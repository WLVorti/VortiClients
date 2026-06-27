import 'package:flutter/material.dart';
import 'package:vorti_messenger/l10n/app_localizations.dart';
import 'package:vorti_messenger/services/theme_provider.dart';
import 'package:vorti_messenger/screens/wallpaper_preview_screen.dart';

class ThemeSettingsScreen extends StatefulWidget {
  final ThemeProvider themeProvider;

  const ThemeSettingsScreen({required this.themeProvider, super.key});

  @override
  State<ThemeSettingsScreen> createState() => _ThemeSettingsScreenState();
}

class _ThemeSettingsScreenState extends State<ThemeSettingsScreen> {
  @override
  Widget build(BuildContext context) {
    final currentId = widget.themeProvider.getCurrentThemeId();
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).theme)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            AppLocalizations.of(context).presets,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 60,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: AppTheme.presets.length,
              itemBuilder: (context, index) {
                final preset = AppTheme.presets[index];
                final isSelected = preset.id == currentId;
                return Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: GestureDetector(
                    onTap: () => widget.themeProvider.applyPreset(preset.id),
                    child: Container(
                      width: 60,
                      decoration: BoxDecoration(
                        color: preset.primaryColor,
                        shape: BoxShape.circle,
                        border: isSelected
                            ? Border.all(
                                color: Theme.of(context).colorScheme.onSurface,
                                width: 3,
                              )
                            : null,
                      ),
                      child: isSelected
                          ? const Icon(
                              Icons.check,
                              color: Colors.white,
                              size: 20,
                            )
                          : null,
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _buildCircleButton(Icons.add, () => _createCustomTheme(context)),
              const SizedBox(width: 8),
              _buildCircleButton(
                Icons.code,
                () => _importThemeFromText(context),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            AppLocalizations.of(context).customColors,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 12),
          _buildColorRow(context, 'Primary', widget.themeProvider.primaryColor),
          _buildColorRow(
            context,
            'Secondary',
            widget.themeProvider.secondaryColor,
          ),
          _buildColorRow(
            context,
            'Background',
            widget.themeProvider.backgroundColor,
          ),
          _buildColorRow(context, 'Surface', widget.themeProvider.surfaceColor),
          _buildColorRow(context, 'Text', widget.themeProvider.textColor),
          _buildColorRow(
            context,
            'Text Secondary',
            widget.themeProvider.textSecondaryColor,
          ),
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 8),
          Text(
            AppLocalizations.of(context).wallpaperAdaptive,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 4),
          Text(
            AppLocalizations.of(context).setWallpaperExtract,
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => WallpaperPreviewScreen(
                      themeProvider: widget.themeProvider,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.wallpaper, size: 20),
              label: Text(AppLocalizations.of(context).openWallpaperSettings),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCircleButton(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.grey.shade400, width: 2),
        ),
        child: Icon(icon, color: Colors.grey.shade600, size: 20),
      ),
    );
  }

  Widget _buildColorRow(BuildContext context, String label, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey.shade400),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () {
              final key = label == 'Text Secondary'
                  ? 'textSecondary'
                  : label.toLowerCase().replaceAll(' ', '');
              _showColorPicker(context, key, color);
            },
          ),
        ],
      ),
    );
  }

  void _showColorPicker(BuildContext ctx, String key, Color currentColor) {
    final theme = Theme.of(ctx);
    showModalBottomSheet(
      context: ctx,
      backgroundColor: theme.colorScheme.surface,
      isScrollControlled: true,
      builder: (c) => _ColorPickerSheet(
        currentColor: currentColor,
        onColorSelected: (color) {
          widget.themeProvider.setCustomColor(key, color);
        },
      ),
    );
  }

  void _createCustomTheme(BuildContext ctx) {
    final theme = Theme.of(ctx);
    showModalBottomSheet(
      context: ctx,
      backgroundColor: theme.colorScheme.surface,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: _CustomThemeSheet(themeProvider: widget.themeProvider),
      ),
    );
  }

  void _importThemeFromText(BuildContext ctx) {
    final theme = Theme.of(ctx);
    showModalBottomSheet(
      context: ctx,
      backgroundColor: theme.colorScheme.surface,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: _ImportThemeSheet(themeProvider: widget.themeProvider),
      ),
    );
  }
}

class _ColorPickerSheet extends StatefulWidget {
  final Color currentColor;
  final Function(Color) onColorSelected;
  const _ColorPickerSheet({
    required this.currentColor,
    required this.onColorSelected,
  });
  @override
  State<_ColorPickerSheet> createState() => _ColorPickerSheetState();
}

class _ColorPickerSheetState extends State<_ColorPickerSheet> {
  final _hexController = TextEditingController();
  String? _errorText;
  double _currentHue = 0;
  double _currentSaturation = 1;
  double _currentBrightness = 0.5;

  @override
  void initState() {
    super.initState();
    final hsl = HSLColor.fromColor(widget.currentColor);
    _currentHue = hsl.hue;
    _currentSaturation = hsl.saturation;
    _currentBrightness = hsl.lightness;
  }

  void _applyHexColor() {
    final l = AppLocalizations.of(context);
    var hex = _hexController.text.trim().toUpperCase().replaceAll('#', '');
    if (hex.length != 6) {
      setState(() => _errorText = l.enter6Chars);
      return;
    }
    try {
      widget.onColorSelected(Color(int.parse('0xFF$hex')));
      Navigator.pop(context);
    } catch (e) {
      setState(() => _errorText = l.invalidHex);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l = AppLocalizations.of(context);
    final c = HSLColor.fromAHSL(
      1,
      _currentHue,
      _currentSaturation,
      _currentBrightness,
    );
    final selectedColor = c.toColor();
    final borderColor = theme.colorScheme.outline;
    return Container(
      color: theme.colorScheme.surface,
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l.selectColor,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _hexController,
                    decoration: InputDecoration(
                      hintText: 'FF0000',
                      labelText: l.hex,
                      errorText: _errorText,
                      isDense: true,
                      prefixText: '#',
                    ),
                    onChanged: (_) => setState(() => _errorText = null),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(onPressed: _applyHexColor, child: Text(l.apply)),
              ],
            ),
            const SizedBox(height: 20),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: selectedColor,
                shape: BoxShape.circle,
                border: Border.all(color: borderColor, width: 2),
              ),
            ),
            const SizedBox(height: 16),
            Text(l.hue, style: theme.textTheme.bodySmall),
            Slider(
              value: _currentHue,
              min: 0,
              max: 360,
              activeColor: theme.colorScheme.primary,
              onChanged: (v) => setState(() => _currentHue = v),
              onChangeEnd: (_) => widget.onColorSelected(selectedColor),
            ),
            Text(l.saturation, style: theme.textTheme.bodySmall),
            Slider(
              value: _currentSaturation,
              min: 0,
              max: 1,
              activeColor: theme.colorScheme.primary,
              onChanged: (v) => setState(() => _currentSaturation = v),
              onChangeEnd: (_) => widget.onColorSelected(selectedColor),
            ),
            Text(l.brightnessLabel, style: theme.textTheme.bodySmall),
            Slider(
              value: _currentBrightness,
              min: 0,
              max: 1,
              activeColor: theme.colorScheme.primary,
              onChanged: (v) => setState(() => _currentBrightness = v),
              onChangeEnd: (_) => widget.onColorSelected(selectedColor),
            ),
          ],
        ),
      ),
    );
  }

  void _updateColor(Offset p, Size s) {
    final x = (p.dx / s.width).clamp(0.0, 1.0);
    final y = (p.dy / s.height).clamp(0.0, 1.0);
    setState(() {
      _currentSaturation = x;
      _currentBrightness = 1 - y;
    });
    widget.onColorSelected(
      HSLColor.fromAHSL(
        1,
        _currentHue,
        _currentSaturation,
        _currentBrightness,
      ).toColor(),
    );
  }

  @override
  void dispose() {
    _hexController.dispose();
    super.dispose();
  }
}

class _CustomThemeSheet extends StatefulWidget {
  final ThemeProvider themeProvider;
  const _CustomThemeSheet({required this.themeProvider});
  @override
  State<_CustomThemeSheet> createState() => _CustomThemeSheetState();
}

class _CustomThemeSheetState extends State<_CustomThemeSheet> {
  Color _primary = const Color(0xFF2196F3);
  Color _secondary = const Color(0xFF03A9F4);
  Color _background = Colors.white;
  Color _surface = const Color(0xFFF5F5F5);
  Color _text = const Color(0xFF212121);
  Color _textSecondary = const Color(0xFF757575);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.surface,
      padding: const EdgeInsets.all(16),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text(
            AppLocalizations.of(context).createCustomTheme,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          _buildPicker(
            context,
            'Primary',
            _primary,
            (c) => setState(() => _primary = c),
          ),
          _buildPicker(
            context,
            'Secondary',
            _secondary,
            (c) => setState(() => _secondary = c),
          ),
          _buildPicker(
            context,
            'Background',
            _background,
            (c) => setState(() => _background = c),
          ),
          _buildPicker(
            context,
            'Surface',
            _surface,
            (c) => setState(() => _surface = c),
          ),
          _buildPicker(
            context,
            'Text',
            _text,
            (c) => setState(() => _text = c),
          ),
          _buildPicker(
            context,
            'Text Secondary',
            _textSecondary,
            (c) => setState(() => _textSecondary = c),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () async {
                await widget.themeProvider.setCustomTheme(
                  _primary,
                  _secondary,
                  _background,
                  _surface,
                  _text,
                  _textSecondary,
                );
                Navigator.pop(context);
              },
              child: Text(AppLocalizations.of(context).createCustomTheme),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPicker(
    BuildContext context,
    String label,
    Color c,
    Function(Color) f,
  ) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
          GestureDetector(
            onTap: () => _showColorPicker(c, f),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: c,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: theme.colorScheme.outline),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showColorPicker(Color current, Function(Color) onChanged) {
    final theme = Theme.of(context);
    showModalBottomSheet(
      context: context,
      backgroundColor: theme.colorScheme.surface,
      isScrollControlled: true,
      builder: (c) =>
          _ColorPickerSheet(currentColor: current, onColorSelected: onChanged),
    );
  }
}

class _ImportThemeSheet extends StatefulWidget {
  final ThemeProvider themeProvider;
  const _ImportThemeSheet({required this.themeProvider});
  @override
  State<_ImportThemeSheet> createState() => _ImportThemeSheetState();
}

class _ImportThemeSheetState extends State<_ImportThemeSheet> {
  final _controller = TextEditingController();
  String? _errorText;

  @override
  void initState() {
    super.initState();
    final c = widget.themeProvider.colors;
    _controller.text =
        'primary - ${_hex(c.primary)}\nsecondary - ${_hex(c.secondary)}\nbackground - ${_hex(c.background)}\nsurface - ${_hex(c.surface)}\ntext - ${_hex(c.text)}\ntextSecondary - ${_hex(c.textSecondary)}';
  }

  String _hex(Color c) =>
      '#${c.value.toRadixString(16).substring(2).toUpperCase()}';
  Color _parseColor(String hex) {
    hex = hex.replaceAll('#', '').replaceAll(' ', '');
    if (hex.length == 6) return Color(int.parse('0xFF$hex'));
    return Colors.black;
  }

  void _apply() async {
    for (final line in _controller.text.split('\n')) {
      final p = line.split('-');
      if (p.length != 2) continue;
      final k = p[0].trim().toLowerCase();
      final v = _parseColor(p[1].trim());
      switch (k) {
        case 'primary':
          await widget.themeProvider.setCustomColor('primary', v);
          break;
        case 'secondary':
          await widget.themeProvider.setCustomColor('secondary', v);
          break;
        case 'background':
          await widget.themeProvider.setCustomColor('background', v);
          break;
        case 'surface':
          await widget.themeProvider.setCustomColor('surface', v);
          break;
        case 'text':
          await widget.themeProvider.setCustomColor('text', v);
          break;
        case 'textsecondary':
          await widget.themeProvider.setCustomColor('textSecondary', v);
          break;
      }
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            AppLocalizations.of(context).importTheme,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            maxLines: 8,
            decoration: InputDecoration(errorText: _errorText),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _apply,
            child: Text(AppLocalizations.of(context).apply),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
