import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/mute_service.dart';
import '../services/theme_provider.dart';
import '../l10n/app_localizations.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/models.dart';
import '../utils/avatar_utils.dart';
import 'chat_screen.dart';
import 'auth_screen.dart';
import 'profile_screen.dart';
import 'user_profile_screen.dart';
import 'group_info_screen.dart';

class HomeScreen extends StatefulWidget {
  final ApiService api;

  const HomeScreen({super.key, required this.api});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  final PageController _pageController = PageController();

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _onTabTapped(int index) {
    setState(() => _currentIndex = index);
    _pageController.jumpToPage(index);
    imageCache.clear();
    imageCache.clearLiveImages();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PageView(
        controller: _pageController,
        onPageChanged: (index) => setState(() => _currentIndex = index),
        children: [
          ChatsTab(api: widget.api),
          CommunitiesTab(api: widget.api),
          ProfileTab(api: widget.api),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: _onTabTapped,
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: AppLocalizations.of(context).chats,
          ),
          NavigationDestination(
            icon: Icon(Icons.group_outlined),
            selectedIcon: Icon(Icons.group),
            label: AppLocalizations.of(context).communities,
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: AppLocalizations.of(context).account,
          ),
        ],
                    ),
    );
  }
}

class ChatsTab extends StatefulWidget {
  final ApiService api;

  const ChatsTab({super.key, required this.api});

  @override
  State<ChatsTab> createState() => _ChatsTabState();
}

class _ChatsTabState extends State<ChatsTab> with WidgetsBindingObserver {
  List<Chat> _chats = [];
  final Map<String, int> _unreadCounts = {};
  final Set<String> _onlineUsers = {};
  bool _isLoading = true;
  Function(Map<String, dynamic>)? _messageHandler;
  VoidCallback? _onlineHandler;
  final _searchController = TextEditingController();
  List<MessageSearchResult> _searchResults = [];
  bool _searchHasMore = false;
  bool _isSearching = false;
  Timer? _searchTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadData();
    _setupWebSocket();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (_messageHandler != null) {
      widget.api.removeMessageListener(_messageHandler!);
    }
    if (_onlineHandler != null) {
      widget.api.onOnlineUsersChanged = null;
    }
    _searchController.dispose();
    _searchTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);

    if (state == AppLifecycleState.resumed) {
      widget.api.reconnectWebSocket();
      _loadData();
    }
  }

  Future<void> _loadData() async {
    try {
      final chats = await widget.api.getChats();
      if (mounted) {
        setState(() {
          _chats = chats.where((c) => c.type == 'direct').toList();
          _isLoading = false;
        });

        final unread = await widget.api.getUnreadCounts();
        if (mounted) {
          setState(() {
            _unreadCounts.clear();
            _unreadCounts.addAll(unread);
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _onSearchChanged(String query) {
    _searchTimer?.cancel();
    if (query.trim().isEmpty) {
      setState(() {
        _isSearching = false;
        _searchResults = [];
        _searchHasMore = false;
      });
      return;
    }
    _isSearching = true;
    _searchTimer = Timer(const Duration(milliseconds: 400), () async {
      final result = await widget.api.searchMessages(query.trim());
      if (mounted) {
        setState(() {
          _searchResults = result['messages'] as List<MessageSearchResult>;
          _searchHasMore = result['hasMore'] as bool;
        });
      }
    });
  }

  Widget _buildAvatar(String? avatarUrl, String fallbackChar, {String? userId}) {
    final fallbackColor = userId != null ? colorFromId(userId) : Theme.of(context).colorScheme.primary;
    final initials = Text(fallbackChar.toUpperCase());
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      final fullUrl = 'https://wlvorti.ru:3000$avatarUrl';
      return Stack(
        children: [
          CircleAvatar(backgroundColor: fallbackColor, child: initials),
          CircleAvatar(
            backgroundColor: Colors.transparent,
            backgroundImage: CachedNetworkImageProvider(fullUrl),
            onBackgroundImageError: (_, __) {},
          ),
        ],
      );
    }
    return CircleAvatar(backgroundColor: fallbackColor, child: initials);
  }

  void _setupWebSocket() async {
    widget.api.connectWebSocket();
    
    // Sync local _onlineUsers with central onlineUsers
    _onlineUsers.clear();
    _onlineUsers.addAll(widget.api.onlineUsers);
    
    _onlineHandler = () {
      if (mounted) {
        setState(() {
          _onlineUsers.clear();
          _onlineUsers.addAll(widget.api.onlineUsers);
        });
      }
    };
    widget.api.onOnlineUsersChanged = _onlineHandler;
    
    _messageHandler = (msg) async {
      final type = msg['type'];

      if (type == 'message' && mounted) {
        final chatId = msg['chatId'];
        final senderId = msg['userId'];
        final currentUserId = widget.api.userId;

        if (senderId != currentUserId) {
          final muted = await MuteService.isMuted(chatId);
          setState(() {
            if (!muted) {
              _unreadCounts[chatId] = (_unreadCounts[chatId] ?? 0) + 1;
            }

            final index = _chats.indexWhere((c) => c.id == chatId);
            if (index != -1) {
              _chats[index] = Chat(
                id: _chats[index].id,
                name: _chats[index].name,
                type: _chats[index].type,
                createdAt: _chats[index].createdAt,
                lastMessage: msg['text'],
                lastMessageAt: msg['timestamp'],
                participants: _chats[index].participants,
                unreadCount: muted ? _chats[index].unreadCount : (_unreadCounts[chatId] ?? 0),
                avatarUrl: _chats[index].avatarUrl,
              );
            }
          });
        }
      }

      if (type == 'online' && mounted) {
        setState(() {
          _onlineUsers.clear();
          _onlineUsers.addAll(widget.api.onlineUsers);
        });
      }

      if (type == 'message_edited' || type == 'message_deleted') {
        _refreshChats();
      }
    };
    widget.api.addMessageListener(_messageHandler!);
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

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 16,
            right: 16,
            top: 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'New Chat',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: searchController,
                decoration: const InputDecoration(
                  hintText: 'Search users...',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (value) async {
                  if (value.length >= 2) {
                    final result = await widget.api.searchUsers(value);
                    setSheetState(() => users = result);
                  }
                },
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 200,
                child: ListView.builder(
                  itemCount: users.length,
                  itemBuilder: (_, i) => ListTile(
                    leading: GestureDetector(
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => UserProfileScreen(
                              api: widget.api,
                              userId: users[i].id,
                            ),
                          ),
                        );
                      },
                      child: Stack(
                        children: [
                          _buildAvatar(
                            users[i].avatarUrl,
                            users[i].username[0],
                            userId: users[i].id,
                          ),
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
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 2,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    title: Text(users[i].username),
                    subtitle: _onlineUsers.contains(users[i].id)
                        ? const Text(
                            'Online',
                            style: TextStyle(color: Colors.green),
                          )
                        : const Text(
                            'Offline',
                            style: TextStyle(color: Colors.grey),
                          ),
                    onTap: () async {
                      final chatId = await widget.api.createChat('direct', [
                        users[i].id,
                      ]);
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (chatId != null && mounted) {
                        _loadData();
                        _openChat(
                          chatId,
                          users[i].username,
                          avatarUrl: users[i].avatarUrl,
                          otherUserId: users[i].id,
                        );
                      }
                    },
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  void _openChat(
    String chatId,
    String name, {
    String? avatarUrl,
    String? otherUserId,
    bool initialOnline = false,
  }) {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => ChatScreen(
              api: widget.api,
              chatId: chatId,
              chatName: name,
              avatarUrl: avatarUrl,
              otherUserId: otherUserId,
              initialOnline: initialOnline,
              chatType: 'direct',
              onMessagesRead: () => _markChatAsRead(chatId),
            ),
          ),
        )
        .then((_) => _loadData());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).chats),
        automaticallyImplyLeading: false,
        actions: [],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search messages...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
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
                : _isSearching && _searchController.text.trim().isNotEmpty
                    ? _searchResults.isEmpty
                        ? const Center(child: Text('No messages found'))
                        : RefreshIndicator(
                            onRefresh: () async => _onSearchChanged(_searchController.text),
                            child: ListView.builder(
                              itemCount: _searchResults.length + (_searchHasMore ? 1 : 0),
                              itemBuilder: (_, i) {
                                if (i == _searchResults.length) {
                                  return const Center(child: CircularProgressIndicator());
                                }
                                final r = _searchResults[i];
                                return ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: colorFromId(r.chatId),
                                    child: Text(r.chatName[0].toUpperCase()),
                                  ),
                                  title: Text(
                                    r.chatName,
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  subtitle: Text(
                                    '${r.senderName}: ${r.text}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  trailing: Text(
                                    _formatTime(r.createdAt),
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                  onTap: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => ChatScreen(
                                          api: widget.api,
                                          chatId: r.chatId,
                                          chatName: r.chatName,
                                        ),
                                      ),
                                    );
                                  },
                                );
                              },
                            ),
                          )
                    : _chats.isEmpty
                        ? const Center(child: Text('No chats yet'))
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              itemCount: _chats.length,
                              itemBuilder: (_, i) {
                                final chat = _chats[i];
                                final unread = _unreadCounts[chat.id] ?? 0;
                                final currentUserId = widget.api.userId;
                                final otherUserId = chat.participants.firstWhere(
                                  (p) => p != currentUserId,
                                  orElse: () => chat.participants.first,
                                );
                                return ListTile(
                                  leading: GestureDetector(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => UserProfileScreen(
                                            api: widget.api,
                                            userId: otherUserId,
                                          ),
                                        ),
                                      );
                                    },
                                    child: Stack(
                                      children: [
                                        _buildAvatar(
                                          chat.avatarUrl,
                                          chat.name?[0].toUpperCase() ??
                                              chat.participants.first[0].toUpperCase(),
                                          userId: chat.id,
                                        ),
                                        if (chat.isOnline ||
                                            _onlineUsers.contains(otherUserId))
                                          Positioned(
                                            right: 0,
                                            bottom: 0,
                                            child: Container(
                                              width: 12,
                                              height: 12,
                                              decoration: BoxDecoration(
                                                color: Colors.green,
                                                shape: BoxShape.circle,
                                                border: Border.all(
                                                  color: Colors.white,
                                                  width: 2,
                                                ),
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  title: Text(chat.name ?? 'Chat'),
                                  subtitle: Text(
                                    chat.lastMessage ?? '',
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
                                  onTap: () => _openChat(
                                    chat.id,
                                    chat.name ?? 'Chat',
                                    avatarUrl: chat.avatarUrl,
                                    otherUserId: otherUserId,
                                    initialOnline: chat.isOnline || _onlineUsers.contains(otherUserId),
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
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

class CommunitiesTab extends StatefulWidget {
  final ApiService api;

  const CommunitiesTab({super.key, required this.api});

  @override
  State<CommunitiesTab> createState() => _CommunitiesTabState();
}

class _CommunitiesTabState extends State<CommunitiesTab> {
  List<Chat> _groups = [];
  bool _isLoading = true;
  final Set<String> _onlineUsers = {};
  Map<String, int> _groupUnreadCounts = {};
  Function(Map<String, dynamic>)? _messageHandler;
  VoidCallback? _onlineHandler;
  final _searchController = TextEditingController();
  List<MessageSearchResult> _searchResults = [];
  bool _searchHasMore = false;
  bool _isSearching = false;
  Timer? _searchTimer;

  @override
  void initState() {
    super.initState();
    _onlineUsers.clear();
    _onlineUsers.addAll(widget.api.onlineUsers);
    _loadGroups();
    _setupWebSocket();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchTimer?.cancel();
    if (_messageHandler != null) {
      widget.api.removeMessageListener(_messageHandler!);
    }
    if (_onlineHandler != null) {
      if (widget.api.onOnlineUsersChanged == _onlineHandler) {
        widget.api.onOnlineUsersChanged = null;
      }
    }
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _searchTimer?.cancel();
    if (query.trim().isEmpty) {
      setState(() {
        _isSearching = false;
        _searchResults = [];
        _searchHasMore = false;
      });
      return;
    }
    _isSearching = true;
    _searchTimer = Timer(const Duration(milliseconds: 400), () async {
      final result = await widget.api.searchMessages(query.trim());
      if (mounted) {
        setState(() {
          _searchResults = result['messages'] as List<MessageSearchResult>;
          _searchHasMore = result['hasMore'] as bool;
        });
      }
    });
  }

  void _setupWebSocket() async {
    _onlineHandler = () {
      if (mounted) {
        setState(() {
          _onlineUsers.clear();
          _onlineUsers.addAll(widget.api.onlineUsers);
        });
      }
    };
    widget.api.onOnlineUsersChanged = _onlineHandler;
    
    _messageHandler = (msg) async {
      final type = msg['type'];
      if (type == 'message' && mounted) {
        final chatId = msg['chatId'];
        final senderId = msg['userId'];
        final currentUserId = widget.api.userId;
        final index = _groups.indexWhere((c) => c.id == chatId);

        if (index != -1 && senderId != currentUserId) {
          final muted = await MuteService.isMuted(chatId);
          if (!mounted) return;
          setState(() {
            if (!muted) {
              _groupUnreadCounts[chatId] = (_groupUnreadCounts[chatId] ?? 0) + 1;
            }
            _groups[index] = Chat(
              id: _groups[index].id,
              name: _groups[index].name,
              type: _groups[index].type,
              createdAt: _groups[index].createdAt,
              lastMessage: msg['text'],
              lastMessageAt: msg['timestamp'],
              participants: _groups[index].participants,
              unreadCount: muted ? _groups[index].unreadCount : (_groupUnreadCounts[chatId] ?? 0),
              avatarUrl: _groups[index].avatarUrl,
            );
          });
        }
      }
    };
    widget.api.addMessageListener(_messageHandler!);
  }

  Future<void> _loadGroups() async {
    try {
      final chats = await widget.api.getChats();
      if (mounted) {
        setState(() {
          _groups = chats.where((c) => c.type == 'group').toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Widget _buildAvatar(String? avatarUrl, String fallbackChar, {String? userId}) {
    final fallbackColor = userId != null ? colorFromId(userId) : Theme.of(context).colorScheme.primary;
    final initials = Text(fallbackChar.toUpperCase());
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      final fullUrl = 'https://wlvorti.ru:3000$avatarUrl';
      return Stack(
        children: [
          CircleAvatar(backgroundColor: fallbackColor, child: initials),
          CircleAvatar(
            backgroundColor: Colors.transparent,
            backgroundImage: CachedNetworkImageProvider(fullUrl),
            onBackgroundImageError: (_, __) {},
          ),
        ],
      );
    }
    return CircleAvatar(backgroundColor: fallbackColor, child: initials);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).communities),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadGroups),
          IconButton(icon: const Icon(Icons.add), onPressed: _createGroup),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search messages...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
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
                : _isSearching && _searchController.text.trim().isNotEmpty
                    ? _searchResults.isEmpty
                        ? const Center(child: Text('No messages found'))
                        : RefreshIndicator(
                            onRefresh: () async => _onSearchChanged(_searchController.text),
                            child: ListView.builder(
                              itemCount: _searchResults.length + (_searchHasMore ? 1 : 0),
                              itemBuilder: (_, i) {
                                if (i == _searchResults.length) {
                                  return const Center(child: CircularProgressIndicator());
                                }
                                final r = _searchResults[i];
                                return ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: colorFromId(r.chatId),
                                    child: Text(r.chatName[0].toUpperCase()),
                                  ),
                                  title: Text(
                                    r.chatName,
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  subtitle: Text(
                                    '${r.senderName}: ${r.text}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  trailing: Text(
                                    _formatTime(r.createdAt),
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                  onTap: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => ChatScreen(
                                          api: widget.api,
                                          chatId: r.chatId,
                                          chatName: r.chatName,
                                        ),
                                      ),
                                    );
                                  },
                                );
                              },
                            ),
                          )
                    : _groups.isEmpty
                        ? const Center(child: Text('No communities yet'))
                        : RefreshIndicator(
                            onRefresh: _loadGroups,
                            child: ListView.builder(
                              itemCount: _groups.length,
                              itemBuilder: (_, i) {
                                final group = _groups[i];
                                final unread = _groupUnreadCounts[group.id] ?? 0;
                                return ListTile(
                                  leading: _buildAvatar(
                                    group.avatarUrl,
                                    group.name?[0].toUpperCase() ?? 'G',
                                    userId: group.id,
                                  ),
                                  title: Text(
                                    group.name ?? 'Group',
                                    style: TextStyle(
                                      color: Theme.of(context).colorScheme.primary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  subtitle: Text(
                                    group.lastMessage ?? '',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      if (unread > 0)
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
                                  ),
                                  onTap: () {
                                    setState(() {
                                      _groupUnreadCounts[group.id] = 0;
                                    });
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => ChatScreen(
                                          api: widget.api,
                                          chatId: group.id,
                                          chatName: group.name ?? 'Group',
                                          avatarUrl: group.avatarUrl,
                                          chatType: 'group',
                                        ),
                                      ),
                                    );
                                  },
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Future<void> _createGroup() async {
    final nameController = TextEditingController();
    final searchController = TextEditingController();
    List<User> users = [];
    final selectedUsers = <String>{};

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 16,
            right: 16,
            top: 16,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(ctx).size.height * 0.7,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'New Community',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    hintText: 'Community name...',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.group),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: searchController,
                  decoration: const InputDecoration(
                    hintText: 'Add members...',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (value) async {
                    if (value.length >= 2) {
                      try {
                        final result = await widget.api.searchUsers(value);
                        if (ctx.mounted) {
                          setSheetState(() => users = result);
                        }
                      } catch (e) {
                        // ignore search errors
                      }
                    }
                  },
                ),
                const SizedBox(height: 8),
                if (selectedUsers.isNotEmpty) ...[
                  Wrap(
                    spacing: 8,
                    children: selectedUsers.map((id) {
                      final user = users.firstWhere((u) => u.id == id, orElse: () => User(id: id, username: 'User', createdAt: 0));
                      return Chip(
                        label: Text(user.username),
                        onDeleted: () {
                          setSheetState(() => selectedUsers.remove(id));
                        },
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 8),
                ],
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: users.length,
                    itemBuilder: (_, i) {
                      final user = users[i];
                      final isSelected = selectedUsers.contains(user.id);
                      return ListTile(
                        leading: _buildAvatar(user.avatarUrl, user.username[0], userId: user.id),
                        title: Text(user.username),
                        trailing: isSelected
                            ? const Icon(Icons.check_circle, color: Colors.green)
                            : const Icon(Icons.add_circle_outline),
                        onTap: () {
                          setSheetState(() {
                            if (isSelected) {
                              selectedUsers.remove(user.id);
                            } else {
                              selectedUsers.add(user.id);
                            }
                          });
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: selectedUsers.isEmpty || nameController.text.isEmpty
                        ? null
                        : () async {
                            final groupId = await widget.api.createChat(
                              'group',
                              selectedUsers.toList(),
                              name: nameController.text,
                            );
                            if (ctx.mounted) Navigator.pop(ctx);
                            if (groupId != null && mounted) {
                              _loadGroups();
                            }
                          },
                    child: const Text('Create Community'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
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


class ProfileTab extends StatelessWidget {
  final ApiService api;

  const ProfileTab({super.key, required this.api});

  @override
  Widget build(BuildContext context) {
    return ProfileScreen(api: api);
  }
}
