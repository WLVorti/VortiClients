// ---- Протухшая сессия ----
// Раньше при истёкшем токене страница просто ничего не грузила: списки чатов
// приходили пустыми, профиль — null, и непонятно было, что вообще происходит.
// Теперь в таких случаях показываем один диалог с предложением войти заново.
//
// Причину ловим двумя путями, потому что токен может умереть тихо и внезапно:
//   1) срок годности известен заранее — exp лежит прямо в JWT;
//   2) сервер сказал 401 (в api.js) или закрыл WebSocket с кодом 1008.

(function () {
  'use strict';

  // setTimeout живёт не дольше ~24 дней, а токен живёт 180 — будим длинный сон
  // частями, иначе таймер молча перестанет работать.
  var MAX_SLEEP = 2147480000;
  var WAKE_EARLY_MS = 5 * 1000;

  var shown = false;
  var timer = null;

  function now() {
    return Date.now();
  }

  function hasToken() {
    try {
      return !!Api.token;
    } catch (_) {
      return false;
    }
  }

  // Токен уже недействителен?
  function expired() {
    if (!hasToken()) return false;
    var exp = Api.tokenExpiry();
    // Не смогли прочитать exp — не гадаем, полагаемся на 401 от сервера.
    if (!exp) return false;
    return exp - now() <= WAKE_EARLY_MS;
  }

  function leftMs() {
    var exp = Api.tokenExpiry();
    if (!exp) return null;
    return exp - now();
  }

  function fmtLeft() {
    var ms = leftMs();
    if (ms == null) return '';
    if (ms <= 0) return 'Сессия закончилась';
    var min = Math.ceil(ms / 60000);
    if (min < 60) return 'Сессия закончится через ' + min + ' мин';
    var hours = Math.round(min / 60);
    if (hours < 48) return 'Сессия закончится через ' + hours + ' ч';
    return 'Сессия закончится через ' + Math.round(hours / 24) + ' дн';
  }

  function schedule() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!hasToken()) return;
    var exp = Api.tokenExpiry();
    if (!exp) return;
    var delay = exp - now();
    if (delay <= WAKE_EARLY_MS) { show(); return; }
    timer = setTimeout(function () {
      timer = null;
      // Проснулись не у конца токена — засыпаем снова.
      if (expired()) show(); else schedule();
    }, Math.min(delay - WAKE_EARLY_MS, MAX_SLEEP));
  }

  function relogin() {
    // Разлогиниваемся по-честному, с удалением куков и профиля, затем
    // перезагружаем страницу: на ней снова обычная форма входа.
    var out = Api.clearCredentials();
    Promise.resolve(out).catch(function () {}).then(function () {
      location.reload();
    });
  }

  function show() {
    if (shown) return;
    shown = true;

    var overlay = document.createElement('div');
    overlay.className = 'overlay ses-overlay';
    overlay.innerHTML = `
      <div class="sheet ses-sheet" role="alertdialog" aria-modal="true">
        <div class="ses-body">
          <div class="ses-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h3 class="ses-title">Сеанс закончился</h3>
          <p class="ses-text" id="sesText"></p>
          <p class="ses-note">Чат и список диалогов не загрузятся, пока вы снова не войдёте.</p>
          <div class="ses-actions">
            <button class="btn-primary ses-btn" id="sesRelogin" type="button">Войти снова</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    var text = overlay.querySelector('#sesText');
    if (text) text.textContent = fmtLeft() || 'Токен входа больше не действует.';

    var btn = overlay.querySelector('#sesRelogin');
    if (btn) btn.addEventListener('click', relogin);
  }

  // --- Подписки ---

  if (Api.onSessionExpired) {
    Api.onSessionExpired(show);
  }

  // Токен сменили на месте (вход, смена аккаунта) — пересчитать график.
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'token') schedule();
  });
  if (Api.loadSession) Api.loadSession();
  schedule();

  // Из фона в передний план: вкладка могла проспать весь срок токена.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (expired()) show(); else schedule();
    }
  });

  // WebSocket закрывается при отказе в токене: auth не прошёл, сервер шлёт 1008.
  if (Api.expireSession) {
    window.addEventListener('ws:unauthorized', function () { Api.expireSession(); });
  }
})();
