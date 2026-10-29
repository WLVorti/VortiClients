const API_BASE = '';

const Api = {
  token: null,
  userId: null,
  profile: null,
  _googleConfig: null,
  _sessionExpired: false,
  _expiredHandlers: [],

  async register(username, password) {
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.status === 201) {
        this.token = data.token;
        this.userId = data.userId;
        this.profile = null;
        data.username = data.username || username;
        this._saveSession(data);
      }
      return data;
    } catch (e) {
      return { status: 'error', message: `Ошибка подключения: ${e.message}` };
    }
  },

  async login(username, password) {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.status === 200) {
        this.token = data.token;
        this.userId = data.userId;
        this.profile = null;
        data.username = data.username || username;
        this._saveSession(data);
      }
      return data;
    } catch (e) {
      return { status: 'error', message: `Ошибка подключения: ${e.message}` };
    }
  },

  /**
   * Вход через Google. На входе — Firebase ID token, который клиент получил
   * от Firebase, а не от Google напрямую: сервер проверяет именно firebase-admin'ом.
   * Ответ приходит и на 200 (аккаунт был), и на 201 (создали новый).
   */
  async loginGoogle(idToken, clientInfo) {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          ...(clientInfo || {}),
        }),
      });
      const data = await res.json();
      if (res.status === 200 || res.status === 201) {
        this.token = data.token;
        this.userId = data.userId;
        this.profile = null;
        this._saveSession(data);
      }
      return data;
    } catch (e) {
      return { status: 'error', message: `Ошибка подключения: ${e.message}` };
    }
  },

  /**
   * Публичный конфиг Firebase для входа через Google.
   * Кэшируем на страницу: он нужен и при показе кнопки, и при самом входе,
   * а ходить за ним на каждый клик незачем.
   */
  async getGoogleConfig() {
    if (this._googleConfig) return this._googleConfig;
    this._googleConfig = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/google/config`, { cache: 'no-store' });
        if (res.status !== 200) return null;
        const data = await res.json();
        return data.status === 'success' ? data : null;
      } catch (_) {
        return null;
      }
    })();
    // При обрыве сети кэш не оставляем, иначе кнопка не появится до перезагрузки.
    this._googleConfig.catch(() => { this._googleConfig = null; });
    return this._googleConfig;
  },

  _headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
    };
  },

  _authHeaders() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  },

  async uploadAvatar(file, filename) {
    try {
      const fd = new FormData();
      fd.append('avatar', file, filename || file.name || 'avatar.jpg');
      const res = await fetch(`${API_BASE}/profile/avatar`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (res.status === 200 && data.avatarUrl) {
        this.profile.avatarUrl = data.avatarUrl;
        this.profile.avatar_url = data.avatarUrl;
      }
      return data;
    } catch (e) {
      return { status: 'error', message: `Ошибка подключения: ${e.message}` };
    }
  },

  async uploadFile(file) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: fd,
      });
      return await res.json();
    } catch (e) {
      return { status: 'error', message: `Ошибка подключения: ${e.message}` };
    }
  },

  async deleteAvatar() {
    try {
      const res = await fetch(`${API_BASE}/profile/avatar`, {
        method: 'DELETE',
        headers: this._headers(),
      });
      return res.status === 200;
    } catch (_) {
      return false;
    }
  },

  async updateProfile(data) {
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.status === 200 && result.profile) {
        const p = result.profile;
        if (p.avatar_url && !p.avatarUrl) p.avatarUrl = p.avatar_url;
        if (p.display_name && !p.displayName) p.displayName = p.display_name;
        if (p.created_at && !p.createdAt) p.createdAt = p.created_at;
        this.profile = p;
      }
      return result;
    } catch (e) {
      return { status: 'error', message: `Ошибка подключения: ${e.message}` };
    }
  },

  async getChats() {
    try {
      const res = await fetch(`${API_BASE}/chats`, {
        headers: this._headers(),
      });
      if (res.status !== 200) return { error: true, chats: [] };
      const data = await res.json();
      return { error: false, chats: data.chats || [] };
    } catch (e) {
      return { error: true, chats: [] };
    }
  },

  async getProfile() {
    if (!this.userId) return null;
    try {
      const res = await fetch(`${API_BASE}/profile?_t=${Date.now()}`, {
        headers: this._headers(),
        cache: 'no-store',
      });
      if (res.status !== 200) return null;
      const data = await res.json();
      const raw = data.profile || data;
      if (!raw || !raw.id) return null;
      if (raw.avatar_url && !raw.avatarUrl) raw.avatarUrl = raw.avatar_url;
      if (raw.display_name && !raw.displayName) raw.displayName = raw.display_name;
      if (raw.created_at && !raw.createdAt) raw.createdAt = raw.created_at;
      return raw;
    } catch (_) {
      return null;
    }
  },

  async getUserProfile(userId) {
    if (!userId) return null;
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/profile`, {
        headers: this._headers(),
      });
      if (res.status !== 200) return null;
      const data = await res.json();
      const raw = data.profile || data;
      if (!raw || !raw.id) return null;
      if (raw.avatar_url && !raw.avatarUrl) raw.avatarUrl = raw.avatar_url;
      if (raw.display_name && !raw.displayName) raw.displayName = raw.display_name;
      if (raw.created_at && !raw.createdAt) raw.createdAt = raw.created_at;
      return raw;
    } catch (_) {
      return null;
    }
  },

  async searchUsers(query) {
    try {
      const res = await fetch(`${API_BASE}/users?search=${encodeURIComponent(query)}`, {
        headers: this._headers(),
      });
      if (res.status !== 200) return [];
      const data = await res.json();
      const users = data.users || [];
      return users.map(u => ({
        id: u.id,
        username: u.username,
        avatarUrl: u.avatar_url || '',
        avatar_url: u.avatar_url || '',
        isOnline: u.is_online || false,
        createdAt: u.created_at,
      }));
    } catch (_) {
      return [];
    }
  },

  async createChat(type, participants, name) {
    try {
      const res = await fetch(`${API_BASE}/chats`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          type,
          participants,
          ...(name ? { name } : {}),
        }),
      });
      const data = await res.json();
      return data;
    } catch (_) {
      return { status: 'error', message: 'Connection error' };
    }
  },

  async getChatMessages(chatId, limit = 50, before, beforeId) {
    try {
      let url = `${API_BASE}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`;
      if (before != null) url += `&before=${encodeURIComponent(String(before))}`;
      if (beforeId) url += `&beforeId=${encodeURIComponent(beforeId)}`;
      const res = await fetch(url, { headers: this._headers() });
      if (res.status !== 200) return { error: true, messages: [] };
      const data = await res.json();
      return { error: false, messages: data.messages || [], total: data.totalCount || 0 };
    } catch (_) {
      return { error: true, messages: [] };
    }
  },

  async getChatInfo(chatId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}`, { headers: this._headers() });
      if (res.status !== 200) return null;
      const data = await res.json();
      return data.chat || null;
    } catch (_) { return null; }
  },

  async getParticipants(chatId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/participants`, { headers: this._headers() });
      if (res.status !== 200) return [];
      const data = await res.json();
      return data.participants || [];
    } catch (_) { return []; }
  },

  async addParticipant(chatId, userId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/participants`, {
        method: 'POST', headers: this._headers(),
        body: JSON.stringify({ userId }),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async removeParticipant(chatId, userId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/participants/${userId}`, {
        method: 'DELETE', headers: this._headers(),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async updateGroupName(chatId, name) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/name`, {
        method: 'PUT', headers: this._headers(),
        body: JSON.stringify({ name }),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async leaveGroup(chatId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/leave`, {
        method: 'DELETE', headers: this._headers(),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async deleteGroup(chatId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}`, {
        method: 'DELETE', headers: this._headers(),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async transferOwnership(chatId, userId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/transfer`, {
        method: 'PUT', headers: this._headers(),
        body: JSON.stringify({ userId }),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async setParticipantRole(chatId, userId, role) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/participants/${userId}/role`, {
        method: 'PUT', headers: this._headers(),
        body: JSON.stringify({ role }),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async uploadGroupAvatar(chatId, file, filename) {
    try {
      const fd = new FormData();
      fd.append('avatar', file, filename || file.name || 'avatar.jpg');
      const res = await fetch(`${API_BASE}/chats/${chatId}/avatar`, {
        method: 'POST', headers: this._authHeaders(), body: fd,
      });
      const data = await res.json();
      return res.ok ? data : null;
    } catch (_) { return null; }
  },

  async deleteGroupAvatar(chatId) {
    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/avatar`, {
        method: 'DELETE', headers: this._headers(),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async deleteMessage(messageId) {
    try {
      const res = await fetch(`${API_BASE}/messages/${messageId}`, {
        method: 'DELETE',
        headers: this._authHeaders(),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async editMessage(messageId, text) {
    try {
      const res = await fetch(`${API_BASE}/messages/${messageId}`, {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify({ text }),
      });
      return res.ok;
    } catch (_) { return false; }
  },

  async getUnreadCounts() {
    try {
      const res = await fetch(`${API_BASE}/chats/unread`, {
        headers: this._headers(),
      });
      if (res.status !== 200) return {};
      const data = await res.json();
      return data.unread || {};
    } catch (_) {
      return {};
    }
  },

  async clearCredentials() {
    this.token = null;
    this.userId = null;
    this.profile = null;
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
    } catch (_) {}
  },

  _saveSession(data) {
    try {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
    } catch (_) {}
    // Save to multi-account list
    if (data.username) {
      this.saveAccount(data.username, data.userId, data.token, data.avatarUrl || '');
    }
  },

  loadSession() {
    try {
      this.token = localStorage.getItem('token');
      this.userId = localStorage.getItem('userId');
    } catch (_) {}
  },

  // ---- Multi-account ----

  getAccounts() {
    try {
      return JSON.parse(localStorage.getItem('accounts') || '[]');
    } catch (_) { return []; }
  },

  saveAccount(username, userId, token, avatarUrl) {
    const accounts = this.getAccounts().filter(a => a.userId !== userId);
    accounts.push({ username, userId, token, avatarUrl: avatarUrl || '' });
    try {
      localStorage.setItem('accounts', JSON.stringify(accounts));
    } catch (_) {}
  },

  removeAccount(userId) {
    const accounts = this.getAccounts().filter(a => a.userId !== userId);
    try {
      localStorage.setItem('accounts', JSON.stringify(accounts));
    } catch (_) {}
  },

  switchAccount(userId, token) {
    this.token = token;
    this.userId = userId;
    this.profile = null;
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
    } catch (_) {}
  },

  // ---- Конец сессии ----

  /**
   * Срок годности токена в мс, 0 если прочитать не удалось.
   * Подпись не проверяем — решение всё равно за сервером, мы лишь заранее
   * знаем срок, чтобы не смотреть на пустые экраны.
   */
  tokenExpiry() {
    try {
      const part = String(this.token || '').split('.')[1];
      if (!part) return 0;
      // JWT — base64url: '-' и '_' вместо '+' и '/', пейджинга нет.
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      const exp = JSON.parse(atob(padded)).exp;
      return typeof exp === 'number' ? exp * 1000 : 0;
    } catch (_) {
      return 0;
    }
  },

  /** Подписчики на «сессия закончилась» (session.js). */
  onSessionExpired(fn) {
    if (typeof fn === 'function') this._expiredHandlers.push(fn);
  },

  expireSession() {
    if (this._sessionExpired) return;
    this._sessionExpired = true;
    this._expiredHandlers.slice().forEach((fn) => {
      try { fn(); } catch (e) { console.error('session handler failed', e); }
    });
  },
};

// ---- Перехват 401 в одном месте ----
// Раньше каждый метод api.js молча возвращал «пустой список», и при истёкшем
// токене страница выглядела просто сломанной. Теперь любой 401 (кроме путей,
// где он означает «неверный пароль» или «нет ключа субадмина») один раз
// превращается в предложение войти заново.
const NOT_SESSION_PATHS = ['/login', '/register', '/auth/', '/subadmin/'];

function isSession401(url) {
  let path;
  try {
    path = new URL(String(url), location.origin).pathname;
  } catch (_) {
    return false;
  }
  return !NOT_SESSION_PATHS.some((p) => path.startsWith(p));
}

// api.js подключается первым, поэтому перехват встаёт раньше остальных вызовов.
// Флаг защищает от повторной обёртки при перезагрузке скрипта.
if (!window.__sessionFetchPatched && typeof window.fetch === 'function') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    return nativeFetch(input, init).then(function (res) {
      if (res.status === 401 && Api.token && isSession401(input)) {
        Api.expireSession();
      }
      return res;
    });
  };
  window.__sessionFetchPatched = true;
}
