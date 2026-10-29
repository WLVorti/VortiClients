(function () {
  'use strict';

  // ---- DOM refs ----
  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const loginUsernameError = document.getElementById('loginUsernameError');
  const loginPasswordError = document.getElementById('loginPasswordError');

  const regUsername = document.getElementById('regUsername');
  const regPassword = document.getElementById('regPassword');
  const regError = document.getElementById('regError');
  const regUsernameError = document.getElementById('regUsernameError');
  const regPasswordError = document.getElementById('regPasswordError');
  const regUsernameHint = document.getElementById('regUsernameHint');

  const googleBlock = document.getElementById('googleBlock');
  const googleBtn = document.getElementById('googleSignInBtn');
  const googleNoteEl = document.getElementById('googleNote');

  const strengthBarFill = document.getElementById('strengthBarFill');
  const strengthLabel = document.getElementById('strengthLabel');
  const reqEls = document.querySelectorAll('.req');

  // ---- Helpers ----
  function show(el) { el.style.display = ''; }
  function hide(el) { el.style.display = 'none'; }

  function setError(el, msg) {
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
  }

  function setFieldState(input, errorEl, isValid) {
    input.classList.remove('error', 'valid');
    if (isValid === true) input.classList.add('valid');
    else if (isValid === false) input.classList.add('error');
  }

  // ---- Password toggle ----
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function () {
      const input = document.getElementById(this.dataset.target);
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      this.querySelector('.eye-open').style.display = isPassword ? 'none' : '';
      this.querySelector('.eye-closed').style.display = isPassword ? '' : 'none';
    });
  });

  // ---- Tab switching ----
  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const target = this.dataset.tab;
      loginForm.classList.toggle('active', target === 'login');
      registerForm.classList.toggle('active', target === 'register');
      // Clear all errors on tab switch
      [loginError, loginUsernameError, loginPasswordError,
       regError, regUsernameError, regPasswordError].forEach(el => setError(el, ''));
      [loginUsername, loginPassword, regUsername, regPassword].forEach(el => setFieldState(el, null));
    });
  });

  // ---- Username validation ----
  function validateUsername(val) {
    if (val.length === 0) return { valid: null, msg: '' };
    if (val.length < 3) return { valid: false, msg: 'Минимум 3 символа' };
    if (val.length > 32) return { valid: false, msg: 'Максимум 32 символа' };
    if (!/^[a-zA-Z0-9_]+$/.test(val)) return { valid: false, msg: 'Только буквы, цифры и _' };
    return { valid: true, msg: '' };
  }

  loginUsername.addEventListener('input', function () {
    const r = validateUsername(this.value);
    setFieldState(this, loginUsernameError, r.valid);
    setError(loginUsernameError, r.msg);
  });

  regUsername.addEventListener('input', function () {
    const r = validateUsername(this.value);
    setFieldState(this, regUsernameError, r.valid);
    setError(regUsernameError, r.msg);
    const counter = document.querySelector('#regUsernameHint [data-count]');
    if (counter) counter.textContent = this.value.trim().length + '/32';
  });

  // ---- Password validation ----
  function validatePassword(val) {
    if (val.length === 0) return { valid: null, msg: '' };
    if (val.length < 8) return { valid: false, msg: 'Минимум 8 символов' };
    if (!/[a-z]/.test(val)) return { valid: false, msg: 'Нужна строчная буква (a–z)' };
    if (!/[A-Z]/.test(val)) return { valid: false, msg: 'Нужна заглавная буква (A–Z)' };
    if (!/[0-9]/.test(val)) return { valid: false, msg: 'Нужна цифра (0–9)' };
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(val)) return { valid: false, msg: 'Нужен спецсимвол' };
    return { valid: true, msg: '' };
  }

  function getPasswordStrength(val) {
    let s = 0;
    if (val.length >= 8) s++;
    if (val.length >= 12) s++;
    if (/[a-z]/.test(val)) s++;
    if (/[A-Z]/.test(val)) s++;
    if (/[0-9]/.test(val)) s++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(val)) s++;
    return s;
  }

  function updatePasswordUI(val) {
    // Strength bar. Палитра шкалы — из stylEx: пусто, ошибка --error,
    // дальше шаги к лайму. Зелёного в палитре нет.
    const strength = getPasswordStrength(val);
    const pct = Math.min(strength / 6 * 100, 100);
    strengthBarFill.style.width = pct + '%';
    const colors = ['#23272c', '#ff5c2a', '#a35a2c', '#8a7a3a', '#7f8f3f', '#a9cc3a', '#c2e04d'];
    strengthBarFill.style.background = colors[strength];

    const labels = ['', 'Очень слабый', 'Слабый', 'Средний', 'Неплохой', 'Хороший', 'Надёжный'];
    strengthLabel.textContent = val.length > 0 ? labels[strength] : '';

    // Requirements checklist
    const checks = {
      length: val.length >= 8,
      lowercase: /[a-z]/.test(val),
      uppercase: /[A-Z]/.test(val),
      digit: /[0-9]/.test(val),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(val),
    };
    reqEls.forEach(el => {
      const req = el.dataset.req;
      const met = checks[req];
      el.classList.toggle('met', met);
      el.querySelector('.req-icon').textContent = met ? '●' : '○';
    });
  }

  loginPassword.addEventListener('input', function () {
    const r = validatePassword(this.value);
    setFieldState(this, loginPasswordError, r.valid);
    setError(loginPasswordError, r.msg);
  });

  regPassword.addEventListener('input', function () {
    const r = validatePassword(this.value);
    setFieldState(this, regPasswordError, r.valid);
    setError(regPasswordError, r.msg);
    updatePasswordUI(this.value);
  });

  // ---- Submit helpers ----
  function setLoading(form, loading) {
    const btn = form.querySelector('.btn-primary');
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  function translateError(msg) {
    if (!msg) return 'Ошибка сервера';
    if (msg === 'Invalid username or password') {
      return 'Пользователь не найден.\nЕсли у вас нет аккаунта — сначала зарегистрируйтесь.';
    }
    const attempts = msg.match(/Invalid username or password\D*(\d+)/);
    if (attempts) return `Неверный пароль. Осталось попыток: ${attempts[1]}`;
    const locked = msg.match(/Account locked\D*(\d+)/);
    if (locked) return `Аккаунт заблокирован. Попробуйте через ${locked[1]} секунд.`;
    if (msg.startsWith('Too many failed attempts')) {
      return 'Слишком много неудачных попыток. Аккаунт заблокирован на 15 минут.';
    }
    return msg;
  }

  function handleSuccess(data) {
    if (typeof showHome === 'function') {
      showHome();
    }
  }

  // ---- Login submit ----
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    setError(loginError, '');
    setError(loginUsernameError, '');
    setError(loginPasswordError, '');
    setFieldState(loginUsername, loginUsernameError, null);
    setFieldState(loginPassword, loginPasswordError, null);

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username) {
      setFieldState(loginUsername, loginUsernameError, false);
      setError(loginUsernameError, 'Введите имя пользователя');
      return;
    }
    if (!password) {
      setFieldState(loginPassword, loginPasswordError, false);
      setError(loginPasswordError, 'Введите пароль');
      return;
    }

    setLoading(loginForm, true);
    const result = await Api.login(username, password);
    setLoading(loginForm, false);

    if (result.token || result.status === 'success') {
      handleSuccess(result);
    } else {
      setError(loginError, translateError(result.message));
    }
  });

  // ---- Register submit ----
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    setError(regError, '');
    setError(regUsernameError, '');
    setError(regPasswordError, '');
    setFieldState(regUsername, regUsernameError, null);
    setFieldState(regPassword, regPasswordError, null);

    const username = regUsername.value.trim();
    const password = regPassword.value;

    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
      setFieldState(regUsername, regUsernameError, usernameCheck.valid);
      setError(regUsernameError, usernameCheck.msg || 'Введите имя пользователя');
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      setFieldState(regPassword, regPasswordError, passwordCheck.valid);
      setError(regPasswordError, passwordCheck.msg || 'Введите пароль');
      return;
    }

    setLoading(registerForm, true);
    const result = await Api.register(username, password);
    setLoading(registerForm, false);

    if (result.token || result.status === 'success') {
      handleSuccess(result);
    } else {
      const msg = result.message || 'Ошибка сервера';
      if (msg.toLowerCase().includes('username') || msg.toLowerCase().includes('user')) {
        setFieldState(regUsername, regUsernameError, false);
        setError(regUsernameError, msg);
      } else {
        setError(regError, msg);
      }
    }
  });

  // ---- Вход через Google ----
  // Тот же путь, что в мобильном приложении: клиент получает у Firebase
  // ID token, сервер проверяет его firebase-admin'ом и отдаёт свой JWT.
  const FIREBASE_VERSION = '10.12.2';
  const FIREBASE_APP_NAME = 'vortimes-web';

  function googleNote(text, isError) {
    if (!googleNoteEl) return;
    googleNoteEl.textContent = text || '';
    googleNoteEl.style.display = text ? '' : 'none';
    googleNoteEl.classList.toggle('is-error', !!isError);
  }

  function googleLoading(on) {
    if (!googleBtn) return;
    googleBtn.disabled = on;
    googleBtn.classList.toggle('loading', on);
  }

  // SDK тянем только по клику: иначе он грузился бы на каждый вход,
  // включая обычный вход по паролю.
  let firebasePromise = null;
  function loadFirebase() {
    if (firebasePromise) return firebasePromise;
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    firebasePromise = Promise.all([
      import(`${base}firebase-app.js`),
      import(`${base}firebase-auth.js`),
    ]).then(([app, auth]) => ({ app, auth }));
    // Чтобы следующая попытка после обрыва сети не залипала на rejected-промиссе.
    firebasePromise.catch(() => { firebasePromise = null; });
    return firebasePromise;
  }

  // Тексты для пользователя. Коды Firebase разбираем, всё остальное — «попробуйте пароль».
  function describeGoogleError(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    switch (code) {
      case 'auth/popup-blocked':
        return 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта.';
      case 'auth/network-request-failed':
        return 'Нет связи с сервером Google. Проверьте интернет.';
      case 'auth/unauthorized-domain':
        return 'Домен сайта не разрешён в Firebase — добавьте его в Authorized domains.';
      case 'auth/operation-not-allowed':
        return 'Вход через Google выключен в проекте Firebase.';
      case 'auth/invalid-api-key':
        return 'Ключ Firebase неверный — проверьте FIREBASE_WEB_API_KEY.';
      case 'auth/configuration-not-found':
        return 'В проекте Firebase нет веб-приложения — добавьте его в консоли.';
      case 'auth/account-exists-with-different-credential':
        return 'Аккаунт с этим Google уже привязан к другому способу входа.';
      default:
        return 'Не удалось войти через Google. Попробуйте вход по паролю.';
    }
  }

  // На iOS Safari Google-попап перехватывается системой и ломается всегда,
  // поэтому там Firebase требует redirect: он уводит на authDomain и
  // возвращает обратно, а токен мы доберём уже на следующей загрузке.
  function needsRedirect() {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    return iOS;
  }

  // SDK инициализируется один раз на страницу и переиспользуется: и кликом,
  // и обработкой возврата из redirect.
  let firebaseReady = null;
  async function firebaseAuth() {
    if (firebaseReady) return firebaseReady;
    firebaseReady = (async () => {
      const { app, auth } = await loadFirebase();
      const config = await Api.getGoogleConfig();
      if (!config || !config.enabled) throw { code: 'auth/configuration-not-found' };

      const firebaseApp = app.getApps().some((a) => a.name === FIREBASE_APP_NAME)
        ? app.getApp(FIREBASE_APP_NAME)
        : app.initializeApp({
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            ...(config.appId ? { appId: config.appId } : {}),
          }, FIREBASE_APP_NAME);

      return { auth, instance: auth.getAuth(firebaseApp) };
    })();
    firebaseReady.catch(() => { firebaseReady = null; });
    return firebaseReady;
  }

  function googleProvider(auth) {
    const provider = new auth.GoogleAuthProvider();
    // На общий экран: если на этом компьютере уже входили другим аккаунтом,
    // всё равно даём выбрать, а не молча входим в него.
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  /** ID token -> наш JWT -> вход. Общая часть для popup и redirect. */
  async function exchangeToken(idToken) {
    const result = await Api.loginGoogle(idToken);
    if (result.token) {
      handleSuccess(result);
      return true;
    }
    // 401 «Invalid Google token» — не переводим дословно, для пользователя это шум.
    googleNote(
      result.message === 'Invalid Google token'
        ? 'Google не подтвердил вход. Попробуйте ещё раз.'
        : result.message || 'Ошибка сервера',
      true,
    );
    return false;
  }

  async function onGoogleSignIn() {
    setError(loginError, '');
    googleNote('');
    googleLoading(true);
    try {
      const { auth, instance } = await firebaseAuth();

      if (needsRedirect()) {
        // Уводим со страницы: finally выполнится, но это не мешает переходу.
        await auth.signInWithRedirect(instance, googleProvider(auth));
        return;
      }

      const credential = await auth.signInWithPopup(instance, googleProvider(auth));
      const idToken = credential.user ? await credential.user.getIdToken() : null;
      if (!idToken) throw { code: 'auth/network-request-failed' };
      await exchangeToken(idToken);
    } catch (e) {
      const text = describeGoogleError(e);
      if (text) googleNote(text, true);
    } finally {
      googleLoading(false);
    }
  }

  // Возврат из signInWithRedirect. Вызывается на каждой загрузке страницы,
  // но токен Firebase здесь появляется только сразу после redirect.
  async function finishRedirect() {
    const { auth, instance } = await firebaseAuth();
    const result = await auth.getRedirectResult(instance);
    if (!result || !result.user) return false;
    googleLoading(true);
    try {
      const idToken = await result.user.getIdToken();
      if (!idToken) return false;
      return await exchangeToken(idToken);
    } finally {
      googleLoading(false);
    }
  }

  // ---- Init ----
  // Check existing session
  Api.loadSession();
  if (Api.token && Api.userId) {
    handleSuccess({ token: Api.token, userId: Api.userId });
  }

  // Кнопку показываем только если сервер подтвердил, что вход настроен.
  // Иначе пользователь увидит кнопку, которая гарантированно не сработает.
  if (googleBlock) {
    if (googleBtn) googleBtn.addEventListener('click', onGoogleSignIn);
    Api.getGoogleConfig().then(async (config) => {
      if (!config || !config.enabled) return;
      googleBlock.hidden = false;
      // Уже вошли — возвраты из redirect нам не нужны.
      if (Api.token && Api.userId) return;
      try {
        await finishRedirect();
      } catch (e) {
        const text = describeGoogleError(e);
        if (text) googleNote(text, true);
      }
    });
  }
})();
