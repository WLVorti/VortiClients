import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/mute_service.dart';
import '../services/theme_provider.dart';
import '../models/models.dart';
import 'chat_screen.dart';
import 'auth_screen.dart';
import 'profile_screen.dart';
import 'user_profile_screen.dart';
import 'group_info_screen.dart';
import 'call_screen.dart';

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
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeInOut,
    );
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
          CallsTab(api: widget.api),
          ProfileTab(api: widget.api),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: _onTabTapped,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chats',
          ),
          NavigationDestination(
            icon: Icon(Icons.group_outlined),
            selectedIcon: Icon(Icons.group),
            label: 'Communities',
          ),
          NavigationDestination(
            icon: Icon(Icons.call_outlined),
            selectedIcon: Icon(Icons.call),
            label: 'Calls',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Account',
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

  Widget _buildAvatar(String? avatarUrl, String fallbackChar) {
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      final fullUrl = 'http://77.34.76.27:3000$avatarUrl';
      return CircleAvatar(
        backgroundImage: NetworkImage(fullUrl),
        onBackgroundImageError: (exception, stackTrace) {},
      );
    }
    return CircleAvatar(
      backgroundColor: Theme.of(context).colorScheme.primary,
      child: Text(fallbackChar.toUpperCase()),
    );
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

        if (senderId != currentUserId && !await MuteService.isMuted(chatId)) {
          setState(() {
            _unreadCounts[chatId] = (_unreadCounts[chatId] ?? 0) + 1;

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
                unreadCount: (_unreadCounts[chatId] ?? 0),
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
        title: const Text('Chats'),
        automaticallyImplyLeading: false,
        actions: [],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
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
                    ),
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
    
    _messageHandler = (msg) {
      final type = msg['type'];
      if (type == 'message' && mounted) {
        final chatId = msg['chatId'];
        final senderId = msg['userId'];
        final currentUserId = widget.api.userId;

        final index = _groups.indexWhere((c) => c.id == chatId);
        if (index != -1 && senderId != currentUserId) {
          MuteService.isMuted(chatId).then((muted) {
            if (!muted && mounted) {
              setState(() {
                _groupUnreadCounts[chatId] = (_groupUnreadCounts[chatId] ?? 0) + 1;
                _groups[index] = Chat(
                  id: _groups[index].id,
                  name: _groups[index].name,
                  type: _groups[index].type,
                  createdAt: _groups[index].createdAt,
                  lastMessage: msg['text'],
                  lastMessageAt: msg['timestamp'],
                  participants: _groups[index].participants,
                  unreadCount: (_groupUnreadCounts[chatId] ?? 0),
                  avatarUrl: _groups[index].avatarUrl,
                );
              });
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
      if (type == 'participant_added' || type == 'participant_removed' || type == 'group_name_changed') {
        _loadGroups();
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

  Widget _buildAvatar(String? avatarUrl, String fallbackChar) {
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      final fullUrl = 'http://77.34.76.27:3000$avatarUrl';
      return CircleAvatar(
        backgroundImage: NetworkImage(fullUrl),
        onBackgroundImageError: (exception, stackTrace) {},
      );
    }
    return CircleAvatar(
      backgroundColor: Theme.of(context).colorScheme.primary,
      child: Text(fallbackChar.toUpperCase()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Communities'),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadGroups),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
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
                        ),
                        title: Text(group.name ?? 'Group'),
                        subtitle: Text(
                          group.lastMessage ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
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
                            PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'info') {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => GroupInfoScreen(
                                    api: widget.api,
                                    chatId: group.id,
                                  ),
                                ),
                              );
                            }
                          },
                          itemBuilder: (_) => [
                            const PopupMenuItem(
                              value: 'info',
                              child: Text('Group info'),
                            ),
                          ],
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
      floatingActionButton: FloatingActionButton(
        onPressed: _createGroup,
        child: const Icon(Icons.add),
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
                        leading: _buildAvatar(user.avatarUrl, user.username[0]),
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
}

class CallsTab extends StatefulWidget {
  final ApiService api;

  const CallsTab({super.key, required this.api});

  @override
  State<CallsTab> createState() => _CallsTabState();
}

class _CallsTabState extends State<CallsTab> {
  bool _hasIncomingCall = false;
  String? _incomingCallId;
  String? _incomingCallerName;
  String? _incomingCallType;

  @override
  void initState() {
    super.initState();
    _setupCallHandlers();
  }

  void _setupCallHandlers() {
    widget.api.onIncomingCall = (callData) {
      if (mounted) {
        setState(() {
          _hasIncomingCall = true;
          _incomingCallId = callData['callId'] as String?;
          _incomingCallerName = callData['callerName'] as String?;
          _incomingCallType = callData['callType'] as String?;
        });
      }
    };

    widget.api.onCallEnded = (callId) {
      if (mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    };
  }

  void _acceptCall() async {
    if (_incomingCallId == null) return;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          api: widget.api,
          callId: _incomingCallId!,
          chatId: '',
          callerName: _incomingCallerName ?? 'Unknown',
          callType: _incomingCallType ?? 'video',
          isIncoming: true,
        ),
      ),
    );

    setState(() {
      _hasIncomingCall = false;
    });
  }

  void _rejectCall() async {
    if (_incomingCallId != null) {
      await widget.api.rejectCall(_incomingCallId!);
    }
    setState(() {
      _hasIncomingCall = false;
      _incomingCallId = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_hasIncomingCall && _incomingCallId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('Incoming call'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: Theme.of(context).colorScheme.primary,
                  child: Text(
                    (_incomingCallerName ?? 'U')[0].toUpperCase(),
                    style: const TextStyle(fontSize: 24),
                  ),
                ),
                const SizedBox(height: 12),
                Text(_incomingCallerName ?? 'Unknown'),
                Text(
                  _incomingCallType == 'video' ? 'Video call' : 'Audio call',
                  style: TextStyle(color: Colors.grey[600]),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: _rejectCall,
                child: const Text('Decline'),
              ),
              FilledButton(
                onPressed: _acceptCall,
                child: const Text('Accept'),
              ),
            ],
          ),
        );
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Calls'),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.call, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'No recent calls',
              style: TextStyle(fontSize: 18, color: Colors.grey),
            ),
            SizedBox(height: 8),
            Text(
              'Start a call from a chat',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
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
