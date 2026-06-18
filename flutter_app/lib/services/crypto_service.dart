import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:pinenacl/x25519.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';

const _pbkdf2Iterations = 100000;

Uint8List _pbkdf2(String password, List<int> salt, int iterations, int keyLength) {
  final hmac = Hmac(sha256, utf8.encode(password));
  final blockCount = (keyLength / 32).ceil();
  final result = BytesBuilder();

  for (int i = 1; i <= blockCount; i++) {
    final block = Uint8List(salt.length + 4);
    block.setAll(0, salt);
    block[salt.length] = (i >> 24) & 0xff;
    block[salt.length + 1] = (i >> 16) & 0xff;
    block[salt.length + 2] = (i >> 8) & 0xff;
    block[salt.length + 3] = i & 0xff;

    var u = hmac.convert(block).bytes;
    var t = Uint8List.fromList(u);

    for (int j = 2; j <= iterations; j++) {
      u = hmac.convert(u).bytes;
      for (int k = 0; k < u.length; k++) {
        t[k] ^= u[k];
      }
    }
    result.add(t);
  }

  final full = result.takeBytes();
  return Uint8List.view(full.buffer, 0, keyLength);
}

class CryptoService {
  static final _storage = const FlutterSecureStorage();

  static const _seedKey = 'e2ee_seed';
  static const _pubKeysKey = 'e2ee_pub_keys';

  static PrivateKey? _ourKey;

  static Map<String, String> _pubKeyCache = {};
  static final Map<String, Box> _boxCache = {};

  static Future<void> _loadPubKeyCache() async {
    if (_pubKeyCache.isNotEmpty) return;
    try {
      final stored = await _storage.read(key: _pubKeysKey);
      if (stored != null) {
        _pubKeyCache = Map<String, String>.from(jsonDecode(stored));
      }
    } catch (_) {
      _pubKeyCache = {};
    }
  }

  static Future<void> _savePubKeyCache() async {
    try {
      await _storage.write(key: _pubKeysKey, value: jsonEncode(_pubKeyCache));
    } catch (_) {}
  }

  static bool get isReady => _ourKey != null;

  static Future<bool> hasSeed() async {
    final existing = await _storage.read(key: _seedKey);
    return existing != null;
  }

  static Future<bool> init() async {
    final existing = await _storage.read(key: _seedKey);
    if (existing != null) {
      final seed = base64Decode(existing);
      _ourKey = PrivateKey.fromSeed(Uint8List.fromList(seed));
    }
    await _loadPubKeyCache();
    return existing != null;
  }

  static Future<void> initWithPassphrase(String passphrase, String userId) async {
    final salt = utf8.encode('$userId:vortimes-e2ee-v1');
    final seed = _pbkdf2(passphrase, salt, _pbkdf2Iterations, 32);
    _ourKey = PrivateKey.fromSeed(Uint8List.fromList(seed));
    await _storage.write(key: _seedKey, value: base64Encode(seed));
  }

  static String? get publicKeyB64 {
    if (_ourKey == null) return null;
    return base64Encode(_ourKey!.publicKey.asTypedList);
  }

  static Future<void> uploadPublicKey(ApiService api) async {
    final pk = publicKeyB64;
    if (pk == null) return;
    api.sendKeyExchange(pk);
  }

  static Future<String?> fetchPublicKey(String userId, ApiService api) async {
    final cached = _pubKeyCache[userId];
    if (cached != null) return cached;

    try {
      final res = await api.httpGet('/users/$userId/public-key');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final pk = data['publicKey'] as String?;
        if (pk != null) {
          _pubKeyCache[userId] = pk;
          _savePubKeyCache();
        }
        return pk;
      }
    } catch (_) {}
    return null;
  }

  static Future<Box?> getBox(String userId, ApiService api) async {
    final cached = _boxCache[userId];
    if (cached != null) return cached;

    if (_ourKey == null) return null;
    final theirPubB64 = await fetchPublicKey(userId, api);
    if (theirPubB64 == null) return null;

    final theirPub = PublicKey(base64Decode(theirPubB64));
    final box = Box(myPrivateKey: _ourKey!, theirPublicKey: theirPub);
    _boxCache[userId] = box;
    return box;
  }

  static String encryptMessage(String plaintext, Box box) {
    final encrypted = box.encrypt(Uint8List.fromList(utf8.encode(plaintext)));
    return '${base64Encode(encrypted.nonce.asTypedList)}:${base64Encode(encrypted.cipherText.asTypedList)}';
  }

  static String? decryptMessage(String ciphertext, Box box) {
    try {
      final parts = ciphertext.split(':');
      if (parts.length != 2) return null;
      final nonce = base64Decode(parts[0]);
      final ct = base64Decode(parts[1]);
      final msg = EncryptedMessage(nonce: nonce, cipherText: ct);
      final decrypted = box.decrypt(msg);
      return utf8.decode(decrypted);
    } catch (_) {
      return null;
    }
  }
}
