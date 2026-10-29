// ОБЩИЙ ЧАТ ("общая комната") — изолированный плагин веб-клиента.
//
// Сообщения хранятся в отдельной таблице general_messages на сервере и никак не
// пересекаются с обычными чатами. Файл полностью самодостаточен: свой экран,
// свой WebSocket, своя разметка на классах gc-*, своя логика. Ни один класс
// мессенджера не переиспользуется — иначе плагин тянул бы чужой дизайн и
// наследовал чужие правила вроде скрытого .chat-bottom-bar.
// home.js / auth.js / api.js не изменяются.
//
// ПОСЛЕ ВХОДА форма логина не меняется: auth.js вызывает showHome(), он здесь
// оборачивается — и общий чат открывается поверх списка чатов.
//
// УДАЛЕНИЕ ФИЧИ:
//   1) убрать <script src="js/general_chat.js"></script> из web/index.html
//   2) удалить этот файл
// Больше ничего трогать не нужно. Выключить без удаления:
//   GENERAL_CHAT_ENABLED=false в .env (сервер отдаст 404, клиент молча выйдет).
(function () {
  'use strict';

  var NAME = 'Общий чат';
  var LIST_LIMIT = 200;
  var MAX_TEXT = 4000;
  var MAX_INPUT_H = 140;

  var mounted = false;
var prepared = false;    // подготовка строки уже была — второй раз не делаем
var dismissed = false;   // пользователь сам закрыл общий чат

  var launcherReady = false;
  var reconnectTimer = null;
  var pingTimer = null;

  var state = {
    ws: null,
    messages: [],
    tempTexts: {},
    reply: null,
  };

  // ---------------------------------------------------------------- утилиты

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeOf(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function dayOf(ts) {
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function colorFor(id) {
    if (typeof colorFromId === 'function') return colorFromId(id);
    var hash = 0;
    var s = String(id || '');
    for (var i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return 'hsl(' + (hash % 360) + ',40%,38%)';
  }

  function myName() {
    if (Api.profile) return Api.profile.username || Api.profile.displayName || 'Я';
    return 'Я';
  }

  function isTouch() {
    return window.matchMedia && window.matchMedia('(hover: none)').matches;
  }

  // На телефоне focus() сразу открывает клавиатуру, поэтому ждём кадра —
  // иначе она вылезает поверх ещё не отрисованной переписки.
  function focusInput() {
    var input = document.getElementById('gcInput');
    if (!input) return;
    if (isTouch()) setTimeout(function () { input.focus(); }, 60);
    else input.focus();
  }

  // ---------------------------------------------------------------- вёрстка

  function shellHtml() {
    return '' +
      '<div class="gc-shell">' +
        '<header class="gc-header">' +
          '<button class="gc-back" type="button" onclick="closeGeneralChat()" title="Назад" aria-label="Назад">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>' +
            '</svg>' +
          '</button>' +
          '<div class="gc-header-avatar" aria-hidden="true">#</div>' +
          '<div class="gc-header-info">' +
            '<div class="gc-header-name">' + esc(NAME) + '</div>' +
            '<div class="gc-status" id="gcStatus"><i class="gc-dot"></i><span>подключение…</span></div>' +
          '</div>' +
        '</header>' +

        '<div class="gc-messages" id="gcMessages">' +
          '<div class="gc-loading">загрузка…</div>' +
        '</div>' +

        '<div class="gc-reply-bar" id="gcReplyBar" hidden>' +
          '<div class="gc-reply-info">' +
            '<span class="gc-reply-user" id="gcReplyUser"></span>' +
            '<span class="gc-reply-text" id="gcReplyText"></span>' +
          '</div>' +
          '<button class="gc-reply-close" type="button" onclick="cancelGeneralReply()" title="Отменить ответ" aria-label="Отменить ответ">&times;</button>' +
        '</div>' +

        '<div class="gc-bar">' +
          '<div class="gc-emoji-panel" id="gcEmoji" hidden></div>' +
          '<textarea class="gc-input" id="gcInput" rows="1" maxlength="' + MAX_TEXT + '" ' +
            'placeholder="Сообщение в общий чат" autocomplete="off" autocapitalize="sentences" ' +
            'enterkeyhint="send" aria-label="Сообщение"></textarea>' +
          '<button class="gc-icon-btn" type="button" onclick="generalToggleEmoji(this)" ' +
            'title="Эмодзи" aria-label="Эмодзи">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>' +
              '<line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>' +
            '</svg>' +
          '</button>' +
          '<button class="gc-send" type="button" onclick="sendGeneralMessage()" title="Отправить" aria-label="Отправить">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  var EMOJIS = [
    '\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F602}','\u{1F923}',
    '\u{1F60A}','\u{1F607}','\u{1F642}','\u{1F643}','\u{1F609}','\u{1F60C}','\u{1F60D}','\u{1F970}',
    '\u{1F618}','\u{1F617}','\u{1F60B}','\u{1F61C}','\u{1F92A}','\u{1F914}','\u{1F928}','\u{1F610}',
    '\u{1F611}','\u{1F636}','\u{1F60F}','\u{1F612}','\u{1F644}','\u{1F62C}','\u{1F62E}','\u{1F634}',
    '\u{1F637}','\u{1F912}','\u{1F915}','\u{1F922}','\u{1F92E}','\u{1F60E}','\u{1F913}','\u{1F9D0}',
    '\u{1F615}','\u{1F61F}','\u{1F641}','\u{1F62E}','\u{1F62F}','\u{1F632}','\u{1F633}','\u{1F97A}',
    '\u{1F626}','\u{1F627}','\u{1F628}','\u{1F630}','\u{1F625}','\u{1F622}','\u{1F62D}','\u{1F631}',
    '\u{1F616}','\u{1F623}','\u{1F61E}','\u{1F613}','\u{1F629}','\u{1F62B}','\u{1F624}','\u{1F621}',
    '\u{1F44D}','\u{1F44E}','\u{1F44C}','\u{270C}\u{FE0F}','\u{1F91D}','\u{1F64F}','\u{1F44F}','\u{1F450}',
    '\u{1F525}','\u{1F4AF}','\u{2705}','\u{274C}','\u{2B50}','\u{1F389}','\u{2764}\u{FE0F}','\u{1F4AC}'
  ];

  function renderEmojiPanel() {
    var panel = document.getElementById('gcEmoji');
    if (!panel || panel.childNodes.length) return;
    panel.innerHTML = EMOJIS.map(function (e) {
      return '<button type="button" class="gc-emoji" onclick="generalPickEmoji(this.textContent)">' + e + '</button>';
    }).join('');
  }

  // ---------------------------------------------------------------- сообщения

  function pushMessage(msg) {
    if (!msg || !msg.id) return;
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].id === msg.id) return;
      if (msg.tempId && state.messages[i].tempId === msg.tempId) {
        state.messages[i] = msg;
        return;
      }
    }
    state.messages.push(msg);
    while (state.messages.length > LIST_LIMIT) state.messages.shift();
  }

  function bubbleHtml(m) {
    // Удалённое субадмином сообщение: показываем плашку на месте текста.
    // Отвечать на него нельзя, поэтому кнопки ответа не будет.
    if (m.deletedAt || m.deleted) {
      return '' +
        '<div class="gc-row gc-row--removed' + (m.userId === Api.userId ? ' mine' : '') + '" data-id="' + esc(m.id) + '">' +
          '<div class="gc-bubble">' +
            (m.userId === Api.userId ? '' : '<div class="gc-author">' + esc(m.username || '') + '</div>') +
            '<div class="gc-removed">удалено администратором</div>' +
            '<div class="gc-meta"><span class="gc-time">' + timeOf(m.timestamp) + '</span></div>' +
          '</div>' +
        '</div>';
    }

    var mine = m.userId === Api.userId;
    var failed = state.tempTexts[m.id] === false;
    var reply = m.replyTo
      ? '<div class="gc-quote"><b>' + esc(m.replyTo.username) + '</b><span>' + esc(m.replyTo.text) + '</span></div>'
      : '';
    // Кнопка ответа только у чужих: навести — появится. Клик по ней не
    // мешает выделению текста, в отличие от клика по самому пузырю.
    var replyBtn = mine ? '' :
      '<button class="gc-reply-btn" type="button" data-uid="' + esc(m.userId) + '" ' +
        'data-name="' + esc(m.username || '') + '" data-text="' + esc(m.text || '') + '">ответить</button>';
    var avatar = mine ? '' :
      '<div class="gc-avatar">' + (m.avatarUrl
        ? '<img src="' + esc(m.avatarUrl) + '" alt="" onerror="this.remove()">'
        : '<span class="gc-initial" style="background:' + colorFor(m.userId) + '">' +
            esc((m.username || '?').charAt(0).toUpperCase()) + '</span>') + '</div>';

    return '' +
      '<div class="gc-row' + (mine ? ' mine' : '') + (failed ? ' failed' : '') + '" data-id="' + esc(m.id) + '">' +
        avatar +
        '<div class="gc-bubble">' +
          (mine ? '' : '<div class="gc-author">' + esc(m.username || '') + '</div>') +
          reply +
          '<div class="gc-text">' + esc(m.text) + '</div>' +
          '<div class="gc-meta">' +
            '<span class="gc-time">' + timeOf(m.timestamp) + '</span>' +
            (failed ? '<span class="gc-failed">не отправлено</span>' : '') +
            replyBtn +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderMessages() {
    var box = document.getElementById('gcMessages');
    if (!box) return;

    if (!state.messages.length) {
      box.innerHTML = '<div class="gc-empty"><b>Общий чат пуст</b>' +
        '<span>Напишите первым — здесь читают все</span></div>';
      return;
    }

    var wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    var html = '';
    var lastDay = '';
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      var day = dayOf(m.timestamp);
      if (day !== lastDay) {
        html += '<div class="gc-day"><span>' + esc(day) + '</span></div>';
        lastDay = day;
      }
      html += bubbleHtml(m);
    }
    box.innerHTML = html;
    if (wasAtBottom) box.scrollTop = box.scrollHeight;
  }

  // ---------------------------------------------------------------- список чатов

  // Строка «Общий чат» в списке чатов: превью последнего сообщения и время.
  // home.js рисует саму строку, мы только наполняем её содержимое.
  function updateChatRow() {
    var row = document.getElementById('generalChatRow');
    if (!row) return;

    var last = state.messages.length ? state.messages[state.messages.length - 1] : null;
    var preview = row.querySelector('.gc-row-msg');
    var time = row.querySelector('.chat-time');

    if (preview) {
      if (!last) {
        preview.textContent = 'Общий чат — здесь читают все';
      } else if (last.deleted || last.deletedAt) {
        preview.textContent = 'Сообщение удалено модератором';
      } else if (last.keyType === 'e2ee_v1' && !last.text) {
        preview.textContent = '🔒 Encrypted message';
      } else {
        preview.textContent = (last.username ? last.username + ': ' : '') + (last.text || '');
      }
    }
    if (time) time.textContent = last ? timeOf(last.timestamp) : '';
  }

  // ---------------------------------------------------------------- WebSocket

  function setStatus(text, online) {
    var el = document.getElementById('gcStatus');
    if (!el) return;
    el.className = 'gc-status' + (online ? ' online' : '');
    var span = el.querySelector('span');
    if (span) span.textContent = text;
  }

  function connect() {
    if (!mounted || !Api.token) return;
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;

    var ws;
    try {
      var protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(protocol + '://' + location.host);
    } catch (_) {
      scheduleReconnect();
      return;
    }
    state.ws = ws;

    ws.onopen = function () {
      setStatus('подключение…', false);
      try { ws.send(JSON.stringify({ type: 'auth', token: Api.token })); } catch (_) {}
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleServerMessage(msg);
    };

    ws.onclose = function (ev) {
      // 1008 — сервер не принял токен: сессия кончилась, переподключение не поможет.
      if (ev && ev.code === 1008) {
        setStatus('нет связи', false);
        if (Api && Api.expireSession) Api.expireSession();
        return;
      }
      setStatus('нет связи', false);
      scheduleReconnect();
    };

    ws.onerror = function () { try { ws.close(); } catch (_) {} };

    clearInterval(pingTimer);
    pingTimer = setInterval(function () {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
      }
    }, 25000);
  }

  function scheduleReconnect() {
    if (!mounted) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  }

  function handleServerMessage(msg) {
    if (msg.type === 'connected') {
      setStatus('на связи', true);
      send({ type: 'general_history' });
      return;
    }

    if (msg.type === 'general_history') {
      state.messages = (msg.messages || []).slice(-LIST_LIMIT);
      renderMessages();
      updateChatRow();
      return;
    }

    // Субадмин удалил сообщение: помечаем его в списке и перерисовываем.
    // Не перерисовываем всё, если удалённое не на экране.
    if (msg.type === 'general_message_deleted') {
      for (var d = 0; d < state.messages.length; d++) {
        if (state.messages[d].id === msg.messageId) {
          state.messages[d].deleted = true;
          state.messages[d].deletedAt = Date.now();
          renderMessages();
          updateChatRow();
          break;
        }
      }
      return;
    }

    if (msg.type === 'general_message') {
      var entry = {
        id: msg.id,
        tempId: msg.tempId,
        userId: msg.userId,
        username: msg.username,
        avatarUrl: msg.avatarUrl,
        text: msg.text,
        timestamp: msg.timestamp,
        replyTo: msg.replyTo,
      };
      if (msg.tempId) state.tempTexts[msg.id] = true;
      pushMessage(entry);
      renderMessages();
      updateChatRow();
      return;
    }

    if (msg.type === 'general_error') {
      if (msg.tempId) state.tempTexts[msg.tempId] = false;
      renderMessages();
      if (typeof showToast === 'function') showToast(msg.message || 'Ошибка общего чата');
    }
  }

  function send(payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try { state.ws.send(JSON.stringify(payload)); return true; } catch (_) {}
    }
    return false;
  }

  // ---------------------------------------------------------------- ввод

  function autoGrow() {
    var el = document.getElementById('gcInput');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_H) + 'px';
  }

  function syncSendState() {
    var el = document.getElementById('gcInput');
    var btn = document.querySelector('.gc-send');
    if (el && btn) btn.classList.toggle('ready', !!el.value.trim());
  }

  function sendMessage() {
    var input = document.getElementById('gcInput');
    if (!input) return;

    var text = input.value.replace(/\s+$/, '');
    if (!text.trim()) return;

    input.value = '';
    autoGrow();
    syncSendState();

    var replyTo = state.reply;
    state.reply = null;
    updateReplyBar();

    var tempId = 'gct' + Date.now() + Math.floor(Math.random() * 1000);
    state.tempTexts[tempId] = true;
    pushMessage({
      id: tempId,
      tempId: tempId,
      userId: Api.userId,
      username: myName(),
      text: text,
      timestamp: Date.now(),
      replyTo: replyTo,
    });
    renderMessages();
    scrollToBottom();

    var ok = send({
      type: 'general_send',
      text: text,
      tempId: tempId,
      // replyTo должен отсутствовать, а не быть null — иначе сервер отклонит кадр
      ...(replyTo ? { replyTo: replyTo } : {}),
    });
    if (!ok) {
      state.tempTexts[tempId] = false;
      renderMessages();
      if (typeof showToast === 'function') showToast('Нет связи с сервером');
    }
  }

  function scrollToBottom() {
    var box = document.getElementById('gcMessages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  // ---------------------------------------------------------------- ответы

  function startReply(username, text) {
    state.reply = { username: username, text: String(text || '').slice(0, 120) };
    updateReplyBar();
    focusInput();
  }

  function cancelReply() {
    state.reply = null;
    updateReplyBar();
  }

  function updateReplyBar() {
    var bar = document.getElementById('gcReplyBar');
    if (!bar) return;
    if (!state.reply) { bar.hidden = true; return; }
    var user = document.getElementById('gcReplyUser');
    var txt = document.getElementById('gcReplyText');
    if (user) user.textContent = state.reply.username || '';
    if (txt) txt.textContent = state.reply.text || '';
    bar.hidden = false;
  }

  // ---------------------------------------------------------------- эмодзи

  function toggleEmoji(btn) {
    var panel = document.getElementById('gcEmoji');
    if (!panel) return;
    var willOpen = panel.hidden;
    panel.hidden = !willOpen;
    if (willOpen) renderEmojiPanel();
    if (btn) btn.classList.toggle('active', willOpen);
  }

  function hideEmoji() {
    var panel = document.getElementById('gcEmoji');
    if (panel) panel.hidden = true;
    var btn = document.querySelector('.gc-icon-btn');
    if (btn) btn.classList.remove('active');
  }

  function pickEmoji(emoji) {
    var input = document.getElementById('gcInput');
    if (!input) return;
    input.value += emoji;
    autoGrow();
    syncSendState();
    focusInput();
  }

  function close() {
    if (!mounted) return;
    dismissed = true;   // чтобы showHome() снова не открыл общий чат
    unmount();
    showLauncher();
    if (typeof showHome === 'function') {
      try { showHome(); return; } catch (_) {}
    }
    location.reload();
  }

  // ---------------------------------------------------------------- телефон
  //
  // 100vh на телефоне не учитывает ни адресную строку, ни экранную клавиатуру,
  // поэтому плашка ввода уезжала под клавиатуру. visualViewport даёт реальную
  // видимую область: при открытии клавиатуры она уменьшается — выставляем её
  // в --gc-vh, и экран вместе с полем ввода поднимается на её высоту.
  // iOS дополнительно прокручивает страницу при появлении клавиатуры, поэтому
  // возвращаем прокрутку в ноль.
  function syncViewport() {
    var shell = document.querySelector('.gc-shell');
    if (!shell) return;
    var vv = window.visualViewport;

    if (!vv) {
      // старый браузер без visualViewport — полагаемся на dvh из CSS
      shell.style.removeProperty('--gc-vh');
      shell.style.removeProperty('--gc-vtop');
      return;
    }

    var keyboardOpen = vv.height < window.innerHeight * 0.75;
    shell.style.setProperty('--gc-vh', Math.round(vv.height) + 'px');
    shell.style.setProperty('--gc-vtop', Math.round(vv.offsetTop || 0) + 'px');
    shell.classList.toggle('kb-open', keyboardOpen);

    if (window.pageYOffset !== 0) window.scrollTo(0, 0);
    if (keyboardOpen) scrollToBottom();
  }

  function bindViewport() {
    syncViewport();
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', syncViewport);
      vv.addEventListener('scroll', syncViewport);
    }
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', function () {
      // на повороте размеры приходят двумя кадрами позже
      setTimeout(syncViewport, 250);
    });
  }

  function unbindViewport() {
    var vv = window.visualViewport;
    if (vv) {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
    }
    window.removeEventListener('resize', syncViewport);
  }

  function lockPageScroll(on) {
    document.documentElement.classList.toggle('gc-open', on);
    document.body.classList.toggle('gc-open', on);
  }

  // ---------------------------------------------------------------- монтирование

  function onDocumentClick(e) {
    var panel = document.getElementById('gcEmoji');
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target)) return;
    var btn = e.target && e.target.closest ? e.target.closest('.gc-icon-btn') : null;
    if (btn) return;
    hideEmoji();
  }

  function mount() {
    // Флаг mounted мог остаться true, когда #app перерисовали поверх открытого
    // общего чата: так делает, например, кнопка «дальше» после опроса (она
    // зовёт showHomeList и рисует список чатов). Тогда шелл в DOM уже нет, но
    // флаг говорил «уже смонтировано», и open() молча выходил — общий чат
    // становилось невозможно открыть до перезагрузки страницы.
    if (mounted && !document.querySelector('.gc-shell')) unmount();
    if (mounted) return true;
    var root = document.getElementById('app');
    if (!root) return false;

    state.messages = [];
    state.reply = null;
    state.tempTexts = {};

    root.innerHTML = shellHtml();
    mounted = true;
    lockPageScroll(true);
    bindViewport();

    var input = document.getElementById('gcInput');
    if (input) {
      input.addEventListener('input', function () {
        autoGrow();
        syncSendState();
      });
      input.addEventListener('keydown', function (e) {
        // Enter отправляет, Shift+Enter — перенос строки
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      input.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
            e.preventDefault();
            if (typeof showToast === 'function') showToast('Общий чат — только текст');
            return;
          }
        }
      });
    }

    // ответ на сообщение: делегирован, потому что список перерисовывается
    var box = document.getElementById('gcMessages');
    if (box) {
      box.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.gc-reply-btn') : null;
        if (!btn) return;
        startReply(btn.dataset.name, btn.dataset.text);
      });
    }

    document.addEventListener('click', onDocumentClick);
    connect();
    return true;
  }

  function unmount() {
    mounted = false;
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
    document.removeEventListener('click', onDocumentClick);
    unbindViewport();
    lockPageScroll(false);
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
      state.ws = null;
    }
  }

  function open() {
    if (!mount()) return;
    hideLauncher();
    renderMessages();
    // на телефоне автофокус сразу выталкивает клавиатуру поверх переписки —
    // там ждём тапа по полю
    if (!isTouch()) {
      var input = document.getElementById('gcInput');
      if (input) input.focus();
    }
  }

  // Кнопка возврата в общий чат. Живёт в body, поэтому не мешает перерисовке
  // основного интерфейса (home.js перерисовывает только #app).
  function showLauncher() {
    if (mounted) return;
    if (!launcherReady) {
      launcherReady = true;
      var btn = document.createElement('button');
      btn.id = 'gcLauncher';
      btn.className = 'gc-launcher';
      btn.type = 'button';
      btn.title = 'Общий чат';
      btn.innerHTML = '<span>#</span> Общий чат';
      btn.addEventListener('click', function () { open(); });
      document.body.appendChild(btn);
    }
    var el = document.getElementById('gcLauncher');
    if (el) el.style.display = '';
  }

  function hideLauncher() {
    var el = document.getElementById('gcLauncher');
    if (el) el.style.display = 'none';
  }

  // ---------------------------------------------------------------- вход

  async function probe() {
    try {
      var res = await fetch('/general-chat', { headers: Api._authHeaders() });
      window.GeneralChatEnabled = res.ok;
      return res.ok;
    } catch (_) {
      window.GeneralChatEnabled = false;
      return false;
    }
  }

  // Наполняем строку «Общий чат» последним сообщением, не открывая сам чат:
  // список чатов рисуется раньше, чем сработает автооткрытие.
  async function loadRowPreview() {
    try {
      var res = await fetch('/general-chat/messages', { headers: Api._authHeaders() });
      if (!res.ok) return;
      var data = await res.json();
      state.messages = (data.messages || []).slice(-LIST_LIMIT);
      updateChatRow();
    } catch (_) { /* превью не критично */ }
  }

  function waitFor(predicate, tries, delay) {
    return new Promise(function (resolve) {
      var i = 0;
      (function tick() {
        var done = false;
        try { done = predicate(); } catch (_) { done = false; }
        if (done || i++ >= tries) return resolve(!!done);
        setTimeout(tick, delay || 150);
      })();
    });
  }

  async function prepareAfterLogin() {
    if (prepared || dismissed) return;
    prepared = true;

    if (!(await probe())) return;

    // ждём обычный интерфейс и закрытие модалки E2EE-пароля (если она была)
    await waitFor(function () {
      return document.getElementById('chatsList') && !document.querySelector('.overlay');
    }, 80);

    loadRowPreview();
  }

  // При входе в приложение общий чат больше не открывается сам: пользователь
  // попадает в список чатов и открывает общий чат тапом по строке. Из подготовки
  // остаётся узнать, включена ли фича, и показать в строке последнее сообщение —
  // иначе строка в списке выглядела бы пустой.
  //
  // Исходный showHome из home.js (список чатов) — poll.js вызывает его, когда
  // опросы кончились, и он тоже должен вести в список чатов.
  window.showHomeList = window.showHome;

  if (typeof window.showHome === 'function') {
    var originalShowHome = window.showHome;
    window.showHome = function () {
      var result = originalShowHome.apply(this, arguments);
      try { prepareAfterLogin(); } catch (_) {}
      return result;
    };
  }

  window.openGeneralChat = open;
  window.closeGeneralChat = close;
  window.updateGeneralChatRow = updateChatRow;
  window.GeneralChatEnabled = true;
  window.sendGeneralMessage = sendMessage;
  window.startGeneralReply = startReply;
  window.cancelGeneralReply = cancelReply;
  window.generalToggleEmoji = toggleEmoji;
  window.generalPickEmoji = pickEmoji;
})();
