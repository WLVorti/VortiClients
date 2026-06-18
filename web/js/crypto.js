const CryptoE2EE = (() => {
  const DB_NAME = 'vorti_e2ee';
  const STORE_NAME = 'keys';
  const SEED_ID = 'e2ee_seed';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function storeValue(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadValue(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function clampSeed(seed) {
    seed[0] &= 248;
    seed[31] &= 127;
    seed[31] |= 64;
    return seed;
  }

  async function deriveSeed(phrase, userId) {
    const enc = new TextEncoder();
    const salt = enc.encode(userId + ':vortimes-e2ee-v1');
    const key = await crypto.subtle.importKey('raw', enc.encode(phrase),
      { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key, 256
    );
    return new Uint8Array(bits);
  }

  function b64decode(s) {
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  }

  function b64encode(b) {
    return btoa(String.fromCharCode(...new Uint8Array(b)));
  }

  let _keyPair = null;
  let _publicKeyB64 = null;

  async function init() {
    const seed = await loadValue(SEED_ID);
    if (seed) return restoreFromSeed(seed);

    const legacy = await loadValue('keyPair') || await loadValue('private_key');
    if (legacy) {
      const raw = await crypto.subtle.exportKey('raw', legacy.publicKey);
      _publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
      _keyPair = legacy;
      return true;
    }
    return false;
  }

  async function restoreFromSeed(seed) {
    try {
      const clamped = clampSeed(new Uint8Array(seed));
      _keyPair = await crypto.subtle.importKey('raw', clamped,
        { name: 'X25519' }, true, ['deriveBits', 'deriveKey']);
      const raw = await crypto.subtle.exportKey('raw', _keyPair.publicKey);
      _publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
      return true;
    } catch (e) {
      console.error('restoreFromSeed failed', e);
      return false;
    }
  }

  async function initWithPassphrase(phrase, userId) {
    const seed = await deriveSeed(phrase, userId);
    await storeValue(SEED_ID, seed);
    const ok = await restoreFromSeed(seed);
    if (!ok) throw new Error('Failed to derive key from passphrase');
  }

  async function hasSeed() {
    return !!(await loadValue(SEED_ID));
  }

  function getPublicKey() {
    return _publicKeyB64;
  }

  async function uploadPublicKey() {
    if (!_publicKeyB64 || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'keyExchange', publicKey: _publicKeyB64 }));
  }

  async function deriveSharedKey(theirPubB64) {
    if (!_keyPair) return null;
    const raw = b64decode(theirPubB64);
    const theirPub = await crypto.subtle.importKey('raw', raw,
      { name: 'X25519' }, false, []);
    const bits = await crypto.subtle.deriveBits(
      { name: 'X25519', public: theirPub },
      _keyPair.privateKey, 256
    );
    return new Uint8Array(bits);
  }

  async function encryptMessage(plaintext, theirPubB64) {
    const sharedKey = await deriveSharedKey(theirPubB64);
    if (!sharedKey) return null;

    const nonce = nacl.randomBytes(24);
    const data = new TextEncoder().encode(plaintext);
    const encrypted = nacl.secretbox(data, nonce, sharedKey);
    if (!encrypted) return null;

    return b64encode(nonce) + ':' + b64encode(encrypted);
  }

  async function decryptMessage(ciphertext, theirPubB64) {
    try {
      const sharedKey = await deriveSharedKey(theirPubB64);
      if (!sharedKey) return null;

      const parts = ciphertext.split(':');
      if (parts.length !== 2) return null;

      const nonce = b64decode(parts[0]);
      const encrypted = b64decode(parts[1]);

      const decrypted = nacl.secretbox.open(encrypted, nonce, sharedKey);
      if (!decrypted) return null;

      return new TextDecoder().decode(decrypted);
    } catch (_) {
      return null;
    }
  }

  return { init, hasSeed, initWithPassphrase, getPublicKey,
    uploadPublicKey, deriveSharedKey, encryptMessage, decryptMessage };
})();
