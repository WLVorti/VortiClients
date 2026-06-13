import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocaleProvider extends ChangeNotifier {
  static final LocaleProvider _instance = LocaleProvider._internal();
  factory LocaleProvider() => _instance;
  LocaleProvider._internal();

  Locale _locale = const Locale('en');
  Locale get locale => _locale;

  Future<void> loadLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final lang = prefs.getString('locale') ?? 'en';
    _locale = Locale(lang);
    notifyListeners();
  }

  Future<void> setLocale(Locale locale) async {
    if (locale == _locale) return;
    _locale = locale;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('locale', locale.languageCode);
  }

  void setLocaleSync(Locale locale) {
    if (locale == _locale) return;
    _locale = locale;
    notifyListeners();
  }

  Locale? Function(List<Locale>?, Iterable<Locale>)? get localeResolutionCallback =>
      (preferred, supported) {
        for (final pref in preferred ?? []) {
          if (supported.any((s) => s.languageCode == pref.languageCode)) {
            return Locale(pref.languageCode);
          }
        }
        return const Locale('en');
      };
}
