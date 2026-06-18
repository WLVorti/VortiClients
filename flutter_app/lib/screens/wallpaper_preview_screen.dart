import 'dart:io';
import 'package:flutter/material.dart';
import 'package:vorti_messenger/l10n/app_localizations.dart';
import 'package:vorti_messenger/services/theme_provider.dart';
import 'package:vorti_messenger/services/wallpaper_service.dart' as wallpaper;

class WallpaperPreviewScreen extends StatefulWidget {
  final ThemeProvider themeProvider;

  const WallpaperPreviewScreen({required this.themeProvider, super.key});

  @override
  State<WallpaperPreviewScreen> createState() => _WallpaperPreviewScreenState();
}

class _WallpaperPreviewScreenState extends State<WallpaperPreviewScreen> {
  final _wallpaperService = wallpaper.WallpaperService();
  String? _wallpaperPath;
  bool _adaptiveEnabled = false;
  wallpaper.WallpaperStyle _style = wallpaper.WallpaperStyle.unknown;
  String? _detectedStyleName;

  String _styleLabel(wallpaper.WallpaperStyle s) {
    final l = AppLocalizations.of(context);
    switch (s) {
      case wallpaper.WallpaperStyle.atmospheric: return l.styleAtmosphere;
      case wallpaper.WallpaperStyle.contrast: return l.styleContrast;
      case wallpaper.WallpaperStyle.mono: return l.styleMono;
      case wallpaper.WallpaperStyle.vibrant: return l.styleVibrant;
      case wallpaper.WallpaperStyle.unknown: return l.styleAuto;
    }
  }

  static const _styleIcons = {
    wallpaper.WallpaperStyle.atmospheric: Icons.landscape,
    wallpaper.WallpaperStyle.contrast: Icons.contrast,
    wallpaper.WallpaperStyle.mono: Icons.filter_b_and_w,
    wallpaper.WallpaperStyle.vibrant: Icons.palette,
    wallpaper.WallpaperStyle.unknown: Icons.auto_awesome,
  };

  @override
  void initState() {
    super.initState();
    _wallpaperPath = _wallpaperService.wallpaperPath;
    _adaptiveEnabled = _wallpaperService.adaptiveTheme;
    _style = _wallpaperService.style;
  }

  Future<void> _pickWallpaper() async {
    final path = await _wallpaperService.pickAndSaveWallpaper();
    if (path != null) {
      setState(() => _wallpaperPath = path);
      if (_adaptiveEnabled) await _applyAdaptiveColors();
    }
  }

  Future<void> _removeWallpaper() async {
    await _wallpaperService.removeWallpaper();
    setState(() => _wallpaperPath = null);
  }

  Future<void> _toggleAdaptive(bool value) async {
    await _wallpaperService.setAdaptiveTheme(value);
    setState(() => _adaptiveEnabled = value);
    if (value && _wallpaperPath != null) await _applyAdaptiveColors();
  }

  Future<void> _setStyle(wallpaper.WallpaperStyle style) async {
    await _wallpaperService.setStyle(style);
    setState(() => _style = style);
    if (_adaptiveEnabled && _wallpaperPath != null) await _applyAdaptiveColors();
  }

  Future<void> _applyAdaptiveColors() async {
    if (_wallpaperPath == null) return;

    final analysis = await _wallpaperService.analyze(
      _wallpaperPath!,
      forceStyle: _style,
    );
    if (!mounted) return;

    _detectedStyleName = _styleLabel(_style);

    // Передаем чистые flat-цветá напрямую из алгоритма
    await widget.themeProvider.setCustomTheme(
      analysis.accentColor,
      analysis.secondaryColor,
      analysis.backgroundColor,
      analysis.surfaceColor,
      analysis.textMain,
      analysis.textSecondary,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.themeProvider.colors;

    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        backgroundColor: colors.background,
        foregroundColor: colors.text,
        elevation: 0,
        title: Text(AppLocalizations.of(context).wallpaperTheme, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.check),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // Зона интерактивного превью
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(child: _buildWallpaperBackground(colors)),
                Positioned.fill(child: _buildChatMessages(colors)),
              ],
            ),
          ),
          // Монолитная flat-панель управления (ограниченная по высоте)
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.45,
            ),
            child: _buildSettingsPanel(colors),
          ),
        ],
      ),
    );
  }

  Widget _buildWallpaperBackground(ThemeColors colors) {
    if (_wallpaperPath != null && File(_wallpaperPath!).existsSync()) {
      return Image.file(File(_wallpaperPath!), fit: BoxFit.cover);
    }
    return Container(color: colors.background);
  }

  Widget _buildChatMessages(ThemeColors colors) {
    final myBubble = widget.themeProvider.primaryColor;
    final theirBubble = colors.surface;
    final l = AppLocalizations.of(context);

    final sampleMessages = [
      _PreviewMessage(text: l.previewMsg1, isMe: true, time: '10:30'),
      _PreviewMessage(text: l.previewMsg2, isMe: false, time: '10:31'),
      _PreviewMessage(text: l.previewMsg3, isMe: true, time: '10:32'),
    ];

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      itemCount: sampleMessages.length,
      itemBuilder: (_, i) => _buildPreviewBubble(sampleMessages[i], myBubble, theirBubble, colors),
    );
  }

  Color _getContrastTextForBubble(Color bg, ThemeColors colors) {
    final r = (bg.r * 255).round();
    final g = (bg.g * 255).round();
    final b = (bg.b * 255).round();
    final yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 135 ? const Color(0xFF11141A) : Colors.white;
  }

  Widget _buildPreviewBubble(_PreviewMessage msg, Color myBubble, Color theirBubble, ThemeColors colors) {
    final bubbleBg = msg.isMe ? myBubble : theirBubble;
    final txtColor = _getContrastTextForBubble(bubbleBg, colors);
    final subTxtColor = _brightness(txtColor) >= 128 ? txtColor.withAlpha(140) : txtColor.withAlpha(160);

    return Padding(
      padding: EdgeInsets.only(
        left: msg.isMe ? 64 : 0,
        right: msg.isMe ? 0 : 64,
        top: 4,
        bottom: 4,
      ),
      child: Align(
        alignment: msg.isMe ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
          decoration: BoxDecoration(
            color: bubbleBg,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(msg.isMe ? 16 : 4),
              bottomRight: Radius.circular(msg.isMe ? 4 : 16),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(msg.text, style: TextStyle(color: txtColor, fontSize: 14, fontWeight: FontWeight.w400)),
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.bottomRight,
                child: Text(
                  msg.time,
                  style: TextStyle(fontSize: 10, color: subTxtColor),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSettingsPanel(ThemeColors colors) {
    final primary = widget.themeProvider.primaryColor;
    final l = AppLocalizations.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.background, width: 2)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(context).padding.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ─── Wallpaper Card ──────────────────────────────────
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: colors.background,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  ListTile(
                    title: Text(l.wallpaper, style: const TextStyle(fontWeight: FontWeight.w600)),
                    trailing: _wallpaperPath != null
                        ? TextButton.icon(
                            onPressed: _removeWallpaper,
                            icon: const Icon(Icons.delete_outline, size: 16, color: Colors.red),
                            label: Text(l.remove, style: const TextStyle(color: Colors.red, fontSize: 13)),
                          )
                        : null,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _pickWallpaper,
                        icon: const Icon(Icons.photo_library_outlined, size: 18),
                        label: Text(_wallpaperPath != null ? l.changeBackgroundImage : l.chooseBackgroundImage),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: primary,
                          side: BorderSide(color: primary),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            // ─── Adaptive Scheme Card ────────────────────────────
            if (_wallpaperPath != null)
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: colors.background,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    ListTile(
                      title: Text(l.adaptiveSchemeColors),
                      trailing: Switch.adaptive(
                        value: _adaptiveEnabled,
                        onChanged: _toggleAdaptive,
                        activeColor: primary,
                      ),
                    ),
                    if (_adaptiveEnabled) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(l.paletteStyle, style: TextStyle(color: colors.textSecondary, fontSize: 13, fontWeight: FontWeight.w500)),
                                if (_detectedStyleName != null)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(color: colors.background, borderRadius: BorderRadius.circular(6)),
                                    child: Text(l.autoStyle(_detectedStyleName!), style: TextStyle(color: primary, fontSize: 11, fontWeight: FontWeight.w600)),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              height: 38,
                              child: ListView(
                                scrollDirection: Axis.horizontal,
                                children: wallpaper.WallpaperStyle.values.where((s) => s != wallpaper.WallpaperStyle.unknown).map((style) {
                                  final label = _styleLabel(style);
                                  final icon = _styleIcons[style]!;
                                  final isSelected = style == _style;

                                  return Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: InkWell(
                                      onTap: () => _setStyle(style),
                                      borderRadius: BorderRadius.circular(8),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 12),
                                        decoration: BoxDecoration(
                                          color: isSelected ? primary : colors.surface,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Row(
                                          children: [
                                            Icon(icon, size: 16, color: isSelected ? colors.surface : colors.textSecondary),
                                            const SizedBox(width: 6),
                                            Text(
                                              label,
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                                                color: isSelected ? colors.surface : colors.text,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: 16),
            // ─── Custom Colors Card ──────────────────────────────
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: colors.background,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  ListTile(
                    title: Text(l.customColors, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Column(
                      children: [
                        _buildColorRow('Accent', widget.themeProvider.primaryColor, (c) {
                          widget.themeProvider.setCustomColor('primary', c);
                        }, colors),
                        const SizedBox(height: 8),
                        _buildColorRow('Background', widget.themeProvider.backgroundColor, (c) {
                          widget.themeProvider.setCustomColor('background', c);
                        }, colors),
                        const SizedBox(height: 8),
                        _buildColorRow('Surface', widget.themeProvider.surfaceColor, (c) {
                          widget.themeProvider.setCustomColor('surface', c);
                        }, colors),
                        const SizedBox(height: 8),
                        _buildColorRow('Text', widget.themeProvider.textColor, (c) {
                          widget.themeProvider.setCustomColor('text', c);
                        }, colors),
                        const SizedBox(height: 8),
                        _buildColorRow('Text Secondary', widget.themeProvider.textSecondaryColor, (c) {
                          widget.themeProvider.setCustomColor('textsecondary', c);
                        }, colors),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildColorRow(String label, Color currentColor, Function(Color) onPicked, ThemeColors colors) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => _showColorPicker(currentColor, onPicked),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: currentColor,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: colors.background, width: 2),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.text)),
          ),
          IconButton(
            onPressed: () => _showColorPicker(currentColor, onPicked),
            icon: Icon(Icons.edit_outlined, size: 18, color: colors.textSecondary),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  void _showColorPicker(Color current, Function(Color) onPicked) {
    final hsl = HSLColor.fromColor(current);
    double hue = hsl.hue;
    double saturation = hsl.saturation;
    double lightness = hsl.lightness;
    final l = AppLocalizations.of(context);

    showModalBottomSheet(
      context: context,
      backgroundColor: widget.themeProvider.colors.surface,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          final c = HSLColor.fromAHSL(1, hue, saturation, lightness).toColor();
          return Padding(
            padding: EdgeInsets.only(
              left: 20, right: 20, top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(l.pickColor, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(8)),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(l.hue, style: TextStyle(fontSize: 12, color: widget.themeProvider.colors.textSecondary)),
                Slider(
                  value: hue, min: 0, max: 360,
                  activeColor: widget.themeProvider.primaryColor,
                  onChanged: (v) => setModalState(() => hue = v),
                ),
                Text(l.saturation, style: TextStyle(fontSize: 12, color: widget.themeProvider.colors.textSecondary)),
                Slider(
                  value: saturation, min: 0, max: 1,
                  activeColor: widget.themeProvider.primaryColor,
                  onChanged: (v) => setModalState(() => saturation = v),
                ),
                Text(l.lightness, style: TextStyle(fontSize: 12, color: widget.themeProvider.colors.textSecondary)),
                Slider(
                  value: lightness, min: 0, max: 1,
                  activeColor: widget.themeProvider.primaryColor,
                  onChanged: (v) => setModalState(() => lightness = v),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      onPicked(c);
                      Navigator.pop(ctx);
                    },
                    child: Text(l.apply),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  static double _brightness(Color c) => (c.r * 299 + c.g * 587 + c.b * 114);
}

class _PreviewMessage {
  final String text;
  final bool isMe;
  final String time;

  const _PreviewMessage({
    required this.text,
    required this.isMe,
    required this.time,
  });
}