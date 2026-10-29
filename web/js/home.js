let currentTab = 0;
let pendingMediaFile = null;
const _decryptedTexts = {}; // msgId -> plaintext

// Переход на площадку «Самореализация» живёт в отдельном модуле
// js/selfrealize.js вместе со своими стилями css/selfrealize.css.
// Шапка собирается функцией, а не константой: разметка кнопки берётся из
// модуля в момент отрисовки, поэтому порядок подключения скриптов решает
// только то, покажет ли кнопка «уже» или «чуть позже».
const APP_TITLES = { 0: 'Chats', 1: 'Communities', 2: 'Calls', 3: 'Account' };

function appHeaders(idx) {
  const title = APP_TITLES[idx] || APP_TITLES[0];
  const btn = idx === 0 && window.Selfrealize ? window.Selfrealize.headerBtn() : '';
  return `<h2>${title}</h2>${btn}`;
}

async function _decryptMsgId(msgId, cipherText, fromUserId) {
  if (_decryptedTexts[msgId] || !fromUserId || fromUserId === Api.userId) return;
  try {
    const pubRes = await fetch(`/users/${fromUserId}/public-key`, { headers: Api._authHeaders() });
    if (!pubRes.ok) return;
    const pubData = await pubRes.json();
    if (!pubData.publicKey) return;
    const plain = await CryptoE2EE.decryptMessage(cipherText, pubData.publicKey);
    if (!plain) return;
    _decryptedTexts[msgId] = plain;
    // Update DOM if message bubble is visible
    const el = document.querySelector(`.msg[data-msg-id="${msgId}"] .msg-text`);
    if (el) el.textContent = plain;
  } catch (_) {}
}

function showHome() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <div class="app-shell">
      <div class="app-main">
        <div class="wf-container" id="waterfall"></div>
        <div class="chats-header" id="appChatHeader">${appHeaders(0)}</div>
        <div class="app-body">
          <div class="tab-content" id="tabChats"></div>
        <div class="tab-content" id="tabCommunities" style="display:none"></div>
        <div class="tab-content" id="tabCalls" style="display:none"></div>
        <div class="tab-content" id="tabAccount" style="display:none"></div>
        <div class="chat-panel" id="chatPanel" style="display:none"></div>
        </div>
        <div class="chat-bottom-bar" id="chatBottomBar" style="display:none">
          <button class="attach-btn" onclick="pickMedia()" title="Attach media">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <div class="chat-input-wrap">
          <input type="text" id="chatInput" placeholder="Message..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}">
          <div class="chat-input-overlay" id="chatInputOverlay"></div>
        </div>
        <button class="emoji-btn" onclick="toggleEmojiPanel(event)" title="Emoji" type="button">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </button>
        <button class="send-btn" onclick="sendMessage()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <div class="emoji-panel" id="emojiPanelDesktop" style="display:none"></div>
      </div>
      <div class="bottom-nav">
        <button class="nav-item active" data-tab="0" title="Chats">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chats</span>
        </button>
        <button class="nav-item" data-tab="1" title="Communities">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Communities</span>
        </button>
        <button class="nav-item" data-tab="2" title="Calls">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>Calls</span>
        </button>
        <button class="nav-item" data-tab="3" title="Account">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Account</span>
        </button>
      </div>
    </div>
  `;

  // ---- Tab switching ----
  const navBtns = root.querySelectorAll('.nav-item');
  const tabContents = {
    0: document.getElementById('tabChats'),
    1: document.getElementById('tabCommunities'),
    2: document.getElementById('tabCalls'),
    3: document.getElementById('tabAccount'),
  };

  let switchingTab = false;
  currentTab = 0;

  function updateAppHeader(idx) {
    const appHeader = document.getElementById('appChatHeader');
    if (!appHeader) return;
    // Don't change if a chat is open (originalHtml is set)
    if (appHeader.dataset.originalHtml !== undefined) return;
    appHeader.style.display = '';
    appHeader.innerHTML = appHeaders(idx);
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (switchingTab) return;
      const idx = parseInt(btn.dataset.tab);
      const prevIdx = [...navBtns].findIndex(b => b.classList.contains('active'));
      if (idx === prevIdx) return;
      switchingTab = true;

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const currentEl = tabContents[prevIdx];
      const newEl = tabContents[idx];
      if (!currentEl || !newEl) { switchingTab = false; return; }

      // Exit current tab
      currentEl.classList.remove('tab-enter');
      currentEl.classList.add('tab-exit');

      setTimeout(() => {
        currentEl.style.display = 'none';
        currentEl.classList.remove('tab-exit');

        // Enter new tab
        newEl.style.display = '';
        newEl.classList.add('tab-enter');
        newEl.addEventListener('animationend', () => {
          newEl.classList.remove('tab-enter');
        }, { once: true });
        switchingTab = false;
        currentTab = idx;
        updateAppHeader(idx);
        if (idx === 0) renderChats();
        if (idx === 1) renderCommunities();
        if (idx === 3) renderAccount();
      }, 250);
    });
  });

  // ---- Start waterfall, load profile, init E2EE ----
  Waterfall.init(document.getElementById('waterfall'));

  // E2EE: restore keys from local storage. Recovery-passphrase окно удалено,
  // поэтому на новом устройстве ключи не поднимутся — direct-сообщения
  // просто уйдут без сквозного шифрования (sendMessage сам откатывается на
  // server_encrypted), интерфейс при этом не блокируется.
  CryptoE2EE.init();

  Api.getProfile().then(p => {
    Api.profile = p;
    renderChats();
  });
  wireChatInputOverlay();
}

// ---- Chats Tab ----
let chatsData = [];

async function renderChats() {
  const el = document.getElementById('tabChats');
  if (!el || el.style.display === 'none') return;

  el.innerHTML = `
    <div class="chats-list" id="chatsList">
      <div class="loading-spinner"></div>
    </div>
    <button class="fab" onclick="showCreateChat()">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  `;

  const result = await Api.getChats();
  chatsData = result.chats || [];
  chatsData.forEach(c => { if (c.unread_count) _unreadCounts[c.id] = c.unread_count; });
  renderChatsList();
}

function renderChatsList() {
  const el = document.getElementById('chatsList');
  if (!el) return;

  const directChats = chatsData.filter(c => c.type === 'direct');

  // Общий чат — не обычный чат из /chats, он живёт отдельно, но в списке
  // должен быть, иначе после выхода из него непонятно, куда попасть.
  // general_chat.js ставит GeneralChatEnabled булевым (probe() -> res.ok),
  // поэтому проверяем именно false, а не строку 'false'.
  const generalRow = (window.GeneralChatEnabled !== false && typeof window.openGeneralChat === 'function')
    ? `<div class="chat-row" id="generalChatRow" onclick="window.openGeneralChat()">
        <div class="chat-avatar chat-avatar--general">#</div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">Общий чат</span>
            <span class="chat-time"></span>
          </div>
          <div class="chat-bottom">
            <span class="chat-msg gc-row-msg">Общий чат — здесь читают все</span>
          </div>
        </div>
      </div>`
    : '';

  if (directChats.length === 0) {
    el.innerHTML = generalRow
      ? generalRow + '<div class="empty-state">No chats yet<br><span class="empty-sub">Tap + to start a new chat</span></div>'
      : '<div class="empty-state">No chats yet<br><span class="empty-sub">Tap + to start a new chat</span></div>';
    if (generalRow) { try { window.updateGeneralChatRow(); } catch (_) {} }
    return;
  }

  el.innerHTML = generalRow + directChats.map(chat => {
    const otherId = chat.type === 'direct' ? chat.participants?.find(p => p !== Api.userId) : null;
    const name = chat.name || otherId || 'Chat';
    const initial = (name || '?')[0].toUpperCase();
    const avatarBg = colorFromId(otherId || chat.id);
    const time = chat.last_message_at ? fmtTime(chat.last_message_at) : '';
    const unread = chat.unread_count || _unreadCounts[chat.id] || 0;
    const isOnline = chat.is_online;
    const avatarUrl = chat.avatarUrl || chat.avatar_url || '';

    return `
      <div class="chat-row" onclick="openChat('${chat.id}', '${name.replace(/'/g, "\\'")}', ${isOnline}, '${otherId || ''}', '${avatarUrl.replace(/'/g, "\\'")}')">
        <div class="chat-avatar" style="background:${avatarBg}">
          ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
          ${isOnline ? '<span class="online-dot"></span>' : ''}
        </div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">${escapeHtml(name)}</span>
            <span class="chat-time">${time}</span>
          </div>
          <div class="chat-bottom">
            <span class="chat-msg">${chat.last_message_key_type === 'e2ee_v1' ? '🔒 Encrypted message' : kolobokizePreview(escapeHtml(chat.last_message || ''))}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Load avatar images for chat rows
  el.querySelectorAll('.chat-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
  if (generalRow) { try { window.updateGeneralChatRow(); } catch (_) {} }
}

// ---- Communities Tab ----
async function renderCommunities() {
  const el = document.getElementById('tabCommunities');
  if (!el || el.style.display === 'none') return;

  el.innerHTML = `
    <div class="chats-list" id="groupsList">
      <div class="loading-spinner"></div>
    </div>
    <button class="fab" onclick="showCreateCommunity()">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  `;

  const result = await Api.getChats();
  const groups = result.chats?.filter(c => c.type === 'group') || [];

  const groupsEl = document.getElementById('groupsList');
  if (groups.length === 0) {
    groupsEl.innerHTML = '<div class="empty-state">No group chats yet</div>';
    return;
  }

  groupsEl.innerHTML = groups.map(g => {
    const initial = (g.name || 'G')[0].toUpperCase();
    const avatarBg = colorFromId(g.id);
    const unread = g.unread_count || 0;
    const avatarUrl = g.avatarUrl || g.avatar_url || '';
    return `
      <div class="chat-row" onclick="openChat('${g.id}', '${(g.name || 'Group').replace(/'/g, "\\'")}', false, '', '${avatarUrl.replace(/'/g, "\\'")}')">
        <div class="chat-avatar" style="background:${avatarBg}">
          ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`}
        </div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">${escapeHtml(g.name || 'Group')}</span>
            <span class="chat-time">${g.last_message_at ? fmtTime(g.last_message_at) : ''}</span>
          </div>
          <div class="chat-bottom">
            <span class="chat-msg">${kolobokizePreview(escapeHtml(g.last_message || ''))}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  groupsEl.querySelectorAll('.chat-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
}

// ---- Calls Tab ----
function renderCalls() {
  const el = document.getElementById('tabCalls');
  if (!el) return;
  el.innerHTML = `
    <div class="chats-header"><h2>Calls</h2></div>
    <div class="empty-state">No calls yet</div>
  `;
}

// ---- Utils ----
function getAvatarUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  // server serves on same origin now
  return url.startsWith('/') ? url : '/' + url;
}

function cacheBust(url) {
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + '_t=' + Date.now();
}

function loadAvatarImage(imgEl, url) {
  if (!imgEl || !url) return;
  imgEl.onerror = () => {
    imgEl.style.display = 'none';
    if (imgEl.dataset.fallback) {
      imgEl.parentElement.textContent = imgEl.dataset.fallback;
    }
  };
  imgEl.src = cacheBust(url);
}

// ---- Account Tab ----
function renderAccount() {
  const el = document.getElementById('tabAccount');
  if (!el) return;

  // Re-fetch profile in case it was null
  if (!Api.profile) {
    el.innerHTML = '';
    Api.getProfile().then(p => {
      Api.profile = p;
      // Update avatar in accounts list
      if (p?.avatarUrl) {
        Api.saveAccount(p.username || 'User', Api.userId, Api.token, p.avatarUrl);
      }
      renderAccount();
    });
    return;
  }

  const p = Api.profile;
  const username = p?.username || 'User';
  const initial = (username || '?')[0].toUpperCase();
  const displayName = p?.displayName || '';
  const bio = p?.bio || '';
  const joined = p?.createdAt ? fmtFullDate(p.createdAt) : '';

  el.innerHTML = `
    <div class="profile-layout">
      <div class="profile-left">
        <div class="profile">
          <div class="profile-avatar-section">
            <div class="profile-avatar ${p?.avatarUrl ? 'has-image' : ''}" id="profileAvatar" style="background:${colorFromId(Api.userId || '')}" onclick="document.getElementById('avatarInput').click()">
              ${p?.avatarUrl ? `<img data-src="${getAvatarUrl(p.avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
              <div class="avatar-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
            </div>
            <input type="file" id="avatarInput" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="handleAvatarUpload(this)">
            ${p?.avatarUrl ? '<button class="avatar-remove-btn" onclick="handleAvatarRemove()" title="Remove avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : ''}
          </div>

          <div class="profile-username">@${escapeHtml(username)}</div>

          <div class="profile-fields" id="profileFields">
            <div class="profile-field">
              <label>Display name</label>
              <div class="profile-value" id="profDisplayName">${displayName ? escapeHtml(displayName) : '<span class="empty-val">—</span>'}</div>
            </div>
            <div class="profile-field">
              <label>Bio</label>
              <div class="profile-value" id="profBio">${bio ? escapeHtml(bio) : '<span class="empty-val">—</span>'}</div>
            </div>
            ${joined ? `
            <div class="profile-field">
              <label>Joined</label>
              <div class="profile-value">${escapeHtml(joined)}</div>
            </div>
            ` : ''}
          </div>

          <div class="profile-actions" id="profileActions">
            <button class="btn-edit" onclick="editProfile()" id="editProfileBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit profile
            </button>
          </div>

          <div class="profile-menu">
            <div class="profile-menu-item danger" onclick="showLogoutConfirm()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>Log out</span>
            </div>
          </div>

          <div class="account-switcher">
            <div class="account-switcher-header">Accounts</div>
            <div class="account-list" id="accountList"></div>
            <button class="btn-add-account" onclick="showAddAccount()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add account
            </button>
          </div>
        </div>
      </div>

      <div class="profile-right">
        <div class="theme-section">
          <div class="theme-header" onclick="this.parentElement.classList.toggle('theme-open')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <span>Theme</span>
            <svg class="theme-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="theme-body" id="themeBody">
            <div class="theme-presets" id="themePresets"></div>
            <div class="theme-label">Custom colors</div>
            <div class="theme-colors" id="themeColors"></div>
            <button class="btn-reset-theme" onclick="resetTheme()">Reset to default</button>
          </div>
        </div>
      </div>
    </div>
  `;
  // Render account list
  renderAccountList();
  // Render theme colors
  renderTheme();
  // load avatar image via fetch (works from file://)
  const avatarImg = el.querySelector('.profile-avatar img[data-src]');
  if (avatarImg) loadAvatarImage(avatarImg, avatarImg.dataset.src);
}

function renderAccountList() {
  const list = document.getElementById('accountList');
  if (!list) return;
  const accounts = Api.getAccounts();
  list.innerHTML = accounts.map(a => {
    const isCurrent = a.userId === Api.userId;
    const initial = (a.username || '?')[0].toUpperCase();
    const bg = colorFromId(a.userId || '');
    return `
      <div class="account-item ${isCurrent ? 'account-current' : ''}">
        <div class="account-item-avatar" style="background:${bg}">
          ${a.avatarUrl ? `<img data-src="${getAvatarUrl(a.avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
        </div>
        <div class="account-item-info">
          <div class="account-item-name">${escapeHtml(a.username)}</div>
          ${isCurrent ? '<div class="account-item-badge">Current</div>' : ''}
        </div>
        ${!isCurrent ? `
          <button class="account-item-switch" onclick="doSwitchAccount('${a.userId}', '${a.token.replace(/'/g, "\\'")}')">Switch</button>
          <button class="account-item-remove" onclick="doRemoveAccount('${a.userId}')" title="Remove">&times;</button>
        ` : ''}
      </div>
    `;
  }).join('');
  // Load account avatar images
  list.querySelectorAll('.account-item-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
}

function showAddAccount() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h3>Add account</h3>
      <div class="auth-card" style="background:none;box-shadow:none;padding:0;width:auto">
        <div class="tabs" style="margin-bottom:16px">
          <button class="tab active" data-tab="addLogin">Login</button>
          <button class="tab" data-tab="addRegister">Register</button>
        </div>
        <form id="addLoginForm" class="auth-form active" style="display:block">
          <div class="field">
            <input type="text" class="field-input" id="addLoginUsername" placeholder="Username" autocomplete="off" maxlength="32" required>
          </div>
          <div class="field">
            <input type="password" class="field-input" id="addLoginPassword" placeholder="Password" autocomplete="off" required>
          </div>
          <div class="field-error" id="addLoginError"></div>
          <button type="submit" class="btn-primary" style="width:100%">Login</button>
        </form>
        <form id="addRegisterForm" class="auth-form" style="display:none">
          <div class="field">
            <input type="text" class="field-input" id="addRegUsername" placeholder="Username" autocomplete="off" maxlength="32" required>
          </div>
          <div class="field">
            <input type="password" class="field-input" id="addRegPassword" placeholder="Password" autocomplete="off" required>
          </div>
          <div class="field-error" id="addRegError"></div>
          <button type="submit" class="btn-primary" style="width:100%">Register</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'addLogin';
      overlay.querySelector('#addLoginForm').style.display = isLogin ? 'block' : 'none';
      overlay.querySelector('#addRegisterForm').style.display = isLogin ? 'none' : 'block';
    });
  });

  // Login submit
  overlay.querySelector('#addLoginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = overlay.querySelector('#addLoginUsername').value.trim();
    const password = overlay.querySelector('#addLoginPassword').value;
    const errorEl = overlay.querySelector('#addLoginError');
    if (!username || !password) { errorEl.textContent = 'Fill in all fields'; return; }
    errorEl.textContent = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    const result = await Api.login(username, password);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
    if (result.token || result.status === 'success') {
      overlay.remove();
      renderAccount();
    } else {
      errorEl.textContent = result.message || 'Error';
    }
  });

  // Register submit
  overlay.querySelector('#addRegisterForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = overlay.querySelector('#addRegUsername').value.trim();
    const password = overlay.querySelector('#addRegPassword').value;
    const errorEl = overlay.querySelector('#addRegError');
    if (!username || !password) { errorEl.textContent = 'Fill in all fields'; return; }
    errorEl.textContent = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
    const result = await Api.register(username, password);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register';
    if (result.token || result.status === 'success') {
      overlay.remove();
      renderAccount();
    } else {
      errorEl.textContent = result.message || 'Error';
    }
  });
}

async function doSwitchAccount(userId, token) {
  // Save current account
  const currentProfile = Api.profile;
  if (currentProfile && Api.userId) {
    Api.saveAccount(currentProfile.username || 'User', Api.userId, Api.token, currentProfile.avatarUrl || '');
  }
  // Switch
  Api.switchAccount(userId, token);
  // Reload app with new account
  closeChatSheet();
  Api.profile = null;
  const p = await Api.getProfile();
  Api.profile = p;
  if (p?.avatarUrl) {
    Api.saveAccount(p.username || 'User', userId, token, p.avatarUrl);
  }
  renderChats();
  renderAccount();
}

function doRemoveAccount(userId) {
  Api.removeAccount(userId);
  renderAccountList();
}

// ---- Profile Edit ----
function editProfile() {
  const fields = document.getElementById('profileFields');
  const actions = document.getElementById('profileActions');
  if (!fields || !actions) return;

  const currentName = document.getElementById('profDisplayName')?.textContent?.replace('—', '')?.trim() || '';
  const currentBio = document.getElementById('profBio')?.textContent?.replace('—', '')?.trim() || '';

  fields.innerHTML = `
    <div class="profile-field edit">
      <label>Display name</label>
      <input type="text" id="editDisplayName" class="field-input" value="${escapeHtml(currentName)}" maxlength="50" placeholder="Your display name">
    </div>
    <div class="profile-field edit">
      <label>Bio</label>
      <textarea id="editBio" class="field-input field-textarea" maxlength="160" placeholder="Tell about yourself">${escapeHtml(currentBio)}</textarea>
    </div>
    ${Api.profile?.createdAt ? `<div class="profile-field"><label>Joined</label><div class="profile-value">${escapeHtml(fmtFullDate(Api.profile.createdAt))}</div></div>` : ''}
  `;
  actions.innerHTML = `
    <button class="btn-save" onclick="saveProfile()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Save
    </button>
    <button class="btn-cancel" onclick="switchTab('account')">Cancel</button>
  `;
}

async function saveProfile() {
  const nameEl = document.getElementById('editDisplayName');
  const bioEl = document.getElementById('editBio');
  if (!nameEl || !bioEl) return;

  const data = {};
  if (nameEl.value.trim()) data.displayName = nameEl.value.trim();
  if (bioEl.value.trim()) data.bio = bioEl.value.trim();

  const result = await Api.updateProfile(data);
  if (result.status === 'success') {
    Api.profile = await Api.getProfile();
    showToast('Profile saved');
  } else {
    showToast(result.message || 'Failed to save');
  }
  renderAccount();
}

// ---- Tab Switching ----
function switchTab(name) {
  const map = { chats: 0, communities: 1, calls: 2, account: 3 };
  const idx = map[name];
  if (idx === undefined) return;
  const btn = document.querySelector(`.nav-item[data-tab="${idx}"]`);
  if (btn) btn.click();
}

// ---- Avatar Cropper ----
let _cropData = null, _cropDrag = false, _cropCallback = null;

function showAvatarCropper(file, onCrop) {
  _cropCallback = onCrop;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const natW = img.naturalWidth, natH = img.naturalHeight;
    const maxDim = Math.min(window.innerWidth * 0.85, window.innerHeight * 0.7, 600);
    const fitScale = Math.min(maxDim / natW, maxDim / natH, 1);
    const vw = Math.round(natW * fitScale);
    const vh = Math.round(natH * fitScale);
    const fs = Math.min(vw, vh);
    const minZ = Math.max(vw, vh) / Math.min(vw, vh); // smallest zoom that fills frame

    const d = { natW, natH, fitScale, vw, vh, fs, zoom: Math.max(1, minZ * 1.3), ox: 0, oy: 0 };
    _cropData = d;

    const overlay = document.createElement('div');
    overlay.className = 'crop-overlay';
    overlay.id = 'cropOverlay';
    overlay.innerHTML = `
      <div class="crop-modal">
        <div class="crop-header">Resize avatar</div>
        <div class="crop-viewport" id="cropViewport" style="width:${vw}px;height:${vh}px">
          <img src="${url}" id="cropImage" draggable="false"
            style="position:absolute;left:0;top:0;width:${vw}px;height:${vh}px;max-width:none">
          <div class="crop-frame" style="width:${fs}px;height:${fs}px">
            <div class="crop-grid"></div>
          </div>
        </div>
        <div class="crop-zoom-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <input type="range" id="cropZoomRange" min="0" max="100" value="30">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </div>
        <div class="crop-actions">
          <button class="crop-btn crop-btn-cancel" onclick="closeCrop()">Cancel</button>
          <button class="crop-btn crop-btn-apply" onclick="applyCrop()">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    URL.revokeObjectURL(url);

    cropUpdate();
    cropDrag();
    cropWheel();
    cropSlider();
  };
  img.src = url;
}

function cropUpdate() {
  const d = _cropData;
  if (!d) return;
  const dw = Math.round(d.vw * d.zoom);
  const dh = Math.round(d.vh * d.zoom);
  const maxOX = Math.max(0, (dw - d.fs) / 2);
  const maxOY = Math.max(0, (dh - d.fs) / 2);
  d.ox = Math.max(-maxOX, Math.min(maxOX, d.ox));
  d.oy = Math.max(-maxOY, Math.min(maxOY, d.oy));
  const img = document.getElementById('cropImage');
  if (!img) return;
  img.style.width = dw + 'px';
  img.style.height = dh + 'px';
  img.style.left = Math.round((d.vw - dw) / 2 + d.ox) + 'px';
  img.style.top = Math.round((d.vh - dh) / 2 + d.oy) + 'px';
}

function cropDrag() {
  const vp = document.getElementById('cropViewport');
  if (!vp) return;
  function sx(cx, cy) {
    if (!_cropData) return;
    _cropData._sx = cx; _cropData._sy = cy;
    _cropData._sox = _cropData.ox; _cropData._soy = _cropData.oy;
    _cropDrag = true;
  }
  function mx(cx, cy) {
    if (!_cropDrag || !_cropData) return;
    _cropData.ox = _cropData._sox + cx - _cropData._sx;
    _cropData.oy = _cropData._soy + cy - _cropData._sy;
    cropUpdate();
  }
  function ex() { _cropDrag = false; }
  vp.addEventListener('mousedown', e => { if (e.button === 0) { sx(e.clientX, e.clientY); e.preventDefault(); } });
  vp.addEventListener('touchstart', e => { if (e.touches.length === 1) { const t = e.touches[0]; sx(t.clientX, t.clientY); } }, { passive: true });
  document.addEventListener('mousemove', e => { if (_cropDrag) mx(e.clientX, e.clientY); });
  document.addEventListener('touchmove', e => { if (_cropDrag && e.touches.length === 1) { const t = e.touches[0]; mx(t.clientX, t.clientY); } }, { passive: true });
  document.addEventListener('mouseup', ex);
  document.addEventListener('touchend', ex);
}

function cropWheel() {
  const vp = document.getElementById('cropViewport');
  if (!vp) return;
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (!_cropData) return;
    const d = _cropData;
    d.zoom = Math.max(1, Math.min(10, d.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    cropUpdate();
    const s = document.getElementById('cropZoomRange');
    if (s) s.value = Math.round((d.zoom - 1) / 9 * 100);
  }, { passive: false });
}

function cropSlider() {
  const s = document.getElementById('cropZoomRange');
  if (!s) return;
  s.addEventListener('input', () => {
    const d = _cropData;
    if (!d) return;
    d.zoom = 1 + (s.value / 100) * 9;
    cropUpdate();
  });
}

function closeCrop() {
  const el = document.getElementById('cropOverlay');
  if (el) el.remove();
  _cropDrag = false;
  _cropData = null;
  _cropCallback = null;
}

async function applyCrop() {
  const d = _cropData;
  if (!d) return;
  const dw = d.vw * d.zoom, dh = d.vh * d.zoom;
  const scale = d.fitScale * d.zoom;
  const natLeft = ((dw - d.fs) / 2 - d.ox) / scale;
  const natTop = ((dh - d.fs) / 2 - d.oy) / scale;
  const natSize = d.fs / scale;
  const img = document.getElementById('cropImage');
  if (!img) { closeCrop(); return; }
  const canvas = document.createElement('canvas');
  canvas.width = natSize; canvas.height = natSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, natLeft, natTop, natSize, natSize, 0, 0, natSize, natSize);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) { showToast('Failed to crop image'); closeCrop(); return; }
  if (blob.size > 5 * 1024 * 1024) { showToast('Cropped image exceeds 5MB'); closeCrop(); return; }
  const cb = _cropCallback;
  closeCrop();
  if (cb) await cb(blob);
}

// ---- Avatar Upload ----
async function handleAvatarUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('File must be under 5MB');
    return;
  }
  input.value = '';
  if (file.type === 'image/gif') {
    showToast('GIF avatars are not supported');
    return;
  }
  showAvatarCropper(file, async (blob) => {
    const result = await Api.uploadAvatar(blob, file.name || 'avatar.jpg');
    if (result.status === 'success') {
      Api.profile = await Api.getProfile();
      renderAccount();
      showToast('Avatar updated');
    } else {
      showToast(result.message || 'Failed to upload avatar');
    }
  });
}

// ---- Theme Settings ----
const themeDefaults = {
  '--bg': '#08090a',
  '--surface': '#101315',
  '--surface-alt': '#171b1f',
  '--primary': '#c2e04d',
  '--primary-hover': '#e8eae5',
  '--text': '#e8eae5',
  '--text-secondary': '#9aa1aa',
  '--text-muted': '#7b818a',
  '--border': '#23272c',
  '--error': '#ff5c2a',
  '--success': '#a9cc3a',
};

const themeLabels = {
  '--bg': 'Background',
  '--surface': 'Surface',
  '--surface-alt': 'Surface alt',
  '--primary': 'Primary',
  '--primary-hover': 'Primary hover',
  '--text': 'Text',
  '--text-secondary': 'Text secondary',
  '--text-muted': 'Text muted',
  '--border': 'Border',
  '--error': 'Error',
  '--success': 'Success',
};

const themePresets = [
  {
    name: 'Lime',
    colors: {
      '--bg': '#08090a',
      '--surface': '#101315',
      '--surface-alt': '#171b1f',
      '--primary': '#c2e04d',
      '--primary-hover': '#e8eae5',
      '--text': '#e8eae5',
      '--text-secondary': '#9aa1aa',
      '--text-muted': '#7b818a',
      '--border': '#23272c',
      '--error': '#ff5c2a',
      '--success': '#a9cc3a',
    },
  },
  {
    name: 'Ember',
    colors: {
      '--bg': '#0D0A0F',
      '--surface': '#1A1218',
      '--surface-alt': '#241A22',
      '--primary': '#E53935',
      '--primary-hover': '#C62828',
      '--text': '#F0F0F0',
      '--text-secondary': '#9E9E9E',
      '--text-muted': '#6B6B6B',
      '--border': '#3A2A35',
      '--error': '#EF5350',
      '--success': '#43a047',
    },
  },
  {
    name: 'Ocean',
    colors: {
      '--bg': '#0A0E17',
      '--surface': '#111827',
      '--surface-alt': '#1E293B',
      '--primary': '#3B82F6',
      '--primary-hover': '#2563EB',
      '--text': '#F1F5F9',
      '--text-secondary': '#94A3B8',
      '--text-muted': '#64748B',
      '--border': '#334155',
      '--error': '#EF4444',
      '--success': '#22C55E',
    },
  },
  {
    name: 'Emerald',
    colors: {
      '--bg': '#0A1410',
      '--surface': '#0F1F18',
      '--surface-alt': '#1A2E25',
      '--primary': '#10B981',
      '--primary-hover': '#059669',
      '--text': '#ECFDF5',
      '--text-secondary': '#A7F3D0',
      '--text-muted': '#6EE7B7',
      '--border': '#1F3D32',
      '--error': '#F87171',
      '--success': '#34D399',
    },
  },
  {
    name: 'Amber',
    colors: {
      '--bg': '#14100A',
      '--surface': '#1F1A12',
      '--surface-alt': '#2E261A',
      '--primary': '#F59E0B',
      '--primary-hover': '#D97706',
      '--text': '#FFFBEB',
      '--text-secondary': '#FDE68A',
      '--text-muted': '#D4A017',
      '--border': '#3D3520',
      '--error': '#F87171',
      '--success': '#34D399',
    },
  },
];

function loadTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem('theme') || '{}');
    for (const key of Object.keys(themeDefaults)) {
      if (saved[key]) {
        document.documentElement.style.setProperty(key, saved[key]);
      }
    }
  } catch (_) {}
}

function saveTheme(colors) {
  localStorage.setItem('theme', JSON.stringify(colors));
}

function resetTheme() {
  localStorage.removeItem('theme');
  for (const key of Object.keys(themeDefaults)) {
    document.documentElement.style.setProperty(key, themeDefaults[key]);
  }
  renderTheme();
}

function renderTheme() {
  renderThemePresets();
  const el = document.getElementById('themeColors');
  if (!el) return;
  const current = {};
  for (const key of Object.keys(themeDefaults)) {
    current[key] = getComputedStyle(document.documentElement).getPropertyValue(key).trim() || themeDefaults[key];
  }
  el.innerHTML = Object.keys(themeDefaults).map(key => `
    <div class="theme-row">
      <label>${themeLabels[key]}</label>
      <div class="theme-picker-wrap">
        <input type="color" class="theme-picker" data-var="${key}" value="${current[key]}">
        <input type="text" class="theme-value" data-var="${key}" value="${current[key]}">
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.theme-picker').forEach(inp => {
    inp.addEventListener('input', () => {
      const val = inp.value;
      const key = inp.dataset.var;
      document.documentElement.style.setProperty(key, val);
      const textInput = el.querySelector(`.theme-value[data-var="${key}"]`);
      if (textInput) textInput.value = val;
      saveTheme(getCurrentTheme());
    });
  });
  el.querySelectorAll('.theme-value').forEach(inp => {
    inp.addEventListener('input', () => {
      const val = inp.value;
      const key = inp.dataset.var;
      document.documentElement.style.setProperty(key, val);
      const picker = el.querySelector(`.theme-picker[data-var="${key}"]`);
      if (picker) picker.value = val;
      saveTheme(getCurrentTheme());
    });
  });
}

function getCurrentTheme() {
  const colors = {};
  for (const key of Object.keys(themeDefaults)) {
    colors[key] = getComputedStyle(document.documentElement).getPropertyValue(key).trim() || themeDefaults[key];
  }
  return colors;
}

function renderThemePresets() {
  const el = document.getElementById('themePresets');
  if (!el) return;
  el.innerHTML = themePresets.map(p => {
    const c = p.colors;
    const chips = ['--primary','--bg','--surface','--text','--border'].map(k => c[k]).join(',');
    return `
      <div class="preset-card" onclick="applyPresetTheme(${themePresets.indexOf(p)})" title="Apply ${p.name}">
        <div class="preset-swatches">${['--primary','--bg','--surface','--text','--border'].map(k =>
          `<span style="background:${c[k]}"></span>`
        ).join('')}</div>
        <span class="preset-name">${p.name}</span>
      </div>
    `;
  }).join('');
}

function applyPresetTheme(idx) {
  const preset = themePresets[idx];
  if (!preset) return;
  for (const key of Object.keys(preset.colors)) {
    document.documentElement.style.setProperty(key, preset.colors[key]);
  }
  saveTheme(getCurrentTheme());
  renderTheme();
}

async function handleAvatarRemove() {
  const ok = confirm('Remove avatar?');
  if (!ok) return;
  const success = await Api.deleteAvatar();
  if (success) {
    Api.profile = await Api.getProfile();
    renderAccount();
    showToast('Avatar removed');
  } else {
    showToast('Failed to remove avatar');
  }
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

// ---- Logout ----
function showLogoutConfirm() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h3>Log out</h3>
      <p>Are you sure you want to log out?</p>
      <div class="dialog-actions">
        <button class="btn-secondary" onclick="this.closest('.overlay').remove()">Cancel</button>
        <button class="btn-primary" style="background:var(--error);width:auto;padding:10px 24px" onclick="doLogout()">Log out</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function doLogout() {
  document.querySelectorAll('.overlay').forEach(el => el.remove());
  await Api.clearCredentials();
  Api.profile = null;
  chatsData = [];
  location.reload();
}

// ---- Create Chat ----
async function showCreateChat() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet" onclick="event.stopPropagation()">
      <div class="sheet-header">
        <h3>New Chat</h3>
        <button class="icon-btn" onclick="this.closest('.overlay').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="sheet-search">
        <input type="text" id="userSearch" placeholder="Search users..." oninput="searchUsers(this.value)">
      </div>
      <div class="sheet-list" id="userSearchResults">
        <div class="empty-state" style="padding:32px 0">Type to search users</div>
      </div>
    </div>
  `;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

let searchTimeout;
async function searchUsers(query) {
  clearTimeout(searchTimeout);
  const el = document.getElementById('userSearchResults');
  if (query.length < 2) {
    el.innerHTML = '<div class="empty-state" style="padding:32px 0">Type to search users</div>';
    return;
  }
  el.innerHTML = '<div class="loading-spinner" style="margin:32px auto"></div>';
  searchTimeout = setTimeout(async () => {
    const users = await Api.searchUsers(query);
    if (users.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:32px 0">No users found</div>';
      return;
    }
    el.innerHTML = users.map(u => {
      const initial = (u.username || '?')[0].toUpperCase();
      const bg = colorFromId(u.id);
      const avatarUrl = u.avatarUrl || u.avatar_url || '';
      return `
        <div class="user-row" onclick="startChat('${u.id}', '${u.username.replace(/'/g, "\\'")}')">
          <div class="chat-avatar" style="background:${bg}">
            ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
          </div>
          <div class="chat-info">
            <div class="chat-name">${escapeHtml(u.username)}</div>
            <div class="chat-msg">${u.isOnline ? 'Online' : 'Offline'}</div>
          </div>
        </div>
      `;
    }).join('');
    el.querySelectorAll('.chat-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
  }, 300);
}

async function startChat(userId, username) {
  document.querySelectorAll('.overlay').forEach(el => el.remove());
  const result = await Api.createChat('direct', [userId]);
  if (result && result.chatId) {
    openChat(result.chatId, username, false, userId, '');
  }
}

// ---- Create Community ----
function showCreateCommunity() {
  showOverlay(`
    <div class="sheet-header">
      <h3>Create community</h3>
      <button class="icon-btn" onclick="this.closest('.overlay').remove()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet-field">
      <input type="text" id="groupNameInput" placeholder="Community name" maxlength="50">
    </div>
    <div class="sheet-field">
      <input type="text" id="groupSearchInput" placeholder="Add members..." oninput="searchCommunityUsers(this.value, 'groupSearchResults', true)">
    </div>
    <div class="sheet-selected" id="selectedMembers"></div>
    <div class="sheet-list" id="groupSearchResults">
      <div class="empty-state" style="padding:32px 0">Type to search users</div>
    </div>
    <button class="sheet-btn" id="createGroupBtn" onclick="createCommunity()" disabled>Create</button>
  `);
}

let communitySearchTimeout;
function searchCommunityUsers(query, resultsId, selectable) {
  clearTimeout(communitySearchTimeout);
  const el = document.getElementById(resultsId);
  if (!el) return;
  if (query.length < 2) {
    el.innerHTML = '<div class="empty-state" style="padding:32px 0">Type to search users</div>';
    return;
  }
  el.innerHTML = '<div class="loading-spinner" style="margin:32px auto"></div>';
  communitySearchTimeout = setTimeout(async () => {
    const users = await Api.searchUsers(query);
    if (users.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:32px 0">No users found</div>';
      return;
    }
    const selected = getSelectedMemberIds();
    el.innerHTML = users.map(u => {
      const initial = (u.username || '?')[0].toUpperCase();
      const bg = colorFromId(u.id);
      const avatarUrl = u.avatarUrl || u.avatar_url || '';
      const isSel = selected.includes(u.id);
      return `
        <div class="user-row ${isSel ? 'selected' : ''}" data-user-id="${u.id}" onclick="toggleMember('${u.id}', '${u.username.replace(/'/g, "\\'")}', '${avatarUrl.replace(/'/g, "\\'")}')">
          <div class="chat-avatar" style="background:${bg}">
            ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
          </div>
          <div class="chat-info">
            <div class="chat-name">${escapeHtml(u.username)}</div>
          </div>
          <div class="check-mark">${isSel ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>
        </div>
      `;
    }).join('');
    el.querySelectorAll('.chat-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
  }, 300);
}

function getSelectedMemberIds() {
  const ids = [];
  document.querySelectorAll('#selectedMembers .member-tag').forEach(el => ids.push(el.dataset.userId));
  return ids;
}

function toggleMember(userId, username, avatarUrl) {
  const container = document.getElementById('selectedMembers');
  const existing = container.querySelector(`.member-tag[data-user-id="${userId}"]`);
  if (existing) {
    existing.remove();
    document.querySelectorAll(`#groupSearchResults .user-row[data-user-id="${userId}"]`).forEach(r => {
      r.classList.remove('selected');
      r.querySelector('.check-mark').innerHTML = '';
    });
  } else {
    container.insertAdjacentHTML('beforeend', `
      <span class="member-tag" data-user-id="${userId}">
        ${escapeHtml(username)}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" onclick="toggleMember('${userId}', '${username.replace(/'/g, "\\'")}', '')"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    `);
    document.querySelectorAll(`#groupSearchResults .user-row[data-user-id="${userId}"]`).forEach(r => {
      r.classList.add('selected');
      r.querySelector('.check-mark').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    });
  }
  document.getElementById('createGroupBtn').disabled = getSelectedMemberIds().length === 0;
}

async function createCommunity() {
  const name = document.getElementById('groupNameInput').value.trim();
  const members = getSelectedMemberIds();
  if (!name || members.length === 0) return;
  const btn = document.getElementById('createGroupBtn');
  btn.textContent = 'Creating...';
  btn.disabled = true;
  const result = await Api.createChat('group', members, name);
  document.querySelectorAll('.overlay').forEach(el => el.remove());
  if (result && result.chatId) {
    showToast('Community created');
    renderCommunities();
  } else {
    showToast('Failed to create community');
  }
}

// ---- Community Settings ----
let currentCommunityData = null;

async function showCommunitySettings(chatId) {
  showToast('Loading...');
  const info = await Api.getChatInfo(chatId);
  const participants = await Api.getParticipants(chatId);
  if (!info) { showToast('Failed to load'); return; }
  currentCommunityData = { chatId, info, participants };
  renderCommunitySettings();
}

function renderCommunitySettings() {
  // Remove existing settings overlay before creating a new one
  document.querySelectorAll('.overlay').forEach(el => el.remove());
  const { chatId, info, participants } = currentCommunityData;
  const myRole = participants.find(p => p.user_id === Api.userId)?.role || 'member';
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';
  const name = info.name || 'Community';
  const avatarUrl = info.avatar_url || '';
  const initial = name[0].toUpperCase();
  const bg = colorFromId(chatId);

  showOverlay(`
    <div class="sheet-header">
      <h3>Community settings</h3>
      <button class="icon-btn" onclick="currentCommunityData=null;this.closest('.overlay').remove()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="settings-scroll">
      <div class="settings-section">
        <div class="group-avatar-section" onclick="${isAdmin ? "document.getElementById('groupAvatarInput').click()" : ''}">
          <div class="group-avatar" style="background:${bg}">
            ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
            ${isAdmin ? '<div class="avatar-overlay"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>' : ''}
          </div>
          ${isAdmin ? '<input type="file" id="groupAvatarInput" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="uploadGroupAvatar(this)">' : ''}
        </div>
        ${isAdmin ? `
          <div class="settings-field">
            <input type="text" id="groupNameEdit" value="${escapeHtml(name)}" maxlength="50">
            <button class="sheet-btn-sm" onclick="saveGroupName('${chatId}')">Save</button>
          </div>
        ` : `
          <div class="settings-label">${escapeHtml(name)}</div>
        `}
      </div>

      <div class="settings-section">
        <div class="settings-section-title">
          <span>Members (${participants.length})</span>
          ${isAdmin ? '<button class="icon-btn" onclick="showAddMember()" title="Add member"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' : ''}
        </div>
        <div class="participants-list" id="participantsList">
          ${participants.map(p => {
            const pInitial = (p.username || '?')[0].toUpperCase();
            const pBg = colorFromId(p.user_id);
            const pAvatarUrl = p.avatar_url || '';
            const roleBadge = p.role === 'owner' ? '<span class="role-badge owner">owner</span>' : p.role === 'admin' ? '<span class="role-badge admin">admin</span>' : '';
            const canRemove = isAdmin && p.user_id !== Api.userId && p.role !== 'owner';
            const canPromote = isOwner && p.role === 'member';
            const canDemote = isOwner && p.role === 'admin';
            return `
              <div class="participant-row">
                <div class="chat-avatar" style="background:${pBg}">
                  ${pAvatarUrl ? `<img data-src="${getAvatarUrl(pAvatarUrl)}" data-fallback="${pInitial.replace(/'/g, "\\'")}" alt="">` : pInitial}
                </div>
                <div class="participant-info">
                  <div class="participant-name">${escapeHtml(p.username)} ${p.user_id === Api.userId ? '(you)' : ''}</div>
                  <div class="participant-role">${roleBadge}</div>
                </div>
                ${canRemove ? `<button class="icon-btn danger" onclick="removeMember('${chatId}','${p.user_id}')" title="Remove"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
                ${canPromote ? `<button class="icon-btn" onclick="setRole('${chatId}','${p.user_id}','admin')" title="Make admin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></button>` : ''}
                ${canDemote ? `<button class="icon-btn" onclick="setRole('${chatId}','${p.user_id}','member')" title="Demote"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="settings-section settings-actions">
        ${isOwner ? `<button class="sheet-btn-danger" onclick="transferOwnershipPrompt('${chatId}')">Transfer ownership</button>` : ''}
        ${!isOwner ? `<button class="sheet-btn-danger" onclick="leaveGroupConfirm('${chatId}')">Leave community</button>` : ''}
        ${isOwner ? `<button class="sheet-btn-danger" onclick="deleteGroupConfirm('${chatId}')">Delete community</button>` : ''}
      </div>
    </div>
  `);
  document.querySelectorAll('.participant-row .chat-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
  document.querySelectorAll('.group-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
}

async function saveGroupName(chatId) {
  const name = document.getElementById('groupNameEdit').value.trim();
  if (!name) return;
  if (await Api.updateGroupName(chatId, name)) {
    showToast('Name updated');
    currentChatName = name;
    renderCommunitySettings();
  } else {
    showToast('Failed to update name');
  }
}

async function uploadGroupAvatar(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  showAvatarCropper(file, async (blob) => {
    const { chatId } = currentCommunityData;
    const result = await Api.uploadGroupAvatar(chatId, blob, file.name || 'avatar.jpg');
    if (result) {
      showToast('Avatar updated');
      renderCommunitySettings();
    } else {
      showToast('Failed to upload avatar');
    }
  });
}

function showAddMember() {
  showOverlay(`
    <div class="sheet-header">
      <h3>Add members</h3>
      <button class="icon-btn" onclick="this.closest('.overlay').remove()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet-field">
      <input type="text" id="addMemberInput" placeholder="Search users..." oninput="searchAddMembers(this.value)">
    </div>
    <div class="sheet-list" id="addMemberResults">
      <div class="empty-state" style="padding:32px 0">Type to search users</div>
    </div>
  `);
}

let addMemberTimeout;
async function searchAddMembers(query) {
  clearTimeout(addMemberTimeout);
  const el = document.getElementById('addMemberResults');
  if (!el) return;
  if (query.length < 2) {
    el.innerHTML = '<div class="empty-state" style="padding:32px 0">Type to search users</div>';
    return;
  }
  el.innerHTML = '<div class="loading-spinner" style="margin:32px auto"></div>';
  addMemberTimeout = setTimeout(async () => {
    const users = await Api.searchUsers(query);
    const existingIds = (currentCommunityData?.participants || []).map(p => p.user_id);
    const filtered = users.filter(u => !existingIds.includes(u.id) && u.id !== Api.userId);
    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:32px 0">All matching users are already members</div>';
      return;
    }
    el.innerHTML = filtered.map(u => {
      const initial = (u.username || '?')[0].toUpperCase();
      const bg = colorFromId(u.id);
      const avatarUrl = u.avatarUrl || u.avatar_url || '';
      return `
        <div class="user-row" onclick="addMemberAction('${currentCommunityData.chatId}', '${u.id}', '${u.username.replace(/'/g, "\\'")}')">
          <div class="chat-avatar" style="background:${bg}">
            ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
          </div>
          <div class="chat-info">
            <div class="chat-name">${escapeHtml(u.username)}</div>
          </div>
        </div>
      `;
    }).join('');
    el.querySelectorAll('.chat-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
  }, 300);
}

async function addMemberAction(chatId, userId, username) {
  if (await Api.addParticipant(chatId, userId)) {
    showToast(`${escapeHtml(username)} added`);
    document.querySelectorAll('.overlay').forEach(el => el.remove());
    const info = await Api.getChatInfo(chatId);
    const participants = await Api.getParticipants(chatId);
    currentCommunityData = { chatId, info, participants };
    renderCommunitySettings();
  } else {
    showToast('Failed to add member');
  }
}

async function removeMember(chatId, userId) {
  if (!confirm('Remove this member?')) return;
  if (await Api.removeParticipant(chatId, userId)) {
    showToast('Member removed');
    const participants = await Api.getParticipants(chatId);
    currentCommunityData.participants = participants;
    renderCommunitySettings();
  } else {
    showToast('Failed to remove member');
  }
}

async function setRole(chatId, userId, role) {
  const label = role === 'admin' ? 'Make admin' : 'Demote to member';
  if (!confirm(`${label}?`)) return;
  if (await Api.setParticipantRole(chatId, userId, role)) {
    showToast(role === 'admin' ? 'Promoted to admin' : 'Demoted to member');
    const participants = await Api.getParticipants(chatId);
    currentCommunityData.participants = participants;
    renderCommunitySettings();
  } else {
    showToast('Failed to change role');
  }
}

async function transferOwnershipPrompt(chatId) {
  const participants = currentCommunityData.participants.filter(p => p.user_id !== Api.userId);
  const list = participants.map(p => `<div class="user-row" onclick="transferOwnership('${chatId}','${p.user_id}')" style="cursor:pointer"><div class="chat-avatar" style="background:${colorFromId(p.user_id)}">${(p.username||'?')[0].toUpperCase()}</div><div class="chat-info"><div class="chat-name">${escapeHtml(p.username)}</div></div></div>`).join('');
  showOverlay(`
    <div class="sheet-header">
      <h3>Transfer ownership</h3>
      <button class="icon-btn" onclick="this.closest('.overlay').remove()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="settings-scroll">
      <div class="settings-section">
        <div class="settings-section-title">Select new owner</div>
        ${list || '<div class="empty-state">No other members</div>'}
      </div>
    </div>
  `);
}

async function transferOwnership(chatId, userId) {
  if (!confirm('Transfer ownership? You will become a regular member.')) return;
  if (await Api.transferOwnership(chatId, userId)) {
    showToast('Ownership transferred');
    document.querySelectorAll('.overlay').forEach(el => el.remove());
    const info = await Api.getChatInfo(chatId);
    const participants = await Api.getParticipants(chatId);
    currentCommunityData = { chatId, info, participants };
    renderCommunitySettings();
  } else {
    showToast('Failed to transfer ownership');
  }
}

async function leaveGroupConfirm(chatId) {
  if (!confirm('Leave this community?')) return;
  if (await Api.leaveGroup(chatId)) {
    showToast('Left community');
    document.querySelectorAll('.overlay').forEach(el => el.remove());
    closeChatSheet();
    renderCommunities();
  } else {
    showToast('Failed to leave');
  }
}

async function deleteGroupConfirm(chatId) {
  if (!confirm('Delete this community permanently? This cannot be undone.')) return;
  if (await Api.deleteGroup(chatId)) {
    showToast('Community deleted');
    document.querySelectorAll('.overlay').forEach(el => el.remove());
    closeChatSheet();
    renderCommunities();
  } else {
    showToast('Failed to delete');
  }
}

function showOverlay(html) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="overlay-content" onclick="event.stopPropagation()">${html}</div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
  return overlay;
}

async function showUserProfile(userId) {
  const overlay = showOverlay('<div class="loading-spinner" style="margin:40px auto"></div>');
  const profile = await Api.getUserProfile(userId);
  if (!profile) {
    overlay.innerHTML = '<div class="overlay-content"><p style="color:var(--text);padding:40px;text-align:center">User not found</p></div>';
    overlay.addEventListener('click', () => overlay.remove());
    return;
  }
  const color = colorFromId(profile.id);
  const initial = (profile.username || '?')[0].toUpperCase();
  const avatarHtml = profile.avatarUrl
    ? `<img src="${cacheBust(getAvatarUrl(profile.avatarUrl))}" alt="" class="profile-popup-avatar-img" onerror="this.style.display='none'">`
    : `<div class="profile-popup-avatar-fallback" style="background:${color}">${initial}</div>`;

  console.log('User profile badges:', profile.badges);
  let badgesHtml = '<div class="profile-popup-badges">';
  if (profile.badges && profile.badges.length) {
    badgesHtml += profile.badges.map(b => {
      const c = b.color || '#FFD700';
      const desc = escapeHtml(b.description || '');
      return `<span class="profile-popup-badge" title="${desc || escapeHtml(b.name)}" style="color:${c};background:${c}22;border:1px solid ${c}55" onclick="event.stopPropagation();this.classList.toggle('badge-expanded')"><span class="profile-popup-badge-icon">${b.icon || '🏅'}</span> ${escapeHtml(b.name)}${desc ? '<span class="profile-popup-badge-desc">'+desc+'</span>' : ''}</span>`;
    }).join('');
  } else {
    badgesHtml += '<span class="profile-popup-no-badges">No badges</span>';
  }
  badgesHtml += '</div>';

  const joined = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';

  overlay.innerHTML = `<div class="overlay-content profile-popup" onclick="event.stopPropagation()">
    <button class="profile-popup-close" onclick="this.closest('.overlay').remove()">&times;</button>
    <div class="profile-popup-avatar">${avatarHtml}</div>
    <div class="profile-popup-name">${escapeHtml(profile.displayName || profile.username)}</div>
    <div class="profile-popup-username">@${escapeHtml(profile.username)}</div>
    ${badgesHtml}
    <div class="profile-popup-bio">${escapeHtml(profile.bio || '')}</div>
    <div class="profile-popup-joined">Joined ${joined}</div>
  </div>`;
  overlay.addEventListener('click', () => overlay.remove());
}

// ---- Chat Screen ----
let ws = null;
let currentChatId = null;
let currentChatType = null;
let currentChatName = null;
let currentOtherUserId = null;
let currentAvatarUrl = null;
let onlineUsers = new Set();
// Reply state
let replyToMessageId = null;
let replyToMessageText = '';
let replyToMessageUser = '';

function openChat(chatId, name, isOnline, otherUserId, avatarUrl) {
  currentChatId = chatId;
  currentChatName = name;
  currentOtherUserId = otherUserId || null;
  currentAvatarUrl = avatarUrl || '';
  currentChatType = otherUserId ? 'direct' : 'group';
  const isGroup = currentChatType === 'group';
  const statusText = isOnline ? 'online' : 'offline';
  const panel = document.getElementById('chatPanel');
  const appMain = document.querySelector('.app-main');
  const initial = (name || '?')[0].toUpperCase();
  const chatColor = isGroup ? colorFromId(chatId) : colorFromId(otherUserId || chatId);
  const avatarHtml = avatarUrl
    ? `<img src="${cacheBust(getAvatarUrl(avatarUrl))}" alt="" onerror="this.style.display='none'">`
    : `<div class="chat-header-avatar-fallback" style="background:${chatColor}">${initial}</div>`;
  const headerClick = isGroup ? '' : ` onclick="showUserProfile('${otherUserId}')" style="cursor:pointer"`;
  const settingsBtn = isGroup
    ? `<button class="icon-btn" onclick="showCommunitySettings('${chatId}')" title="Group settings"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>`
    : '';

  // Animate bottom nav out
  const nav = document.querySelector('.bottom-nav');
  nav.classList.add('nav-hidden');
  setTimeout(() => { nav.style.display = 'none'; }, 500);
  // Animate bottom bar in
  const bottomBar = document.getElementById('chatBottomBar');
  bottomBar.style.display = 'flex';
  void bottomBar.offsetHeight;
  bottomBar.classList.add('bar-open');

  // Replace app header with chat header
  const appHeader = document.getElementById('appChatHeader');
  if (appHeader) {
    appHeader.dataset.originalHtml = appHeader.innerHTML;
    appHeader.dataset.originalTab = currentTab;
    appHeader.style.display = '';
    // Animate: fade out, swap content, fade in
    appHeader.style.transition = 'opacity 0.15s ease';
    appHeader.style.opacity = '0';
  }

  const doSwap = () => {
    if (appHeader) {
      appHeader.innerHTML = `
      <button class="icon-btn" onclick="closeChatSheet()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <div class="chat-header-avatar"${headerClick}>
        ${avatarHtml}
      </div>
      <div class="chat-header-info">
        <div class="chat-header-name">${escapeHtml(name)}</div>
        <div class="chat-header-status ${isOnline ? 'status-online' : 'status-offline'}" id="chatStatusLeft">${statusText}</div>
      </div>
      <div style="flex:1"></div>
      ${settingsBtn}
    `;
      requestAnimationFrame(() => {
        appHeader.style.opacity = '1';
      });
    }
  };

  setTimeout(doSwap, 150);

  panel.innerHTML = `
    <div class="chat-sheet">
      <div class="chat-header">
        <button class="icon-btn" onclick="closeChatSheet()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div class="chat-header-avatar"${headerClick}>
          ${avatarHtml}
        </div>
        <div class="chat-header-info">
          <div class="chat-header-name">${escapeHtml(name)}</div>
          <div class="chat-header-status ${isOnline ? 'status-online' : 'status-offline'}" id="chatStatus">${statusText}</div>
        </div>
        <div style="flex:1"></div>
        ${settingsBtn}
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="loading-spinner" style="margin:40px auto"></div>
      </div>
      <div class="chat-reply-bar" id="chatReplyBar" style="display:none">
        <div class="chat-reply-info">
          <span class="chat-reply-user" id="replyUser"></span>
          <span class="chat-reply-text" id="replyText"></span>
        </div>
        <button class="chat-reply-close" onclick="cancelReply()">&times;</button>
      </div>
      <div class="media-preview-bar" id="mediaPreviewBar" style="display:none">
        <div class="media-preview-info">
          <img id="mediaPreviewImg" src="" alt="preview">
          <span class="media-preview-name" id="mediaPreviewName"></span>
        </div>
        <button class="chat-reply-close" onclick="cancelMediaPreview()">&times;</button>
      </div>
      <div class="chat-input-bar">
        <button class="attach-btn" onclick="pickMedia()" title="Attach media">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <div class="chat-input-wrap">
          <input type="text" id="chatInputMobile" placeholder="Message..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}">
          <div class="chat-input-overlay" id="chatInputMobileOverlay"></div>
        </div>
        <button class="emoji-btn" onclick="toggleEmojiPanel(event)" title="Emoji" type="button">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </button>
        <button class="send-btn" onclick="sendMessage()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <div class="emoji-panel" id="emojiPanel" style="display:none"></div>
      </div>
    </div>
  `;

  // Show and animate panel in
  panel.style.display = 'flex';
  void panel.offsetHeight;
  // Animate tab-content narrowing and panel slide-in simultaneously
  appMain.classList.add('has-chat');
  panel.classList.add('panel-open');

  resetHistoryState();
  loadMessages(chatId);
  connectWs(chatId);

  // Доскроллили к началу — подгружаем более старую страницу.
  const msgBox = document.getElementById('chatMessages');
  if (msgBox) {
    msgBox.addEventListener('scroll', maybeLoadOlder, { passive: true });
  }

  document.addEventListener('paste', chatPasteHandler);
  wireChatInputOverlay();
}

function chatPasteHandler(e) {
  const bar = document.getElementById('mediaPreviewBar');
  if (!bar) return; // chat not open
  if (document.activeElement?.id !== 'chatInputMobile' && document.activeElement?.id !== 'chatInput') return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      if (file.size > 10 * 1024 * 1024) { showToast('Image too large (max 10 MB)'); return; }
      pendingMediaFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.getElementById('mediaPreviewImg');
        const name = document.getElementById('mediaPreviewName');
        const bar = document.getElementById('mediaPreviewBar');
        if (img && name && bar) {
          img.src = ev.target.result;
          name.textContent = file.name || 'Pasted image';
          bar.style.display = '';
        }
      };
      reader.readAsDataURL(file);
      return;
    }
  }
}

function closeChatSheet() {
  document.removeEventListener('paste', chatPasteHandler);
  cancelMediaPreview();
  if (ws) { ws.close(); ws = null; }
  const panel = document.getElementById('chatPanel');
  const appMain = document.querySelector('.app-main');

  // Remove has-chat immediately so tab-content expands via CSS transition
  if (appMain) {
    // Keep internal panel elements hidden while panel slides out
    const panelHeader = panel.querySelector('.chat-header');
    const panelInputBar = panel.querySelector('.chat-input-bar');
    if (panelHeader) panelHeader.style.display = 'none';
    if (panelInputBar) panelInputBar.style.display = 'none';
    appMain.classList.remove('has-chat');
  }

  // Animate panel out
  panel.classList.remove('panel-open');

  // Animate bottom bar out
  const bottomBar = document.getElementById('chatBottomBar');
  bottomBar.classList.remove('bar-open');

  // Animate bottom nav back in
  const nav = document.querySelector('.bottom-nav');
  nav.style.display = '';
  void nav.offsetHeight;
  nav.classList.remove('nav-hidden');

  // After animation completes, clean up
  setTimeout(() => {
    panel.style.display = 'none';
    bottomBar.style.display = 'none';
    Object.keys(_pendingTimers).forEach(k => { clearTimeout(_pendingTimers[k]); delete _pendingTimers[k]; });
    Object.keys(_tempOrdered).forEach(k => delete _tempOrdered[k]);
    currentChatId = null;
    currentChatType = null;
    currentOtherUserId = null;
    // Remove inline styles added during close
    const removedHeader = panel.querySelector('.chat-header');
    const removedInputBar = panel.querySelector('.chat-input-bar');
    if (removedHeader) removedHeader.style.display = '';
    if (removedInputBar) removedInputBar.style.display = '';
    // Restore app header
    const appHeader = document.getElementById('appChatHeader');
    if (appHeader && appHeader.dataset.originalHtml) {
      const tab = parseInt(appHeader.dataset.originalTab) || currentTab;
      appHeader.style.transition = 'opacity 0.15s ease';
      appHeader.style.opacity = '0';
      setTimeout(() => {
        appHeader.innerHTML = appHeaders(tab);
        requestAnimationFrame(() => {
          appHeader.style.opacity = '1';
        });
        delete appHeader.dataset.originalHtml;
        delete appHeader.dataset.originalTab;
      }, 150);
    }
  }, 500);
}

function updateChatStatus(isOnline) {
  ['chatStatus', 'chatStatusLeft'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = isOnline ? 'online' : 'offline';
      el.className = 'chat-header-status ' + (isOnline ? 'status-online' : 'status-offline');
    }
  });
}

// ---- История сообщений ----
// Сервер отдаёт страницу и умеет отдавать более старые по `before` (метка
// времени). Раньше веб звал только первую страницу, и переписка длиннее
// 50 сообщений просто обрывалась: догрузки не было вовсе.
const MSG_PAGE = 50;
let _oldestLoadedAt = null;   // created_at самого старого уже показанного
let _oldestLoadedId = null;   // id самого старого уже показанного
let _newestLoadedAt = null;   // created_at самого нового уже показанного
let _newestLoadedId = null;   // id самого нового уже показанного
let _hasOlder = true;
let _loadingOlder = false;
// Предел догрузки подряд, без прокрутки пользователем: пока контейнер короче
// экрана, события скролла не будет, и историю нужно добрать самим.
const AUTO_LOAD_CHAIN = 20;
// Идентификаторы отрисованных сообщений. Раньше дедуп искал по DOM, то есть
// O(n) на каждое входящее сообщение: пачка из сотни кадров от сервера
// превращалась в квадрат.
let _seenMsgIds = new Set();
let _wsQueue = [];            // кадры, пришедшие пока грузилась первая страница
let _chatReady = false;       // первая страница чата отрисована

function resetHistoryState() {
  _oldestLoadedAt = null;
  _oldestLoadedId = null;
  _newestLoadedAt = null;
  _newestLoadedId = null;
  _hasOlder = true;
  _loadingOlder = false;
  _seenMsgIds = new Set();
  _wsQueue = [];
  _chatReady = false;
}

// Новое сообщение имеет смысл рисовать, только если оно не старше уже
// отрисованного новейшего. Раньше сравнение шло только по created_at, и два
// сообщения, отправленные в одну миллисекунду, теряли одно из себя: метки
// совпадали, проверка `timestamp > _newestLoadedAt` давала false, кадр уходил
// в никуда. Поэтому метка сравнивается, а при равенстве — id.
function isOlderThanLoaded(timestamp, id) {
  if (_newestLoadedAt == null) return false;
  if (timestamp < _newestLoadedAt) return true;
  if (timestamp > _newestLoadedAt) return false;
  if (!id || !_newestLoadedId) return false;
  return id < _newestLoadedId;
}

// Расшифровываем страницу ДО отрисовки. Раньше это делалось после вставки в
// DOM, и каждое зашифрованное сообщение на миг показывало «🔒 Encrypted
// message», а потом подменялось текстом. Заодно ключ собеседника берётся один
// раз на страницу, а не отдельным запросом на каждое сообщение.
async function decryptPage(messages) {
  const keys = {};
  for (const m of messages) {
    if (m.key_type !== 'e2ee_v1') continue;
    if (_decryptedTexts[m.id]) continue;
    let key;
    if (m.user_id === Api.userId) {
      // Своё сообщение: общий ключ с самим собой, расшифровываем своим же
      // публичным ключом. Раньше такие сообщения просто пропускались, и после
      // перезагрузки страницы висели с замком — кэш расшифровок живёт только
      // в памяти. На новом устройстве ключ чужой, secretbox не откроется и
      // останется прежний замок, то есть хуже не делаем.
      key = CryptoE2EE.getPublicKey ? CryptoE2EE.getPublicKey() : null;
    } else {
      const uid = m.user_id;
      if (!(uid in keys)) {
        try {
          const res = await fetch(`/users/${uid}/public-key`, { headers: Api._authHeaders() });
          const data = res.ok ? await res.json() : {};
          keys[uid] = data.publicKey || null;
        } catch (_) {
          keys[uid] = null;
        }
      }
      key = keys[uid];
    }
    if (!key) continue;
    try {
      const plain = await CryptoE2EE.decryptMessage(m.text, key);
      if (plain) _decryptedTexts[m.id] = plain;
    } catch (_) { /* ключа нет — останется замок */ }
  }
}

function showOlderSpinner(el) {
  if (el.querySelector('.older-loading')) return;
  const s = document.createElement('div');
  s.className = 'older-loading loading-spinner';
  s.style.margin = '12px auto';
  el.insertBefore(s, el.firstChild);
}

function removeOlderSpinner(el) {
  const s = el.querySelector('.older-loading');
  if (s) s.remove();
}

async function loadMessages(chatId) {
  const result = await Api.getChatMessages(chatId, MSG_PAGE);
  // Пока летел ответ, пользователь мог открыть другой чат. Рисовать сообщения
  // прежнего чата в текущем окне нельзя — это и было причиной «кривой» загрузки
  // при быстром переключении.
  if (currentChatId !== chatId) return;
  const el = document.getElementById('chatMessages');
  if (!el) return;

  // Сервер отдаёт страницу по возрастанию времени, поэтому её края и есть
  // границы курсора. Раньше младшую метку искали через Math.min по всей
  // странице — при равных метках времени это давало произвольный id, и
  // догрузка либо дублировала сообщения, либо теряла их.
  const first = result.messages[0] || null;
  const last = result.messages[result.messages.length - 1] || null;
  _oldestLoadedAt = first ? first.created_at : null;
  _oldestLoadedId = first ? first.id : null;
  _newestLoadedAt = last ? last.created_at : null;
  _newestLoadedId = last ? last.id : null;
  _hasOlder = result.total
    ? result.total > result.messages.length
    : result.messages.length >= MSG_PAGE;

  if (result.error) {
    el.innerHTML = '<div class="empty-state" style="padding:40px 0;color:var(--text-muted)">Failed to load messages</div>';
    // Без отрисованной страницы очередь кадров только растёт и никогда не
    // показывается — ровно тот случай, когда она и накапливается по уму.
    _wsQueue = [];
    _chatReady = true;
    return;
  }
  if (result.messages.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:40px 0;color:var(--text-muted)">No messages yet</div>';
    // Кадр мог прийти ровно пока летел запрос. Раньше очередь здесь просто
    // терялась, и сообщение не появлялось до перезагрузки страницы.
    flushWsQueue();
    return;
  }

  await decryptPage(result.messages);
  if (currentChatId !== chatId) return;

  el.innerHTML = result.messages.map(m => renderMessage(m, currentChatType === 'group')).join('');
  _seenMsgIds = new Set(result.messages.map(m => m.id).filter(Boolean));
  el.querySelectorAll('.msg-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
  scrollChat();
  result.messages.forEach(m => {
    if (m.user_id !== Api.userId) sendReadReceipt(m.id);
  });
  markChatRead(chatId);
  flushWsQueue();
  // Первая страница могла не заполнить контейнер. Тогда события скролла не
  // будет вообще — догружать придётся вручную, то есть никак.
  maybeLoadOlder();
}

// Кадры, пришедшие по WS пока грузилась первая страница. Показываем только
// то, что действительно новее уже отрисованного: иначе серверная «доставка
// офлайн-сообщений» дописывала бы в пустой чат всю историю от первого
// сообщения, и страница потом затирала её последними 50.
function flushWsQueue() {
  _chatReady = true;
  const queued = _wsQueue;
  _wsQueue = [];
  for (const data of queued) {
    if (data.id && _seenMsgIds.has(data.id)) continue;
    if (isOlderThanLoaded(data.timestamp, data.id)) continue;
    addMessage({
      id: data.id,
      chat_id: data.chatId,
      user_id: data.userId,
      text: data.text,
      file_id: data.fileId,
      file_mime_type: data.file_mime_type,
      created_at: data.timestamp,
      username: data.username || currentChatName,
      avatar_url: '',
      status: 'sent',
      reply: data.reply || null,
      key_type: data.keyType,
    }, currentChatType === 'group');
  }
}

// Верхний элемент списка, дошедший до верхней границы контейнера. На него
// вешается восстановление позиции: его offsetTop не меняется от того, что
// выше появились новые сообщения, а scrollHeight контейнера — меняется.
function firstVisibleAnchor(el) {
  const top = el.scrollTop;
  for (const node of el.children) {
    if (node.offsetTop + node.offsetHeight > top) return node;
  }
  return el.firstElementChild;
}

// Возвращает якорь на то же место экрана после вставки сообщений выше него.
function restoreAnchor(el, anchor, prevTop) {
  if (!anchor || !anchor.isConnected) return;
  el.scrollTop += anchor.offsetTop - prevTop;
}

// Картинки вставленных сообщений встают на место уже после восстановления
// позиции и растут вверх от якоря, то есть уезжают с экрана. Пока они не
// подгрузились, якорь держим на месте по их событиям загрузки.
function stabilizeAnchor(el, anchor, prevTop) {
  if (!anchor || !anchor.isConnected) return;
  const scope = anchor.parentNode;
  if (!scope) return;
  scope.querySelectorAll('img').forEach(img => {
    if (img.complete) return;
    const once = () => {
      restoreAnchor(el, anchor, prevTop);
      img.removeEventListener('load', once);
      img.removeEventListener('error', once);
    };
    img.addEventListener('load', once);
    img.addEventListener('error', once);
  });
}

// Одна страница истории. Возвращает, что вставили, — вызывающий сам решает,
// тянуть ли дальше.
async function loadOlderPage(chatId, el) {
  showOlderSpinner(el);

  // Замер якоря делаем до запроса: пока летела сеть и расшифровывались
  // кадры, в список могли прийти новые сообщения по WS, и восстановление по
  // scrollHeight уводило читателя на другое сообщение.
  const anchor = firstVisibleAnchor(el);
  const prevTop = anchor ? anchor.offsetTop : el.scrollTop;

  const result = await Api.getChatMessages(chatId, MSG_PAGE, _oldestLoadedAt, _oldestLoadedId);
  removeOlderSpinner(el);
  if (currentChatId !== chatId || result.error) return 0;

  const fresh = result.messages.filter(m => m.id && !_seenMsgIds.has(m.id));

  if (fresh.length) {
    await decryptPage(fresh);
    if (currentChatId !== chatId) return 0;
    el.insertAdjacentHTML('afterbegin', fresh.map(m => renderMessage(m, currentChatType === 'group')).join(''));
    fresh.forEach(m => { if (m.id) _seenMsgIds.add(m.id); });
    el.querySelectorAll('.msg-avatar img[data-src]').forEach(img => loadAvatarImage(img, img.dataset.src));
    fresh.forEach(m => { if (m.user_id !== Api.userId) sendReadReceipt(m.id); });
    // Удалённые сообщения тоже показываем: первая страница их рисует, а
    // фильтр стоял только здесь, из-за чего в середине переписки зияли дыры.
    restoreAnchor(el, anchor, prevTop);
    stabilizeAnchor(el, anchor, prevTop);
  }

  const first = result.messages[0] || null;
  if (first) {
    _oldestLoadedAt = first.created_at;
    _oldestLoadedId = first.id;
  }
  // Сколько всего осталось незагруженным, считаем по числу отрисованных:
  // сервер отдаёт и удалённые сообщения, клиент их тоже рисует.
  _hasOlder = result.total ? result.total > _seenMsgIds.size : result.messages.length >= MSG_PAGE;
  return fresh.length;
}

// Доскроллили к началу — догружаем более старые страницы. Курсор по паре
// (created_at, id), дедуп по id: сервер отдаёт строго до курсора, но WS мог
// успеть прислать то же самое.
async function loadOlderMessages() {
  if (_loadingOlder || !_hasOlder || _oldestLoadedAt == null) return;
  const chatId = currentChatId;
  const el = document.getElementById('chatMessages');
  if (!el || !chatId) return;

  _loadingOlder = true;
  try {
    // Пока контейнер короче экрана, события скролла не будет — а значит не
    // будет и следующей догрузки. Раньше на этом месте подгрузка молча
    // вставала, и история обрывалась на первой странице.
    for (let page = 0; page < AUTO_LOAD_CHAIN; page++) {
      const viewportFull = el.scrollHeight > el.clientHeight + 8;
      if (viewportFull && el.scrollTop >= 80) break;
      if (!await loadOlderPage(chatId, el)) break;
    }
  } finally {
    _loadingOlder = false;
  }
}

// Точка входа догрузки: по событию скролла и сразу после первой страницы.
function maybeLoadOlder() {
  const el = document.getElementById('chatMessages');
  if (!el || _loadingOlder || !_hasOlder || _chatReady !== true) return;
  if (el.scrollTop < 80 || el.scrollHeight <= el.clientHeight + 8) loadOlderMessages();
}

function renderMessage(m, isGroup) {
  const isMine = m.user_id === Api.userId;
  const time = m.created_at ? fmtTimeMsg(m.created_at) : '';
  const avatarUrl = m.avatar_url || '';
  const initial = (m.username || '?')[0].toUpperCase();
  const bg = colorFromId(m.user_id);
  const showAvatar = !isMine && isGroup;
  const isDeleted = m.text === '[deleted]';

  if (isDeleted) return '';

  let mediaHtml = '';
  if (m.file_id) {
    const mime = (m.file_mime_type || '').toLowerCase();
    const fileUrl = `/download/${m.file_id}?token=${Api.token}`;
    const isKnownNonMedia = mime && !mime.startsWith('image/') && !mime.startsWith('video/') && !mime.startsWith('audio/');
    if (isKnownNonMedia) {
      mediaHtml = `<div class="msg-media msg-file"><a href="${fileUrl}" target="_blank" download>📎 ${escapeHtml(m.text || 'File')}</a></div>`;
    } else if (mime.startsWith('video/')) {
      mediaHtml = `<div class="msg-media msg-video"><video src="${fileUrl}" data-file="${m.file_id}" controls preload="metadata" onclick="this.paused?this.play():this.pause()" onerror="this.onerror=null;loadMediaFile(this)" onloadedmetadata="scrollChatIfAtBottom()"></video></div>`;
    } else {
      mediaHtml = `<div class="msg-media"><img src="${fileUrl}" data-file="${m.file_id}" alt="" loading="lazy" onclick="showImageViewer('${fileUrl}')" onerror="this.onerror=null;loadMediaFile(this)" onload="scrollChatIfAtBottom()"></div>`;
    }
  }

  // Reply preview
  let replyHtml = '';
  if (m.reply) {
    const replyText = kolobokize(escapeHtml(m.reply.replyText || ''));
    const replyUser = escapeHtml(m.reply.replyUser || '');
    replyHtml = `<div class="msg-reply" onclick="scrollToMessage('${m.reply.replyId}')"><span class="msg-reply-user">${replyUser}</span><span class="msg-reply-text">${replyText}</span></div>`;
  }

  return `
    <div class="msg ${isMine ? 'msg-mine' : 'msg-other'}" data-msg-id="${escapeHtml(m.id)}" data-username="${escapeHtml(m.username || 'User')}">
      ${showAvatar ? `
        <div class="msg-avatar" style="background:${bg}">
          ${avatarUrl ? `<img data-src="${getAvatarUrl(avatarUrl)}" data-fallback="${initial.replace(/'/g, "\\'")}" alt="">` : initial}
        </div>
      ` : '<div class="msg-avatar-spacer"></div>'}
      <div class="msg-body">
        ${showAvatar ? `<div class="msg-author">${escapeHtml(m.username)}</div>` : ''}
        <div class="msg-bubble">
          ${replyHtml}
          ${mediaHtml}
          ${m.text && !m.text.startsWith('[File]') ? `<div class="msg-text">${kolobokize(escapeHtml(_decryptedTexts[m.id] ?? (m.key_type === 'e2ee_v1' ? '🔒 Encrypted message' : m.text)))}</div>` : ''}
          <div class="msg-meta">
            <span class="msg-time">${time}</span>
            ${m.edited ? '<span class="msg-edited">edited</span>' : ''}
            ${isMine ? `<span class="msg-status">${m.status === 'sending' ? '⏳' : m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}
          </div>
        </div>
        <button class="msg-actions-btn" onclick="showMessageMenu(event, '${m.id}', ${isMine})" title="Actions">⋯</button>
      </div>
    </div>
  `;
}

function showImageViewer(url) {
  const viewer = document.getElementById('imageViewer');
  const img = document.getElementById('imageViewerImg');
  if (viewer && img) {
    img.src = url;
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeImageViewer() {
  const viewer = document.getElementById('imageViewer');
  const img = document.getElementById('imageViewerImg');
  if (viewer) viewer.style.display = 'none';
  if (img) img.src = '';
  document.body.style.overflow = '';
}

async function loadMediaFile(el) {
  const fileId = el.dataset.file || el.src?.match(/\/download\/([^?]+)/)?.[1];
  if (!fileId) return;
  try {
    const resp = await fetch(`/download/${fileId}?token=${Api.token}`);
    if (!resp.ok) throw new Error('Failed to load');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if (el.tagName === 'IMG') {
      el.src = url;
      el.style.cursor = 'pointer';
      el.onclick = () => window.open(`/download/${fileId}?token=${Api.token}`, '_blank');
    } else if (el.tagName === 'VIDEO') {
      el.src = url;
    }
    scrollChat();
  } catch (_) {}
}

function scrollChat() {
  const el = document.getElementById('chatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

// Догрузилась картинка или видео. Раньше здесь стоял безусловный scrollChat(),
// из-за чего нельзя было прочитать историю: каждая подгрузившаяся картинка
// прыгала список вниз. Теперь держим низ только если пользователь и так был
// внизу, то есть читал свежие сообщения.
function scrollChatIfAtBottom() {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
}

function showMessageMenu(event, messageId, isMine) {
  event.stopPropagation();
  // Close any existing menu
  document.querySelectorAll('.msg-menu').forEach(m => m.remove());
  const existing = document.querySelector('.msg-menu-backdrop');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'msg-menu';
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.top - 10) + 'px';
  menu.style.right = (window.innerWidth - rect.right + 4) + 'px';
  menu.innerHTML = `
    <button onclick="startReply('${messageId}')">Reply</button>
    ${isMine ? `<button onclick="startEdit('${messageId}')">Edit</button>` : ''}
    ${isMine ? `<button class="danger" onclick="deleteMessageConfirm('${messageId}')">Delete</button>` : ''}
  `;
  document.body.appendChild(menu);

  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.onclick = () => { menu.remove(); backdrop.remove(); };
  document.body.appendChild(backdrop);
}

function startReply(messageId) {
  document.querySelectorAll('.msg-menu, .msg-menu-backdrop').forEach(el => el.remove());
  const msgEl = document.querySelector(`.msg[data-msg-id="${messageId}"]`);
  const textEl = msgEl?.querySelector('.msg-text');
  const user = msgEl?.dataset.username || 'User';
  const text = textEl ? textEl.textContent : '';
  replyToMessageId = messageId;
  replyToMessageText = text.substring(0, 100);
  replyToMessageUser = user;
  const bar = document.getElementById('chatReplyBar');
  if (bar) {
    document.getElementById('replyUser').textContent = replyToMessageUser;
    document.getElementById('replyText').textContent = replyToMessageText;
    bar.style.display = 'flex';
  }
  // Focus input
  const isDesktop = window.innerWidth >= 768;
  document.getElementById(isDesktop ? 'chatInput' : 'chatInputMobile').focus();
}

function cancelReply() {
  replyToMessageId = null;
  replyToMessageText = '';
  replyToMessageUser = '';
  const bar = document.getElementById('chatReplyBar');
  if (bar) bar.style.display = 'none';
}

async function deleteMessageConfirm(messageId) {
  document.querySelectorAll('.msg-menu, .msg-menu-backdrop').forEach(el => el.remove());
  if (!confirm('Delete this message?')) return;
  const ok = await Api.deleteMessage(messageId);
  if (ok) {
    const msgEl = document.querySelector(`.msg[data-msg-id="${messageId}"]`);
    if (msgEl) msgEl.remove();
  }
}

function startEdit(messageId) {
  document.querySelectorAll('.msg-menu, .msg-menu-backdrop').forEach(el => el.remove());
  const msgEl = document.querySelector(`.msg[data-msg-id="${messageId}"]`);
  const textEl = msgEl?.querySelector('.msg-text');
  if (!textEl) return;
  const originalText = textEl.textContent;
  const isDesktop = window.innerWidth >= 768;
  const input = document.getElementById(isDesktop ? 'chatInput' : 'chatInputMobile');
  input.value = originalText;
  input.focus();
  syncChatInputOverlay(input);
  // Override sendMessage temporarily to edit
  const originalSend = sendMessage;
  window.__editMessageId = messageId;
  window.__restoreSend = () => { sendMessage = originalSend; delete window.__editMessageId; delete window.__restoreSend; };
  sendMessage = async function editAndSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    syncChatInputOverlay(input);
    cancelReply();
    const ok = await Api.editMessage(messageId, text);
    if (ok) {
      const el = document.querySelector(`.msg[data-msg-id="${messageId}"] .msg-text`);
      if (el) el.textContent = text;
      const meta = document.querySelector(`.msg[data-msg-id="${messageId}"] .msg-meta`);
      if (meta && !meta.querySelector('.msg-edited')) {
        const edited = document.createElement('span');
        edited.className = 'msg-edited';
        edited.textContent = 'edited';
        meta.insertBefore(edited, meta.querySelector('.msg-time'));
      }
    }
    window.__restoreSend();
  };
}

function scrollToMessage(messageId) {
  const el = document.querySelector(`.msg[data-msg-id="${messageId}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function addMessage(m, isGroup) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (m.id) {
    if (_seenMsgIds.has(m.id)) return;
    _seenMsgIds.add(m.id);
  }
  // Новейшую метку двигаем только вперёд, иначе первое же вставленное
  // сообщение обнулит ориентир для всех следующих проверок на устаревание.
  if (m.created_at > (_newestLoadedAt || 0) || (_newestLoadedAt == null)) {
    _newestLoadedAt = m.created_at;
    _newestLoadedId = m.id || _newestLoadedId;
  } else if (m.created_at === _newestLoadedAt && m.id && (!_newestLoadedId || m.id > _newestLoadedId)) {
    _newestLoadedAt = m.created_at;
    _newestLoadedId = m.id;
  }
  const empty = el.querySelector('.empty-state');
  if (empty) el.innerHTML = '';
  el.insertAdjacentHTML('beforeend', renderMessage(m, isGroup));
  scrollChat();
  const imgs = el.querySelectorAll('.msg-avatar img[data-src]:not([data-loaded])');
  imgs.forEach(img => { img.dataset.loaded = '1'; loadAvatarImage(img, img.dataset.src); });
}

function updateChatListLastMessage(chatId, text, timestamp, isFromOther) {
  const row = document.querySelector(`.chat-row[onclick*="'${chatId}'"]`);
  if (!row) return;
  const msgEl = row.querySelector('.chat-msg');
  const timeEl = row.querySelector('.chat-time');
  if (msgEl) msgEl.textContent = text;
  if (timeEl) timeEl.textContent = fmtTime(timestamp);
  if (isFromOther) {
    _unreadCounts[chatId] = (_unreadCounts[chatId] || 0) + 1;
    const bottom = row.querySelector('.chat-bottom');
    if (bottom && !bottom.querySelector('.unread-badge')) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = _unreadCounts[chatId] > 99 ? '99+' : _unreadCounts[chatId];
      bottom.appendChild(badge);
    } else {
      const badge = bottom?.querySelector('.unread-badge');
      if (badge) badge.textContent = _unreadCounts[chatId] > 99 ? '99+' : _unreadCounts[chatId];
    }
  }
  const list = document.getElementById('chatsList');
  if (list && row.parentNode === list) {
    list.insertBefore(row, list.firstChild);
  }
}

function pickMedia() {
  document.getElementById('mediaPicker').click();
}

async function onMediaPicked(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !currentChatId) return;

  const maxSize = 1024 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File too large (max 1 GB)');
    return;
  }

  showToast('Uploading...');
  const result = await Api.uploadFile(file);
  if (!result.fileId) {
    showToast('Upload failed');
    return;
  }

  const payload = {
    type: 'sendFile',
    chatId: currentChatId,
    fileId: result.fileId,
    fileMimeType: result.mimeType || file.type,
    tempId: 't' + Date.now(),
  };
  if (replyToMessageId) {
    payload.replyTo = replyToMessageId;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(payload)); }
    catch (_) { pendingMessages.push(payload); }
  } else {
    pendingMessages.push(payload);
  }
  cancelReply();
  showToast('Sent');
}

function cancelMediaPreview() {
  pendingMediaFile = null;
  const bar = document.getElementById('mediaPreviewBar');
  const img = document.getElementById('mediaPreviewImg');
  if (bar) bar.style.display = 'none';
  if (img) img.src = '';
}

const pendingMessages = [];
const _readMessageIds = new Set();
const _unreadCounts = {};

function flushPendingMessages() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  let flushed = 0;
  while (pendingMessages.length) {
    const payload = pendingMessages.shift();
    try { ws.send(JSON.stringify(payload)); flushed++; } catch (_) { pendingMessages.unshift(payload); break; }
  }
  if (flushed) showToast(`Sent ${flushed} pending message${flushed > 1 ? 's' : ''}`);
}

function sendViaWs(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(payload)); return true; }
    catch (_) { pendingMessages.push(payload); return false; }
  }
  pendingMessages.push(payload);
  return false;
}

function sendReadReceipt(messageId) {
  if (_readMessageIds.has(messageId)) return;
  _readMessageIds.add(messageId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'read', messageId })); } catch (_) {}
  }
}

function markChatRead(chatId) {
  _unreadCounts[chatId] = 0;
  const row = document.querySelector(`.chat-row[onclick*="'${chatId}'"]`);
  if (row) {
    const badge = row.querySelector('.unread-badge');
    if (badge) badge.remove();
  }
}

const _pendingTimers = {};
const _tempOrdered = {};  // chatId → [tempId, ...]

function addTempMessage(text, tempId, isGroup, keyType, originalText) {
  if (!_tempOrdered[currentChatId]) _tempOrdered[currentChatId] = [];
  _tempOrdered[currentChatId].push(tempId);
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const empty = el.querySelector('.empty-state');
  if (empty) el.innerHTML = '';
  const now = Date.now();
  const displayText = keyType === 'e2ee_v1' ? text : originalText || text;
  const m = {
    id: tempId,
    chat_id: currentChatId,
    user_id: Api.userId,
    text: displayText,
    file_id: null,
    file_mime_type: null,
    created_at: now,
    username: currentChatName || 'You',
    avatar_url: '',
    status: 'sending',
    reply: null,
  };
  if (keyType === 'e2ee_v1') {
    m.key_type = 'e2ee_v1';
    _decryptedTexts[tempId] = text;
  }
  el.insertAdjacentHTML('beforeend', renderMessage(m, isGroup));
  scrollChat();
  const chatId = currentChatId;
  _pendingTimers[tempId] = setTimeout(async () => {
    const msgEl = document.querySelector(`.msg[data-msg-id="${tempId}"]`);
    if (!msgEl || msgEl.dataset.msgId !== tempId) { delete _pendingTimers[tempId]; return; }
    try {
      const res = await Api.getChatMessages(chatId, 1, Date.now());
      const found = res.messages?.find(m => m.user_id === Api.userId);
      if (found) {
        msgEl.dataset.msgId = found.id;
        const statusEl = msgEl.querySelector('.msg-status');
        if (statusEl) statusEl.textContent = '✓';
      }
    } catch (_) {}
    delete _pendingTimers[tempId];
  }, 1000);
}

async function sendMessage() {
  const isDesktop = window.innerWidth >= 768;
  const input = document.getElementById(isDesktop ? 'chatInput' : 'chatInputMobile');
  const text = input.value.trim();
  const hasMedia = !!pendingMediaFile;
  if (!text && !hasMedia) return;
  if (!currentChatId) return;
  if (hasMedia) {
    const file = pendingMediaFile;
    cancelMediaPreview();
    input.value = '';
    syncChatInputOverlay(input);
    showToast('Uploading...');
    const result = await Api.uploadFile(file);
    if (!result.fileId) { showToast('Upload failed'); return; }
    const payload = {
      type: 'sendFile',
      chatId: currentChatId,
      fileId: result.fileId,
      fileMimeType: result.mimeType || file.type,
      tempId: 't' + Date.now(),
    };
    if (replyToMessageId) payload.replyTo = replyToMessageId;
    const sent = sendViaWs(payload);
    if (sent) addTempMessage('📎 Media', payload.tempId, currentChatType === 'group');
    cancelReply();
    showToast(sent ? 'Sent' : 'Queued');
    return;
  }
  let sendText = text;
  let keyType;
  if (currentChatType === 'direct' && currentOtherUserId && text) {
    try {
      const pubRes = await fetch(`/users/${currentOtherUserId}/public-key`, { headers: Api._authHeaders() });
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (pubData.publicKey) {
              sendText = await CryptoE2EE.encryptMessage(text, pubData.publicKey);
          if (sendText) keyType = 'e2ee_v1';
        }
      }
    } catch (_) {}
  }
  const payload = {
    type: 'send',
    chatId: currentChatId,
    text: sendText,
    tempId: 't' + Date.now(),
  };
  if (keyType) payload.keyType = keyType;
  if (replyToMessageId) payload.replyTo = replyToMessageId;
  const sent = sendViaWs(payload);
  if (sent) {
    input.value = '';
    syncChatInputOverlay(input);
    addTempMessage(keyType === 'e2ee_v1' ? text : sendText, payload.tempId, currentChatType === 'group', keyType, text);
  }
  cancelReply();
}

function getOtherUserId() {
  // For direct chats, we know the other user is the chat name (username)
  // Try to find the user from the participants
  return null; // We'll rely on WS events for status
}

function connectWs(chatId) {
  if (ws) ws.close();
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.host;
  ws = new WebSocket(`${protocol}://${host}`);
  let reconnectTimer = null;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token: Api.token }));
    flushPendingMessages();
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      if (data.type === 'online_users') {
        onlineUsers = new Set(data.users || []);
        if (currentOtherUserId) {
          updateChatStatus(onlineUsers.has(currentOtherUserId));
        }
      }

      // Субадмин запустил/закрыл опрос: poll.js слушает это событие и сразу
      // перерисовывает блокировку, без ожидания перезагрузки страницы.
      if (data.type === 'poll_changed') {
        window.dispatchEvent(new CustomEvent('poll:changed'));
      }

      if (data.type === 'connected' && data.userId) {
        CryptoE2EE.uploadPublicKey();
      }

      if (data.type === 'online') {
        if (data.status === 'online') {
          onlineUsers.add(data.userId);
        } else {
          onlineUsers.delete(data.userId);
        }
        if (currentOtherUserId === data.userId) {
          updateChatStatus(data.status === 'online');
        }
      }

      if (data.type === 'message') {
        // Our own message echo (server doesn't include tempId) — match by order per chat
        if (!data.tempId && data.userId === Api.userId && data.chatId === currentChatId && _tempOrdered[data.chatId]?.length) {
          const tempId = _tempOrdered[data.chatId].shift();
          const el = document.getElementById('chatMessages');
          if (data.keyType === 'e2ee_v1' && _decryptedTexts[tempId]) {
            _decryptedTexts[data.id] = _decryptedTexts[tempId];
            delete _decryptedTexts[tempId];
          }
          if (el) {
            for (let i = 0; i < el.children.length; i++) {
              const c = el.children[i];
              if (c.dataset && c.dataset.msgId === tempId) {
                // Replace bubble with properly rendered message (handles file_id, text, etc.)
                const msg = {
                  id: data.id,
                  chat_id: data.chatId,
                  user_id: data.userId,
                  text: data.text || '',
                  file_id: data.fileId,
                  file_mime_type: data.file_mime_type,
                  created_at: data.timestamp,
                  username: data.username || currentChatName,
                  avatar_url: '',
                  status: 'sent',
                  reply: data.reply || null,
                  key_type: data.keyType,
                };
                c.outerHTML = renderMessage(msg, currentChatType === 'group');
                break;
              }
            }
          }
          updateChatListLastMessage(data.chatId, data.keyType === 'e2ee_v1' ? '🔒 Encrypted' : (data.text || (data.fileId ? '📎 Media' : '')), data.timestamp, false);
          return;
        }
        // Dedup: O(1) по набору отрисованных id
        if (data.id && _seenMsgIds.has(data.id)) return;
        const msg = {
          id: data.id,
          chat_id: data.chatId,
          user_id: data.userId,
          text: data.text,
          file_id: data.fileId,
          file_mime_type: data.file_mime_type,
          created_at: data.timestamp,
          username: data.username || currentChatName,
          avatar_url: '',
          status: 'sent',
          reply: data.reply || null,
          key_type: data.keyType,
        };
        if (data.chatId === currentChatId) {
          if (!_chatReady) {
            // Первая страница ещё летит — копим, чтобы не выводить кадры
            // в пустой контейнер. Превью в списке чатов обновляем сразу.
            _wsQueue.push(data);
          } else if (!isOlderThanLoaded(data.timestamp, data.id)) {
            addMessage(msg, currentChatType === 'group');
            if (data.userId !== Api.userId) sendReadReceipt(data.id);
          }
        }
        const isFromOther = data.userId !== Api.userId && data.chatId !== currentChatId;
        updateChatListLastMessage(data.chatId, data.keyType === 'e2ee_v1' ? '🔒 Encrypted' : (msg.text || (data.fileId ? '📎 Media' : '')), data.timestamp, isFromOther);
        if (data.keyType === 'e2ee_v1' && data.userId !== Api.userId) {
          _decryptMsgId(data.id, data.text, data.userId);
        }
      }

      if (data.type === 'delivered') {
        document.querySelectorAll(`.msg[data-msg-id="${data.messageId}"] .msg-status`).forEach(el => {
          if (el.textContent === '✓' || el.textContent === '⏳') el.textContent = '✓✓';
        });
      }

      if (data.type === 'read') {
        document.querySelectorAll(`.msg[data-msg-id="${data.messageId}"] .msg-status`).forEach(el => {
          el.textContent = '✓✓';
        });
      }

      if (data.type === 'message_edited' && data.chatId === currentChatId) {
        const msgEl = document.querySelector(`.msg[data-msg-id="${data.messageId}"]`);
        if (msgEl) {
          const textEl = msgEl.querySelector('.msg-text');
          if (textEl) textEl.textContent = data.newText || '';
          const meta = msgEl.querySelector('.msg-meta');
          if (meta && !meta.querySelector('.msg-edited')) {
            const edited = document.createElement('span');
            edited.className = 'msg-edited';
            edited.textContent = 'edited';
            meta.insertBefore(edited, meta.querySelector('.msg-time'));
          }
        }
      }

      if (data.type === 'message_deleted' && data.chatId === currentChatId) {
        const msgEl = document.querySelector(`.msg[data-msg-id="${data.messageId}"]`);
        if (msgEl) msgEl.remove();
        document.querySelectorAll(`.msg-reply[onclick*="'${data.messageId}'"]`).forEach(el => {
          const textEl = el.querySelector('.msg-reply-text');
          if (textEl) textEl.textContent = '[deleted]';
        });
      }
    } catch (_) {}
  };

  ws.onerror = () => {
    if (ws) ws.close();
  };

  ws.onclose = (ev) => {
    // 1008 — сервер отказал в токене, это не обрыв связи: переподключение
    // лишь будет снова бить в закрытую дверь, поэтому зовём перелогин.
    if (ev && ev.code === 1008) {
      if (window.Api && Api.expireSession) Api.expireSession();
      return;
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (currentChatId) {
      reconnectTimer = setTimeout(() => connectWs(currentChatId), 3000);
    }
  };
}

function fmtTimeMsg(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toTimeString().slice(0, 5);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + d.toTimeString().slice(0, 5);
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

// ---- Utils ----
function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const COLORS = ['#e53935','#f57c00','#fdd835','#7cb342','#43a047','#2e7d32','#1e88e5','#039be5','#00acc1','#00897b','#5e35b1','#8e24aa','#d81b60','#6d4c41','#546e7a', '#ef5350','#ff7043','#ffb74d','#aed581','#81c784','#4db6ac','#4dd0e1','#64b5f6','#7986cb','#ba68c8','#f06292','#a1887f','#90a4ae','#bdbdbd','#f44336','#ff9800'];

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i), h |= 0;
  return h;
}

function colorFromId(id) {
  return COLORS[Math.abs(hashCode(id)) % COLORS.length];
}

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return 'transparent';
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toTimeString().slice(0, 5);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtFullDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const days = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()} ${days[d.getMonth()]} ${d.getFullYear()}`;
}

const EMOJIS = ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🤠','🥳','🥺','😢','😭','😤','😠','😡','🤬','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','💋','👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','👄','💘','❤️','💓','💔','💕','💖','💗','💙','💚','💛','🧡','💜','🖤','🤍','🤎','💞','💝','❤️‍🔥','❣️','💟','💌','💤','💢','💣','💥','💦','💨','💫','💬','🗨️','🗯️','💭','🕳️','👤','👥','🗣️','👣','⭐','🌟','✨','⚡','🔥','💥','💫','💦','💨','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌀','🌪️','🌫️','🌈','☔','☂️','💧','💦','🌊','🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','💎','🔮','🪄','🎮','🕹️','🎰','🎲','♠️','♥️','♦️','♣️','🃏','🀄','🎴','🎭','🎨','🧩','🎯','🎳','🎪','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎱','🏀','🏈','⚽','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','⛸️','🛷','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','🤺','⛹️','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎲','♟️','🎯','🎱','🏀','🏈','⚽','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','⛸️','🛷','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','🤺','⛹️','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🚣','🏊','🤽','🚣','🧗','🚵','🚴','🚣','🏊','🤽','🚣','🧗','🚵','🚴','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🚏','🛣️','🛤️','⛽','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🏠','🏡','🏘️','🏚️','🏗️','🏢','🏭','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏯','🏰','💒','🗼','🗽','⛪','🕌','🕍','🛕','🕋','⛩️','🛤️','🌋','🗻','🏔️','⛰️','🌄','🌅','🏕️','🏖️','🏜️','🏝️','🏞️','🌇','🌆','🌃','🏙️','🌌','🌉','🎠','🎡','🎢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🚚','🚛','🚜','🏎️','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🪐','🌠','⭐','🌟','✨','⚡','☄️','💥','🔥','🌪️','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','🌊','☂️','☔','⚡','🔥','💫','💥'];

const KOLOBOKS = ['acute_mini','aggressive_mini','air_kiss_mini','angel_mini','beee_mini','biggrin_mini','biggrin_mini2','blum_mini','blush_mini','bo_mini','bomb_mini','boredom_mini','bye_mini','chok_mini','clapping_mini','cray_mini','cray_mini2','crazy_mini','dance_mini','dash_mini','diablo_mini','dirol_mini','drink_mini','drink2_mini','fool_mini','fool_mini2','good_mini','greeting_mini','happy_mini','heart_mini','help_mini','kiss_mini','kiss3_mini','laugh_mini','laugh_mini2','lol_mini','lol_mini2','mad_mini','mail1_mini','mamba_mini','man_in_love_mini','mocking_mini','music_mini','music_mini2','nea_mini','new_russian_mini','ok_mini','pardon_mini','rofl_mini','rolleyes_mini','rose_mini','sad_mini','sad_mini2','scratch_one-s_head_mini','secret_mini','shout_mini','smile_mini','smile_mini2','sorry_mini','stop_mini','unknw_mini','unsure_mini','vava_mini','wacko_mini','wacko_mini2','wink_mini','yahoo_mini','yes_mini'];

function toggleEmojiPanel(e) {
  e.stopPropagation();
  const isDesktop = window.innerWidth >= 768;
  const panel = document.getElementById(isDesktop ? 'emojiPanelDesktop' : 'emojiPanel');
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  if (!panel.querySelector('.emoji-tabs') && !panel.querySelector('.emoji-grid')) {
    const tabs = document.createElement('div');
    tabs.className = 'emoji-tabs';
    tabs.innerHTML = '<button class="emoji-tab active" type="button" data-tab="emoji" onclick="switchEmojiTab(this,\'emoji\')">🙂</button><button class="emoji-tab" type="button" data-tab="kolobok" onclick="switchEmojiTab(this,\'kolobok\')"><img class="emoji-tab-kolobok" src="/mini/acute_mini.gif" alt="" loading="lazy" decoding="async"></button>';
    panel.appendChild(tabs);
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    grid.innerHTML = EMOJIS.map(e => `<button class="emoji-item" type="button" onclick="insertEmoji('${e}')">${e}</button>`).join('');
    panel.appendChild(grid);
  }
  panel.style.display = 'block';
}

function switchEmojiTab(btn, tab) {
  const panel = btn.closest('.emoji-panel');
  if (!panel) return;
  [...panel.querySelectorAll('.emoji-tab')].forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const grid = panel.querySelector('.emoji-grid');
  if (!grid) return;
  if (tab === 'kolobok') {
    if (!grid.dataset.kolobokBuilt) {
      grid.innerHTML = KOLOBOKS.map(n => `<button class="emoji-item emoji-gif" type="button" onclick="insertKolobok('${n}')"><img src="/mini/${n}.gif" alt="${n}" loading="lazy" decoding="async"></button>`).join('');
      grid.dataset.kolobokBuilt = '1';
    }
  } else if (grid.dataset.kolobokBuilt) {
    grid.innerHTML = EMOJIS.map(e => `<button class="emoji-item" type="button" onclick="insertEmoji('${e}')">${e}</button>`).join('');
    delete grid.dataset.kolobokBuilt;
  }
}

function insertKolobok(name) {
  const isDesktop = window.innerWidth >= 768;
  const input = document.getElementById(isDesktop ? 'chatInput' : 'chatInputMobile');
  if (input) {
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const idx = KOLOBOKS.indexOf(name);
    const marker = idx >= 0 ? `:k${idx}:` : `::kolobok:${name}::`;
    input.value = input.value.substring(0, start) + marker + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + marker.length;
    syncChatInputOverlay(input);
    input.focus();
  }
}

function kolobokize(text) {
  if (!text || (text.indexOf('::kolobok:') === -1 && !/:k\d+:/.test(text))) return text;
  return text.replace(/::kolobok:([A-Za-z0-9_-]+)::|:k(\d+):/g, (_, name, idx) => {
    const n = name
      ? (KOLOBOKS.includes(name) ? name : null)
      : (KOLOBOKS[+idx] || null);
    if (n) return `<img class="kolobok-inline" src="/mini/${n}.gif" alt="${n}" loading="lazy" decoding="async">`;
    return name ? `::kolobok:${name}::` : `:k${idx}:`;
  });
}

function kolobokizePreview(text) {
  if (!text || (text.indexOf('::kolobok:') === -1 && !/:k\d+:/.test(text))) return text;
  return text.replace(/::kolobok:[A-Za-z0-9_-]+::|:k\d+:/g, '🌀');
}

function syncChatInputOverlay(input) {
  const wrap = input?.closest('.chat-input-wrap');
  const overlay = wrap && wrap.querySelector('.chat-input-overlay');
  if (!overlay) return;
  const cs = getComputedStyle(input);
  overlay.style.left = cs.paddingLeft;
  overlay.style.right = cs.paddingRight;
  overlay.style.fontSize = cs.fontSize;
  overlay.style.fontFamily = cs.fontFamily;
  overlay.innerHTML = input.value ? kolobokize(escapeHtml(input.value)) : '';
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
  probe.style.fontSize = cs.fontSize;
  probe.style.fontFamily = cs.fontFamily;
  document.body.appendChild(probe);
  overlay.querySelectorAll('.kolobok-inline').forEach(img => {
    probe.textContent = `:k${KOLOBOKS.indexOf(img.alt)}:`;
    img.style.width = `${probe.getBoundingClientRect().width}px`;
  });
  probe.remove();
  overlay.style.transform = `translateX(${-input.scrollLeft}px)`;
}

function wireChatInputOverlay() {
  ['chatInput', 'chatInputMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.overlayWired) {
      el.dataset.overlayWired = '1';
      el.addEventListener('input', () => syncChatInputOverlay(el));
      el.addEventListener('scroll', () => syncChatInputOverlay(el));
      syncChatInputOverlay(el);
    }
  });
}

document.addEventListener('click', (e) => {
  const p1 = document.getElementById('emojiPanel');
  const p2 = document.getElementById('emojiPanelDesktop');
  const panel = p1?.style.display !== 'none' ? p1 : (p2?.style.display !== 'none' ? p2 : null);
  if (panel && !e.target.closest('.emoji-btn') && !e.target.closest('.emoji-panel')) {
    panel.style.display = 'none';
  }
});

function insertEmoji(emoji) {
  const isDesktop = window.innerWidth >= 768;
  const input = document.getElementById(isDesktop ? 'chatInput' : 'chatInputMobile');
  if (input) {
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    syncChatInputOverlay(input);
    input.focus();
  }
}

// Apply saved theme on load
loadTheme();
