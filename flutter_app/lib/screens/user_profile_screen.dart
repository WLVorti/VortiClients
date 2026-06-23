import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_service.dart';
import '../l10n/app_localizations.dart';
import '../widgets/falling_icons_background.dart';
import '../models/models.dart';
import '../utils/avatar_utils.dart';
import 'image_viewer_screen.dart';

class UserProfileScreen extends StatefulWidget {
  final ApiService api;
  final String userId;

  const UserProfileScreen({super.key, required this.api, required this.userId});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen>
    with SingleTickerProviderStateMixin {
  Profile? _profile;
  bool _isLoading = true;
  String? _chatId;
  List<Message> _mediaMessages = [];
  List<Message> _musicMessages = [];
  List<Message> _fileMessages = [];
  bool _mediaLoading = false;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadProfile();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    final profile = await widget.api.getUserProfile(widget.userId);
    if (mounted) {
      setState(() {
        _profile = profile;
        _isLoading = false;
      });
    }
    if (profile != null) {
      _findChatAndLoadMedia();
    }
  }

  Future<void> _findChatAndLoadMedia() async {
    try {
      final chats = await widget.api.getChats();
      final currentUserId = widget.api.userId;
      if (currentUserId == null) return;
      final chat = chats.cast<Chat?>().firstWhere(
        (c) =>
            c!.type == 'direct' &&
            c.participants.contains(currentUserId) &&
            c.participants.contains(widget.userId),
        orElse: () => null,
      );
      if (chat == null) return;
      setState(() => _chatId = chat.id);
      _loadMedia(chat.id);
    } catch (_) {}
  }

  Future<void> _loadMedia(String chatId) async {
    setState(() => _mediaLoading = true);
    try {
      final messages = await widget.api.getMessages(chatId, limit: 200);
      final media = <Message>[];
      final music = <Message>[];
      final files = <Message>[];

      for (final m in messages) {
        if (m.fileId == null || m.fileId!.isEmpty) continue;
        if (m.isDeleted) continue;
        final ext = _getExt(m);
        if (_isImage(ext)) {
          media.add(m);
        } else if (_isAudio(ext)) {
          music.add(m);
        } else {
          files.add(m);
        }
      }

      if (mounted) {
        setState(() {
          _mediaMessages = media;
          _musicMessages = music;
          _fileMessages = files;
          _mediaLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _mediaLoading = false);
    }
  }

  String _getExt(Message m) {
    final name = m.text.replaceAll('[File] ', '');
    final dot = name.lastIndexOf('.');
    if (dot == -1) return '';
    return name.substring(dot + 1).toLowerCase();
  }

  bool _isImage(String ext) =>
      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].contains(ext);
  bool _isAudio(String ext) =>
      ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].contains(ext);

  String _fileName(Message m) => m.text.replaceAll('[File] ', '');

  String _downloadUrl(String fileId) =>
      '${ApiService.baseUrl}/download/$fileId?token=${widget.api.token}';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.account)),
      body: Stack(fit: StackFit.expand, children: [
        const Positioned.fill(child: FallingIconsBackground(maxConcurrent: 120)),
        _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _profile == null
                ? Center(child: Text(l10n.userNotFound))
                : _chatId == null
                    ? SingleChildScrollView(child: _buildProfileHeader(theme, l10n))
                    : Column(
                        children: [
                          ConstrainedBox(
                            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.4),
                            child: SingleChildScrollView(child: _buildProfileHeader(theme, l10n)),
                          ),
                          SizedBox(
                            height: 36,
                            child: TabBar(
                              controller: _tabController,
                              tabs: [
                                Tab(text: '${l10n.media} (${_mediaMessages.length})'),
                                Tab(text: '${l10n.music} (${_musicMessages.length})'),
                                Tab(text: '${l10n.files} (${_fileMessages.length})'),
                              ],
                              isScrollable: false,
                              labelColor: theme.colorScheme.primary,
                              unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
                              indicatorColor: theme.colorScheme.primary,
                            ),
                          ),
                          Expanded(
                            child: _mediaLoading
                                ? const Center(child: CircularProgressIndicator())
                                : TabBarView(
                                    controller: _tabController,
                                    children: [
                                      _buildMediaTab(theme),
                                      _buildMusicTab(theme),
                                      _buildFilesTab(theme, l10n),
                                    ],
                                  ),
                          ),
                        ],
                      ),
      ]),
    );
  }

  Widget _buildProfileHeader(ThemeData theme, AppLocalizations l10n) {
    final p = _profile!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
      child: Column(
        children: [
          CircleAvatar(
            radius: 60,
            backgroundColor: colorFromId(p.id),
            backgroundImage: (p.avatarUrl != null && p.avatarUrl!.isNotEmpty)
                ? CachedNetworkImageProvider('https://wlvorti.ru:3000${p.avatarUrl}')
                : null,
            child: (p.avatarUrl == null || p.avatarUrl!.isEmpty)
                ? Text(p.username[0].toUpperCase(), style: const TextStyle(fontSize: 40))
                : null,
          ),
          const SizedBox(height: 24),
          Text(p.displayName,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text('@${p.username}',
            style: TextStyle(fontSize: 16, color: theme.colorScheme.onSurfaceVariant),
          ),
          if (p.bio.isNotEmpty) ...[
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(p.bio,
                style: TextStyle(fontSize: 14, color: theme.colorScheme.onSurface),
                textAlign: TextAlign.center,
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text('${l10n.joined} ${l10n.formatDate(p.createdAt)}',
            style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaTab(ThemeData theme) {
    if (_mediaMessages.isEmpty) {
      return Center(child: Text('No media', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)));
    }
    return GridView.builder(
      padding: const EdgeInsets.all(4),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 2,
        mainAxisSpacing: 2,
      ),
      itemCount: _mediaMessages.length,
      itemBuilder: (_, i) {
        final m = _mediaMessages[i];
        return GestureDetector(
          onTap: () => _openImage(m),
          child: CachedNetworkImage(
            imageUrl: _downloadUrl(m.fileId!),
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: theme.colorScheme.surfaceContainerHigh, child: const Icon(Icons.broken_image)),
          ),
        );
      },
    );
  }

  Widget _buildMusicTab(ThemeData theme) {
    if (_musicMessages.isEmpty) {
      return Center(child: Text('No music', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)));
    }
    return ListView.builder(
      itemCount: _musicMessages.length,
      itemBuilder: (_, i) {
        final m = _musicMessages[i];
        return ListTile(
          leading: Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.audiotrack, color: theme.colorScheme.onPrimaryContainer, size: 22),
          ),
          title: Text(_fileName(m), maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: () {},
        );
      },
    );
  }

  Widget _buildFilesTab(ThemeData theme, AppLocalizations l10n) {
    if (_fileMessages.isEmpty) {
      return Center(child: Text('No files', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)));
    }
    return ListView.builder(
      itemCount: _fileMessages.length,
      itemBuilder: (_, i) {
        final m = _fileMessages[i];
        final name = _fileName(m);
        final dot = name.lastIndexOf('.');
        final ext = dot == -1 ? '?' : name.substring(dot + 1).toUpperCase();
        return ListTile(
          leading: Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(10)),
            child: Center(
              child: Text(ext.length > 3 ? ext.substring(0, 3) : ext,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: theme.colorScheme.onPrimaryContainer),
              ),
            ),
          ),
          title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: () {},
        );
      },
    );
  }

  void _openImage(Message msg) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ImageViewerScreen(
          imageUrl: _downloadUrl(msg.fileId!),
          heroTag: 'shared_${msg.id}',
        ),
      ),
    );
  }
}
