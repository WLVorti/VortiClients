// ОПРОСЫ — блокировка чата, пока пользователь не ответил.
//
// Плагин полностью изолирован: свой оверлей (css/poll.css), свой опрос состояния.
// Пока висит активный опрос и пользователь на него не ответил, вместо
// списка чатов он видит полноэкранный опрос. Общий чат тоже недоступен —
// оверлей лежит с z-index 5000 поверх gc-shell (200).
//
// Работает тремя способами, чтобы опрос нельзя было обойти:
//   1) перехватывает showHome() — вместо домашнего экрана показывает опрос;
//   2) каждые 45 секунд спрашивает сервер — поймает опрос, запущенный, пока
//      пользователь уже сидит в чате;
//   3) после голосования перечитывает состояние — если очередь не кончилась,
//      сразу показывает следующий опрос.
//
// УДАЛЕНИЕ ФИЧИ:
//   1) убрать <script src="js/poll.js"></script> и <link href="css/poll.css">
//      из web/index.html
//   2) удалить web/js/poll.js и web/css/poll.css
// Серверную часть (src/handlers/rest/polls.ts) можно оставить: без клиента
// опросы просто никто не увидит.
(function () {
  'use strict';

  var POLL_MS = 10000;     // страховка, если WS-канал не поднялся
  var CUSTOM_CHOICE = -1;   // choiceIndex для «введите свой ответ»
  var MAX_CUSTOM = 300;

  var overlay = null;
  var visible = false;
  var busy = false;
  var poll = null;          // текущий опрос
  var remaining = 0;        // сколько ещё опросов ждёт ответа
  var customOpen = false;
  var checkedAtLogin = false;
  var onResults = false;     // пользователь смотрит итоги, а не вопрос

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function show(el, on) { if (el) el.hidden = !on; }

  /* ---------------------------------------------------------------- вьюпорт */

  // То же, что в общем чате: 100vh не учитывает клавиатуру телефона.
  function syncViewport() {
    if (!overlay) return;
    var vv = window.visualViewport;
    if (!vv) return;
    overlay.style.setProperty('--pl-vh', Math.round(vv.height) + 'px');
    overlay.style.setProperty('--pl-vtop', Math.round(vv.offsetTop || 0) + 'px');
    if (window.pageYOffset !== 0) window.scrollTo(0, 0);
  }

  function bindViewport() {
    syncViewport();
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', syncViewport);
      vv.addEventListener('scroll', syncViewport);
    }
    window.addEventListener('resize', syncViewport);
  }

  /* ---------------------------------------------------------------- сеть */

  function state() {
    return fetch('/poll/state', { headers: Api._authHeaders() })
      .then(function (r) {
        if (r.status === 401) return null;
        if (!r.ok) throw new Error('Опросы недоступны');
        return r.json();
      });
  }

  function vote(choiceIndex, customText) {
    var body = choiceIndex === CUSTOM_CHOICE
      ? { choiceIndex: CUSTOM_CHOICE, customText: customText }
      : { choiceIndex: choiceIndex };

    return fetch('/poll/' + encodeURIComponent(poll.id) + '/vote', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, Api._authHeaders()),
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.message || 'Не удалось отправить голос');
        return d;
      });
    });
  }

  /* ---------------------------------------------------------------- разметка */

  function shellHtml() {
    return '' +
      '<div class="pl-card">' +
        '<div class="pl-brand">' +
          '<span class="pl-mark" aria-hidden="true">V</span>' +
          '<span class="pl-brand-sub">опрос</span>' +
        '</div>' +
        '<div class="pl-progress" id="plProgress" hidden></div>' +
        '<h1 class="pl-q" id="plQuestion"></h1>' +
        '<div class="pl-opts" id="plOpts"></div>' +
        '<div class="pl-custom" id="plCustom" hidden>' +
          '<input class="pl-input" id="plCustomInput" type="text" maxlength="' + MAX_CUSTOM + '" ' +
            'placeholder="напишите свой ответ" enterkeyhint="send">' +
          '<button class="pl-btn" type="button" id="plCustomSend">ответить</button>' +
        '</div>' +
        '<div class="pl-res" id="plResults" hidden></div>' +
        '<p class="pl-msg" id="plMsg" hidden></p>' +
        '<button class="pl-btn pl-btn--wide" type="button" id="plNext" hidden>дальше</button>' +
        '<p class="pl-note">пока не ответите, чат недоступен</p>' +
      '</div>';
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'pl-overlay';
    overlay.id = 'pollOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = shellHtml();
    document.body.appendChild(overlay);
    bindViewport();
    wire();
    return overlay;
  }

  function wire() {
    document.getElementById('plOpts').addEventListener('click', onOptsClick);
    document.getElementById('plCustomSend').addEventListener('click', submitCustom);
    document.getElementById('plCustomInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitCustom(); }
    });
    document.getElementById('plNext').addEventListener('click', advance);
  }

  function msg(text) {
    var el = document.getElementById('plMsg');
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    el.textContent = text;
    el.hidden = false;
  }

  function setBusy(on) {
    busy = on;
    var buttons = overlay ? overlay.querySelectorAll('button') : [];
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = on; });
  }

  /* ---------------------------------------------------------------- экраны */

  function renderQuestion() {
    if (!poll) return hide();

    var el = document.getElementById('plQuestion');
    el.textContent = poll.question;

    var progress = document.getElementById('plProgress');
    if (remaining > 1) {
      progress.textContent = 'опросов осталось: ' + remaining;
      progress.hidden = false;
    } else {
      progress.hidden = true;
    }

    var opts = poll.options.map(function (text, i) {
      return '<button class="pl-opt" type="button" data-index="' + i + '">' +
        '<span>' + esc(text) + '</span></button>';
    }).join('');

    if (poll.allowCustom) {
      opts += '<button class="pl-opt is-custom" type="button" data-index="' + CUSTOM_CHOICE + '">' +
        '<span>введите свой ответ</span><span class="pl-opt-arrow">&rsaquo;</span></button>';
    }

    document.getElementById('plOpts').innerHTML = opts;
    // явно показываем варианты: после экрана результатов они скрыты
    show(document.getElementById('plOpts'), true);
    show(document.getElementById('plResults'), false);
    show(document.getElementById('plNext'), false);
    show(document.getElementById('plCustom'), false);
    customOpen = false;
    onResults = false;
    msg('');
  }

  function renderResults(withResults) {
    if (!withResults || !withResults.results) return;

    var r = withResults.results;
    var mine = withResults.myVote;

    var lines = withResults.options.map(function (text, i) {
      var isMine = mine && mine.choiceIndex === i;
      return '<div class="pl-resline' + (isMine ? ' is-mine' : '') + '">' +
        '<span class="pl-resline-label">' + (isMine ? '<span class="pl-own">ваш</span> ' : '') + esc(text) + '</span>' +
        '<span class="pl-resbar"><span style="width:' + (r.percentages[i] || 0) + '%"></span></span>' +
        '<span class="pl-resnum">' + (r.counts[i] || 0) + '·' + (r.percentages[i] || 0) + '%</span>' +
      '</div>';
    });

    if (withResults.allowCustom) {
      r.custom.forEach(function (c) {
        var pct = r.total ? Math.round((c.count / r.total) * 100) : 0;
        lines.push('<div class="pl-resline is-custom">' +
          '<span class="pl-resline-label">&laquo;' + esc(c.text) + '&raquo;</span>' +
          '<span class="pl-resbar"><span style="width:' + pct + '%"></span></span>' +
          '<span class="pl-resnum">' + c.count + '·' + pct + '%</span>' +
        '</div>');
      });
    }

    document.getElementById('plResults').innerHTML =
      lines.join('') + '<div class="pl-total">всего голосов: ' + r.total + '</div>';

    // экран итогов: варианты и поле своего ответа прячем, результаты показываем
    show(document.getElementById('plResults'), true);
    show(document.getElementById('plOpts'), false);
    show(document.getElementById('plCustom'), false);
    show(document.getElementById('plNext'), true);
    onResults = true;
  }

  function hide() {
    if (overlay) overlay.hidden = true;
    visible = false;
    onResults = false;
    poll = null;
    remaining = 0;
  }

  function present() {
    ensureOverlay();
    overlay.hidden = false;
    visible = true;
    renderQuestion();
    syncViewport();
  }

  /* ---------------------------------------------------------------- голоса */

  function submitCustom() {
    var input = document.getElementById('plCustomInput');
    var text = input.value.trim();
    if (!text) { msg('Введите свой ответ'); return; }
    send(CUSTOM_CHOICE, text);
  }

  function send(choiceIndex, customText) {
    if (busy || !poll) return;
    setBusy(true);
    msg('');
    vote(choiceIndex, customText)
      .then(function (res) {
        remaining = res.remaining || 0;
        // res.voted — опрос, за который только что проголосовали, с итогами.
        // res.current здесь не подходит: в последнем опросе очереди он null.
        renderResults(res.voted);
        var input = document.getElementById('plCustomInput');
        if (input) input.value = '';
      })
      .catch(function (e) { msg(e.message || 'Не удалось отправить голос'); })
      .finally(function () { setBusy(false); });
  }

  /** «дальше»: следующий опрос из очереди либо снимаем блокировку. */
  function advance() {
    if (busy) return;
    setBusy(true);
    state()
      .then(function (data) {
        if (!data) { hide(); return; }
        remaining = data.remaining || 0;
        if (data.blocked && data.current) {
          poll = data.current;
          renderQuestion();
        } else {
          hide();
          // список чатов, а не общий чат: showHome без нашего автооткрытия
          if (typeof window.showHomeList === 'function') {
            try { window.showHomeList(); } catch (_) { window.showHome(); }
          } else if (typeof window.showHome === 'function') {
            try { window.showHome(); } catch (_) {}
          }
        }
      })
      .catch(function (e) { msg(e.message); })
      .finally(function () { setBusy(false); });
  }

  function onOptsClick(e) {
    var btn = e.target.closest ? e.target.closest('.pl-opt') : null;
    if (!btn || busy) return;

    var idx = Number(btn.dataset.index);
    if (idx === CUSTOM_CHOICE) {
      customOpen = !customOpen;
      var box = document.getElementById('plCustom');
      box.hidden = !customOpen;
      if (customOpen) {
        var input = document.getElementById('plCustomInput');
        input.focus();
        syncViewport();
      }
      return;
    }
    send(idx, null);
  }

  /* ---------------------------------------------------------------- опрос сервера */

  function check(force) {
    if (!Api.token) {
      if (visible) hide();
      return Promise.resolve();
    }
    return state()
      .then(function (data) {
        if (!data) return;
        var wanted = data.blocked && data.current;

        if (wanted) {
          // новый вопрос (другой id) либо принудительное обновление с WS
          if (force || !visible || !poll || poll.id !== data.current.id) {
            poll = data.current;
            remaining = data.remaining || 0;
            present();
          }
        } else if (visible && !onResults) {
          hide();
        }
        // Если пользователь смотрит итоги и блокировки больше нет — оставляем
        // экран итогов на месте: снимает его кнопка «дальше».
      })
      .catch(function () { /* тихо: опрос не должен ломать интерфейс */ });
  }

  /* ---------------------------------------------------------------- старт */

  // Перехватываем showHome: пока есть неотвеченный опрос, домашний экран
  // не рисуется вовсе — вместо него опрос. Загружается ПОСЛЕ general_chat.js,
  // поэтому обёртка наша (внешняя) и чат не успеет открыться.
  if (typeof window.showHome === 'function') {
    var originalShowHome = window.showHome;
    window.showHome = function () {
      if (Api.token) {
        return state()
          .then(function (data) {
            if (data && data.blocked && data.current) {
              poll = data.current;
              remaining = data.remaining || 0;
              present();
              return;
            }
            if (data && !data.blocked && visible) hide();
            return originalShowHome.apply(window, arguments);
          })
          .catch(function () {
            return originalShowHome.apply(window, arguments);
          });
      }
      return originalShowHome.apply(window, arguments);
    };
  }

  // Опрос мог быть запущен, пока пользователь уже сидит в чате.
  // Основной сигнал — WS-событие от сервера (мгновенно), а этот интервал и
  // проверка при возврате на вкладку — страховка, если WS был не подключён.
  setInterval(function () {
    if (!visible) check();
  }, POLL_MS);

  /* ------------------------------------------------- свой WS-канал для опросов */

  // У домашнего экрана WebSocket вообще не подключён: connectWs() в home.js
  // вызывается только при открытии чата. Поэтому событие от сервера туда не
  // доходило, и опрос был виден только после перезагрузки. Держим отдельное
  // лёгкое соединение — оно не трогает ws в home.js и в general_chat.js.
  var watchWs = null;
  var watchRetry = null;

  function stopWatch() {
    if (watchRetry) { clearTimeout(watchRetry); watchRetry = null; }
    if (watchWs) {
      try { watchWs.onclose = null; watchWs.onerror = null; watchWs.onmessage = null; watchWs.close(); } catch (_) {}
      watchWs = null;
    }
  }

  function connectWatch() {
    if (watchWs || !Api.token) return;
    var protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    try {
      watchWs = new WebSocket(protocol + '://' + location.host);
    } catch (_) {
      scheduleWatchRetry();
      return;
    }

    watchWs.onopen = function () {
      try { watchWs.send(JSON.stringify({ type: 'auth', token: Api.token })); } catch (_) {}
    };

    watchWs.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (_) { return; }
      if (!data || data.type !== 'poll_changed') return;
      // Опрос уже открыт — обновляем содержимое (субадмин мог закрыть текущий
      // и поднять следующий). Иначе просто показываем новый опрос.
      if (visible) check(true); else check();
    };

    watchWs.onerror = function () { /* закроется и переподключимся в onclose */ };

    watchWs.onclose = function () {
      watchWs = null;
      if (Api.token) scheduleWatchRetry();
    };
  }

  function scheduleWatchRetry() {
    if (watchRetry) return;
    watchRetry = setTimeout(function () { watchRetry = null; connectWatch(); }, 5000);
  }

  window.addEventListener('poll:changed', function () {
    // Если опрос уже показан, перерисовываем его содержимое (например, когда
    // субадмин закрыл текущий и поднял следующий из очереди).
    if (visible) { check(true); return; }
    check();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      // в фоновой вкладке сокет всё равно жив, но экономим: проверка не нужна
      if (watchWs) { try { watchWs.send(JSON.stringify({ type: 'ping' })); } catch (_) {} }
      return;
    }
    if (!visible) check();
    if (!watchWs && Api.token) connectWatch();
  });

  window.addEventListener('beforeunload', stopWatch);

  // Первая проверка после входа, когда токен появился.
  var tokenWatch = setInterval(function () {
    if (Api.token && !checkedAtLogin) {
      checkedAtLogin = true;
      clearInterval(tokenWatch);
      check();
      connectWatch();
    }
    if (!Api.token) { checkedAtLogin = false; stopWatch(); }
  }, 1000);
})();
