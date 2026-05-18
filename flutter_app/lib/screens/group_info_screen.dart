import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import '../services/api_service.dart';
import '../models/models.dart';

class GroupInfoScreen extends StatefulWidget {
  final ApiService api;
  final String chatId;

  const GroupInfoScreen({
    super.key,
    required this.api,
    required this.chatId,
  });

  @override
  State<GroupInfoScreen> createState() => _GroupInfoScreenState();
}

class _GroupInfoScreenState extends State<GroupInfoScreen> {
  Map<String, dynamic>? _chatInfo;
  List<dynamic> _participants = [];
  bool _isLoading = true;
  String? _currentUserRole;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      print('Loading chat info for: ${widget.chatId}');
      final chatInfo = await widget.api.getChatInfo(widget.chatId);
      print('Chat info result: $chatInfo');
      final participants = await widget.api.getParticipants(widget.chatId);
      print('Participants result: $participants');
      if (mounted) {
        setState(() {
          _chatInfo = chatInfo;
          _participants = participants;
          _currentUserRole = chatInfo?['role'];
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error loading group info: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  bool get _isAdmin => _currentUserRole == 'admin' || _currentUserRole == 'owner';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_chatInfo?['name'] ?? 'Group'),
        actions: [
          if (_isAdmin)
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'rename') {
                  _showRenameDialog();
                } else if (value == 'delete') {
                  _showDeleteDialog();
                }
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: 'rename',
                  child: Text('Rename'),
                ),
                if (_currentUserRole == 'owner')
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text('Delete group'),
                  ),
              ],
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                _buildHeader(),
                const Divider(),
                _buildParticipantsSection(),
              ],
            ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          GestureDetector(
            onTap: _isAdmin ? _changeAvatar : null,
            child: Stack(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).colorScheme.primary,
                  backgroundImage: _chatInfo?['avatarUrl'] != null
                      ? NetworkImage('${ApiService.baseUrl}${_chatInfo!['avatarUrl']}?token=${widget.api.token}')
                      : null,
                  child: _chatInfo?['avatarUrl'] == null
                      ? Text(
                          (_chatInfo?['name'] ?? 'G')[0].toUpperCase(),
                          style: const TextStyle(fontSize: 32),
                        )
                      : null,
                ),
                if (_isAdmin)
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.edit, size: 16, color: Colors.white),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            _chatInfo?['name'] ?? 'Group',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            '${_participants.length} members',
            style: TextStyle(color: Colors.grey[600]),
          ),
          if (_currentUserRole != null) ...[
            const SizedBox(height: 8),
            Chip(
              label: Text(_currentUserRole!.toUpperCase()),
              backgroundColor: _currentUserRole == 'owner'
                  ? Colors.amber
                  : _currentUserRole == 'admin'
                      ? Colors.blue
                      : Colors.grey,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildParticipantsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Members',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              if (_isAdmin)
                IconButton(
                  icon: const Icon(Icons.person_add),
                  onPressed: _showAddParticipantDialog,
                ),
            ],
          ),
        ),
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: _participants.length,
          itemBuilder: (context, index) {
            final participant = _participants[index];
            final userId = participant['user_id'];
            final role = participant['role'];
            final username = participant['username'] ?? 'Unknown';

            return ListTile(
              leading: CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primary,
                child: Text(username[0].toUpperCase()),
              ),
              title: Text(username),
              subtitle: role != 'member' ? Text(role) : null,
              trailing: _isAdmin && role != 'owner'
                  ? PopupMenuButton<String>(
                      onSelected: (value) async {
                        if (value == 'remove') {
                          await _removeParticipant(userId);
                        } else if (value == 'admin' || value == 'member') {
                          await _setRole(userId, value);
                        }
                      },
                      itemBuilder: (_) => [
                        if (role != 'admin')
                          const PopupMenuItem(
                            value: 'admin',
                            child: Text('Make admin'),
                          ),
                        if (role == 'admin')
                          const PopupMenuItem(
                            value: 'member',
                            child: Text('Remove admin'),
                          ),
                        const PopupMenuItem(
                          value: 'remove',
                          child: Text('Remove'),
                        ),
                      ],
                    )
                  : null,
            );
          },
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.exit_to_app, color: Colors.red),
          title: const Text('Leave group', style: TextStyle(color: Colors.red)),
          onTap: _leaveGroup,
        ),
      ],
    );
  }

  void _showRenameDialog() {
    final controller = TextEditingController(text: _chatInfo?['name']);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename group'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'Group name',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              await widget.api.updateGroupName(widget.chatId, controller.text);
              if (mounted) {
                Navigator.pop(ctx);
                _loadData();
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showDeleteDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete group'),
        content: const Text('Are you sure you want to delete this group? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final errorMsg = await widget.api.deleteGroup(widget.chatId);
              if (mounted) {
                Navigator.pop(ctx);
                if (errorMsg == null) {
                  Navigator.pop(context);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(errorMsg),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _changeAvatar() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            if (_chatInfo?['avatarUrl'] != null)
              ListTile(
                leading: const Icon(Icons.delete),
                title: const Text('Remove photo'),
                onTap: () => Navigator.pop(ctx, 'remove'),
              ),
          ],
        ),
      ),
    );

    if (result == null) return;

    if (result == 'remove') {
      await widget.api.deleteGroupAvatar(widget.chatId);
      if (mounted) {
        _loadData();
      }
      return;
    }

    final file = await _pickImage();
    if (file != null) {
      final avatarUrl = await widget.api.uploadGroupAvatar(widget.chatId, file);
      if (avatarUrl != null && mounted) {
        _loadData();
      }
    }
  }

  Future<File?> _pickImage() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
    );
    if (result != null && result.files.single.path != null) {
      SystemChrome.setEnabledSystemUIMode(
        SystemUiMode.manual,
        overlays: SystemUiOverlay.values,
      );
      try {
        final croppedFile = await ImageCropper().cropImage(
          sourcePath: result.files.single.path!,
          aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
          compressQuality: 80,
          maxWidth: 512,
          maxHeight: 512,
          uiSettings: [
            AndroidUiSettings(
              toolbarTitle: 'Crop Avatar',
              toolbarColor: Theme.of(context).colorScheme.primary,
              toolbarWidgetColor: Colors.white,
              initAspectRatio: CropAspectRatioPreset.square,
              lockAspectRatio: true,
              statusBarColor: Theme.of(context).colorScheme.primary,
            ),
            IOSUiSettings(title: 'Crop Avatar', aspectRatioLockEnabled: true),
          ],
        );

        if (croppedFile == null) return null;
        return File(croppedFile.path);
      } finally {
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      }
    }
    return null;
  }

  void _showAddParticipantDialog() async {
    final searchController = TextEditingController();
    final users = <User>[];

    showModalBottomSheet(
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
            children: [
              const Text(
                'Add participant',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: searchController,
                decoration: const InputDecoration(
                  hintText: 'Search users...',
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) async {
                  if (value.length >= 2) {
                    final result = await widget.api.searchUsers(value);
                    if (ctx.mounted) {
                      setSheetState(() {
                          users.clear();
                          users.addAll(result);
                        });
                    }
                  }
                },
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 200,
                child: ListView.builder(
                  itemCount: users.length,
                  itemBuilder: (_, i) => ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      child: Text(users[i].username[0]),
                    ),
                    title: Text(users[i].username),
                    onTap: () async {
                      await widget.api.addParticipant(
                        widget.chatId,
                        users[i].id,
                      );
                      if (ctx.mounted) Navigator.pop(ctx);
                      _loadData();
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _removeParticipant(String userId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove participant?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await widget.api.removeParticipant(widget.chatId, userId);
      _loadData();
    }
  }

  Future<void> _setRole(String userId, String role) async {
    await widget.api.setParticipantRole(widget.chatId, userId, role);
    _loadData();
  }

  Future<void> _leaveGroup() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave group?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final errorMsg = await widget.api.leaveGroup(widget.chatId);
      if (mounted) {
        if (errorMsg == null) {
          Navigator.pop(context);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(errorMsg),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }
}