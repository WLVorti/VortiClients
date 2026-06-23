import 'package:shared_preferences/shared_preferences.dart';

class HiddenChats {
  static const _key = 'hidden_chats';
  static Set<String> _hidden = {};

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _hidden = prefs.getStringList(_key)?.toSet() ?? {};
  }

  static bool isHidden(String chatId) => _hidden.contains(chatId);

  static Future<void> hide(String chatId) async {
    _hidden.add(chatId);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _hidden.toList());
  }

  static Future<void> remove(String chatId) async {
    _hidden.remove(chatId);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _hidden.toList());
  }
}
