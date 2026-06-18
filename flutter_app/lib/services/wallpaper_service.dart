import 'dart:io';
import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

enum WallpaperStyle { atmospheric, contrast, mono, vibrant, unknown }

class WallpaperAnalysis {
  final Color accentColor;
  final Color secondaryColor;
  final Color backgroundColor;
  final Color textOnAccent;
  final Color textMain;
  final Color textSecondary;
  final Color surfaceColor;
  final Color glowColor;
  final bool useLightText;
  final WallpaperStyle detectedStyle;
  final double confidence;

  const WallpaperAnalysis({
    required this.accentColor,
    required this.secondaryColor,
    required this.backgroundColor,
    required this.textOnAccent,
    required this.textMain,
    required this.textSecondary,
    required this.surfaceColor,
    required this.glowColor,
    required this.useLightText,
    this.detectedStyle = WallpaperStyle.atmospheric,
    this.confidence = 0.5,
  });

  ThemeColors toThemeColors() => ThemeColors(
    primary: accentColor,
    secondary: secondaryColor,
    background: backgroundColor,
    surface: surfaceColor,
    text: textMain,
    textSecondary: textSecondary,
  );
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
}

class _PixelInfo {
  final int r, g, b;
  final double saturation;
  final double brightness;
  final double hue;

  _PixelInfo({required this.r, required this.g, required this.b, required this.saturation, required this.brightness, required this.hue});
}

double _yiq(int r, int g, int b) => (r * 299 + g * 587 + b * 114) / 1000;

Color _contrastText(Color color) {
  final r = (color.r * 255).round();
  final g = (color.g * 255).round();
  final b = (color.b * 255).round();
  return _yiq(r, g, b) >= 135 ? const Color(0xFF11141A) : Colors.white;
}

Color _normalizeHSL(Color color, {double? saturation, double? lightness}) {
  final hsl = HSLColor.fromColor(color);
  return hsl.withSaturation((saturation ?? hsl.saturation).clamp(0.0, 1.0)).withLightness((lightness ?? hsl.lightness).clamp(0.0, 1.0)).toColor();
}

Color _normalizeAccent(Color color, bool isLightTheme) {
  final hsl = HSLColor.fromColor(color);
  final double s = (hsl.saturation * 1.25).clamp(0.28, 0.80);
  final double l = isLightTheme ? hsl.lightness.clamp(0.35, 0.52) : hsl.lightness.clamp(0.58, 0.75);
  return hsl.withSaturation(s).withLightness(l).toColor();
}

Color _makeSecondary(Color accent, Color bg) => _lerpColor(accent, bg, 0.45);

Color _lerpColor(Color a, Color b, double t) {
  final r = (a.r * 255) + ((b.r * 255) - (a.r * 255)) * t;
  final g = (a.g * 255) + ((b.g * 255) - (a.g * 255)) * t;
  final bl = (a.b * 255) + ((b.b * 255) - (a.b * 255)) * t;
  return Color.fromARGB(255, r.round().clamp(0, 255), g.round().clamp(0, 255), bl.round().clamp(0, 255));
}

class _BgPalette {
  final Color bg;
  final Color surface;
  final bool isLight;
  const _BgPalette({required this.bg, required this.surface, required this.isLight});
}

class WallpaperService {
  static const _wallpaperPathKey = 'wallpaper_path';
  static const _adaptiveThemeKey = 'adaptive_theme_from_wallpaper';
  static const _styleKey = 'wallpaper_style';
  static final _storage = const FlutterSecureStorage();

  static final WallpaperService _instance = WallpaperService._internal();
  factory WallpaperService() => _instance;
  WallpaperService._internal();

  String? _currentUserId;
  String? _wallpaperPath;
  bool _adaptiveTheme = false;
  WallpaperStyle _style = WallpaperStyle.unknown;
  WallpaperAnalysis? _lastAnalysis;

  String? get wallpaperPath => _wallpaperPath;
  bool get adaptiveTheme => _adaptiveTheme;
  WallpaperStyle get style => _style;
  WallpaperAnalysis? get lastAnalysis => _lastAnalysis;

  void setCurrentUser(String? userId) => _currentUserId = userId;
  String _getKey(String base) => _currentUserId == null ? base : '${base}_$_currentUserId';

  Future<void> load() async {
    final path = await _storage.read(key: _getKey(_wallpaperPathKey));
    if (path != null && File(path).existsSync()) _wallpaperPath = path;
    if (await _storage.read(key: _getKey(_adaptiveThemeKey)) == 'true') _adaptiveTheme = true;
    final styleStr = await _storage.read(key: _getKey(_styleKey));
    if (styleStr != null) {
      _style = WallpaperStyle.values.firstWhere((e) => e.name == styleStr, orElse: () => WallpaperStyle.unknown);
    }
  }

  Future<String?> pickAndSaveWallpaper() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 1024, maxHeight: 1024);
    if (picked == null) return null;
    final dir = await getApplicationDocumentsDirectory();
    final fileName = 'wallpaper_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final savedFile = File('${dir.path}/$fileName');
    await File(picked.path).copy(savedFile.path);
    _wallpaperPath = savedFile.path;
    await _storage.write(key: _getKey(_wallpaperPathKey), value: _wallpaperPath);
    return savedFile.path;
  }

  Future<void> removeWallpaper() async {
    if (_wallpaperPath != null) {
      final f = File(_wallpaperPath!);
      if (f.existsSync()) await f.delete();
    }
    _wallpaperPath = null;
    await _storage.delete(key: _getKey(_wallpaperPathKey));
  }

  Future<void> setAdaptiveTheme(bool value) async {
    _adaptiveTheme = value;
    await _storage.write(key: _getKey(_adaptiveThemeKey), value: value ? 'true' : 'false');
  }

  Future<void> setStyle(WallpaperStyle style) async {
    _style = style;
    await _storage.write(key: _getKey(_styleKey), value: style.name);
  }

  Future<List<_PixelInfo>> _extractPixels(String imagePath) async {
    final file = File(imagePath);
    if (!file.existsSync()) return [];
    final bytes = await file.readAsBytes();
    final codec = await ui.instantiateImageCodec(bytes, targetWidth: 40, targetHeight: 40);
    final frame = await codec.getNextFrame();
    final byteData = await frame.image.toByteData();
    codec.dispose();
    if (byteData == null) return [];
    final raw = byteData.buffer.asUint8List();
    final pixels = <_PixelInfo>[];
    for (int i = 0; i < raw.length; i += 4) {
      final r = raw[i], g = raw[i + 1], b = raw[i + 2], a = raw[i + 3];
      if (a < 128) continue;
      final hsl = HSLColor.fromColor(Color.fromARGB(255, r, g, b));
      pixels.add(_PixelInfo(r: r, g: g, b: b, saturation: hsl.saturation, brightness: _yiq(r, g, b), hue: hsl.hue));
    }
    return pixels;
  }

  WallpaperStyle _classifyStyle(List<_PixelInfo> pixels) {
    if (pixels.isEmpty) return WallpaperStyle.atmospheric;
    double avgSat = 0, minBright = 255, maxBright = 0;
    double rSum = 0, gSum = 0, bSum = 0;
    for (final p in pixels) {
      avgSat += p.saturation;
      minBright = min(minBright, p.brightness);
      maxBright = max(maxBright, p.brightness);
      rSum += p.r; gSum += p.g; bSum += p.b;
    }
    final count = pixels.length;
    avgSat /= count;
    final contrast = maxBright - minBright;
    final rAvg = rSum / count, gAvg = gSum / count, bAvg = bSum / count;
    double variance = 0;
    for (final p in pixels) {
      variance += pow(p.r - rAvg, 2) + pow(p.g - gAvg, 2) + pow(p.b - bAvg, 2);
    }
    variance /= (count * 3);
    if (avgSat < 0.08 && variance < 400) return WallpaperStyle.mono;
    if (contrast > 150 && variance > 1400) return WallpaperStyle.contrast;
    if (avgSat > 0.4) return WallpaperStyle.vibrant;
    return WallpaperStyle.atmospheric;
  }

  Color _getDominantAccent(List<_PixelInfo> pixels) {
    if (pixels.isEmpty) return const Color(0xFF2196F3);
    const int bucketCount = 16;
    final buckets = List.generate(bucketCount, (_) => <_PixelInfo>[]);
    for (final p in pixels) {
      if (p.saturation < 0.05) continue;
      int idx = (p.hue / (360 / bucketCount)).floor().clamp(0, bucketCount - 1);
      buckets[idx].add(p);
    }
    List<_PixelInfo> dominant = [];
    int maxCount = 0;
    for (final bucket in buckets) {
      if (bucket.length > maxCount) { maxCount = bucket.length; dominant = bucket; }
    }
    if (dominant.isEmpty) {
      final f = pixels.reduce((a, b) => a.saturation > b.saturation ? a : b);
      return Color.fromARGB(255, f.r, f.g, f.b);
    }
    final best = dominant.reduce((a, b) => a.saturation > b.saturation ? a : b);
    return Color.fromARGB(255, best.r, best.g, best.b);
  }

  Color _avgColor(List<_PixelInfo> pixels) {
    double r = 0, g = 0, b = 0;
    for (final p in pixels) { r += p.r; g += p.g; b += p.b; }
    return Color.fromARGB(255, (r / pixels.length).round(), (g / pixels.length).round(), (b / pixels.length).round());
  }

  bool _isLight(List<_PixelInfo> pixels) {
    if (pixels.isEmpty) return false;
    double total = 0;
    for (final p in pixels) total += p.brightness;
    return (total / pixels.length) >= 130;
  }

  _BgPalette _makePalette(List<_PixelInfo> pixels) {
    final light = _isLight(pixels);
    final avg = _avgColor(pixels);
    if (light) {
      return _BgPalette(bg: _normalizeHSL(avg, saturation: 0.08, lightness: 0.96), surface: _normalizeHSL(avg, saturation: 0.05, lightness: 0.90), isLight: true);
    } else {
      return _BgPalette(bg: _normalizeHSL(avg, saturation: 0.10, lightness: 0.06), surface: _normalizeHSL(avg, saturation: 0.06, lightness: 0.12), isLight: false);
    }
  }

  WallpaperAnalysis _analyzeAtmospheric(List<_PixelInfo> pixels) {
    if (pixels.isEmpty) return _fallback();
    final palette = _makePalette(pixels);
    final accent = _normalizeAccent(_getDominantAccent(pixels), palette.isLight);
    final secondary = _makeSecondary(accent, palette.bg);
    final textMain = palette.isLight ? const Color(0xFF111622) : const Color(0xFFF5F7FA);
    final textSec = palette.isLight ? const Color(0xFF64748B) : const Color(0xFF8A94A6);
    return WallpaperAnalysis(
      accentColor: accent, secondaryColor: secondary, backgroundColor: palette.bg,
      textOnAccent: _contrastText(accent), textMain: textMain, textSecondary: textSec,
      surfaceColor: palette.surface, glowColor: _lerpColor(accent, palette.bg, 0.65),
      useLightText: !palette.isLight, detectedStyle: WallpaperStyle.atmospheric, confidence: 0.8,
    );
  }

  WallpaperAnalysis _analyzeContrast(List<_PixelInfo> pixels) {
    if (pixels.isEmpty) return _fallback();
    final light = _isLight(pixels);
    final accent = _normalizeAccent(_getDominantAccent(pixels), light);
    final bg = light ? const Color(0xFFF8FAFC) : const Color(0xFF090D16);
    final surface = light ? const Color(0xFFE2E8F0) : const Color(0xFF1E293B);
    final secondary = _makeSecondary(accent, bg);
    return WallpaperAnalysis(
      accentColor: accent, secondaryColor: secondary, backgroundColor: bg,
      textOnAccent: _contrastText(accent),
      textMain: light ? const Color(0xFF0F172A) : Colors.white,
      textSecondary: light ? const Color(0xFF475569) : const Color(0xFF94A3B8),
      surfaceColor: surface, glowColor: _lerpColor(accent, bg, 0.5),
      useLightText: !light, detectedStyle: WallpaperStyle.contrast, confidence: 0.85,
    );
  }

  WallpaperAnalysis _analyzeMono(List<_PixelInfo> pixels) {
    final light = _isLight(pixels);
    if (light) {
      return const WallpaperAnalysis(
        accentColor: Color(0xFF1E293B), secondaryColor: Color(0xFF94A3B8),
        backgroundColor: Color(0xFFF8F9FA), surfaceColor: Color(0xFFFFFFFF),
        textOnAccent: Colors.white, textMain: Color(0xFF0F172A), textSecondary: Color(0xFF64748B),
        glowColor: Color(0xFF64748B), useLightText: false, detectedStyle: WallpaperStyle.mono, confidence: 0.95,
      );
    } else {
      return const WallpaperAnalysis(
        accentColor: Color(0xFFE2E8F0), secondaryColor: Color(0xFF475569),
        backgroundColor: Color(0xFF0F141C), surfaceColor: Color(0xFF1E2633),
        textOnAccent: Color(0xFF0F172A), textMain: Color(0xFFF8FAFC), textSecondary: Color(0xFF94A3B8),
        glowColor: Color(0xFF475569), useLightText: true, detectedStyle: WallpaperStyle.mono, confidence: 0.95,
      );
    }
  }

  WallpaperAnalysis _analyzeVibrant(List<_PixelInfo> pixels) {
    if (pixels.isEmpty) return _fallback();
    final palette = _makePalette(pixels);
    final rawAccent = _getDominantAccent(pixels);
    final hsl = HSLColor.fromColor(rawAccent);
    final accent = hsl.withSaturation((hsl.saturation * 1.4).clamp(0.45, 0.95)).withLightness(palette.isLight ? 0.45 : 0.60).toColor();
    final secondary = _makeSecondary(accent, palette.bg);
    final textMain = palette.isLight ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC);
    final textSec = palette.isLight ? const Color(0xFF475569) : const Color(0xFF94A3B8);
    return WallpaperAnalysis(
      accentColor: accent, secondaryColor: secondary, backgroundColor: palette.bg,
      textOnAccent: _contrastText(accent), textMain: textMain, textSecondary: textSec,
      surfaceColor: palette.surface, glowColor: _lerpColor(accent, palette.bg, 0.55),
      useLightText: !palette.isLight, detectedStyle: WallpaperStyle.vibrant, confidence: 0.9,
    );
  }

  WallpaperAnalysis _fallback() {
    return const WallpaperAnalysis(
      accentColor: Color(0xFF2196F3), secondaryColor: Color(0xFF1565C0),
      backgroundColor: Color(0xFF0F141C), textOnAccent: Colors.white,
      textMain: Color(0xFFF8FAFC), textSecondary: Color(0xFF94A3B8),
      surfaceColor: Color(0xFF1E2633), glowColor: Color(0xFF1565C0),
      useLightText: true, detectedStyle: WallpaperStyle.atmospheric, confidence: 0.3,
    );
  }

  static String _colorToHex(Color c) => '#${c.value.toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';

  static void _logAnalysis(WallpaperAnalysis result) {
    final style = result.detectedStyle.name.toUpperCase();
    debugPrint('╔══ Wallpaper Analysis [$style] ════════════════════');
    debugPrint('║ accentColor:    ${_colorToHex(result.accentColor)}');
    debugPrint('║ secondaryColor: ${_colorToHex(result.secondaryColor)}');
    debugPrint('║ backgroundColor:${_colorToHex(result.backgroundColor)}');
    debugPrint('║ surfaceColor:   ${_colorToHex(result.surfaceColor)}');
    debugPrint('║ textOnAccent:   ${_colorToHex(result.textOnAccent)}');
    debugPrint('║ textMain:       ${_colorToHex(result.textMain)}');
    debugPrint('║ textSecondary:  ${_colorToHex(result.textSecondary)}');
    debugPrint('║ glowColor:      ${_colorToHex(result.glowColor)}');
    debugPrint('║ useLightText:   ${result.useLightText}');
    debugPrint('╚═════════════════════════════════════════════════');
  }

  Future<WallpaperAnalysis> analyze(String imagePath, {WallpaperStyle? forceStyle}) async {
    final pixels = await _extractPixels(imagePath);
    if (forceStyle != null && forceStyle != WallpaperStyle.unknown) return _analyzeByStyle(pixels, forceStyle);
    return analyzeAuto(imagePath);
  }

  Future<WallpaperAnalysis> analyzeAuto(String imagePath) async {
    final pixels = await _extractPixels(imagePath);
    final style = _classifyStyle(pixels);
    return _analyzeByStyle(pixels, style);
  }

  WallpaperAnalysis _analyzeByStyle(List<_PixelInfo> pixels, WallpaperStyle style) {
    WallpaperAnalysis result;
    switch (style) {
      case WallpaperStyle.atmospheric: result = _analyzeAtmospheric(pixels); break;
      case WallpaperStyle.contrast: result = _analyzeContrast(pixels); break;
      case WallpaperStyle.mono: result = _analyzeMono(pixels); break;
      case WallpaperStyle.vibrant: result = _analyzeVibrant(pixels); break;
      case WallpaperStyle.unknown: result = _analyzeAtmospheric(pixels); break;
    }
    _lastAnalysis = result;
    _logAnalysis(result);
    return result;
  }
}