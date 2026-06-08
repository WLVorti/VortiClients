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
    // Strength bar
    const strength = getPasswordStrength(val);
    const pct = Math.min(strength / 6 * 100, 100);
    strengthBarFill.style.width = pct + '%';
    const colors = ['#e0e0e0', '#e53935', '#f57c00', '#fdd835', '#7cb342', '#43a047', '#2e7d32'];
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

  // ---- Init ----
  // Check existing session
  Api.loadSession();
  if (Api.token && Api.userId) {
    handleSuccess({ token: Api.token, userId: Api.userId });
  }
})();
