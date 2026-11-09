import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_service.dart';
import '../services/chat_storage.dart';
import '../services/mute_service.dart';
import '../models/models.dart';
import '../utils/avatar_utils.dart';
import '../utils/kolobok_utils.dart';
import 'chat_screen.dart';
import 'auth_screen.dart';
import 'profile_screen.dart';
import '../l10n/app_localizations.dart';
import '../widgets/user_search_sheet.dart';

class ChatsScreen extends StatefulWidget {
  final ApiService api;

  const ChatsScreen({super.key, required this.api});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  List<Chat> _chats = [];
  final Map<String, int> _unreadCounts = {};
  final Set<String> _onlineUsers = {};
  bool _isLoading = true;
  String? _savedChatId;
  String? _savedLastMessage;
  int? _savedLastMessageAt;
  String? _savedLastMessageKeyType;

  @override
  void initState() {
    super.initState();
    _loadCachedChats();
    _loadData();
    _setupWebSocket();
  }

  /// Сначала показываем список чатов с диска, сеть подтягивается следом.
  Future<void> _loadCachedChats() async {
    final cached = await ChatStorage.loadChats();
    if (cached.isEmpty || !mounted) return;
    // Saved-чат тоже берём из кэша — он всегда закреплён сверху,
    // не дожидаясь сети.
    final saved = cached.where((c) => c.type == 'saved').firstOrNull;
    setState(() {
      _savedChatId = saved?.id;
      _savedLastMessage = saved?.lastMessage;
      _savedLastMessageAt = saved?.lastMessageAt;
      _savedLastMessageKeyType = saved?.lastMessageKeyType;
      _chats = cached.where((c) => c.type != 'saved').toList();
      _isLoading = false;
    });
  }

  Future<void> _loadData() async {
    print('[ChatsScreen] _loadData started');
    try {
      // Параллельно: saved-чат и список чатов не зависят друг от друга
      final results = await Future.wait([
        widget.api.getOrCreateSavedChat(),
        widget.api.getChats(),
      ]);
      String? savedId = results[0] as String?;
      final chats = results[1] as List<Chat>;
      // fallback: если getOrCreateSavedChat не сработал, но saved-чат уже есть — берём его
      savedId ??= chats.where((c) => c.type == 'saved').firstOrNull?.id;
      print('[ChatsScreen] Got ${chats.length} chats');
      for (var c in chats) {
        print('[ChatsScreen] Chat ${c.name}: avatarUrl=${c.avatarUrl}');
      }
      if (mounted) {
        setState(() {
          _savedChatId = savedId;
          // Исключаем saved-чат из обычного списка — он показан закреплённым элементом
          _chats = chats.where((c) => c.type != 'saved').toList();
          _isLoading = false;
          // превью "Избранного" из его последнего сообщения
          if (savedId != null) {
            final savedChat = chats.where((c) => c.id == savedId).firstOrNull;
            _savedLastMessage = savedChat?.lastMessage;
            _savedLastMessageAt = savedChat?.lastMessageAt;
            _savedLastMessageKeyType = savedChat?.lastMessageKeyType;
          }
        });
        print('[ChatsScreen] _chats set with ${_chats.length} items');
        // Cache the fresh data
        await ChatStorage.saveChats(chats);

        // Загружаем счётчики непрочитанных
        final unread = await widget.api.getUnreadCounts();
        if (mounted) {
          setState(() {
            _unreadCounts.clear();
            _unreadCounts.addAll(unread);
          });
        }
      }
    } catch (e) {
      print('[ChatsScreen] Error: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _setupWebSocket() async {
    widget.api.connectWebSocket();
    widget.api.onMessage = (msg) async {
      final type = msg['type'];

      if (type == 'message' && mounted) {
        final chatId = msg['chatId'];
        final senderId = msg['userId'];
        final currentUserId = widget.api.userId;

        // Обновляем превью "Избранного" независимо от отправителя
        if (_savedChatId != null && chatId == _savedChatId) {
          setState(() {
            _savedLastMessage = msg['text'];
            _savedLastMessageAt = msg['timestamp'];
            _savedLastMessageKeyType = msg['keyType'];
          });
        }

        // Не увеличиваем счётчик если сообщение от себя
        if (senderId != currentUserId && !await MuteService.isMuted(chatId)) {
          setState(() {
            _unreadCounts[chatId] = (_unreadCounts[chatId] ?? 0) + 1;

            // Обновляем lastMessage в чате
            final index = _chats.indexWhere((c) => c.id == chatId);
            if (index != -1) {
              _chats[index] = Chat(
                id: _chats[index].id,
                name: _chats[index].name,
                type: _chats[index].type,
                createdAt: _chats[index].createdAt,
                lastMessage: msg['text'],
                lastMessageAt: msg['timestamp'],
                lastMessageKeyType: msg['keyType'],
                participants: _chats[index].participants,
                unreadCount: (_unreadCounts[chatId] ?? 0),
              );
            }
          });
        }
      }

      if (type == 'online' && mounted) {
        setState(() {
          if (msg['status'] == 'online') {
            _onlineUsers.add(msg['userId']);
          } else {
            _onlineUsers.remove(msg['userId']);
          }
        });
      }

      if (type == 'message_edited' && mounted) {
        _refreshChats();
      }

      if (type == 'message_deleted' && mounted) {
        _refreshChats();
      }
    };
  }

  Future<void> _refreshChats() async {
    final chats = await widget.api.getChats();
    if (mounted) {
      setState(() => _chats = chats.where((c) => c.type != 'saved').toList());
    }
  }

  void _markChatAsRead(String chatId) {
    setState(() {
      _unreadCounts[chatId] = 0;
    });
  }

  Future<void> _createChat() async {
    await UserSearchSheet.show(
      context: context,
      api: widget.api,
      config: const UserSearchSheetConfig(
        title: 'New Chat',
      ),
      onSubmitted: (users) async {
        if (users.isEmpty) return;
        final user = users.first;
        final chatId = await widget.api.createChat('direct', [user.id]);
        if (chatId != null && mounted) {
          _loadData();
          _openChat(chatId, user.username);
        }
      },
    );
  }

  void _openChat(String chatId, String name, {String chatType = 'direct'}) {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => ChatScreen(
              api: widget.api,
              chatId: chatId,
              chatName: name,
              chatType: chatType,
              onMessagesRead: () => _markChatAsRead(chatId),
            ),
          ),
        )
        .then((_) => _loadData());
  }

  String? _specialLastMessageText(String? lastMessage, {String? keyType}) {
    if (lastMessage == null || lastMessage.isEmpty) return '';

    if (keyType == 'e2ee_v1') {
      return '🔒 Encrypted message';
    }

    // Check if message contains [File] or [file] - indicating a file message
    final lowerMessage = lastMessage.toLowerCase();
    if (lowerMessage.contains('[file]')) {
      // Extract filename - take everything after [file] or [File]
      final startIdx = lowerMessage.indexOf('[file]');
      final fileName = lastMessage.substring(startIdx + 6).trim(); // 6 = length of '[file]'
      if (fileName.isEmpty) return AppLocalizations.of(context).file;

      final ext = fileName.split('.').last.toLowerCase();
      final isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].contains(ext);

      return isImage ? AppLocalizations.of(context).photo : AppLocalizations.of(context).file;
    }

    return null;
  }

  Widget _buildLastMessagePreview(String? lastMessage, TextStyle? style, {String? keyType}) {
    final special = _specialLastMessageText(lastMessage, keyType: keyType);
    if (special != null) {
      return Text(
        special,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: style,
      );
    }
    return Text.rich(
      TextSpan(style: style, children: kolobokPreviewSpans(lastMessage!)),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }

  Widget _buildAvatar(String? avatarUrl, String fallbackChar, {String? userId}) {
    final fallbackColor = userId != null ? colorFromId(userId) : Theme.of(context).colorScheme.primary;
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      final fullUrl = 'https://wlvorti.ru:3000$avatarUrl';
      print('[Avatar] Loading image: $fullUrl');
      return SizedBox(
        width: 40,
        height: 40,
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: fullUrl,
            fit: BoxFit.cover,
            placeholder: (_, __) => const CircularProgressIndicator(),
            errorWidget: (_, __, ___) {
              return Container(
                color: Colors.grey[300],
                child: const Icon(Icons.person, color: Colors.white),
              );
            },
          ),
        ),
      );
    }
    return CircleAvatar(
      backgroundColor: fallbackColor,
      child: Text(fallbackChar.toUpperCase()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).chats),
        actions: [
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ProfileScreen(api: widget.api),
                ),
              );
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView.builder(
                // Всегда показываем "Избранное" первым элементом
                itemCount: (_savedChatId != null ? 1 : 0) + _chats.length,
                itemBuilder: (_, i) {
                  final hasSaved = _savedChatId != null;
                  if (hasSaved && i == 0) {
                    return _buildSavedTile();
                  }
                  final chatIndex = i - (hasSaved ? 1 : 0);
                  final chat = _chats[chatIndex];
                  final unread = _unreadCounts[chat.id] ?? 0;
                  print(
                    '[ChatList] Building tile for ${chat.name}, avatarUrl=${chat.avatarUrl}',
                  );
                  return ListTile(
                    leading: _buildAvatar(
                      chat.avatarUrl,
                      chat.name?[0].toUpperCase() ??
                          chat.participants.first[0].toUpperCase(),
                      userId: chat.id,
                    ),
                    title: Text(chat.name ?? AppLocalizations.of(context).chat),
                    subtitle: _buildLastMessagePreview(
                      chat.lastMessage,
                      Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      keyType: chat.lastMessageKeyType,
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (chat.lastMessageAt != null)
                          Text(
                            _formatTime(chat.lastMessageAt!),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        if (unread > 0) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.blue,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              unread > 99 ? '99+' : unread.toString(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    onTap: () => _openChat(chat.id, chat.name ?? AppLocalizations.of(context).chat),
                  );
                },
              ),
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createChat,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildSavedTile() {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: theme.colorScheme.primary,
        child: Icon(Icons.bookmark, color: theme.colorScheme.onPrimary),
      ),
      title: Text(
        l10n.savedMessages,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: _buildLastMessagePreview(
        _savedLastMessage,
        theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
        keyType: _savedLastMessageKeyType,
      ),
      trailing: _savedLastMessageAt != null
          ? Text(
              _formatTime(_savedLastMessageAt!),
              style: theme.textTheme.bodySmall,
            )
          : null,
      onTap: () {
        final id = _savedChatId;
        if (id != null) _openChat(id, l10n.savedMessages, chatType: 'saved');
      },
    );
  }

  String _formatTime(int timestamp) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    final now = DateTime.now();
    if (date.day == now.day) {
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    }
    return '${date.day}/${date.month}';
  }
}
