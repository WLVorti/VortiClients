import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'api_service.dart';

class MuteService {
  static const _key = 'muted_chats';
  static SharedPreferences? _prefs;
  static ApiService? _api;
  static final _client = http.Client();

  static Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  static void setApi(ApiService api) {
    _api = api;
  }

  static Future<bool> isMuted(String chatId) async {
    await init();
    final muted = _prefs?.getStringList(_key) ?? [];
    return muted.contains(chatId);
  }

  static Future<void> mute(String chatId) async {
    await init();
    final muted = _prefs?.getStringList(_key) ?? [];
    if (!muted.contains(chatId)) {
      muted.add(chatId);
      await _prefs?.setStringList(_key, muted);
    }
    if (_api != null) {
      await _client.post(
        Uri.parse('${ApiService.baseUrl}/chats/$chatId/mute'),
        headers: {'Authorization': 'Bearer ${_api!.token}'},
      );
    }
  }

  static Future<void> unmute(String chatId) async {
    await init();
    final muted = _prefs?.getStringList(_key) ?? [];
    muted.remove(chatId);
    await _prefs?.setStringList(_key, muted);
    if (_api != null) {
      await _client.delete(
        Uri.parse('${ApiService.baseUrl}/chats/$chatId/mute'),
        headers: {'Authorization': 'Bearer ${_api!.token}'},
      );
    }
  }

  static Future<void> toggle(String chatId) async {
    if (await isMuted(chatId)) {
      await unmute(chatId);
    } else {
      await mute(chatId);
    }
  }

  static Future<List<String>> getMutedChats() async {
    await init();
    return _prefs?.getStringList(_key) ?? [];
  }
}