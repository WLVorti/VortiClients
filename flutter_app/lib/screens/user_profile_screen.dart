import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/models.dart';

class UserProfileScreen extends StatefulWidget {
  final ApiService api;
  final String userId;

  const UserProfileScreen({super.key, required this.api, required this.userId});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  Profile? _profile;
  bool _isLoading = true;
  int _messageCount = 0;
  bool _isLoadingMessages = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadMessageCount();
  }

  Future<void> _loadProfile() async {
    final profile = await widget.api.getUserProfile(widget.userId);
    if (mounted) {
      setState(() {
        _profile = profile;
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMessageCount() async {
    setState(() => _isLoadingMessages = true);
    try {
      final chats = await widget.api.getChats();
      final chat = chats.firstWhere(
        (c) => c.participants.contains(widget.userId) && c.type == 'direct',
        orElse: () => chats.first,
      );
      if (chat.id.isNotEmpty) {
        final messages = await widget.api.getMessages(chat.id);
        if (mounted) {
          setState(() {
            _messageCount = messages.length;
            _isLoadingMessages = false;
          });
        }
      }
    } catch (e) {
      print('Load message count error: $e');
      if (mounted) setState(() => _isLoadingMessages = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _profile == null
              ? const Center(child: Text('User not found'))
              : SingleChildScrollView(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(height: 20),
                          CircleAvatar(
                            radius: 60,
                            backgroundColor: Theme.of(context).colorScheme.primary,
                            backgroundImage: (_profile!.avatarUrl != null &&
                                    _profile!.avatarUrl!.isNotEmpty)
                                ? NetworkImage(
                                    'http://77.34.76.27:3000${_profile!.avatarUrl}',
                                  )
                                : null,
                            child: (_profile!.avatarUrl == null ||
                                    _profile!.avatarUrl!.isEmpty)
                                ? Text(
                                    _profile!.username[0].toUpperCase(),
                                    style: const TextStyle(fontSize: 40),
                                  )
                                : null,
                          ),
                          const SizedBox(height: 24),
                          Text(
                            _profile!.displayName,
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.onSurface,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '@${_profile!.username}',
                            style: TextStyle(
                              fontSize: 16,
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                          ),
                          if (_profile!.bio != null &&
                              _profile!.bio!.isNotEmpty) ...[
                            const SizedBox(height: 24),
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Theme.of(
                                  context,
                                ).colorScheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                _profile!.bio!,
                                style: TextStyle(
                                  fontSize: 14,
                                  color: Theme.of(context).colorScheme.onSurface,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                          const SizedBox(height: 32),
                          Text(
                            'Joined ${_formatDate(_profile!.createdAt)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 16),
                          if (_isLoadingMessages)
                            const CircularProgressIndicator()
                          else
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                'Messages: $_messageCount',
                                style: TextStyle(
                                  fontSize: 14,
                                  color: Theme.of(context).colorScheme.onSurface,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
    );
  }

  String _formatDate(int timestamp) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    final months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }
}
