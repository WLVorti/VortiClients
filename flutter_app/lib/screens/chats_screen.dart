import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_service.dart';
import '../services/chat_cache.dart';
import '../services/mute_service.dart';
import '../models/models.dart';
import '../utils/avatar_utils.dart';
import 'chat_screen.dart';
import 'auth_screen.dart';
import 'profile_screen.dart';
import '../l10n/app_localizations.dart';

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

  @override
  void initState() {
    super.initState();
    final cached = ChatCache.getChats();
    if (cached.isNotEmpty) {
      _chats = cached;
      _isLoading = false;
    }
    _loadData();
    _setupWebSocket();
  }

  Future<void> _loadData() async {
    print('[ChatsScreen] _loadData started');
    try {
      final chats = await widget.api.getChats();
      print('[ChatsScreen] Got ${chats.length} chats');
      for (var c in chats) {
        print('[ChatsScreen] Chat ${c.name}: avatarUrl=${c.avatarUrl}');
      }
      if (mounted) {
        setState(() {
          _chats = chats;
          _isLoading = false;
        });
        print('[ChatsScreen] _chats set with ${_chats.length} items');
        // Cache the fresh data
        ChatCache.saveChats(chats);

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
      setState(() => _chats = chats);
    }
  }

  void _markChatAsRead(String chatId) {
    setState(() {
      _unreadCounts[chatId] = 0;
    });
  }

  Future<void> _createChat() async {
    final searchController = TextEditingController();
    List<User> users = [];
    Timer? _debounce;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.onSurfaceVariant.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Row(
                  children: [
                    Text(
                      AppLocalizations.of(context).newChat,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: TextField(
                  controller: searchController,
                  decoration: InputDecoration(
                    hintText: AppLocalizations.of(context).searchUsers,
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 20),
                            onPressed: () {
                              searchController.clear();
                              setSheetState(() => users = []);
                            },
                          )
                        : null,
                  ),
                  onChanged: (value) {
                    _debounce?.cancel();
                    if (value.length < 2) {
                      setSheetState(() => users = []);
                      return;
                    }
                    _debounce = Timer(const Duration(milliseconds: 300), () async {
                      final result = await widget.api.searchUsers(value);
                      if (searchController.text == value) {
                        setSheetState(() => users = result);
                      }
                    });
                  },
                ),
              ),
              const SizedBox(height: 8),
              if (users.isEmpty && searchController.text.length >= 2)
                Padding(
                  padding: const EdgeInsets.all(40),
                  child: Text(AppLocalizations.of(context).usersNotFound,
                    style: TextStyle(color: Colors.grey),
                  ),
                )
              else
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    itemCount: users.length,
                    itemBuilder: (_, i) => Card(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      elevation: 0,
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ListTile(
                        leading: Stack(
                          children: [
                            _buildAvatar(users[i].avatarUrl, users[i].username[0], userId: users[i].id),
                            if (_onlineUsers.contains(users[i].id))
                              Positioned(
                                right: 0,
                                bottom: 0,
                                child: Container(
                                  width: 12,
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: Colors.green,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Theme.of(context).colorScheme.surface, width: 2),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        title: Text(users[i].username, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(
                          _onlineUsers.contains(users[i].id) ? AppLocalizations.of(context).online : AppLocalizations.of(context).offline,
                          style: TextStyle(
                            color: _onlineUsers.contains(users[i].id) ? Colors.green : Colors.grey,
                            fontSize: 13,
                          ),
                        ),
                        trailing: Icon(Icons.arrow_forward_ios, size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
                        onTap: () async {
                          final chatId = await widget.api.createChat('direct', [users[i].id]);
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (chatId != null && mounted) {
                            _loadData();
                            _openChat(chatId, users[i].username);
                          }
                        },
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    ).whenComplete(() => _debounce?.cancel());
  }

  void _openChat(String chatId, String name) {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => ChatScreen(
              api: widget.api,
              chatId: chatId,
              chatName: name,
              onMessagesRead: () => _markChatAsRead(chatId),
            ),
          ),
        )
        .then((_) => _loadData());
  }

  String _getLastMessageDisplay(String? lastMessage, {String? keyType}) {
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
    
    return lastMessage;
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
          : _chats.isEmpty
          ? Center(child: Text(AppLocalizations.of(context).noChatsYet))
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView.builder(
                itemCount: _chats.length,
                itemBuilder: (_, i) {
                  final chat = _chats[i];
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
                    subtitle: Text(
                      _getLastMessageDisplay(chat.lastMessage, keyType: chat.lastMessageKeyType),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
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

  String _formatTime(int timestamp) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    final now = DateTime.now();
    if (date.day == now.day) {
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    }
    return '${date.day}/${date.month}';
  }
}
