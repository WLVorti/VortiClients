import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsProvider extends ChangeNotifier {
  static const _keyAutoSaveMedia = 'auto_save_media';
  static SharedPreferences? _prefs;

  bool _autoSaveMedia = false;
  bool get autoSaveMedia => _autoSaveMedia;

  static Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  Future<void> load() async {
    await init();
    _autoSaveMedia = _prefs?.getBool(_keyAutoSaveMedia) ?? false;
    notifyListeners();
  }

  Future<void> setAutoSaveMedia(bool value) async {
    await init();
    _autoSaveMedia = value;
    await _prefs?.setBool(_keyAutoSaveMedia, value);
    notifyListeners();
  }
}
