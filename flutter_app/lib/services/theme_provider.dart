import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppTheme {
  final String id;
  final String name;
  final Color primaryColor;
  final Color secondaryColor;
  final Color backgroundColor;
  final Color surfaceColor;
  final Color onPrimaryColor;
  final Color onBackgroundColor;

  const AppTheme({
    required this.id,
    required this.name,
    required this.primaryColor,
    required this.secondaryColor,
    required this.backgroundColor,
    required this.surfaceColor,
    required this.onPrimaryColor,
    required this.onBackgroundColor,
  });

  static const List<AppTheme> presets = [
    AppTheme(
      id: 'light_blue',
      name: 'Light Blue',
      primaryColor: Color(0xFF0A84FF),
      secondaryColor: Color(0xFF5AC8FA),
      backgroundColor: Color(0xFFFFFFFF),
      surfaceColor: Color(0xFFF0F4FF),
      onPrimaryColor: Color(0xFFFFFFFF),
      onBackgroundColor: Color(0xFF1C1C1E),
    ),
    AppTheme(
      id: 'light_neon',
      name: 'Light Neon',
      primaryColor: Color(0xFFFF2D78),
      secondaryColor: Color(0xFFFF6B9D),
      backgroundColor: Color(0xFFFFFFFF),
      surfaceColor: Color(0xFFFFF0F5),
      onPrimaryColor: Color(0xFFFFFFFF),
      onBackgroundColor: Color(0xFF1C1C1E),
    ),
    AppTheme(
      id: 'dark_blue',
      name: 'Dark Blue',
      primaryColor: Color(0xFF1A8CFF),
      secondaryColor: Color(0xFF64D2FF),
      backgroundColor: Color(0xFF0D1117),
      surfaceColor: Color(0xFF161B22),
      onPrimaryColor: Color(0xFFFFFFFF),
      onBackgroundColor: Color(0xFFF0F6FF),
    ),
    AppTheme(
      id: 'dark_neon',
      name: 'Dark Neon',
      primaryColor: Color(0xFFFF2D78),
      secondaryColor: Color(0xFFFF8FB3),
      backgroundColor: Color(0xFF0D0A0F),
      surfaceColor: Color(0xFF1A1218),
      onPrimaryColor: Color(0xFFFFFFFF),
      onBackgroundColor: Color(0xFFFCE4EC),
    ),
  ];
}

class ThemeColors {
  final Color primary;
  final Color secondary;
  final Color background;
  final Color surface;
  final Color text;
  final Color textSecondary;

  const ThemeColors({
    required this.primary,
    required this.secondary,
    required this.background,
    required this.surface,
    required this.text,
    required this.textSecondary,
  });

  static const ThemeColors defaultLight = ThemeColors(
    primary: Color(0xFF0A84FF),
    secondary: Color(0xFF5AC8FA),
    background: Color(0xFFFFFFFF),
    surface: Color(0xFFF0F4FF),
    text: Color(0xFF1C1C1E),
    textSecondary: Color(0xFF6E6E73),
  );

  static const ThemeColors defaultDark = ThemeColors(
    primary: Color(0xFF1A8CFF),
    secondary: Color(0xFF64D2FF),
    background: Color(0xFF0D1117),
    surface: Color(0xFF161B22),
    text: Color(0xFFF0F6FF),
    textSecondary: Color(0xFF8B949E),
  );
}

class ThemeProvider extends ChangeNotifier {
  static const _themeKeyPrefix = 'theme_mode';
  static const _themeIdPrefix = 'theme_id';
  static const _customPrimaryKey = 'custom_primary_color';
  static const _customSecondaryKey = 'custom_secondary_color';
  static const _customBackgroundKey = 'custom_background_color';
  static const _customSurfaceKey = 'custom_surface_color';
  static const _customTextKey = 'custom_text_color';
  static const _customSecondaryTextKey = 'custom_secondary_text_color';
  static final _storage = const FlutterSecureStorage();

  static final ThemeProvider _instance = ThemeProvider._internal();
  factory ThemeProvider() => _instance;
  ThemeProvider._internal();
  
  String? _currentUserId;
  ThemeMode _themeMode = ThemeMode.system;
  String _themeId = 'light_blue';
  ThemeColors _customColors = ThemeColors.defaultLight;
  
  ThemeMode get themeMode => _themeMode;
  String get themeId => _themeId;
  ThemeColors get colors => _customColors;
  Color get primaryColor => _customColors.primary;
  Color get secondaryColor => _customColors.secondary;
  Color get backgroundColor => _customColors.background;
  Color get surfaceColor => _customColors.surface;
  Color get textColor => _customColors.text;
  Color get textSecondaryColor => _customColors.textSecondary;
  
  bool get isDarkMode => _themeMode == ThemeMode.dark;
  String getCurrentThemeId() => _themeId;
  bool get isCustom => _themeId == 'custom';
  
  void setCurrentUser(String? userId) {
    _currentUserId = userId;
  }
  
  String _getKey(String baseKey) {
    if (_currentUserId == null) return baseKey;
    return '${baseKey}_${_currentUserId}';
  }
  
  static Future<void> resetTheme() async {
    final instance = _instance;
    await _storage.delete(key: '${_themeKeyPrefix}_${instance._currentUserId}');
    await _storage.delete(key: '${_themeIdPrefix}_${instance._currentUserId}');
    await _storage.delete(key: instance._getKey(_customPrimaryKey));
    await _storage.delete(key: instance._getKey(_customSecondaryKey));
    await _storage.delete(key: instance._getKey(_customBackgroundKey));
    await _storage.delete(key: instance._getKey(_customSurfaceKey));
    await _storage.delete(key: instance._getKey(_customTextKey));
    await _storage.delete(key: instance._getKey(_customSecondaryTextKey));
    instance._themeMode = ThemeMode.system;
    instance._themeId = 'light_blue';
    instance._customColors = ThemeColors.defaultLight;
    instance.notifyListeners();
  }
  
  Future<void> loadTheme() async {
    final modeKey = _getKey(_themeKeyPrefix);
    final idKey = _getKey(_themeIdPrefix);
    
    final modeValue = await _storage.read(key: modeKey);
    if (modeValue != null) {
      _themeMode = modeValue == 'dark' ? ThemeMode.dark : ThemeMode.light;
      _customColors = _themeMode == ThemeMode.dark 
          ? ThemeColors.defaultDark 
          : ThemeColors.defaultLight;
    } else {
      // Fallback to default theme
      _themeMode = ThemeMode.system;
      _themeId = 'light_blue';
      _applyPreset('light_blue');
    }
    
    final idValue = await _storage.read(key: idKey);
    if (idValue != null) {
      _themeId = idValue;
      if (idValue == 'custom') {
        await _loadCustomColors();
      } else {
        _applyPreset(idValue);
      }
    }
    notifyListeners();
  }
  
  Future<void> _loadCustomColors() async {
    final primaryKey = _getKey(_customPrimaryKey);
    final secondaryKey = _getKey(_customSecondaryKey);
    final backgroundKey = _getKey(_customBackgroundKey);
    final surfaceKey = _getKey(_customSurfaceKey);
    final textKey = _getKey(_customTextKey);
    final textSecondaryKey = _getKey(_customSecondaryTextKey);
    
    final primary = await _storage.read(key: primaryKey);
    final secondary = await _storage.read(key: secondaryKey);
    final background = await _storage.read(key: backgroundKey);
    final surface = await _storage.read(key: surfaceKey);
    final text = await _storage.read(key: textKey);
    final textSecondary = await _storage.read(key: textSecondaryKey);
    
    _customColors = ThemeColors(
      primary: primary != null ? Color(int.parse(primary)) : _customColors.primary,
      secondary: secondary != null ? Color(int.parse(secondary)) : _customColors.secondary,
      background: background != null ? Color(int.parse(background)) : _customColors.background,
      surface: surface != null ? Color(int.parse(surface)) : _customColors.surface,
      text: text != null ? Color(int.parse(text)) : _customColors.text,
      textSecondary: textSecondary != null ? Color(int.parse(textSecondary)) : _customColors.textSecondary,
    );
  }
    
  void _applyPreset(String id) {
    final preset = AppTheme.presets.firstWhere(
      (t) => t.id == id,
      orElse: () => AppTheme.presets[0],
    );
    _customColors = ThemeColors(
      primary: preset.primaryColor,
      secondary: preset.secondaryColor,
      background: preset.backgroundColor,
      surface: preset.surfaceColor,
      text: preset.onBackgroundColor,
      textSecondary: preset.onBackgroundColor.withValues(alpha: 0.7),
    );
  }
  
  Future<void> applyPreset(String id) async {
    final idKey = _getKey(_themeIdPrefix);
    await _storage.write(key: idKey, value: id);
    _themeId = id;
    _applyPreset(id);
    notifyListeners();
  }
  
  Future<void> setThemeMode(ThemeMode mode) async {
    final modeKey = _getKey(_themeKeyPrefix);
    await _storage.write(key: modeKey, value: mode == ThemeMode.dark ? 'dark' : 'light');
    _themeMode = mode;
    notifyListeners();
  }
  
  Future<void> toggleThemeMode() async {
    final newMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await setThemeMode(newMode);
  }
  
  Future<void> setCustomColor(String key, Color color) async {
    _themeId = 'custom';
    final idKey = _getKey(_themeIdPrefix);
    await _storage.write(key: idKey, value: 'custom');
    
    String storageKey;
    switch (key) {
      case 'primary':
        storageKey = _getKey(_customPrimaryKey);
        break;
      case 'secondary':
        storageKey = _getKey(_customSecondaryKey);
        break;
      case 'background':
        storageKey = _getKey(_customBackgroundKey);
        break;
      case 'surface':
        storageKey = _getKey(_customSurfaceKey);
        break;
      case 'text':
        storageKey = _getKey(_customTextKey);
        break;
      case 'textSecondary':
        storageKey = _getKey(_customSecondaryTextKey);
        break;
      default:
        return;
    }
    
    switch (key) {
      case 'primary':
        _customColors = ThemeColors(
          primary: color,
          secondary: _customColors.secondary,
          background: _customColors.background,
          surface: _customColors.surface,
          text: _customColors.text,
          textSecondary: _customColors.textSecondary,
        );
        break;
      case 'secondary':
        _customColors = ThemeColors(
          primary: _customColors.primary,
          secondary: color,
          background: _customColors.background,
          surface: _customColors.surface,
          text: _customColors.text,
          textSecondary: _customColors.textSecondary,
        );
        break;
      case 'background':
        _customColors = ThemeColors(
          primary: _customColors.primary,
          secondary: _customColors.secondary,
          background: color,
          surface: _customColors.surface,
          text: _customColors.text,
          textSecondary: _customColors.textSecondary,
        );
        break;
      case 'surface':
        _customColors = ThemeColors(
          primary: _customColors.primary,
          secondary: _customColors.secondary,
          background: _customColors.background,
          surface: color,
          text: _customColors.text,
          textSecondary: _customColors.textSecondary,
        );
        break;
      case 'text':
        _customColors = ThemeColors(
          primary: _customColors.primary,
          secondary: _customColors.secondary,
          background: _customColors.background,
          surface: _customColors.surface,
          text: color,
          textSecondary: _customColors.textSecondary,
        );
        break;
      case 'textSecondary':
        _customColors = ThemeColors(
          primary: _customColors.primary,
          secondary: _customColors.secondary,
          background: _customColors.background,
          surface: _customColors.surface,
          text: _customColors.text,
          textSecondary: color,
        );
        break;
    }
    await _storage.write(key: storageKey, value: color.value.toString());
    await _storage.write(key: _getKey(_customPrimaryKey), value: _customColors.primary.value.toString());
    await _storage.write(key: _getKey(_customSecondaryKey), value: _customColors.secondary.value.toString());
    await _storage.write(key: _getKey(_customBackgroundKey), value: _customColors.background.value.toString());
    await _storage.write(key: _getKey(_customSurfaceKey), value: _customColors.surface.value.toString());
    await _storage.write(key: _getKey(_customTextKey), value: _customColors.text.value.toString());
    await _storage.write(key: _getKey(_customSecondaryTextKey), value: _customColors.textSecondary.value.toString());
    notifyListeners();
  }
  
  Future<void> setCustomTheme(
    Color primary,
    Color secondary,
    Color background,
    Color surface,
    Color text,
    Color textSecondary,
  ) async {
    _themeId = 'custom';
    _customColors = ThemeColors(
      primary: primary,
      secondary: secondary,
      background: background,
      surface: surface,
      text: text,
      textSecondary: textSecondary,
    );
    
    final idKey = _getKey(_themeIdPrefix);
    final primaryKey = _getKey(_customPrimaryKey);
    final secondaryKey = _getKey(_customSecondaryKey);
    final backgroundKey = _getKey(_customBackgroundKey);
    final surfaceKey = _getKey(_customSurfaceKey);
    final textKey = _getKey(_customTextKey);
    final textSecondaryKey = _getKey(_customSecondaryTextKey);
    
    await _storage.write(key: idKey, value: 'custom');
    await _storage.write(key: primaryKey, value: primary.value.toString());
    await _storage.write(key: secondaryKey, value: secondary.value.toString());
    await _storage.write(key: backgroundKey, value: background.value.toString());
    await _storage.write(key: surfaceKey, value: surface.value.toString());
    await _storage.write(key: textKey, value: text.value.toString());
    await _storage.write(key: textSecondaryKey, value: textSecondary.value.toString());
    notifyListeners();
  }
  
  ThemeData getThemeData() {
    final colors = _customColors;
    final isDark = _themeMode == ThemeMode.dark;
    final brightness = isDark ? Brightness.dark : Brightness.light;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: colors.primary,
      brightness: brightness,
    ).copyWith(
      surface: colors.surface,
      background: colors.background,
      onSurface: colors.text,
      onSurfaceVariant: colors.textSecondary,
      surfaceContainer: colors.surface,
      surfaceContainerHigh: colors.surface,
      surfaceContainerHighest: colors.surface,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colors.background,
      appBarTheme: AppBarTheme(
        backgroundColor: colors.background,
        foregroundColor: colors.text,
        elevation: 0,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: colors.primary,
        foregroundColor: isDark ? Colors.white : Colors.white,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: colors.primary, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: isDark ? Colors.white : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      cardTheme: CardThemeData(
        color: colors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.surface,
        indicatorColor: colors.primary.withValues(alpha: 0.2),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: colors.primary);
          }
          return IconThemeData(color: colors.textSecondary);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return TextStyle(color: colors.primary, fontSize: 12, fontWeight: FontWeight.w500);
          }
          return TextStyle(color: colors.textSecondary, fontSize: 12);
        }),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        modalBackgroundColor: colors.surface,
      ),
    );
  }
}
