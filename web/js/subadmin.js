// СУБАДМИНКА (/subadmin) — панель управления опросами.
// Пароль отправляется один раз на /subadmin/api/login и в браузере не хранится:
// здесь лежит только выданный сервером токен (localStorage), как и токен юзера
// в остальном клиенте. Без токена панель показывает форму входа.
//
// УДАЛЕНИЕ ФИЧИ:
//   1) web/subadmin.html, web/js/subadmin.js, web/css/subadmin.css
//   2) в src/index.ts — блок «СУБАДМИНКА» и две строки poll
//   3) src/handlers/rest/subadmin.ts, src/handlers/rest/polls.ts
// Отключить без удаления: SUBADMIN_ENABLED=false (панель и API отдают 404).
(function () {
  'use strict';

  var TOKEN_KEY = 'subadmin_token';
  var MAX_OPTIONS = 12;
  var MIN_OPTIONS = 2;

  var $ = function (id) { return document.getElementById(id); };
  var token = localStorage.getItem(TOKEN_KEY) || null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeOf(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function dateOf(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function show(id, on) { var el = $(id); if (el) el.hidden = !on; }

  var toastTimer = null;
  function toast(text, isError) {
    var el = $('saToast');
    if (!el) return;
    el.textContent = text;
    el.className = 'sa-toast' + (isError ? ' is-error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, isError ? 4500 : 2600);
  }

  function msg(id, text) {
    var el = $(id);
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    el.textContent = text;
    el.hidden = false;
  }

  /* ------------------------------------------------------------------ сеть */

  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';

    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 401) { logout(); throw new Error('Сессия истекла — войдите заново'); }
      return res.text().then(function (raw) {
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
        if (res.status === 404) throw new Error(data.message || 'Субадминка отключена на сервере');
        if (!res.ok) throw new Error(data.message || 'Ошибка сервера');
        return data;
      });
    });
  }

  function logout() {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    show('saApp', false);
    show('saLogin', true);
    var pw = $('saPassword');
    if (pw) { pw.value = ''; pw.focus(); }
  }

  /* ------------------------------------------------------------------ опции */

  function optionValues() {
    return Array.prototype.slice
      .call(document.querySelectorAll('#saOptions .sa-opt .sa-input'))
      .map(function (i) { return i.value.trim(); })
      .filter(function (v) { return v.length > 0; });
  }

  function addOption(value) {
    var box = $('saOptions');
    if (!box) return;
    if (box.children.length >= MAX_OPTIONS) {
      toast('Максимум ' + MAX_OPTIONS + ' вариантов', true);
      return;
    }
    var n = box.children.length;
    var row = document.createElement('div');
    row.className = 'sa-opt';
    row.innerHTML =
      '<span class="sa-opt-num">' + (n + 1) + '</span>' +
      '<input class="sa-input" type="text" maxlength="120" placeholder="вариант ответа" value="' + esc(value || '') + '">' +
      '<button class="sa-opt-del" type="button" title="Убрать" aria-label="Убрать вариант">&times;</button>';
    box.appendChild(row);
    renumberOptions();
    var input = row.querySelector('input');
    if (value) input.value = value;
    return input;
  }

  function renumberOptions() {
    var rows = document.querySelectorAll('#saOptions .sa-opt');
    Array.prototype.forEach.call(rows, function (r, i) {
      r.querySelector('.sa-opt-num').textContent = String(i + 1);
    });
  }

  /* ------------------------------------------------------------------ список */

  var STATUS = {
    active: { label: 'идёт сейчас', cls: 'sa-badge--active' },
    queued: { label: 'в очереди', cls: 'sa-badge--queued' },
    draft: { label: 'черновик', cls: 'sa-badge--draft' },
    closed: { label: 'закрыт', cls: 'sa-badge--draft' },
  };

  function resultsHtml(poll) {
    var r = poll.results;
    if (!r || r.total === 0) {
      return '<div class="sa-empty">Голосов пока нет</div>';
    }

    var lines = poll.options.map(function (opt, i) {
      return '<div class="sa-optline">' +
        '<span class="sa-optline-label">' + esc(opt) + '</span>' +
        '<span class="sa-bar"><span style="width:' + (r.percentages[i] || 0) + '%"></span></span>' +
        '<span class="sa-optline-num">' + (r.counts[i] || 0) + ' · ' + (r.percentages[i] || 0) + '%</span>' +
      '</div>';
    });

    if (poll.allowCustom) {
      if (r.custom.length) {
        lines = lines.concat(r.custom.map(function (c) {
          var pct = r.total ? Math.round((c.count / r.total) * 100) : 0;
          return '<div class="sa-optline is-custom">' +
            '<span class="sa-optline-label">«' + esc(c.text) + '»</span>' +
            '<span class="sa-bar"><span style="width:' + pct + '%"></span></span>' +
            '<span class="sa-optline-num">' + c.count + ' · ' + pct + '%</span>' +
          '</div>';
        }));
      }
      lines.push('<div class="sa-optline is-custom">' +
        '<span class="sa-optline-label">свой ответ — всего</span>' +
        '<span class="sa-optline-num">' + r.customPercentage + '%</span>' +
      '</div>');
    }

    return '<div class="sa-opts">' + lines.join('') + '</div>';
  }

  function actionsHtml(poll) {
    var out = [];
    if (poll.status === 'draft') {
      out.push('<button class="sa-btn sa-btn--primary sa-btn--sm" data-act="launch" data-id="' + poll.id + '">запустить</button>');
      out.push('<button class="sa-btn sa-btn--ghost sa-btn--sm" data-act="delete" data-id="' + poll.id + '">удалить</button>');
    } else if (poll.status === 'queued') {
      out.push('<button class="sa-btn sa-btn--danger sa-btn--sm" data-act="close" data-id="' + poll.id + '">убрать из очереди</button>');
    } else if (poll.status === 'active') {
      out.push('<button class="sa-btn sa-btn--danger sa-btn--sm" data-act="close" data-id="' + poll.id + '">закрыть и взять следующий</button>');
    } else if (poll.status === 'closed') {
      if (poll.voters && poll.voters.c === 0) {
        out.push('<button class="sa-btn sa-btn--ghost sa-btn--sm" data-act="delete" data-id="' + poll.id + '">удалить</button>');
      }
      out.push('<button class="sa-btn sa-btn--ghost sa-btn--sm" data-act="votes" data-id="' + poll.id + '">кто как голосовал</button>');
    }
    return out.join('');
  }

  function pollHtml(poll) {
    var st = STATUS[poll.status] || STATUS.draft;
    return '' +
      '<article class="sa-poll' + (poll.status === 'active' ? ' is-active' : '') + '" data-id="' + poll.id + '">' +
        '<div class="sa-poll-head">' +
          '<div>' +
            '<div class="sa-poll-q">' + esc(poll.question) + '</div>' +
            '<div class="sa-poll-meta">' +
              (poll.status === 'active' ? 'запущен ' : '') + (dateOf(poll.launchedAt || poll.createdAt)) +
              ' · ' + (poll.voters ? poll.voters.c : 0) + ' голосов' +
              (poll.allowCustom ? ' · свой ответ разрешён' : '') +
            '</div>' +
          '</div>' +
          '<span class="sa-badge ' + st.cls + '">' + st.label + '</span>' +
        '</div>' +
        resultsHtml(poll) +
        '<div class="sa-poll-actions">' + actionsHtml(poll) + '</div>' +
        '<div class="sa-votes" data-votes-for="' + poll.id + '" hidden></div>' +
      '</article>';
  }

  function render(data) {
    var list = $('saList');
    if (!list) return;

    if (!data.polls.length) {
      list.innerHTML = '<div class="sa-empty">Опросов пока нет. Создайте первый сверху.</div>';
    } else {
      list.innerHTML = data.polls.map(pollHtml).join('');
    }

    var st = $('saStats');
    if (st) {
      st.hidden = false;
      st.innerHTML =
        '<div class="sa-stat"><b>' + data.stats.totalPolls + '</b><span>всего опросов</span></div>' +
        '<div class="sa-stat"><b>' + data.stats.totalVotes + '</b><span>всего голосов</span></div>' +
        '<div class="sa-stat"><b>' + (data.stats.activeId ? '1' : '0') + '</b><span>идёт сейчас</span></div>';
    }
  }

  function load() {
    return api('/subadmin/api/polls')
      .then(render)
      .catch(function (e) { toast(e.message, true); });
  }

  /* ------------------------------------------------------------------ действия */

  function onListClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var id = btn.dataset.id;
    var act = btn.dataset.act;

    if (act === 'launch') {
      if (!confirm('Запустить опрос? Пока он активен, у всех на сайте вместо чата будет опрос.')) return;
      btn.disabled = true;
      api('/subadmin/api/polls/' + id + '/launch', { method: 'POST' })
        .then(function (r) {
          toast(r.queued ? 'Опрос встал в очередь' : 'Опрос запущен — он уже висит у всех на сайте');
          return load();
        })
        .catch(function (err) { toast(err.message, true); btn.disabled = false; });
      return;
    }

    if (act === 'close') {
      if (!confirm('Закрыть опрос? Покажет результаты проголосовавшим и поднимет следующий из очереди.')) return;
      btn.disabled = true;
      api('/subadmin/api/polls/' + id + '/close', { method: 'POST' })
        .then(function () { toast('Опрос закрыт'); return load(); })
        .catch(function (err) { toast(err.message, true); btn.disabled = false; });
      return;
    }

    if (act === 'delete') {
      if (!confirm('Удалить опрос безвозвратно?')) return;
      btn.disabled = true;
      api('/subadmin/api/polls/' + id, { method: 'DELETE' })
        .then(function () { toast('Опрос удалён'); return load(); })
        .catch(function (err) { toast(err.message, true); btn.disabled = false; });
      return;
    }

    if (act === 'votes') {
      var box = document.querySelector('[data-votes-for="' + id + '"]');
      if (!box) return;
      if (!box.hidden) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="sa-empty">загрузка…</div>';
      api('/subadmin/api/polls/' + id + '/votes')
        .then(function (r) {
          if (!r.votes.length) { box.innerHTML = '<div class="sa-empty">Голосов нет</div>'; return; }
          box.innerHTML = r.votes.map(function (v) {
            return '<div class="sa-vote">' +
              '<time>' + timeOf(v.createdAt) + '</time>' +
              '<span>' + (v.isCustom ? 'свой: ' : '') + esc(v.label) + '</span>' +
            '</div>';
          }).join('');
        })
        .catch(function (err) { box.innerHTML = '<div class="sa-empty">' + esc(err.message) + '</div>'; });
    }
  }

  /* ------------------------------------------------------------------ вход */

  function enterApp() {
    show('saLogin', false);
    show('saApp', true);
    return load().then(loadMessages).then(loadNews);
  }

  function onLoginSubmit(e) {
    e.preventDefault();
    var pw = $('saPassword');
    var btn = $('saLoginBtn');
    if (!pw || !pw.value) return;

    msg('saLoginMsg', '');
    btn.disabled = true;
    btn.textContent = 'проверяем…';

    fetch('/subadmin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw.value }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.data.message || 'Неверный пароль');
        token = r.data.token;
        localStorage.setItem(TOKEN_KEY, token);
        pw.value = '';
        enterApp();
      })
      .catch(function (err) { msg('saLoginMsg', err.message || 'Не удалось войти'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'войти'; });
  }

  function onCreate() {
    var question = $('saQuestion').value.trim();
    var options = optionValues();
    var allowCustom = $('saAllowCustom').checked;

    msg('saFormMsg', '');
    if (!question) return msg('saFormMsg', 'Введите вопрос');
    if (options.length < MIN_OPTIONS) return msg('saFormMsg', 'Нужно минимум ' + MIN_OPTIONS + ' варианта ответа');

    var btn = $('saCreate');
    btn.disabled = true;

    api('/subadmin/api/polls', { method: 'POST', body: { question: question, options: options, allowCustom: allowCustom } })
      .then(function () {
        $('saQuestion').value = '';
        $('saAllowCustom').checked = false;
        var box = $('saOptions');
        box.innerHTML = '';
        addOption();
        addOption();
        toast('Черновик создан — запусти его кнопкой «запустить»');
        return load();
      })
      .catch(function (e) { msg('saFormMsg', e.message); })
      .finally(function () { btn.disabled = false; });
  }

  /* ---------------------------------------------------------------- новости */

  // Вложения текущей новости. Массив объектов {kind,url,mime,name} — ровно то,
  // что ждёт сервер; при правке существующей новости список заполняется из её
  // ответа, поэтому «отменить правку» возвращает исходный набор файлов.
  var newsMedia = [];
  var newsEditingId = null;

  function newsPlural(n, one, few, many) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function renderNewsFiles() {
    var box = $('saNewsFiles');
    if (!box) return;
    if (!newsMedia.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = newsMedia.map(function (m, i) {
      var thumb;
      if (m.kind === 'video') {
        thumb = '<video src="' + esc(m.url) + '" muted preload="metadata"></video>';
      } else {
        // Гифку показываем img'ом: она анимируется сама и не требует кодека.
        thumb = '<img src="' + esc(m.url) + '" alt="">';
      }
      return '' +
        '<div class="sa-news-file" data-index="' + i + '">' +
          '<div class="sa-news-file-thumb">' + thumb + '</div>' +
          '<div class="sa-news-file-name">' + esc(m.name) + '</div>' +
          '<button class="sa-opt-del" type="button" data-act="rmnewsfile" data-index="' + i + '"' +
            ' title="Убрать" aria-label="Убрать вложение">&times;</button>' +
        '</div>';
    }).join('');
  }

  function resetNewsForm() {
    newsMedia = [];
    newsEditingId = null;
    $('saNewsTitle').value = '';
    $('saNewsBody').value = '';
    $('saNewsFile').value = '';
    $('saNewsPublish').checked = true;
    var editing = $('saNewsEditing');
    var cancel = $('saNewsCancelEdit');
    var preview = $('saNewsPreview');
    if (editing) editing.hidden = true;
    if (cancel) cancel.hidden = true;
    if (preview) preview.hidden = true;
    $('saNewsSave').textContent = 'опубликовать';
    renderNewsFiles();
    updateNewsCounter();
    msg('saNewsMsg', '');
  }

  function updateNewsCounter() {
    var counter = $('saNewsCounter');
    if (!counter) return;
    var len = $('saNewsBody').value.length;
    counter.textContent = len + ' / 20000';
  }

  function newsFileCount() {
    var input = $('saNewsFile');
    return input && input.files ? input.files.length : 0;
  }

  function syncNewsUploadBtn() {
    var btn = $('saNewsUpload');
    if (btn) btn.disabled = newsFileCount() === 0;
  }

  /** Загрузка одного файла. Возвращает промис с описанием вложения. */
  function uploadNewsFile(file) {
    var form = new FormData();
    form.append('file', file);
    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    return fetch('/subadmin/api/news/media', { method: 'POST', headers: headers, body: form })
      .then(function (res) {
        if (res.status === 401) { logout(); throw new Error('Сессия истекла — войдите заново'); }
        return res.text().then(function (raw) {
          var data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
          if (!res.ok) throw new Error(data.message || 'Не удалось загрузить файл');
          return data.media;
        });
      });
  }

  /** Загрузка всех выбранных файлов по очереди. */
  function uploadNewsFiles() {
    var input = $('saNewsFile');
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return Promise.resolve();

    var btn = $('saNewsUpload');
    var hint = $('saNewsUploadMsg');
    var done = 0;

    if (btn) { btn.disabled = true; btn.textContent = 'грузим…'; }
    if (hint) hint.textContent = 'файлов: ' + files.length;

    // По одному, а не разом: параллельная загрузка пяти видео — это пять
    // запросов, которые при 200 МБ на файл сразу упираются в лимит соединений.
    return files.reduce(function (chain, file) {
      return chain.then(function () {
        return uploadNewsFile(file).then(function (media) {
          newsMedia.push(media);
          done += 1;
          if (hint) hint.textContent = 'загружено: ' + done + ' из ' + files.length;
        }).catch(function (err) {
          done += 1;
          toast(err.message + ' (' + file.name + ')', true);
        });
      });
    }, Promise.resolve()).then(function () {
      input.value = '';
      if (btn) { btn.textContent = 'загрузить'; btn.disabled = true; }
      if (hint) hint.textContent = newsMedia.length ? 'вложений: ' + newsMedia.length : '';
      renderNewsFiles();
    });
  }

  function newsPreview(show) {
    var box = $('saNewsPreview');
    var body = $('saNewsPreviewBody');
    if (!box || !body) return;
    if (!show) { box.hidden = true; return; }

    var mediaByUrl = {};
    newsMedia.forEach(function (m) { mediaByUrl[m.url] = m; });

    // Тот же markdown.js, что на сайте: предпросмотр врёт не в нашу пользу.
    body.innerHTML = window.Markdown
      ? window.Markdown.render($('saNewsBody').value, { mediaByUrl: mediaByUrl })
      : '';
    box.hidden = false;
  }

  function saveNews() {
    var title = $('saNewsTitle').value.trim();
    var text = $('saNewsBody').value;

    msg('saNewsMsg', '');
    if (!title) return msg('saNewsMsg', 'Введите заголовок');
    if (!text.trim()) return msg('saNewsMsg', 'Текст новости пуст');

    var btn = $('saNewsSave');
    btn.disabled = true;

    var payload = {
      title: title,
      body: text,
      media: newsMedia,
      publish: $('saNewsPublish').checked,
    };

    var editingId = newsEditingId;
    var request = editingId
      ? api('/subadmin/api/news/' + encodeURIComponent(editingId), { method: 'PATCH', body: payload })
      : api('/subadmin/api/news', { method: 'POST', body: payload });

    request
      .then(function (r) {
        toast(editingId ? 'Новость обновлена' : (payload.publish ? 'Новость опубликована' : 'Черновик сохранён'));
        resetNewsForm();
        return loadNews();
      })
      .catch(function (e) { msg('saNewsMsg', e.message); })
      .finally(function () { btn.disabled = false; });
  }

  function newsItemHtml(item) {
    var summary = window.Markdown ? window.Markdown.toText(item.body, 160) : item.body;

    return '' +
      '<article class="sa-newsitem' + (item.isPublished ? '' : ' is-draft') + '" data-id="' + esc(item.id) + '">' +
        '<div class="sa-newsitem-head">' +
          '<div>' +
            '<div class="sa-newsitem-title">' + esc(item.title) + '</div>' +
            '<div class="sa-newsitem-meta">' +
              dateOf(item.publishedAt) + ' · ' + timeOf(item.publishedAt) +
              (item.media && item.media.length ? ' · вложений: ' + item.media.length : '') +
            '</div>' +
          '</div>' +
          '<span class="sa-badge ' + (item.isPublished ? 'sa-badge--active' : 'sa-badge--draft') + '">' +
            (item.isPublished ? 'на сайте' : 'черновик') +
          '</span>' +
        '</div>' +
        '<div class="sa-newsitem-text">' + esc(summary) + '</div>' +
        '<div class="sa-poll-actions">' +
          '<button class="sa-btn sa-btn--primary sa-btn--sm" type="button" data-act="editnews" data-id="' + esc(item.id) + '">править</button>' +
          '<button class="sa-btn sa-btn--ghost sa-btn--sm" type="button" data-act="' +
            (item.isPublished ? 'unpublishnews' : 'publishnews') + '" data-id="' + esc(item.id) + '">' +
            (item.isPublished ? 'снять с публикации' : 'опубликовать') +
          '</button>' +
          '<button class="sa-btn sa-btn--danger sa-btn--sm" type="button" data-act="delnews" data-id="' + esc(item.id) + '">удалить</button>' +
        '</div>' +
      '</article>';
  }

  function renderNews(items) {
    var box = $('saNewsList');
    if (!box) return;
    // Кэш заполняем здесь же: он нужен кнопкам списка, а не только рендеру.
    newsCache = {};
    items.forEach(function (item) { newsCache[item.id] = item; });

    if (!items.length) {
      box.innerHTML = '<div class="sa-empty">Новостей пока нет — напишите первую сверху.</div>';
      return;
    }
    box.innerHTML = items.map(newsItemHtml).join('');
  }

  function loadNews() {
    return api('/subadmin/api/news')
      .then(function (r) { renderNews(r.news || []); })
      .catch(function (e) {
        var box = $('saNewsList');
        if (box) box.innerHTML = '<div class="sa-empty">Не удалось загрузить: ' + esc(e.message) + '</div>';
      });
  }

  function fillNewsForm(item) {
    newsEditingId = item.id;
    newsMedia = (item.media || []).slice();
    $('saNewsTitle').value = item.title || '';
    $('saNewsBody').value = item.body || '';
    $('saNewsPublish').checked = !!item.isPublished;
    $('saNewsSave').textContent = 'сохранить';
    show('saNewsEditing', true);
    show('saNewsCancelEdit', false);
    renderNewsFiles();
    updateNewsCounter();
    msg('saNewsMsg', '');
    $('saNewsTitle').focus();
    $('saNewsTitle').scrollIntoView({ block: 'center' });
  }

  /** Переключение публикации без правки текста: тот же PATCH, но с текущим
   *  содержимым. Отдельного маршрута нет намеренно — иначе пришлось бы
   *  дублировать всю валидацию ради одного флага. */
  function setNewsPublished(id, publish) {
    var item = newsCache[id];
    if (!item) return;
    api('/subadmin/api/news/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: { title: item.title, body: item.body, media: item.media || [], publish: publish },
    })
      .then(function () {
        toast(publish ? 'Новость опубликована' : 'Новость снята с публикации');
        return loadNews();
      })
      .catch(function (e) { toast(e.message, true); });
  }

  /** Кэш последнего списка: нужен кнопке публикации, которой нужны текущие
   *  title/body новости, а список строк их не держит. */
  var newsCache = {};

  function onNewsListClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var id = btn.dataset.id;
    var act = btn.dataset.act;

    if (act === 'editnews') {
      if (newsCache[id]) fillNewsForm(newsCache[id]);
      return;
    }

    if (act === 'publishnews') {
      setNewsPublished(id, true);
      return;
    }

    if (act === 'unpublishnews') {
      if (!confirm('Снять новость с публикации? Она пропадёт из ленты на сайте, но останется здесь как черновик.')) return;
      setNewsPublished(id, false);
      return;
    }

    if (act === 'delnews') {
      if (!confirm('Удалить новость безвозвратно? Вложения тоже будут удалены.')) return;
      btn.disabled = true;
      api('/subadmin/api/news/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          if (newsEditingId === id) resetNewsForm();
          toast('Новость удалена');
          return loadNews();
        })
        .catch(function (err) { toast(err.message, true); btn.disabled = false; });
      return;
    }

    if (act === 'rmnewsfile') {
      var index = Number(btn.dataset.index);
      if (!isFinite(index)) return;
      // Файл с диска удалит сервер, когда новость сохранится с новым списком.
      // Намеренно не удаляем сейчас: если пользователь передумает и отменит
      // правку, файл должен остаться.
      newsMedia.splice(index, 1);
      renderNewsFiles();
      newsPreview(!$('saNewsPreview').hidden);
    }
  }

  /* ---------------------------------------------------------------- модерация чата */

  // Сообщения, выбранные галочками. Храним Set, выбор не теряется при перерисовке.
  var picked = new Set();

  function messageHtml(m) {
    var removed = !!m.deletedAt;
    return '' +
      '<div class="sa-msgrow' + (removed ? ' is-removed' : '') + (picked.has(m.id) ? ' is-checked' : '') + '" data-id="' + esc(m.id) + '">' +
        '<input class="sa-msgrow-check" type="checkbox" data-act="pick" data-id="' + esc(m.id) + '"' +
          (removed ? ' disabled' : '') + (picked.has(m.id) ? ' checked' : '') +
          ' aria-label="Выбрать сообщение">' +
        '<div class="sa-msgrow-body">' +
          '<div class="sa-msgrow-head">' +
            '<span class="sa-msgrow-author">' + esc(m.username) + '</span>' +
            '<span class="sa-msgrow-time">' + dateOf(m.timestamp) + ' ' + timeOf(m.timestamp) + '</span>' +
          '</div>' +
          '<div class="sa-msgrow-text">' + esc(m.text) + '</div>' +
        '</div>' +
        (removed
          ? ''
          : '<button class="sa-btn sa-btn--danger sa-btn--sm" type="button" data-act="delmsg" data-id="' + esc(m.id) + '">удалить</button>') +
      '</div>';
  }

  function renderMessages(messages) {
    var box = $('saMessages');
    if (!box) return;

    if (!messages.length) {
      box.innerHTML = '<div class="sa-empty">В общем чате пока нет сообщений</div>';
    } else {
      box.innerHTML = messages.map(messageHtml).join('');
    }
    updateBulkBar();
  }

  function updateBulkBar() {
    var bar = $('saBulkBar');
    var count = $('saBulkCount');
    if (count) count.textContent = 'выбрано: ' + picked.size;
    if (bar) bar.hidden = picked.size === 0;
  }

  function loadMessages() {
    return api('/subadmin/api/general-messages?limit=200')
      .then(function (r) {
        msg('saMsgsMsg', '');
        // снять с выбора то, чего уже нет (уже удалили в другой вкладке)
        var present = {};
        r.messages.forEach(function (m) { present[m.id] = true; });
        picked.forEach(function (id) { if (!present[id]) picked.delete(id); });
        renderMessages(r.messages);
      })
      .catch(function (e) {
        var box = $('saMessages');
        if (box) box.innerHTML = '<div class="sa-empty">Не удалось загрузить: ' + esc(e.message) + '</div>';
        toast(e.message, true);
      });
  }

  function clearPicks() {
    picked.clear();
    var checks = document.querySelectorAll('#saMessages .sa-msgrow-check');
    Array.prototype.forEach.call(checks, function (c) { c.checked = false; });
    Array.prototype.forEach.call(document.querySelectorAll('#saMessages .sa-msgrow'), function (r) {
      r.classList.remove('is-checked');
    });
    updateBulkBar();
  }

  function onMessagesClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;

    var id = btn.dataset.id;
    var act = btn.dataset.act;

    if (act === 'pick') {
      if (btn.checked) picked.add(id); else picked.delete(id);
      var row = btn.closest('.sa-msgrow');
      if (row) row.classList.toggle('is-checked', btn.checked);
      updateBulkBar();
      return;
    }

    if (act === 'delmsg') {
      if (!confirm('Удалить сообщение? Оно заменится плашкой «удалено администратором» у всех.')) return;
      btn.disabled = true;
      api('/subadmin/api/general-messages/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          toast('Сообщение удалено — у всех в чате оно уже исчезло');
          return loadMessages();
        })
        .catch(function (err) { toast(err.message, true); btn.disabled = false; });
      return;
    }
  }

  function bulkDelete() {
    if (!picked.size) return;
    var n = picked.size;
    if (!confirm('Удалить выбранные сообщения (' + n + ')? У всех в чате они заменятся плашкой «удалено администратором».')) return;

    var btn = $('saBulkDelete');
    if (btn) btn.disabled = true;
    api('/subadmin/api/general-messages/delete', { method: 'POST', body: { ids: Array.from(picked) } })
      .then(function (r) {
        var skipped = r.skipped ? ', пропущено: ' + r.skipped : '';
        toast('Удалено: ' + r.deleted + skipped);
        picked.clear();
        return loadMessages();
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  /* ------------------------------------------------------------------ старт */

  function init() {
    addOption();
    addOption();

    $('saLoginForm').addEventListener('submit', onLoginSubmit);
    $('saCreate').addEventListener('click', onCreate);
    $('saRefresh').addEventListener('click', load);
    $('saLogout').addEventListener('click', logout);
    $('saList').addEventListener('click', onListClick);
    $('saMessages').addEventListener('click', onMessagesClick);
    $('saMsgsRefresh').addEventListener('click', loadMessages);
    $('saBulkDelete').addEventListener('click', bulkDelete);
    $('saBulkClear').addEventListener('click', clearPicks);

    $('saNewsSave').addEventListener('click', saveNews);
    $('saNewsRefresh').addEventListener('click', loadNews);
    $('saNewsList').addEventListener('click', onNewsListClick);
    $('saNewsUpload').addEventListener('click', uploadNewsFiles);
    $('saNewsFile').addEventListener('change', syncNewsUploadBtn);
    $('saNewsBody').addEventListener('input', updateNewsCounter);
    $('saNewsBody').addEventListener('input', function () {
      // Предпросмотр, если он открыт, живёт вместе с текстом: иначе пришлось
      // бы жать кнопку после каждой правки, чтобы увидеть результат.
      if (!$('saNewsPreview').hidden) newsPreview(true);
    });
    $('saNewsCancelEdit').addEventListener('click', function () {
      resetNewsForm();
      toast('Правка отменена');
    });
    $('saNewsPreviewBtn').addEventListener('click', function () {
      newsPreview($('saNewsPreview').hidden);
      if (!$('saNewsPreview').hidden) {
        $('saNewsPreview').scrollIntoView({ block: 'nearest' });
      }
    });

    $('saAddOption').addEventListener('click', function () {
      var input = addOption();
      if (input) input.focus();
    });

    $('saOptions').addEventListener('click', function (e) {
      var del = e.target.closest ? e.target.closest('.sa-opt-del') : null;
      if (!del) return;
      var box = $('saOptions');
      if (box.children.length <= MIN_OPTIONS) {
        toast('Нужно минимум ' + MIN_OPTIONS + ' варианта', true);
        return;
      }
      del.closest('.sa-opt').remove();
      renumberOptions();
    });

    if (token) {
      enterApp();
    } else {
      show('saLogin', true);
      var pw = $('saPassword');
      if (pw) pw.focus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
