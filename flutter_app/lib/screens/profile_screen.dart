import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import '../services/api_service.dart';
import '../services/theme_provider.dart';
import '../models/models.dart';
import '../models/account.dart';
import 'home_screen.dart';
import 'auth_screen.dart';
import 'theme_settings_screen.dart';

class ProfileScreen extends StatefulWidget {
  final ApiService api;

  const ProfileScreen({super.key, required this.api});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Profile? _profile;
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isUploadingAvatar = false;
  List<Account> _accounts = [];
  Account? _currentAccount;

  final _displayNameController = TextEditingController();
  final _bioController = TextEditingController();
  final _themeProvider = ThemeProvider();

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadAccounts();
  }

  Future<void> _loadAccounts() async {
    final accounts = await widget.api.getAccounts();
    final current = await widget.api.getCurrentAccount();
    if (mounted) {
      setState(() {
        _accounts = accounts;
        _currentAccount = current;
      });
    }
  }

  void _showAccountsBottomSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      isScrollControlled: true,
      builder: (context) => _AccountsBottomSheet(
        api: widget.api,
        accounts: _accounts,
        currentAccount: _currentAccount,
        themeProvider: _themeProvider,
        onAccountSwitched: () async {
          Navigator.pop(context);
          await _loadAccounts();
          await _loadProfile();
          if (mounted) {
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => HomeScreen(api: widget.api)),
              (route) => false,
            );
          }
        },
        onAccountsUpdated: () async {
          await _loadAccounts();
          final current = await widget.api.getCurrentAccount();
          if (mounted) {
            setState(() {
              _currentAccount = current;
            });
          }
          await _loadProfile();
        },
      ),
    );
  }

  String _getInitial() {
    if (_profile == null) return 'U';
    final profile = _profile!;
    String name;
    if (profile.displayName?.isNotEmpty == true) {
      name = profile.displayName!;
    } else if (profile.username?.isNotEmpty == true) {
      name = profile.username!;
    } else {
      return 'U';
    }
    name = name.trim();
    if (name.isEmpty) return 'U';
    final chars = name.characters;
    return chars.isEmpty ? 'U' : chars.first.toUpperCase();
  }

  String _getAccountInitial(Account account) {
    String name;
    if (account.displayName?.isNotEmpty == true) {
      name = account.displayName!;
    } else if (account.username?.isNotEmpty == true && account.username != account.id) {
      name = account.username!;
    } else {
      // Use first 2 chars of ID as fallback
      final idStr = account.id;
      return idStr.length >= 2 ? idStr.substring(0, 2).toUpperCase() : 'U';
    }
    name = name.trim();
    if (name.isEmpty) return 'U';
    final chars = name.characters;
    return chars.isEmpty ? 'U' : chars.first.toUpperCase();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _isLoading = true;
    });
    try {
      final profile = await widget.api.getProfile();
      if (mounted) {
        setState(() {
          _profile = profile;
          _isLoading = false;
          _displayNameController.text = profile?.displayName ?? '';
          _bioController.text = profile?.bio ?? '';
        });
      }
    } catch (e) {
      print('Load profile error: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _saveProfile() async {
    setState(() => _isSaving = true);
    final updatedProfile = await widget.api.updateProfile(
      displayName: _displayNameController.text,
      bio: _bioController.text,
    );
    if (mounted) {
      setState(() {
        _profile = updatedProfile;
        _isSaving = false;
      });
    }
  }

  Future<void> _pickImage() async {
    setState(() => _isUploadingAvatar = true);
    final result = await FilePicker.platform.pickFiles(type: FileType.image);
    if (result != null && result.files.single.path != null) {
      SystemChrome.setEnabledSystemUIMode(
        SystemUiMode.manual,
        overlays: SystemUiOverlay.values,
      );
      try {
        final croppedFile = await ImageCropper().cropImage(
          sourcePath: result.files.single.path!,
          uiSettings: [
            AndroidUiSettings(
              toolbarTitle: 'Crop avatar',
              toolbarColor: _themeProvider.primaryColor,
              toolbarWidgetColor: Colors.white,
              initAspectRatio: CropAspectRatioPreset.square,
              lockAspectRatio: false,
              statusBarColor: _themeProvider.primaryColor,
            ),
          ],
        );
        if (croppedFile != null) {
          final file = File(croppedFile.path);
          final avatarUrl = await widget.api.uploadAvatar(file);
          if (mounted) {
            setState(() {
              _profile = _profile?.copyWith(avatarUrl: avatarUrl);
              _isUploadingAvatar = false;
            });
          }
        } else {
          if (mounted) setState(() => _isUploadingAvatar = false);
        }
      } finally {
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      }
    } else {
      if (mounted) setState(() => _isUploadingAvatar = false);
    }
  }

  Future<void> _removeAvatar() async {
    final success = await widget.api.deleteAvatar();
    if (success && mounted) {
      setState(() {
        _profile = _profile?.copyWith(avatarUrl: null);
      });
    }
  }

  String _getAvatarUrl() {
    if (_profile?.avatarUrl == null) return '';
    if (_profile!.avatarUrl!.startsWith('http')) {
      return _profile!.avatarUrl!;
    }
    return 'http://77.34.76.27:3000${_profile!.avatarUrl}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: LayoutBuilder(
          builder: (context, constraints) => SizedBox(
            width: constraints.maxWidth,
            child: const Text('Account', overflow: TextOverflow.ellipsis),
          ),
        ),
        centerTitle: false,
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: _accounts.length > 1,
              label: Text('${_accounts.length}'),
              child: const Icon(Icons.switch_account),
            ),
            onPressed: _showAccountsBottomSheet,
            tooltip: 'Switch account',
          ),
          IconButton(
            icon: _isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.check),
            onPressed: _isSaving ? null : _saveProfile,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_isLoading)
                  const Center(child: CircularProgressIndicator())
                else if (_profile != null)
                  Center(
                    child: Stack(
                      children: [
                      CircleAvatar(
                        radius: 50,
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        backgroundImage: _profile?.avatarUrl != null
                            ? NetworkImage(_getAvatarUrl())
                            : null,
                      child: _profile?.avatarUrl == null
                          ? Text(
                              _getInitial(),
                              style: const TextStyle(fontSize: 36),
                            )
                          : null,
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: GestureDetector(
                          onTap: _pickImage,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: _themeProvider.primaryColor,
                              shape: BoxShape.circle,
                            ),
                            child: _isUploadingAvatar
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(
                                    Icons.camera_alt,
                                    size: 16,
                                    color: Colors.white,
                                  ),
                          ),
                        ),
                      ),
                      if (_profile?.avatarUrl != null)
                        Positioned(
                          top: 0,
                          right: 0,
                          child: GestureDetector(
                            onTap: _removeAvatar,
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: const BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.close,
                                size: 12,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Center(
                  child: Text(
                    '@${_profile?.username ?? ''}',
                    style: const TextStyle(fontSize: 16),
                  ),
                ),
                const SizedBox(height: 24),
                Builder(
                  builder: (context) {
                    final theme = Theme.of(context);
                    return TextField(
                      controller: _displayNameController,
                      decoration: InputDecoration(
                        labelText: 'Display name',
                        labelStyle: theme.textTheme.bodyMedium?.copyWith(
                          overflow: TextOverflow.ellipsis,
                        ),
                        alignLabelWithHint: true,
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                Builder(
                  builder: (context) {
                    final theme = Theme.of(context);
                    return TextField(
                      controller: _bioController,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: 'Bio',
                        labelStyle: theme.textTheme.bodyMedium?.copyWith(
                          overflow: TextOverflow.ellipsis,
                        ),
                        alignLabelWithHint: true,
                      ),
                    );
                  },
                ),
                const SizedBox(height: 24),
                Builder(
                  builder: (context) {
                    final theme = Theme.of(context);
                    return ListTile(
                      tileColor: theme.colorScheme.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary,
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      title: Text('Theme',
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium),
                      subtitle: Text(
                          _themeProvider.themeId == 'custom'
                              ? 'Custom'
                              : _themeProvider.themeId,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium),
                      trailing: Icon(Icons.chevron_right,
                          color: theme.colorScheme.onSurfaceVariant),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ThemeSettingsScreen(
                              themeProvider: _themeProvider,
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
                const SizedBox(height: 16),
                Builder(
                  builder: (context) {
                    final theme = Theme.of(context);
                    return Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.info_outline,
                            size: 16,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Joined: ${_formatDate(_profile?.createdAt ?? 0)}',
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                        ],
                        ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                Card(
                  color: Theme.of(context).colorScheme.surface,
                  child: ListTile(
                    leading: Icon(
                      Icons.bug_report,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    title: const Text('Copy debug logs'),
                    subtitle: Text(
                      '${ApiService.logs.length} entries',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    onTap: () {
                      Clipboard.setData(
                        ClipboardData(text: ApiService.getLogs()),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Logs copied to clipboard'),
                          duration: Duration(seconds: 3),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  color: Theme.of(context).colorScheme.surface,
                  child: ListTile(
                    leading: Icon(
                      Icons.logout,
                      color: Colors.red,
                    ),
                    title: Text(
                      'Log out',
                      style: TextStyle(color: Colors.red),
                    ),
                    onTap: () async {
                      final confirmed = await showDialog<bool>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: const Text('Log out'),
                          content: const Text('Are you sure you want to log out?'),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context, false),
                              child: const Text('Cancel'),
                            ),
                            TextButton(
                              onPressed: () => Navigator.pop(context, true),
                              style: TextButton.styleFrom(foregroundColor: Colors.red),
                              child: const Text('Log out'),
                            ),
                          ],
                        ),
                      );
                      if (confirmed == true) {
                        await widget.api.clearCredentials();
                        widget.api.disconnect();
                        if (mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(
                              builder: (_) => AuthScreen(api: widget.api),
                            ),
                            (route) => false,
                          );
                        }
                      }
                    },
                  ),
                ),
              ],
            ),
    );
  }
  
  Widget _buildColorRow(String label, Color color, String key) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(
                color: Colors.grey.shade300,
                width: 1,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
          GestureDetector(
            onTap: () => _showColorPicker(key, color),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: const Text('Change', style: TextStyle(fontSize: 12)),
            ),
          ),
        ],
      ),
    );
  }

  void _showColorPicker(String key, Color currentColor) {
    final theme = Theme.of(context);
    showModalBottomSheet(
      context: context,
      backgroundColor: theme.colorScheme.surface,
      builder: (context) => _ColorPickerSheet(
        currentColor: currentColor,
        onColorSelected: (color) {
          _themeProvider.setCustomColor(key, color);
        },
      ),
    );
  }

  void _createCustomTheme(BuildContext context) {
    final theme = Theme.of(context);
    showModalBottomSheet(
      context: context,
      backgroundColor: theme.colorScheme.surface,
      isScrollControlled: true,
      builder: (context) => _CustomThemeSheet(
        themeProvider: _themeProvider,
      ),
    );
  }

  String _formatDate(int timestamp) {
    if (timestamp == 0) return 'Unknown';
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    return '${date.day}/${date.month}/${date.year}';
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

  static const List<Color> _presetColors = [
    Color(0xFF000000),
    Color(0xFF212121),
    Color(0xFF424242),
    Color(0xFF757575),
    Color(0xFFBDBDBD),
    Color(0xFFE0E0E0),
    Color(0xFFF5F5F5),
    Color(0xFFFFFFFF),
    Color(0xFFF44336),
    Color(0xFFE91E63),
    Color(0xFF9C27B0),
    Color(0xFF673AB7),
    Color(0xFF3F51B5),
    Color(0xFF2196F3),
    Color(0xFF03A9F4),
    Color(0xFF00BCD4),
    Color(0xFF009688),
    Color(0xFF4CAF50),
    Color(0xFF8BC34A),
    Color(0xFFCDDC39),
    Color(0xFFFFEB3B),
    Color(0xFFFFC107),
    Color(0xFFFF9800),
    Color(0xFFFF5722),
    Color(0xFF795548),
    Color(0xFF607D8B),
  ];

  void _applyHexColor() {
    final hex = _hexController.text.trim();
    if (hex.isEmpty) return;
    
    String colorHex = hex;
    if (!hex.startsWith('#')) {
      colorHex = '#$hex';
    }
    
    try {
      final color = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
      widget.onColorSelected(color);
      Navigator.pop(context);
    } catch (e) {
      setState(() => _errorText = 'Invalid color code');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.surface,
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Select Color',
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _hexController,
                  decoration: InputDecoration(
                    hintText: '#FF0000',
                    labelText: 'Hex code',
                    errorText: _errorText,
                    isDense: true,
                    prefixText: '#',
                  ),
                  onChanged: (_) => setState(() => _errorText = null),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _applyHexColor,
                child: const Text('Apply'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('or pick a color:'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _presetColors.map((color) {
              return GestureDetector(
                onTap: () {
                  widget.onColorSelected(color);
                  Navigator.pop(context);
                },
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(8),
                    border: color == widget.currentColor
                        ? Border.all(color: Colors.blue, width: 3)
                        : Border.all(color: Colors.grey.shade300),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
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

  static const List<Color> _colors = [
    Color(0xFF000000),
    Color(0xFF212121),
    Color(0xFF424242),
    Color(0xFF757575),
    Color(0xFFBDBDBD),
    Color(0xFFE0E0E0),
    Color(0xFFF5F5F5),
    Color(0xFFFFFFFF),
    Color(0xFFF44336),
    Color(0xFFE91E63),
    Color(0xFF9C27B0),
    Color(0xFF673AB7),
    Color(0xFF3F51B5),
    Color(0xFF2196F3),
    Color(0xFF03A9F4),
    Color(0xFF00BCD4),
    Color(0xFF009688),
    Color(0xFF4CAF50),
    Color(0xFF8BC34A),
    Color(0xFFCDDC39),
    Color(0xFFFFEB3B),
    Color(0xFFFFC107),
    Color(0xFFFF9800),
    Color(0xFFFF5722),
    Color(0xFF795548),
    Color(0xFF607D8B),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Create Custom Theme',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 24),
          _buildColorPicker('Primary', _primary, (c) => setState(() => _primary = c)),
          _buildColorPicker('Secondary', _secondary, (c) => setState(() => _secondary = c)),
          _buildColorPicker('Background', _background, (c) => setState(() => _background = c)),
          _buildColorPicker('Surface', _surface, (c) => setState(() => _surface = c)),
          _buildColorPicker('Text', _text, (c) => setState(() => _text = c)),
          _buildColorPicker('Text Secondary', _textSecondary, (c) => setState(() => _textSecondary = c)),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                widget.themeProvider.setCustomTheme(
                  _primary,
                  _secondary,
                  _background,
                  _surface,
                  _text,
                  _textSecondary,
                );
                Navigator.pop(context);
              },
              child: const Text('Create Theme'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildColorPicker(String label, Color color, Function(Color) onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _colors.map((c) {
              return GestureDetector(
                onTap: () => onChanged(c),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: c,
                    borderRadius: BorderRadius.circular(4),
                    border: c == color
                        ? Border.all(color: Colors.blue, width: 3)
                        : Border.all(color: Colors.grey.shade300),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _AccountsBottomSheet extends StatefulWidget {
  final ApiService api;
  final List<Account> accounts;
  final Account? currentAccount;
  final ThemeProvider themeProvider;
  final VoidCallback onAccountSwitched;
  final VoidCallback onAccountsUpdated;

  const _AccountsBottomSheet({
    required this.api,
    required this.accounts,
    required this.currentAccount,
    required this.themeProvider,
    required this.onAccountSwitched,
    required this.onAccountsUpdated,
  });

  @override
  State<_AccountsBottomSheet> createState() => _AccountsBottomSheetState();
}

class _AccountsBottomSheetState extends State<_AccountsBottomSheet> {
  late List<Account> _accounts;

  @override
  void initState() {
    super.initState();
    _accounts = List.from(widget.accounts);
  }

  Future<void> _switchAccount(Account account) async {
    if (account.id == widget.currentAccount?.id) return;
    
    await widget.api.switchAccount(account.id);
    widget.themeProvider.setCurrentUser(account.id);
    await widget.themeProvider.loadTheme();
    widget.onAccountSwitched();
  }

  Future<void> _addAccount() async {
    Navigator.pop(context);
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AuthScreen(api: widget.api, isAddingAccount: true),
      ),
    );
    widget.onAccountsUpdated();
  }

  Future<void> _removeAccount(Account account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove account'),
        content: Text('Remove ${account.displayName ?? account.username} from this device?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    
    if (confirmed == true) {
      await widget.api.removeAccount(account.id);
      setState(() {
        _accounts.removeWhere((a) => a.id == account.id);
      });
      widget.onAccountsUpdated();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Container(
      padding: const EdgeInsets.all(16),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Accounts', style: theme.textTheme.titleLarge),
              IconButton(
                icon: const Icon(Icons.add),
                onPressed: _addAccount,
                tooltip: 'Add account',
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_accounts.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'No accounts added',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            )
          else
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: _accounts.length,
                itemBuilder: (context, index) {
                  final account = _accounts[index];
                  final isCurrent = account.id == widget.currentAccount?.id;
                  
                  return Card(
                    color: isCurrent
                        ? theme.colorScheme.primary.withValues(alpha: 0.1)
                        : theme.colorScheme.surface,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        backgroundImage: account.avatarUrl != null
                            ? NetworkImage('http://77.34.76.27:3000${account.avatarUrl}')
                            : null,
                        child: account.avatarUrl == null
                            ? Text(_getAccountInitial(account))
                            : null,
                      ),
                      title: Text(
                        account.displayName?.isNotEmpty == true
                            ? account.displayName!
                            : account.username?.isNotEmpty == true
                                ? account.username!
                                : 'Account ${account.id.substring(0, account.id.length > 8 ? 8 : account.id.length)}',
                      ),
                      subtitle: Text(
                        account.username?.isNotEmpty == true
                            ? '@${account.username}'
                            : 'ID: ${account.id.substring(0, account.id.length > 12 ? 12 : account.id.length)}...',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (isCurrent)
                            Icon(Icons.check_circle, color: theme.colorScheme.primary),
                          if (!isCurrent)
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 20),
                              onPressed: () => _removeAccount(account),
                              color: Colors.red,
                            ),
                        ],
                      ),
                      onTap: () => _switchAccount(account),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
  
  String _getAccountInitial(Account account) {
    String name;
    if (account.displayName?.isNotEmpty == true) {
      name = account.displayName!;
    } else if (account.username?.isNotEmpty == true && account.username != account.id) {
      name = account.username!;
    } else {
      final idStr = account.id;
      return idStr.length >= 2 ? idStr.substring(0, 2).toUpperCase() : 'U';
    }
    name = name.trim();
    if (name.isEmpty) return 'U';
    final chars = name.characters;
    return chars.isEmpty ? 'U' : chars.first.toUpperCase();
  }
}