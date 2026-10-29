/* Площадка «Самореализация»: переход из мессенджера, форма предложений и
   публичная лента. Разметка живёт здесь и в selfrealize.html, стили — в
   css/selfrealize.css. Мессенджер про этот модуль ничего не знает, кроме
   вызова Selfrealize.headerBtn() при сборке шапки вкладки Chats. */

window.Selfrealize = (function () {
  // Путь без домена: на боевом сервере это и есть wlvorti.ru:3000/selfrealize,
  // а на локальной разработке кнопка не уводит на боевой сервер.
  const PATH = '/selfrealize';
  const API_PATH = '/selfrealize/suggestions';
  const NEWS_API = '/selfrealize/news';
  const MAX_LEN = 2000;
  const PAGE = 30;
  const NEWS_PAGE = 10;
  const POLL_MS = 20000;

  function headerBtn() {
    return `<a class="selfrealize-btn" href="${PATH}">Самореализация</a>`;
  }

  /* ---------- Форма предложений ---------- */

  function el(id) {
    return document.getElementById(id);
  }

  function showMsg(node, text, state) {
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.textContent = '';
      node.removeAttribute('data-state');
      return;
    }
    node.hidden = false;
    node.setAttribute('data-state', state);
    node.innerHTML = text;
  }

  /** Показать/спрятать счётчик и подсказку у галочки. */
  function syncCounter(textEl, countEl, anonEl, hintEl) {
    const len = textEl.value.length;
    countEl.textContent = `${len} / ${MAX_LEN}`;
    countEl.classList.toggle('is-over', len > MAX_LEN * 0.9);

    const anon = anonEl.checked;
    hintEl.textContent = anon
      ? 'ваше имя не сохранится и не будет видно'
      : 'предложение придёт под вашим именем';

    textEl.placeholder = anon
      ? 'анонимно — можно писать всё, что угодно'
      : 'например: запись к преподавателю, список кружков, история занятий…';
  }

  function initForm(onSubmitted) {
    const form = el('srForm');
    if (!form) return;

    const textEl = el('srText');
    const countEl = el('srCount');
    const anonEl = el('srAnon');
    const hintEl = el('srAnonHint');
    const msgEl = el('srMsg');
    const submitEl = el('srSubmit');

    if (!textEl || !countEl || !anonEl || !hintEl || !submitEl) return;

    syncCounter(textEl, countEl, anonEl, hintEl);
    textEl.addEventListener('input', () => syncCounter(textEl, countEl, anonEl, hintEl));
    anonEl.addEventListener('change', () => syncCounter(textEl, countEl, anonEl, hintEl));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitEl.disabled) return;

      const text = textEl.value.trim();
      const anonymous = anonEl.checked;

      if (text.length < 3) {
        showMsg(msgEl, 'Напишите хотя бы пару слов — так предложение будет понятнее.', 'err');
        textEl.focus();
        return;
      }

      // Токен нужен только чтобы подписать предложение именем аккаунта.
      // При анонимной отправке он не передаётся вовсе — иначе сервер всё
      // равно узнает, кто отправил, даже если не запишет это в базу.
      const token = anonymous ? null : localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      submitEl.disabled = true;
      const originalLabel = submitEl.textContent;
      submitEl.textContent = 'отправляем…';
      showMsg(msgEl, '', '');

      try {
        const res = await fetch(API_PATH, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text, anonymous }),
        });

        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          // Протухший токен: подпись не получится — предлагаем анонимно.
          if (res.status === 401 && !anonymous) {
            showMsg(
              msgEl,
              'Войдите в аккаунт, чтобы отправить от своего имени, — или поставьте галочку «Отправить анонимно».',
              'err'
            );
          } else {
            const msg = (data && data.message) || 'Не удалось отправить. Попробуйте чуть позже.';
            showMsg(msgEl, msg, 'err');
          }
          return;
        }

        const item = data && data.item;
        // Предложение появляется в ленте сразу, не дожидаясь перезагрузки.
        if (item && onSubmitted) onSubmitted(item);

        showMsg(
          msgEl,
          item && item.author
            ? `Спасибо! Предложение уже в ленте — под именем <b>${item.author}</b>.`
            : 'Спасибо! Предложение уже в ленте — без подписи.',
          'ok'
        );
        form.reset();
        syncCounter(textEl, countEl, anonEl, hintEl);
      } catch {
        showMsg(msgEl, 'Сеть недоступна. Проверьте соединение и попробуйте ещё раз.', 'err');
      } finally {
        submitEl.disabled = false;
        submitEl.textContent = originalLabel;
      }
    });
  }

  /* ---------- Лента занятий ---------- */

  const SESSIONS_API = '/selfrealize/sessions';
  const SESSION_PAGE = 12;

  /** Токен мессенджера. Запись и кабинет без него недоступны, поэтому все
   *  запросы, меняющие данные, идут с заголовком — иначе сервер ответит 401,
   *  а пользователь увидит «что-то пошло не так» вместо «войдите». */
  function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' };
  }

  function isAuthed() {
    return !!localStorage.getItem('token');
  }

  /** Границы «сегодня»/«завтра»/«недели» считаются в браузере, а не на
   *  сервере: часовой пояс ученика и сервера может различаться, и занятие в
   *  23:30 «сегодня» на сервере было бы «завтра». Клиент знает своё «сегодня»
   *  точно, поэтому диапазон миллисекунд считается здесь и уходит в from/to. */
  function whenRange(when) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 24 * 60 * 60 * 1000;

    if (when === 'today') return { from: startOfDay, to: startOfDay + day - 1 };
    if (when === 'tomorrow') return { from: startOfDay + day, to: startOfDay + 2 * day - 1 };
    if (when === 'week') return { from: startOfDay, to: startOfDay + 7 * day - 1 };
    return null;
  }

  /** «сегодня в 18:30», «завтра в 10:00», «12 сентября в 15:00». */
  function sessionWhen(ts) {
    const now = new Date();
    const d = new Date(ts);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 24 * 60 * 60 * 1000;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    if (ts >= startOfDay && ts < startOfDay + day) return `сегодня в ${time}`;
    if (ts >= startOfDay + day && ts < startOfDay + 2 * day) return `завтра в ${time}`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' в ' + time;
  }

  /** «через 2 ч», «завтра» — до занятия, а не после: в ленте занятие всегда в
   *  будущем, и «2 ч назад» там бессмысленно. */
  function sessionIn(ts) {
    const diff = ts - Date.now();
    if (diff <= 0) return 'уже началось';
    if (diff < 60 * 60 * 1000) return `через ${Math.max(1, Math.round(diff / 60000))} мин`;
    if (diff < 24 * 60 * 60 * 1000) return `через ${Math.round(diff / 3600000)} ч`;
    const days = Math.round(diff / (24 * 3600000));
    return days === 1 ? 'завтра' : `через ${days} дн`;
  }

  /**
   * Карточка занятия.
   *
   * Всё текстовое ставится через textContent: названия и описания пишут
   * пользователи. Описание приходит обычным текстом, а не markdown — оно
   * короткое, и рендерить в нём разметку значило бы открыть путь для ссылок
   * в публичной ленте.
   */
  function buildSession(item, ctx) {
    const row = document.createElement('article');
    row.className = 'sr-sess';
    row.setAttribute('data-id', item.id);
    if (item.status === 'cancelled') row.setAttribute('data-cancelled', '1');
    // Открытый набор не занимает колонку со временем: там нечего показывать,
    // и пустая полоса слева выглядела бы дырой в карточке.
    if (item.isOpen) row.setAttribute('data-open', '1');
    else row.appendChild(whenCol(item));

    const main = document.createElement('div');
    main.className = 'sr-sess-main';

    // Метка набора — обычная горизонтальная плашка над названием, а не
    // колонка с вертикальным текстом: вертикальный текст в карточке не
    // читается, а колонка ради двух слов оставляет дыру в вёрстке.
    if (item.isOpen) {
      const badge = document.createElement('span');
      badge.className = 'sr-sess-openbadge';
      badge.textContent = 'набор открыт';
      main.appendChild(badge);
    } else if (item.enrollmentClosed) {
      // Закрытый набор помечаем явно: без метки он выглядит как обычное
      // занятие, и человек не понимает, почему нельзя записаться.
      const badge = document.createElement('span');
      badge.className = 'sr-sess-openbadge is-closed';
      badge.textContent = 'набор закрыт';
      main.appendChild(badge);
    }

    const title = document.createElement('h3');
    title.className = 'sr-sess-title';
    title.textContent = item.title;
    main.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'sr-sess-meta';
    if (item.direction) meta.append(metaBit('направление', item.direction));
    if (item.place) meta.append(metaBit('место', item.place));
    meta.append(metaBit('ведёт', item.hostNick));
    main.appendChild(meta);

    if (item.description) {
      const desc = document.createElement('p');
      desc.className = 'sr-sess-desc';
      desc.textContent = item.description;
      main.appendChild(desc);
    }

    const foot = document.createElement('div');
    foot.className = 'sr-sess-foot';
    foot.appendChild(seatsPill(item));
    foot.appendChild(sessionAction(item, ctx));
    main.appendChild(foot);

    // Причина отказа переживает перерисовку: она в состоянии, а не в кнопке.
    const flash = ctx.flash && ctx.flash.get(item.id);
    if (flash) {
      const msg = document.createElement('p');
      msg.className = 'sr-sess-msg';
      msg.setAttribute('role', 'status');
      msg.textContent = flash;
      main.appendChild(msg);
    }

    row.appendChild(main);
    return row;
  }

  /** Левая колонка карточки: когда. Для открытого набора её нет вовсе. */
  function whenCol(item) {
    const when = document.createElement('div');
    when.className = 'sr-sess-when';
    when.append(whenBig(item.startsAt), whenSub(item));
    return when;
  }

  function whenBig(ts) {
    const d = new Date(ts);
    const node = document.createElement('strong');
    node.textContent = sessionWhen(ts);
    node.setAttribute('title', d.toLocaleString('ru-RU'));
    return node;
  }

  function whenSub(item) {
    const node = document.createElement('span');
    if (item.isOpen) {
      node.textContent = 'дата не назначена';
      return node;
    }
    const duration = item.durationMin >= 60
      ? plural(item.durationMin / 60, 'час', 'часа', 'часов')
      : `${item.durationMin} мин`;
    node.textContent = `${duration} · ${sessionIn(item.startsAt)}`;
    return node;
  }

  function metaBit(label, value) {
    const node = document.createElement('span');
    node.className = 'sr-sess-bit';
    const b = document.createElement('b');
    b.textContent = label + ':';
    node.append(b, document.createTextNode(' ' + value));
    return node;
  }

  /** Места: сколько занято из скольких. Цвет зависит от остатка — «1 место»
   *  должно читаться как «успевай», а не как обычная подпись. */
  function seatsPill(item) {
    const node = document.createElement('span');
    const left = item.seatsLeft;
    node.className = 'sr-sess-seats';
    if (left <= 0) {
      node.setAttribute('data-state', 'full');
      node.textContent = 'мест нет';
    } else {
      if (left <= 2) node.setAttribute('data-state', 'few');
      node.textContent = `${left} ${plural(left, 'место', 'места', 'мест')} свободно`;
    }
    if (item.capacity) node.setAttribute('title', `занято ${item.seatsTaken} из ${item.capacity}`);
    return node;
  }

  /**
   * Кнопка карточки: «войти», «вы записаны», «отменить» или отказ с причиной.
   *
   * Состояние «вы записаны» приходит из /mine, иначе гостю показывалась бы
   * кнопка входа даже после записи. Отдельный запрос на каждое занятие ленты
   * не делаем — карточек на странице десятки, а состояние запрашивается один
   * раз на всю страницу и раздаётся по id.
   */
  function sessionAction(item, ctx) {
    const btn = document.createElement('button');
    btn.className = 'sr-btn sr-sess-act';
    btn.type = 'button';

    const enrolled = ctx.myEnrollments.get(item.id);

    if (item.status === 'cancelled') {
      btn.textContent = 'занятие отменено';
      btn.disabled = true;
      return btn;
    }
    // Ведущий не записывается на своё занятие: сервер это всё равно
    // запрещает. Раньше кнопка «записаться» у своего занятия была тупиком —
    // каждый клик возвращал 409, а сообщение тут же затиралось перерисовкой.
    if (item.isHost) {
      btn.textContent = 'вы ведёте это занятие';
      btn.disabled = true;
      return btn;
    }
    // Закрытый набор виден и читается, но записаться нельзя. Проверка после
    // «вы записаны»: уже записанный видит «отменить запись» — закрытие набора
    // не отменяет его собственной записи.
    if (item.enrollmentClosed && !enrolled) {
      btn.textContent = 'набор закрыт';
      btn.disabled = true;
      return btn;
    }
    if (enrolled) {
      btn.textContent = 'отменить запись';
      btn.classList.add('is-enrolled');
      btn.addEventListener('click', () => ctx.onCancel(item.id, btn));
      return btn;
    }
    if (item.seatsLeft <= 0) {
      btn.textContent = 'мест нет';
      btn.disabled = true;
      return btn;
    }

    btn.textContent = 'войти';
    btn.addEventListener('click', () => ctx.onEnroll(item.id, btn));
    return btn;
  }

  /**
   * Лента занятий с фильтрами.
   *
   * Пагинация по offset, а не по курсору: лента отсортирована по времени
   * ВОЗРАСТАЮЩЕЙ, метки повторяются весь день, и курсор «после метки» между
   * двумя занятиями одного дня дал бы дыру в списке.
   */
  function initSessions() {
    const feed = el('srSessionsFeed');
    const openFeed = el('srOpenFeed');
    const openSec = el('srOpenSec');
    const emptyEl = el('srSessionsEmpty');
    const countEl = el('srSessionsCount');
    const moreBtn = el('srSessionsMore');
    const moreWrap = el('srSessionsMoreWrap');
    const qEl = el('srQ');
    const placeEl = el('srPlace');
    const hostEl = el('srHost');
    if (!feed) return null;

    const state = {
      when: 'all',
      offset: 0,
      total: 0,
      loading: false,
      items: new Map(),
      // Открытый набор живёт отдельно от постраничной ленты: его некуда
      // положить в items, потому что там offset-пагинация, а набор всегда
      // показывается целиком.
      openItems: new Map(),
      // Свои записи: один запрос на страницу, раздаётся карточкам по id.
      myEnrollments: new Map(),
      // Причина отказа на карточке (мест нет, занятие уже идёт и т.п.).
      // Хранится в состоянии, а не в кнопке: перерисовка после 409 уничтожила
      // бы текст, и человек видел бы кнопку, которая молча не работает.
      flash: new Map(),
    };

    function query() {
      const qs = new URLSearchParams();
      const q = (qEl && qEl.value.trim()) || '';
      const place = (placeEl && placeEl.value.trim()) || '';
      const host = (hostEl && hostEl.value.trim()) || '';
      if (q) qs.set('q', q);
      if (place) qs.set('place', place);
      if (host) qs.set('hostNick', host);
      const range = whenRange(state.when);
      if (range) {
        qs.set('from', String(range.from));
        qs.set('to', String(range.to));
      }
      qs.set('limit', String(SESSION_PAGE));
      qs.set('offset', String(state.offset));
      return qs;
    }

    /** Фильтры лежат в адресной строке: страницу с найденным можно
     *  переслать, а «назад» вернёт к прошлому набору условий. */
    function syncUrl() {
      const params = new URLSearchParams();
      if (qEl && qEl.value.trim()) params.set('q', qEl.value.trim());
      if (placeEl && placeEl.value.trim()) params.set('place', placeEl.value.trim());
      if (hostEl && hostEl.value.trim()) params.set('host', hostEl.value.trim());
      if (state.when !== 'all') params.set('when', state.when);

      const qs = params.toString();
      const hash = qs ? '?' + qs + '#sessions' : '#sessions';
      history.replaceState(null, '', location.pathname + hash);
    }

    function restoreFromUrl() {
      const params = new URLSearchParams(location.search);
      if (qEl) qEl.value = params.get('q') || '';
      if (placeEl) placeEl.value = params.get('place') || '';
      if (hostEl) hostEl.value = params.get('host') || '';
      const when = params.get('when');
      state.when = when || 'all';
      syncChips();
    }

    function syncChips() {
      for (const chip of document.querySelectorAll('.sr-chip[data-when]')) {
        chip.classList.toggle('is-active', chip.dataset.when === state.when);
      }
    }

    function renderEmpty(text) {
      if (!emptyEl) return;
      // «Ничего не нашлось» и «набор пуст, но занятия есть» — разные вещи:
      // пустое сообщение под лентой должно появляться только когда пуста
      // вся выдача, иначе человек видит «занятий нет» при открытом наборе.
      emptyEl.hidden = state.items.size > 0 || state.openItems.size > 0;
      emptyEl.textContent = text;
    }

    function renderCount() {
      if (!countEl) return;
      countEl.textContent = state.total
        ? `${state.total} ${plural(state.total, 'занятие', 'занятия', 'занятий')}`
        : '';
    }

    const ctx = {
      myEnrollments: state.myEnrollments,
      flash: state.flash,
      onEnroll: enrollInto,
      onCancel: cancelFrom,
    };

    /** Запись. Ошибки сервера показываются на самой карточке, а не в общем
     *  сообщении сверху: «мест больше нет» относится к этому занятию, а не
     *  ко всей странице. */
    async function enrollInto(id, btn) {
      if (!isAuthed()) {
        btn.textContent = 'войдите, чтобы записаться';
        btn.disabled = true;
        return;
      }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'записываем…';

      try {
        const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(id)}/enroll`, {
          method: 'POST',
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          // Причину отказа кладём в состояние карточки и только потом
          // перерисовываем ленту: текст на самой кнопке перерисовка стёрла бы,
          // и человек снова жал бы кнопку, которая молча не работает.
          state.flash.set(id, (data && data.message) || 'Не удалось записаться');
          // Мест могло не хватить именно сейчас: обновляем карточку, чтобы
          // показать «мест нет», иначе кнопка будет предлагать то, чего нет.
          // Состояние записи сбрасываем — сервер только что сказал, что её нет.
          state.myEnrollments.delete(id);
          reload();
          return;
        }

        state.flash.delete(id);
        state.myEnrollments.set(id, true);
        btn.textContent = 'отменить запись';
        btn.classList.add('is-enrolled');
        btn.disabled = false;
        void original;
        reload();
      } catch {
        btn.textContent = 'нет связи';
        btn.disabled = false;
      }
    }

    async function cancelFrom(id, btn) {
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'отменяем…';

      try {
        const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(id)}/enroll`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          state.flash.set(id, (data && data.message) || 'Не удалось отменить');
          state.myEnrollments.delete(id);
          reload();
          return;
        }

        state.flash.delete(id);
        state.myEnrollments.delete(id);
        reload();
        void original;
      } catch {
        btn.textContent = 'нет связи';
        btn.disabled = false;
      }
    }

    /** Свои записи для текущей страницы: один запрос вместо N. */
    async function loadMyEnrollments(ids) {
      if (!isAuthed() || ids.length === 0) return;
      // Проверяем только те, где состояние ещё неизвестно, — иначе каждая
      // перезагрузка ленты шла бы в кабинет.
      const unknown = ids.filter((id) => !state.myEnrollments.has(id));
      if (!unknown.length) return;

      await Promise.all(
        unknown.map(async (id) => {
          try {
            const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(id)}/mine`, {
              headers: authHeaders(),
            });
            if (!res.ok) return;
            const data = await res.json();
            // Значение 1, а не true: Map должен различать «записан» и
            // «не записан», иначе карточка подумает, что запись есть.
            state.myEnrollments.set(id, data.enrolled ? 1 : 0);
          } catch {
            // Сеть моргнула: карточка останется нейтральной, кнопка
            // предложит записаться и сервер ответит «уже записаны».
          }
        })
      );
    }

    function draw() {
      const items = Array.from(state.items.values());
      feed.textContent = '';
      for (const item of items) feed.appendChild(buildSession(item, ctx));

      // Набор рисуется всегда, даже когда лента по датам пуста — и наоборот.
      // Оба блока обновляются вместе, потому что приходят одним ответом и
      // зависят от одних и тех же фильтров.
      if (openFeed) {
        const openItems = Array.from(state.openItems.values());
        openFeed.textContent = '';
        for (const item of openItems) openFeed.appendChild(buildSession(item, ctx));
        if (openSec) openSec.hidden = openItems.length === 0;
      }

      renderCount();
      renderEmpty(
        state.total === 0 && state.openItems.size === 0
          ? 'Занятий не нашлось. Попробуйте снять фильтры или создать своё.'
          : ''
      );
      if (moreWrap) moreWrap.hidden = !state.hasMore;
    }

    async function load(append) {
      if (state.loading) return;
      state.loading = true;
      if (moreBtn) moreBtn.disabled = true;

      try {
        const res = await fetch(`${SESSIONS_API}?${query().toString()}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          renderEmpty('Не удалось загрузить занятия. Попробуйте обновить страницу.');
          return;
        }

        state.total = data.total || 0;
        state.hasMore = !!data.hasMore;

        // Набор открыт всегда приезжает целиком: пагинация к нему не
        // относится. Поэтому он заменяется, а не дописывается — иначе вторая
        // страница ленты показала бы те же карточки повторно.
        state.openItems = new Map();
        for (const item of data.openItems || []) state.openItems.set(item.id, item);

        if (append) {
          for (const item of data.items || []) state.items.set(item.id, item);
          state.offset = data.offset;
        } else {
          state.items = new Map();
          for (const item of data.items || []) state.items.set(item.id, item);
          state.offset = data.offset;
        }

        // Свои записи запрашиваются и для карточек набора: записаться можно
        // и туда, и кнопка «отменить запись» должна работать одинаково.
        await loadMyEnrollments([...(data.items || []), ...(data.openItems || [])].map((i) => i.id));
        draw();
      } catch {
        renderEmpty('Нет связи с сервером. Проверьте подключение.');
      } finally {
        state.loading = false;
        if (moreBtn) {
          moreBtn.disabled = false;
          moreBtn.textContent = 'показать ещё';
        }
      }
    }

    function reload() {
      state.offset = 0;
      load(false);
    }

    /** Смывает причины отказов при смене фильтров или поиска.
     *  Вызывается только из действий человека: автоперерисовка после 409
     *  наоборот обязана сохранить сообщение, ради которого и случилась. */
    function clearFlash() {
      if (state.flash.size) state.flash.clear();
    }

    /* Поиск с задержкой: на каждый символ ходить на сервер — лишние запросы,
       но и мгновенный ответ по локальному фильтру тут невозможен, текст
       приходит с сервера. 300 мс — привычная пауза, после которой запрос уже
       не отменяется. */
    let searchTimer = null;
    function onSearchInput() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        clearFlash();
        syncUrl();
        reload();
      }, 300);
    }

    if (qEl) qEl.addEventListener('input', onSearchInput);
    if (placeEl) placeEl.addEventListener('input', onSearchInput);
    if (hostEl) hostEl.addEventListener('input', onSearchInput);

    for (const chip of document.querySelectorAll('.sr-chip[data-when]')) {
      chip.addEventListener('click', () => {
        state.when = chip.dataset.when;
        clearFlash();
        syncChips();
        syncUrl();
        reload();
      });
    }

    if (moreBtn) moreBtn.addEventListener('click', () => load(true));

    restoreFromUrl();

    return {
      start() {
        if (state.items.size === 0) load(false);
      },
      reload,
    };
  }

  /* ---------- Форма создания занятия ---------- */

  /**
   * datetime-local отдаёт строку «2026-10-05T18:30» в ЛОКАЛЬНОМ времени, без
   * часового пояса. new Date() разбирает её как местное — ровно то, что нужно:
   * ведущий написал 18:30 по своему времени, и 18:30 должно быть в ленте.
   * Если бы мы отправили сырую строку, сервер принял бы её за 00:00 UTC, и
   * занятие уехало бы на несколько часов.
   */
  function localInputToMs(value) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  /** Минимальная дата в datetime-local — «через час», как требует сервер.
   *  Без этого подсказки браузер позволял выбрать прошедшее время, и занятие
   *  отклонялось только после отправки. */
  function minDateTime() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function initSessionForm(onCreated) {
    const form = el('srCreateForm');
    const wrap = el('srCreateWrap');
    const openBtn = el('srCreateOpen');
    const closeBtn = el('srCreateClose');
    const msgEl = el('srCreateMsg');
    const submitEl = el('srCreateSubmit');
    const dateEl = el('srNewDate');
    const hasDateEl = el('srNewHasDate');
    const dateWrap = el('srNewDateWrap');
    const durationEl = el('srNewDuration');
    const placeWrap = el('srNewPlaceWrap');
    const placeEl = el('srNewPlace');
    if (!form || !wrap || !openBtn) return null;

    /** Собирает вид места из радиокнопок.
     *  Радио, а не select: вариантов три, и выбор должен быть виден целиком —
     *  выпадающий список прятал бы «в кабинете» под стрелкой. */
    function placeKind() {
      const checked = form.querySelector('input[name="srPlaceKind"]:checked');
      return checked ? checked.value : 'custom';
    }

    function syncPlace() {
      const kind = placeKind();
      if (placeWrap) placeWrap.hidden = kind !== 'custom';
      // Подсветка выбранного чипа: у radio нет своей стилизации в этой
      // системе, а без неё не видно, какой вариант выбран.
      for (const label of form.querySelectorAll('.sr-place-pick .sr-chip')) {
        const input = label.querySelector('input');
        label.classList.toggle('is-active', !!input && input.checked);
      }
    }

    /** Дата и всё, что имеет смысл только вместе с ней.
     *  Длительность без даты не выводится: она не показывается в карточке, и
     *  спрашивать её — значит спрашивать то, что не используется. */
    function syncDate() {
      const on = !!hasDateEl && hasDateEl.checked;
      if (dateWrap) dateWrap.hidden = !on;
      if (dateEl) {
        dateEl.disabled = !on;
        dateEl.required = on;
        if (on) dateEl.min = minDateTime();
      }
      if (durationEl) {
        durationEl.disabled = !on;
        // Прячем только ЯЧЕЙКУ длительности, а не её .sr-two: места лежат в
        // той же сетке, и скрытие контейнера убирало обязательное «Мест»
        // ровно в том режиме, где его чаще всего и заполняют — в наборе без
        // даты. Лимит мест обязателен всегда.
        const holder = el('srNewDurationWrap');
        if (holder) holder.hidden = !on;
      }
    }

    for (const input of form.querySelectorAll('input[name="srPlaceKind"]')) {
      input.addEventListener('change', syncPlace);
    }
    if (hasDateEl) hasDateEl.addEventListener('change', syncDate);
    syncPlace();
    syncDate();

    function open() {
      if (!isAuthed()) {
        showMsg(msgEl, 'Войдите в аккаунт, чтобы создать занятие. <a class="sr-lnk" href="/">войти</a>', 'err');
        wrap.hidden = false;
        return;
      }
      wrap.hidden = false;
      if (dateEl && hasDateEl && hasDateEl.checked && !dateEl.value) {
        // Час от текущего момента — самый частый выбор, и он же минимальный
        // допустимый: подставлять его экономит клик и не подставляет ошибку.
        const d = new Date(Date.now() + 60 * 60 * 1000);
        d.setMinutes(0, 0, 0);
        const pad = (n) => String(n).padStart(2, '0');
        dateEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function close() {
      wrap.hidden = true;
      showMsg(msgEl, '', '');
    }

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitEl && submitEl.disabled) return;

      const title = (el('srNewTitle').value || '').trim();
      const capacity = Number((el('srNewSeats') || {}).value || 0);
      const withDate = !!(hasDateEl && hasDateEl.checked);
      const startsAt = withDate && dateEl ? localInputToMs(dateEl.value) : NaN;
      const kind = placeKind();

      if (title.length < 3) {
        showMsg(msgEl, 'Придумайте название хотя бы из трёх символов.', 'err');
        el('srNewTitle').focus();
        return;
      }
      if (withDate && !Number.isFinite(startsAt)) {
        showMsg(msgEl, 'Укажите дату и время занятия.', 'err');
        if (dateEl) dateEl.focus();
        return;
      }
      if (withDate && startsAt < Date.now()) {
        showMsg(msgEl, 'Время уже прошло. Поставьте будущее.', 'err');
        return;
      }
      if (!(capacity >= 1 && capacity <= 200)) {
        showMsg(msgEl, 'Мест должно быть от 1 до 200.', 'err');
        return;
      }
      if (kind === 'custom' && !((el('srNewPlace') || {}).value || '').trim()) {
        showMsg(msgEl, 'Укажите место или выберите «в вебе» / «в кабинете».', 'err');
        if (placeEl) placeEl.focus();
        return;
      }

      // startsAt: null — это не «не прислали», а «даты нет». Отправлять
      // undefined нельзя: клиентский JSON его выкинет, и сервер решил бы, что
      // ведущий просто не заполнил поле, а не выбрал открытый набор.
      const body = {
        title,
        startsAt: withDate ? startsAt : null,
        capacity,
        durationMin: withDate && durationEl ? Number(durationEl.value || 60) : null,
        placeKind: kind,
        place: kind === 'custom' ? (el('srNewPlace').value || '').trim() : '',
        description: ((el('srNewDesc') || {}).value || '').trim(),
        direction: ((el('srNewDirection') || {}).value || '').trim(),
      };

      const label = submitEl ? submitEl.textContent : '';
      if (submitEl) {
        submitEl.disabled = true;
        submitEl.textContent = 'публикуем…';
      }
      showMsg(msgEl, '', '');

      try {
        const res = await fetch(SESSIONS_API, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const msg = (data && data.message) || 'Не удалось создать занятие';
          showMsg(msgEl, msg, 'err');
          return;
        }

        // Занятие с внешней ссылкой уходит на проверку — об этом честнее
        // сказать сразу, чем показать его в ленте и удивляться, что его нет.
        if (data.needsReview) {
          showMsg(msgEl, `Занятие создано и ждёт проверки: ${data.reason}`, 'ok');
        } else if (data.isOpen) {
          showMsg(msgEl, 'Набор открыт. Когда решите дату — назначьте её в кабинете.', 'ok');
        } else {
          showMsg(msgEl, 'Занятие опубликовано, оно в ленте.', 'ok');
        }

        form.reset();
        syncPlace();
        syncDate();
        if (onCreated) onCreated(data);
      } catch {
        showMsg(msgEl, 'Нет связи с сервером.', 'err');
      } finally {
        if (submitEl) {
          submitEl.disabled = false;
          submitEl.textContent = label;
        }
      }
    });

    return { open, close };
  }

  /* ---------- Кабинет ---------- */

  /**
   * Кабинет: мои занятия (веду) и мои записи.
   *
   * Участников моих занятий показываем по кнопке на карточке: их список —
   * главная ценность для ведущего, но он пустой у большинства занятий, и
   * отдельная секция на всю страницу была бы пустым местом.
   */
  function initCabinet() {
    const body = el('srCabinetBody');
    const guest = el('srCabinetGuest');
    const sessionsFeed = el('srMySessionsFeed');
    const sessionsCount = el('srMySessionsCount');
    const enrollFeed = el('srMyEnrollFeed');
    const enrollCount = el('srMyEnrollCount');
    const enrollSec = el('srMyEnrollSec');
    if (!body || !sessionsFeed) return null;

    let loaded = false;
    // Причины отказов в кабинете живут отдельно от ленты: они относятся к
    // ведущему, а не к посетителю страницы.
    const cabFlash = new Map();

    function rowFor(item, opts) {
      const row = document.createElement('article');
      row.className = 'sr-sess';

      const main = document.createElement('div');
      main.className = 'sr-sess-main';

      const title = document.createElement('h3');
      title.className = 'sr-sess-title';
      title.textContent = item.title;
      main.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'sr-sess-meta';
      // Дата в кабинете обязательна даже больше, чем в ленте: ведущий сюда
      // приходит за расписанием, а не за списком названий.
      meta.appendChild(metaBit(item.isOpen ? 'когда' : 'начнётся', item.isOpen ? 'дата не назначена' : sessionWhen(item.startsAt)));
      if (opts.showHost) meta.append(metaBit('ведёт', item.hostNick));
      if (item.direction) meta.append(metaBit('направление', item.direction));
      if (item.place) meta.append(metaBit('место', item.place));
      main.appendChild(meta);

      const foot = document.createElement('div');
      foot.className = 'sr-sess-foot';

      if (opts.meetCode) {
        // Код встречи — то, ради чего ведущий сюда и приходит: без него он не
        // отличит «Участник A7K2» от «Участник B3M9» у двери.
        const code = document.createElement('span');
        code.className = 'sr-sess-code';
        code.textContent = 'ваш код: ' + opts.meetCode;
        foot.appendChild(code);
      }

      if (opts.onCancel) {
        const btn = document.createElement('button');
        btn.className = 'sr-btn sr-sess-act';
        btn.type = 'button';
        btn.textContent = 'отменить запись';
        btn.disabled = !item.canCancel;
        if (!item.canCancel) btn.title = 'Отмена закрыта за час до начала';
        btn.addEventListener('click', () => opts.onCancel(item.id, btn));
        foot.appendChild(btn);
      }

      if (opts.onParticipants) {
        const btn = document.createElement('button');
        btn.className = 'sr-btn sr-btn--ghost';
        btn.type = 'button';
        btn.textContent = `участники (${item.seatsTaken})`;
        btn.addEventListener('click', () => opts.onParticipants(item.id, btn));
        foot.appendChild(btn);

        if (item.status === 'pending') {
          const badge = document.createElement('span');
          badge.className = 'sr-sess-badge';
          badge.textContent = 'ждёт проверки';
          foot.appendChild(badge);
        }
        if (item.status === 'cancelled') {
          const badge = document.createElement('span');
          badge.className = 'sr-sess-badge';
          badge.textContent = 'отменено';
          foot.appendChild(badge);
        }
      }

      // Открытый набор в кабинете — единственное место, где дату можно
      // назначить задним числом. Отдельная кнопка, а не редактирование всей
      // карточки: ведущему в этот момент нужен один вопрос — «когда?» — и
      // форма создания занятия для этого годилась бы хуже.
      if (item.isOpen && opts.onSchedule) {
        const btn = document.createElement('button');
        btn.className = 'sr-btn';
        btn.type = 'button';
        btn.textContent = 'назначить дату';
        btn.addEventListener('click', () => opts.onSchedule(item, btn));
        foot.appendChild(btn);
      }

      // Закрыть/открыть набор. Занятие при этом остаётся в ленте — исчезло бы
      // оно только при полной отмене. Отдельная кнопка нужна ведущему, когда
      // он набрал людей и хочет прекратить запись, не отменяя само занятие.
      if (!item.isHost && opts.onToggleClosed && item.status !== 'cancelled') {
        const btn = document.createElement('button');
        btn.className = 'sr-btn sr-btn--ghost';
        btn.type = 'button';
        btn.textContent = item.enrollmentClosed ? 'открыть набор' : 'закрыть набор';
        btn.addEventListener('click', () => opts.onToggleClosed(item, btn));
        foot.appendChild(btn);
      }

      main.appendChild(foot);
      row.appendChild(main);
      return row;
    }

    /** Участники занятия — по нажатию. Список подменяет кнопку: он короткий,
     *  а разворачивать его в ленте без нужды незачем. */
    async function showParticipants(id, btn) {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'загружаем…';
      try {
        const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(id)}/participants`, {
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          btn.textContent = (data && data.message) || 'Не удалось';
          btn.disabled = false;
          return;
        }

        const items = data.items || [];
        btn.textContent = items.length
          ? items.map((p) => `${p.nick} · ${p.meetCode}`).join(', ')
          : 'пока никто не записался';

        const note = document.createElement('span');
        note.className = 'sr-sess-badge';
        note.textContent = 'код встречи: ' + data.meetCode;
        btn.parentNode.appendChild(note);
      } catch {
        btn.textContent = 'нет связи';
      } finally {
        btn.disabled = false;
        void original;
      }
    }

    async function cancelMyEnrollment(id, btn) {
      btn.disabled = true;
      btn.textContent = 'отменяем…';
      try {
        const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(id)}/enroll`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          btn.textContent = (data && data.message) || 'Не удалось';
          btn.disabled = false;
          return;
        }
        load();
      } catch {
        btn.textContent = 'нет связи';
        btn.disabled = false;
      }
    }

    /**
     * Назначить дату открытому набору.
     *
     * Поле вставляется прямо в строку карточки: отдельная модалка ради одного
     * datetime-поля была бы тремя экранами лишнего клика. После сохранения
     * строка перерисовывается целиком — занятие уезжает из блока «идёт набор»
     * в обычную ленту, и это изменение видно сразу.
     */
    async function scheduleOpen(item, btn) {
      if (el('srDateForId')) {
        el('srDateForId').focus();
        return;
      }

      const label = document.createElement('label');
      label.className = 'sr-lbl';
      label.textContent = 'дата и время';
      label.htmlFor = 'srDateForId';

      const input = document.createElement('input');
      input.id = 'srDateForId';
      input.className = 'sr-input sr-input--sm';
      input.type = 'datetime-local';
      input.min = minDateTime();

      const save = document.createElement('button');
      save.className = 'sr-btn';
      save.type = 'button';
      save.textContent = 'сохранить';

      const cancel = document.createElement('button');
      cancel.className = 'sr-btn sr-btn--ghost';
      cancel.type = 'button';
      cancel.textContent = 'отмена';

      const slot = document.createElement('span');
      slot.className = 'sr-date-inline';
      slot.append(label, input, save, cancel);

      // Ставим после кнопки «назначить дату»: поле появляется там, где человек
      // нажал, а не в конце строки, до которой ещё надо дотянуться.
      btn.parentNode.insertBefore(slot, btn.nextSibling);

      function cleanup() {
        slot.remove();
      }

      cancel.addEventListener('click', cleanup);

      save.addEventListener('click', async () => {
        const startsAt = localInputToMs(input.value);
        if (!Number.isFinite(startsAt) || startsAt < Date.now()) {
          input.focus();
          return;
        }
        save.disabled = true;
        save.textContent = 'сохраняем…';
        try {
          const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(item.id)}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ startsAt }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            save.disabled = false;
            save.textContent = (data && data.message) || 'не удалось';
            return;
          }
          cleanup();
          load();
        } catch {
          save.disabled = false;
          save.textContent = 'нет связи';
        }
      });
    }

    /**
     * Закрыть или открыть набор.
     *
     * Повторное нажатие не должно ждать ответа вслепую: при неудаче текст
     * кнопки возвращается к прежнему и подпись остаётся правдивой, а сообщение
     * сервера показывается на карточке — как при отказе в записи.
     */
    async function toggleClosed(item, btn) {
      const want = !item.enrollmentClosed;
      btn.disabled = true;
      btn.textContent = want ? 'закрываем…' : 'открываем…';
      try {
        const res = await fetch(`${SESSIONS_API}/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ enrollmentClosed: want }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          btn.textContent = want ? 'закрыть набор' : 'открыть набор';
          btn.disabled = false;
          if (data && data.message) {
            cabFlash.set(item.id, data.message);
            load();
          }
          return;
        }
        load();
      } catch {
        btn.textContent = want ? 'закрыть набор' : 'открыть набор';
        btn.disabled = false;
      }
    }

    async function load() {
      if (!isAuthed()) {
        body.hidden = true;
        if (guest) guest.hidden = false;
        return;
      }
      if (guest) guest.hidden = true;
      body.hidden = false;

      const [sessionsRes, enrollRes] = await Promise.all([
        fetch('/selfrealize/me/sessions', { headers: authHeaders() }).then((r) => r.json().catch(() => null)),
        fetch('/selfrealize/me/enrollments', { headers: authHeaders() }).then((r) => r.json().catch(() => null)),
      ]);

      const mySessions = (sessionsRes && sessionsRes.items) || [];
      const myEnrollments = (enrollRes && enrollRes.items) || [];

      sessionsFeed.textContent = '';
      if (!mySessions.length) {
        const empty = document.createElement('div');
        empty.className = 'sr-feed-empty';
        empty.textContent = 'Вы ещё не ведёте занятий.';
        sessionsFeed.appendChild(empty);
      }
      for (const item of mySessions) {
        sessionsFeed.appendChild(
          rowFor(item, {
            meetCode: item.meetCode,
            onParticipants: showParticipants,
            onSchedule: scheduleOpen,
            onToggleClosed: toggleClosed,
            flash: cabFlash,
          })
        );
      }
      if (sessionsCount) {
        sessionsCount.textContent = mySessions.length
          ? `${mySessions.length} ${plural(mySessions.length, 'занятие', 'занятия', 'занятий')}`
          : '';
      }

      if (enrollFeed) {
        enrollFeed.textContent = '';
        if (!myEnrollments.length) {
          const empty = document.createElement('div');
          empty.className = 'sr-feed-empty';
          empty.textContent = 'Вы никуда не записаны.';
          enrollFeed.appendChild(empty);
        }
        for (const item of myEnrollments) {
          enrollFeed.appendChild(
            rowFor(item, {
              showHost: true,
              meetCode: item.meetCode,
              onCancel: cancelMyEnrollment,
            })
          );
        }
      }
      if (enrollCount) {
        enrollCount.textContent = myEnrollments.length
          ? `${myEnrollments.length} ${plural(myEnrollments.length, 'запись', 'записи', 'записей')}`
          : '';
      }
      if (enrollSec) enrollSec.hidden = false;
    }

    return {
      start() {
        if (loaded) return;
        loaded = true;
        load();
      },
      reload() {
        loaded = false;
        load();
      },
    };
  }

  /* ---------- Публичная лента ---------- */

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /** «только что», «7 мин», «3 ч», «2 дн», дальше дата. */
  function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 45) return 'только что';
    if (s < 3600) return `${Math.floor(s / 60)} мин`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} дн`;
    const d = new Date(ts);
    return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Один элемент ленты. Текст ставится через textContent — предложения пишут
   * пользователи, innerHTML здесь дал бы XSS. Имя тоже, хотя оно и из аккаунта.
   */
  function buildItem(item, fresh) {
    const row = document.createElement('article');
    row.className = 'sr-item';
    if (item.anonymous) row.setAttribute('data-anon', '1');
    if (fresh) row.setAttribute('data-fresh', '1');

    const text = document.createElement('p');
    text.className = 'sr-item-text';
    text.textContent = item.text;
    row.appendChild(text);

    const foot = document.createElement('div');
    foot.className = 'sr-item-foot';

    const who = document.createElement('span');
    who.className = 'sr-item-who';
    who.textContent = item.anonymous ? 'анонимно' : item.author || 'без имени';
    foot.appendChild(who);

    const dot = document.createElement('span');
    dot.className = 'sr-item-dot';
    dot.textContent = '·';
    foot.appendChild(dot);

    const time = document.createElement('time');
    time.className = 'sr-item-time';
    time.dateTime = new Date(item.created_at).toISOString();
    time.textContent = timeAgo(item.created_at);
    time.setAttribute('title', new Date(item.created_at).toLocaleString('ru-RU'));
    foot.appendChild(time);

    row.appendChild(foot);
    return row;
  }

  function initFeed() {
    const feed = el('srFeed');
    if (!feed) return null;

    const emptyEl = el('srFeedEmpty');
    const moreWrap = el('srFeedMoreWrap');
    const moreBtn = el('srFeedMore');
    const countEl = el('srFeedCount');

    const seen = new Set();
    let cursor = null;
    let hasMore = false;
    let total = 0;
    let loading = false;

    function renderCount() {
      if (!countEl) return;
      if (!total) {
        countEl.textContent = '';
        return;
      }
      countEl.textContent = `${total} ${plural(total, 'предложение', 'предложения', 'предложений')}`;
    }

    function renderEmpty() {
      if (emptyEl) emptyEl.hidden = seen.size !== 0;
    }

    /** Вставка сверху без перерисовки уже показанного — иначе лента дёргалась бы.
     *  items приходят от сервера от новых к старым, поэтому вставляем в том же
     *  порядке, каждым узлом перед текущим первым ребёнком: первый элемент
     *  списка оказывается самым верхним. */
    function prepend(items, markFresh) {
      if (!items.length) return;
      const anchor = feed.firstChild;
      let added = 0;

      for (const item of items) {
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        feed.insertBefore(buildItem(item, markFresh), anchor);
        added += 1;
      }
      if (added) {
        renderEmpty();
        renderCount();
      }
    }

    function appendOlder(items) {
      let added = 0;
      const frag = document.createDocumentFragment();
      for (const item of items) {
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        frag.appendChild(buildItem(item, false));
        added += 1;
      }
      if (added) {
        feed.appendChild(frag);
        renderEmpty();
      }
    }

    /**
     * mode:
     *   init  — первая отрисовка, перестраиваем список целиком
     *   poll  — тихая проверка нового: добавляем только то, чего не видели
     *   more  — догружаем следующую страницу в конец
     *
     * poll принципиально не перестраивает ленту: полная перерисовка каждые
     * 20 секунд проигрывала бы анимацию появления у всех элементов и подменяла
     * узлы у того, кто как раз читает.
     */
    async function load(mode) {
      if (loading) return;
      loading = true;
      if (moreBtn && mode === 'more') {
        moreBtn.disabled = true;
        moreBtn.textContent = 'загружаем…';
      }

      try {
        const qs = new URLSearchParams({ limit: String(PAGE) });
        if (mode === 'more' && cursor) qs.set('before', cursor);

        const res = await fetch(`${API_PATH}?${qs.toString()}`);
        if (!res.ok) throw new Error('feed ' + res.status);
        const data = await res.json();

        const items = Array.isArray(data.items) ? data.items : [];
        if (typeof data.total === 'number') total = data.total;
        // Курсор обновляем только при первой загрузке и при догрузке. Опрос
        // всегда берёт самую свежую страницу, и его курсор указывал бы на
        // начало ленты: после него «показать ещё» приносило бы то, что уже
        // показано, и прокрутка вглубь перестала бы работать.
        if (mode !== 'poll' && data.cursor) cursor = data.cursor;
        if (mode !== 'poll') hasMore = !!data.hasMore;

        if (mode === 'init') {
          feed.textContent = '';
          seen.clear();
          for (const item of items) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            feed.appendChild(buildItem(item, false));
          }
          renderEmpty();
          renderCount();
        } else if (mode === 'poll') {
          prepend(items, true);
        } else {
          appendOlder(items);
          renderCount();
        }

        if (moreWrap) moreWrap.hidden = !hasMore;
      } catch {
        // Молча оставляем как есть: пустая лента из-за сбоя сети хуже,
        // чем лента, которая просто не обновилась.
      } finally {
        loading = false;
        if (moreBtn) {
          moreBtn.disabled = false;
          moreBtn.textContent = 'показать ещё';
        }
      }
    }

    if (moreBtn) moreBtn.addEventListener('click', () => load('more'));

    load('init');

    // Тихое обновление: новые предложения появляются сами. Страница скрыта —
    // не дёргаем сеть зря.
    let timer = setInterval(() => {
      if (!document.hidden) load('poll');
    }, POLL_MS);

    document.addEventListener('visibilitychange', () => {
      clearInterval(timer);
      if (!document.hidden) {
        load('poll');
        timer = setInterval(() => {
          if (!document.hidden) load('poll');
        }, POLL_MS);
      }
    });

    // Форму нужен способ мгновенно показать только что отправленное.
    return {
      add(item) {
        total += 1;
        prepend([item], true);
      },
    };
  }

  /* ---------- Вкладки ---------- */

  /* Переключение вкладок живёт здесь, а не в разметке, по одной причине:
     выбранная вкладка записывается в hash, и по ней же страница открывается
     сразу с нужной вкладкой — ссылкой вида /selfrealize#news можно
     поделиться, и она откроет именно новости. */
  function initTabs(onShow) {
    const tabs = Array.from(document.querySelectorAll('.sr-tab'));
    if (!tabs.length) return;

    // Первая вкладка в разметке — «занятия», и она же дефолт: лента занятий
    // и есть причина, по которой на площадку приходят.
    const defaultPanel = tabs[0].dataset.panel;

    function panelOf(name) {
      const tab = tabs.find((t) => t.dataset.panel === name);
      return tab ? tab.dataset.panel : defaultPanel;
    }

    function select(name, updateHash) {
      const wanted = panelOf(name);
      let found = false;
      for (const tab of tabs) {
        const panel = el(tab.getAttribute('aria-controls'));
        const active = tab.dataset.panel === wanted;
        if (active) found = true;

        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        if (panel) panel.hidden = !active;

        // Панель, которую показали, получает фокус-очко: иначе переключение
        // с клавиатуры непонятно куда уехало. Без фокусируемых элементов
        // внутри (пустая новость) фокус просто остаётся на самой вкладке.
        if (active && onShow) onShow(tab.dataset.panel, panel);
      }
      if (!found) select(defaultPanel, false);
      if (updateHash) history.replaceState(null, '', '#' + wanted);
    }

    for (const tab of tabs) {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        select(tab.dataset.panel, true);
      });
    }

    window.addEventListener('hashchange', () => {
      select(location.hash.replace('#', ''), false);
    });

    // Открываем страницу сразу на нужной вкладке, не переписывая hash.
    select(location.hash.replace('#', ''), false);
    return select;
  }

  /* ---------- Лента новостей ---------- */

  function dateLabel(ts) {
    const d = new Date(ts);
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    return d.toLocaleDateString('ru-RU', opts);
  }

  /**
   * Один узел вложения новости.
   *
   * src и класс ставятся из проверенного на сервере поля kind, а не из
   * расширения: иначе gif, названный .jpg, показался бы картинкой и не
   * ожил бы. Внешняя картинка в разметке и вложение выглядят по-разному
   * (подпись из имени файла есть только у вложения).
   */
  function buildMediaNode(media) {
    const wrap = document.createElement('figure');
    wrap.className = 'sr-news-media';

    if (media.kind === 'video') {
      const video = document.createElement('video');
      video.src = media.url;
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      wrap.appendChild(video);
    } else if (media.kind === 'gif') {
      // Гифку показываем картинкой: <img> анимируется сам и не тянет
      // кодеки, которые есть не в каждом браузере.
      const img = document.createElement('img');
      img.src = media.url;
      img.alt = media.name || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      wrap.appendChild(img);
    } else {
      const img = document.createElement('img');
      img.src = media.url;
      img.alt = media.name || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      wrap.appendChild(img);
    }

    if (media.name) {
      const cap = document.createElement('figcaption');
      cap.textContent = media.name;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  function buildNews(item, fresh) {
    const row = document.createElement('article');
    row.className = 'sr-news-item';
    if (fresh) row.setAttribute('data-fresh', '1');
    if (item.id) row.setAttribute('data-id', item.id);

    const head = document.createElement('div');
    head.className = 'sr-news-head';

    const title = document.createElement('h3');
    title.className = 'sr-news-title';
    title.textContent = item.title || 'без заголовка';
    head.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'sr-news-meta';

    const time = document.createElement('time');
    time.className = 'sr-news-time';
    time.dateTime = new Date(item.publishedAt).toISOString();
    time.textContent = dateLabel(item.publishedAt);
    time.setAttribute('title', new Date(item.publishedAt).toLocaleString('ru-RU'));
    meta.appendChild(time);
    head.appendChild(meta);

    row.appendChild(head);

    // Текст приходит markdown и разбирается markdown.js, который экранирует
    // его целиком перед сборкой тегов. Здесь innerHTML законен ровно настолько,
    // насколько безопасен сам рендерер.
    if (item.body && window.Markdown) {
      const mediaByUrl = {};
      for (const media of item.media || []) mediaByUrl[media.url] = media;
      const body = document.createElement('div');
      body.className = 'md';
      body.innerHTML = window.Markdown.render(item.body, { mediaByUrl });
      if (body.innerHTML) row.appendChild(body);
    }

    if (item.media && item.media.length) {
      const gallery = document.createElement('div');
      gallery.className = 'sr-news-gallery';
      for (const media of item.media) {
        const node = buildMediaNode(media);
        // Клик открывает вложение в полный размер — иначе единственный способ
        // рассмотреть фотографию есть только зум браузера.
        //
        // Видео остаётся без обработчика: у него свои кнопки, и клик по «play»
        // всплыл бы к нам и открыл ролик поверх ленты.
        if (media.kind !== 'video') {
          node.classList.add('is-openable');
          node.setAttribute('role', 'button');
          node.setAttribute('tabindex', '0');
          node.setAttribute('aria-label', 'открыть: ' + (media.name || 'вложение'));
        }
        gallery.appendChild(node);
      }
      row.appendChild(gallery);
    }

    return row;
  }

  /** Открыть вложение в полный размер. Отдельное оверлей-окно, потому что
   *  картинка из ленты может быть шириной во весь экран телефона. */
  function initLightbox() {
    let overlay = null;

    function hide() {
      if (overlay) overlay.hidden = true;
    }

    function show(url, name) {
      if (!overlay) return;
      overlay.textContent = '';

      // Видео в полный размер открываем видео, а не картинкой: <img> на .mp4
      // не покажет ничего, кроме битой иконки. Ролик играет сразу и с
      // превью-кадра, чтобы не грузить его до нажатия.
      const isVideo = /\.(mp4|webm|mov|m4v|ogv|3gp)$/i.test(url.split('?')[0]);
      let media;
      if (isVideo) {
        media = document.createElement('video');
        media.src = url;
        media.controls = true;
        media.autoplay = true;
        media.playsInline = true;
        media.preload = 'metadata';
      } else {
        media = document.createElement('img');
        media.src = url;
        media.alt = name || '';
      }

      const close = document.createElement('button');
      close.className = 'sr-lightbox-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Закрыть');
      close.textContent = '×';

      overlay.appendChild(media);
      overlay.appendChild(close);
      overlay.hidden = false;
      close.focus();
    }

    // Оверлей создаётся сразу, а не по DOMContentLoaded: скрипт подключается
    // в конце body, и к моменту его запуска readyState может быть уже
    // 'interactive' — тогда событие никогда не пришло бы и клик по вложению
    // молча ничего не делал.
    overlay = document.createElement('div');
    overlay.className = 'sr-lightbox';
    overlay.hidden = true;
    overlay.addEventListener('click', hide);
    document.body.appendChild(overlay);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });

    return {
      attach(root) {
        if (!root || !overlay) return;
        // Повторные вызовы на том же узле не дублировали бы обработчики, но
        // attach дергается на каждой загрузке страницы — помечаем, чтобы
        // слушатель добавился один раз.
        if (root.__srLightbox) return;
        root.__srLightbox = true;
        root.addEventListener('click', (e) => {
          const node = e.target.closest ? e.target.closest('.is-openable') : null;
          if (!node) return;
          const media = node.querySelector('img, video');
          if (!media) return;
          show(media.getAttribute('src'), media.getAttribute('alt') || '');
        });
        root.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const node = e.target.closest ? e.target.closest('.is-openable') : null;
          if (!node) return;
          e.preventDefault();
          const media = node.querySelector('img, video');
          if (media) show(media.getAttribute('src'), media.getAttribute('alt') || '');
        });
      },
    };
  }

  function initNewsFeed() {
    const feed = el('srNewsFeed');
    if (!feed) return null;

    const emptyEl = el('srNewsEmpty');
    const moreWrap = el('srNewsMoreWrap');
    const moreBtn = el('srNewsMore');
    const countEl = el('srNewsCount');

    const seen = new Set();
    let cursor = null;
    let hasMore = false;
    let loading = false;
    let inited = false;
    let timer = null;

    function renderEmpty() {
      if (emptyEl) emptyEl.hidden = seen.size !== 0;
    }

    function renderCount() {
      if (!countEl) return;
      countEl.textContent = seen.size ? `${seen.size} ${plural(seen.size, 'новость', 'новости', 'новостей')}` : '';
    }

    function build(item, fresh) {
      const node = buildNews(item, fresh);
      return node;
    }

    /**
     * mode:
     *   init  — первая отрисовка, список строится целиком
     *   poll  — тихая проверка: добавляем только то, чего не видели
     *   more  — следующая страница в конец
     */
    async function load(mode) {
      if (loading) return;
      loading = true;
      if (moreBtn && mode === 'more') {
        moreBtn.disabled = true;
        moreBtn.textContent = 'загружаем…';
      }

      try {
        const qs = new URLSearchParams({ limit: String(NEWS_PAGE) });
        if (mode === 'more' && cursor) qs.set('before', cursor);

        const res = await fetch(`${NEWS_API}?${qs.toString()}`);
        if (!res.ok) throw new Error('news ' + res.status);
        const data = await res.json();

        const items = Array.isArray(data.items) ? data.items : [];
        // Курсор и hasMore — только от init и more: опрос берёт самую свежую
        // страницу, и его курсор указал бы на начало ленты, после чего
        // «показать ещё» приносило бы уже показанное.
        if (mode !== 'poll' && data.cursor) cursor = data.cursor;
        if (mode !== 'poll') hasMore = !!data.hasMore;

        if (mode === 'init') {
          feed.textContent = '';
          seen.clear();
          const frag = document.createDocumentFragment();
          for (const item of items) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            frag.appendChild(build(item, false));
          }
          feed.appendChild(frag);
        } else if (mode === 'poll') {
          const anchor = feed.firstChild;
          let added = 0;
          for (const item of items) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            feed.insertBefore(build(item, true), anchor);
            added += 1;
          }
          if (!added) return;
        } else {
          const frag = document.createDocumentFragment();
          let added = 0;
          for (const item of items) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            frag.appendChild(build(item, false));
            added += 1;
          }
          feed.appendChild(frag);
          if (!added) return;
        }

        lightbox.attach(feed);
        renderEmpty();
        renderCount();
        if (moreWrap) moreWrap.hidden = !hasMore;
      } catch {
        // Молча: пустая лента из-за сбоя сети хуже ленты, которая не обновилась.
      } finally {
        loading = false;
        if (moreBtn) {
          moreBtn.disabled = false;
          moreBtn.textContent = 'показать ещё';
        }
      }
    }





    if (moreBtn) moreBtn.addEventListener('click', function() { load('more'); });

    return {
      /** Первый показ вкладки. Повторные вызовы ничего не делают: лента уже
       *  есть, и её не нужно перезапрашивать при каждом переключении. */
      start: function() {
        if (inited) return;
        inited = true;
        load('init');

        timer = setInterval(function() {
          if (!document.hidden) load('poll');
        }, POLL_MS);

        document.addEventListener('visibilitychange', function() {
          if (document.hidden && timer) {
            clearInterval(timer);
            timer = null;
            return;
          }
          if (!document.hidden) {
            load('poll');
            if (!timer) {
              timer = setInterval(function() {
                if (!document.hidden) load('poll');
              }, POLL_MS);
            }
          }
        });
      },
    };
  }

  function boot() {
    const feed = initFeed();
    initForm((item) => {
      if (feed) feed.add(item);
    });

    const sessions = initSessions();
    initSessionForm(() => {
      // Новое занятие может уйти на модерацию (тогда в ленте его не будет),
      // поэтому лента перечитывается целиком: так она в любом случае
      // показывает то, что сервер считает опубликованным.
      if (sessions) sessions.reload();
    });

    const cabinet = initCabinet();
    const news = initNewsFeed();
    initTabs((name) => {
      // Ленты грузятся только когда вкладку открыли: иначе каждый заход на
      // площадку платил бы за запросы, которые никто не смотрит.
      if (name === 'news' && news) news.start();
      if (name === 'sessions' && sessions) sessions.start();
      if (name === 'cabinet' && cabinet) cabinet.start();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { PATH, headerBtn };
})();
