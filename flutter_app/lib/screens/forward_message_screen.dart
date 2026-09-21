import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../services/crypto_service.dart';
import '../utils/avatar_utils.dart';
import '../utils/kolobok_utils.dart';
import '../l10n/app_localizations.dart';

class ForwardMessageScreen extends StatefulWidget {
  final ApiService api;
  final Message message;

  const ForwardMessageScreen({
    super.key,
    required this.api,
    required this.message,
  });

  @override
  State<ForwardMessageScreen> createState() => _ForwardMessageScreenState();
}

class _ForwardMessageScreenState extends State<ForwardMessageScreen> {
  List<Chat> _chats = [];
  List<Chat> _filtered = [];
  bool _isLoading = true;
  bool _sending = false;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadChats();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadChats() async {
    try {
      final chats = await widget.api.getChats();
      if (!mounted) return;
      setState(() {
        _chats = chats;
        _filtered = chats;
        _isLoading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _onSearchChanged(String query) {
    final q = query.trim().toLowerCase();
    setState(() {
      _filtered = q.isEmpty
          ? _chats
          : _chats.where((c) {
              final name = (_chatDisplayName(c)).toLowerCase();
              return name.contains(q);
            }).toList();
    });
  }

  String _chatDisplayName(Chat chat) {
    final currentUserId = widget.api.userId;
    if (chat.type == 'group') return chat.name ?? 'Group';
    final otherUserId = chat.participants.firstWhere(
      (p) => p != currentUserId,
      orElse: () => chat.participants.first,
    );
    return chat.name ?? otherUserId;
  }

  /// Возвращает текст для пересылки (расшифрованный для e2ee сообщений).
  String _resolvedText(Message msg) => msg.plainText ?? msg.text;

  Future<void> _forwardTo(Chat chat) async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      final msg = widget.message;
      final text = _resolvedText(msg).trim();

      if (msg.stickerId != null) {
        widget.api.sendSticker(chat.id, msg.stickerId!);
      } else if (msg.fileId != null) {
        await widget.api.sendFile(
          chat.id,
          msg.fileId!,
          mimeType: msg.fileMimeType,
        );
      } else if (text.isNotEmpty) {
        await _sendText(chat, text);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).failedToSend)),
        );
      }
      if (mounted) setState(() => _sending = false);
      return;
    }

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).forwarded)),
    );
    Navigator.of(context).pop();
  }

  Future<void> _sendText(Chat chat, String text) async {
    String sendText = text;
    String? keyType;
    String? senderKeyId;
    String? recipientKeyId;
    if (chat.type == 'direct' && text.isNotEmpty) {
      final currentUserId = widget.api.userId;
      final otherUserId = chat.participants.firstWhere(
        (p) => p != currentUserId,
        orElse: () => chat.participants.first,
      );
      try {
        final box = await CryptoService.getBox(otherUserId, widget.api);
        if (box != null) {
          sendText = CryptoService.encryptMessage(text, box);
          keyType = 'e2ee_v1';
          senderKeyId = CryptoService.ourKeyId;
          recipientKeyId = CryptoService.latestPeerKeyId(otherUserId);
          if (recipientKeyId == null) {
            final fresh =
                await CryptoService.getBox(otherUserId, widget.api, force: true);
            if (fresh != null) {
              recipientKeyId = CryptoService.latestPeerKeyId(otherUserId);
            }
          }
        }
      } catch (_) {}
    }
    widget.api.sendMessage(chat.id, sendText,
        keyType: keyType,
        senderKeyId: senderKeyId,
        recipientKeyId: recipientKeyId);
  }

  Widget _buildPreview() {
    final msg = widget.message;
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(Icons.forward, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    AppLocalizations.of(context).forwarding,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 4),
                  _buildContentPreview(msg, theme),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContentPreview(Message msg, ThemeData theme) {
    if (msg.stickerId != null) {
      return Row(
        children: [
          const Icon(Icons.emoji_emotions_outlined, size: 18),
          const SizedBox(width: 6),
          Text(msg.stickerEmoji ?? AppLocalizations.of(context).sticker,
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      );
    }
    if (msg.fileId != null) {
      final name = _resolvedText(msg).replaceFirst('[File] ', '');
      return Row(
        children: [
          Icon(Icons.insert_drive_file, size: 18),
          const SizedBox(width: 6),
          Expanded(
            child: Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      );
    }
    final text = _resolvedText(msg).trim();
    if (text.isEmpty) return const SizedBox.shrink();
    return Text.rich(
      TextSpan(children: kolobokPreviewSpans(text, size: 20)),
      maxLines: 6,
      overflow: TextOverflow.ellipsis,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.forwardTo),
        actions: [
          if (_sending)
            const Padding(
              padding: EdgeInsets.all(14),
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          _buildPreview(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: l10n.searchMessages,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest
                    .withValues(alpha: 0.5),
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          _onSearchChanged('');
                        },
                      )
                    : null,
              ),
              onChanged: _onSearchChanged,
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _filtered.isEmpty
                    ? Center(child: Text(l10n.noChatsYet))
                    : ListView.builder(
                        itemCount: _filtered.length,
                        itemBuilder: (_, i) {
                          final chat = _filtered[i];
                          final displayName = _chatDisplayName(chat);
                          final initial = displayName.isNotEmpty
                              ? displayName[0].toUpperCase()
                              : '?';
                          return ListTile(
                            leading: Stack(
                              children: [
                                CircleAvatar(
                                  backgroundColor: chat.type == 'saved'
                                      ? Theme.of(context).colorScheme.primary
                                      : colorFromId(chat.id),
                                  backgroundImage:
                                      chat.type != 'saved' &&
                                              chat.avatarUrl != null &&
                                              chat.avatarUrl!.isNotEmpty
                                          ? CachedNetworkImageProvider(
                                              '${ApiService.baseUrl}${chat.avatarUrl}')
                                          : null,
                                  child: chat.type == 'saved'
                                      ? Icon(Icons.bookmark,
                                          size: 18,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onPrimary)
                                      : Text(initial),
                                ),
                                if (chat.type == 'group')
                                  const Positioned(
                                    right: -2,
                                    bottom: -2,
                                    child: CircleAvatar(
                                      radius: 10,
                                      child: Icon(Icons.group, size: 12),
                                    ),
                                  ),
                              ],
                            ),
                            title: Text(
                              displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: chat.type == 'group'
                                ? Icon(Icons.group,
                                    size: 18,
                                    color: Theme.of(context).colorScheme.primary)
                                : null,
                            onTap: () => _forwardTo(chat),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
