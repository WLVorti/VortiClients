import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';
import 'package:just_audio/just_audio.dart';
import 'package:audio_waveforms/audio_waveforms.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../utils/avatar_utils.dart';
import '../services/api_service.dart';
import '../services/message_cache.dart';
import '../services/mute_service.dart';
import '../models/models.dart';
import '../widgets/falling_icons_background.dart';
import 'user_profile_screen.dart';
import 'group_info_screen.dart';
import 'image_viewer_screen.dart';

const int _maxMessageLength = 10000;

class ChatScreen extends StatefulWidget {
  final ApiService api;
  final String chatId;
  final String chatName;
  final String? avatarUrl;
  final String? otherUserId;
  final String chatType;
  final bool initialOnline;
  final VoidCallback? onMessagesRead;

  const ChatScreen({
    super.key,
    required this.api,
    required this.chatId,
    required this.chatName,
    this.avatarUrl,
    this.otherUserId,
    this.chatType = 'direct',
    this.initialOnline = false,
    this.onMessagesRead,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final _editController = TextEditingController();
  List<Message> _messages = [];
  bool _isLoading = true;
  bool _messagesLoaded = false;
  bool _hasOlderMessages = false;
  bool _isLoadingMore = false;
  bool _isUploading = false;
  bool _isEditing = false;
  bool _isOtherTyping = false;
  bool _isOtherOnline = false;
  String? _editingMessageId;
  String? _replyToMessageId;
  Message? _replyToMessage;
  late final String _currentUserId;
  final Set<String> _readMessages = {};
  final Set<String> _onlineUsers = {};
  final Set<String> _pendingMessageIds = {};
  final Map<String, Timer> _pendingMessageTimers = {};
  Timer? _draftDebounce;
  Timer? _readDebounce;
  final Set<String> _pendingReadIds = {};
  bool _isAppActive = true;
  bool _isRecording = false;
  DateTime? _recordingStartTime;
  RecorderController? _recorderController;
  String? _recordingPath;
  int _recordingSeconds = 0;
  Timer? _recordingTimer;
  final Map<String, String> _participantNames = {};
  bool _isMuted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _currentUserId = widget.api.userId ?? '';
    _loadCachedMessages();
    _loadMessages();
    _loadDraft();
    _loadMuteStatus();
    widget.api.addMessageListener(_handleMessage);
    _scrollController.addListener(_onScroll);
    if (widget.chatType == 'group') {
      _loadParticipantNames();
    }
  }

  Future<void> _loadCachedMessages() async {
    try {
      final cached = await MessageCache.getMessages(widget.chatId);
      if (cached.isEmpty || !mounted) return;
      setState(() {
        for (final m in cached.reversed) {
          if (!_messages.any((e) => e.id == m.id)) {
            _messages.add(m);
          }
        }
        if (!_messagesLoaded) {
          _isLoading = false;
        }
      });
    } catch (_) {}
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_isLoadingMore || !_hasOlderMessages) return;
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      _loadMoreMessages();
    }
    if (_isNearBottom && _pendingReadIds.isNotEmpty) {
      _flushReadReceipts();
    }
  }

  void _scheduleReadReceipts() {
    _readDebounce?.cancel();
    _readDebounce = Timer(const Duration(seconds: 1), () {
      if (!_isAppActive || !_scrollController.hasClients) return;
      if (_isNearBottom) {
        _flushReadReceipts();
      }
    });
  }

  void _flushReadReceipts() {
    if (_pendingReadIds.isEmpty) return;
    if (!_isNearBottom) return;
    for (final id in _pendingReadIds) {
      widget.api.sendRead(id);
      _readMessages.add(id);
    }
    _pendingReadIds.clear();
    widget.onMessagesRead?.call();
  }

  Future<void> _loadMuteStatus() async {
    final muted = await MuteService.isMuted(widget.chatId);
    if (mounted && _isMuted != muted) {
      setState(() {
        _isMuted = muted;
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);

    if (state == AppLifecycleState.resumed) {
      _isAppActive = true;
      widget.api.reconnectWebSocket();
      _refreshMessageStatus();
    }
    
    if (state == AppLifecycleState.paused) {
      _isAppActive = false;
      _readDebounce?.cancel();
      _pendingReadIds.clear();
      widget.api.sendPing();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.otherUserId != null) {
      setState(() {
        _isOtherOnline = widget.api.isUserOnline(widget.otherUserId!) || widget.initialOnline;
      });
    }
  }

  Future<void> _loadDraft() async {
    final draft = await widget.api.getDraft(widget.chatId);
    if (draft != null && draft.isNotEmpty && mounted) {
      _messageController.text = draft;
    }
  }

  Future<void> _saveDraft() async {
    final text = _messageController.text.trim();
    if (text.isNotEmpty) {
      await widget.api.saveDraft(widget.chatId, text);
    } else {
      await widget.api.clearDraft(widget.chatId);
    }
  }

  Future<void> _clearDraft() async {
    await widget.api.clearDraft(widget.chatId);
  }

  Future<void> _startRecording() async {
    final status = await Permission.microphone.request();
    if (status != PermissionStatus.granted) {
      _showSnackBar('Microphone permission denied');
      return;
    }

    try {
      final dir = await getTemporaryDirectory();
      _recordingPath =
          '${dir.path}/${DateTime.now().millisecondsSinceEpoch}.m4a';

      _recorderController = RecorderController()
        ..androidEncoder = AndroidEncoder.aac
        ..androidOutputFormat = AndroidOutputFormat.mpeg4
        ..iosEncoder = IosEncoder.kAudioFormatMPEG4AAC
        ..bitRate = 128000
        ..sampleRate = 44100;

      await _recorderController!.record(path: _recordingPath);

      setState(() {
        _isRecording = true;
        _recordingStartTime = DateTime.now();
        _recordingSeconds = 0;
      });

      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (mounted && _isRecording) {
          setState(() {
            _recordingSeconds++;
          });
        }
      });
    } catch (e) {
      ApiService.addLog('_startRecording: error=$e');
      _showSnackBar('Failed to start recording');
    }
  }

  Future<void> _stopRecording() async {
    if (_recorderController == null || !_isRecording) return;

    _recordingTimer?.cancel();
    _recordingTimer = null;

    try {
      await _recorderController!.stop();
      setState(() {
        _isRecording = false;
        _recordingSeconds = 0;
      });

      final path = _recordingPath;
      if (path != null && path.isNotEmpty) {
        final file = File(path);
        if (await file.exists()) {
          setState(() => _isUploading = true);

          final uploadResult = await widget.api.uploadFile(file);
          if (uploadResult != null) {
            ApiService.addLog('_stopRecording: uploadFile succeeded fileId=${uploadResult['fileId']} path=$path');
            widget.api.sendFile(
              widget.chatId,
              uploadResult['fileId']!,
              mimeType: uploadResult['mimeType'],
            );
          } else {
            ApiService.addLog('_stopRecording: uploadFile returned null for path=$path');
            _showSnackBar('Upload failed');
          }

          setState(() => _isUploading = false);
        }
      }
    } catch (e) {
      ApiService.addLog('_stopRecording: error=$e path=$_recordingPath');
      setState(() => _isRecording = false);
      _showSnackBar('Failed to send voice message');
    }

    _recorderController = null;
  }

  void _handleMessage(Map<String, dynamic> msg) {
    final type = msg['type'];

    if (type == 'message' && msg['chatId'] == widget.chatId) {
      // Cancel pending timer FIRST, before any state mutation,
      // to ensure the 5s "Failed to send" error never fires for a delivered message
      if (msg['userId'] == _currentUserId) {
        final confirmedTempId = msg['tempId'] as String?;
        ApiService.addLog('_handleMessage: confirmed msgId=${msg['id']} tempId=$confirmedTempId');
        if (confirmedTempId != null) {
          _pendingMessageTimers[confirmedTempId]?.cancel();
          _pendingMessageTimers.remove(confirmedTempId);
          _pendingMessageIds.remove(confirmedTempId);
        }
      }

      final replyData = msg['reply'] as Map<String, dynamic>?;

      final message = Message.fromJson({
        'id': msg['id'],
        'chat_id': msg['chatId'],
        'user_id': msg['userId'],
        'text': msg['text'],
        'file_id': msg['fileId'],
        'reply': replyData,
        'created_at': msg['timestamp'],
      });

      if (_messages.any((m) => m.id == message.id)) {
        return;
      }

      if (message.userId != _currentUserId) {
        _pendingReadIds.add(message.id);
        _scheduleReadReceipts();
      }

      MessageCache.saveMessage(message);

      if (mounted) {
        setState(() {
          _messages.add(message);
        });
      }

      _scrollToBottom(force: message.userId == _currentUserId);
    }

    if (type == 'error') {
      final errorMsg = msg['message'] as String? ?? 'Send failed';
      final failedMsgId = msg['tempId'] as String?;
      
      ApiService.addLog('_handleMessage: server error chatId=${widget.chatId} tempId=$failedMsgId error=$errorMsg');
      
      // Restore failed message text
      final failedText = msg['text'] as String?;
      final failedReplyTo = msg['replyTo'] as String?;
      
      if (failedMsgId != null) {
        _pendingMessageTimers[failedMsgId]?.cancel();
        _pendingMessageTimers.remove(failedMsgId);
        _pendingMessageIds.remove(failedMsgId);
      }
      
      if (failedText != null && mounted) {
        _messageController.text = failedText;
        if (failedReplyTo != null) {
          setState(() {
            _replyToMessageId = failedReplyTo;
            final msgObj = _messages.firstWhere(
              (m) => m.id == failedReplyTo,
              orElse: () => Message(
                id: '',
                chatId: '',
                userId: '',
                text: '',
                createdAt: 0,
              ),
            );
            _replyToMessage = msgObj.id.isNotEmpty ? msgObj : null;
          });
        }
      }
      if (failedMsgId != null) {
        _showSnackBar('Failed to send: $errorMsg');
      }
    }

    if (type == 'message_edited' && msg['chatId'] == widget.chatId) {
      setState(() {
        final index = _messages.indexWhere((m) => m.id == msg['messageId']);
        if (index != -1) {
          _messages[index] = _messages[index].copyWith(
            text: msg['newText'] ?? _messages[index].text,
            isEdited: true,
          );
        }
      });
    }

    if (type == 'message_deleted' && msg['chatId'] == widget.chatId) {
      setState(() {
        final index = _messages.indexWhere((m) => m.id == msg['messageId']);
        if (index != -1) {
          _messages[index] = _messages[index].copyWith(text: '[deleted]');
          MessageCache.saveMessage(_messages[index]);
        }
      });
    }

    if (type == 'online') {
      final userId = msg['userId'];
      final isOnline = msg['status'] == 'online';

      if (userId == widget.otherUserId) {
        setState(() {
          _isOtherOnline = isOnline;
        });
      }
    }

    if (type == 'online_users' && widget.otherUserId != null) {
      setState(() {
        _isOtherOnline = widget.api.isUserOnline(widget.otherUserId!);
      });
    }

    if (type == 'delivered') {
      final messageId = msg['messageId'];
      final index = _messages.indexWhere(
        (m) => m.id == messageId && m.userId == _currentUserId,
      );
      if (index != -1) {
        setState(() {
          _messages[index] = _messages[index].copyWith(
            status: MessageStatus.delivered,
          );
        });
        MessageCache.saveMessage(_messages[index]);
      }
    }

    if (type == 'read' && msg['userId'] != _currentUserId) {
      final messageId = msg['messageId'];
      final index = _messages.indexWhere(
        (m) => m.id == messageId && m.userId == _currentUserId,
      );
      if (index != -1) {
        setState(() {
          _messages[index] = _messages[index].copyWith(
            status: MessageStatus.read,
          );
        });
        MessageCache.saveMessage(_messages[index]);
      }
      setState(() {
        _readMessages.add(messageId);
      });
    }

    if (type == 'typing' && msg['chatId'] == widget.chatId) {
      if (msg['userId'] != _currentUserId) {
        setState(() {
          _isOtherTyping = msg['isTyping'] == true;
        });

        if (msg['isTyping'] == true) {
          Future.delayed(const Duration(seconds: 3), () {
            if (mounted) {
              setState(() => _isOtherTyping = false);
            }
          });
        }
      }
    }
  }

  Future<void> _loadMessages() async {
    if (_messagesLoaded) return;
    try {
      final messages = await widget.api.getMessages(widget.chatId);
      if (mounted) {
        setState(() {
          for (final m in messages) {
            final index = _messages.indexWhere((existing) => existing.id == m.id);
            if (index != -1) {
              if (m.status.index > _messages[index].status.index) {
                _messages[index] = _messages[index].copyWith(status: m.status);
              }
            } else {
              _messages.add(m);
            }
          }
          _isLoading = false;
          _messagesLoaded = true;
          _hasOlderMessages = messages.length >= 50;

          for (final m in messages) {
            if (m.userId != _currentUserId && !_readMessages.contains(m.id)) {
              _pendingReadIds.add(m.id);
            }
          }
          final hasUnread = _pendingReadIds.isNotEmpty;
          if (hasUnread) {
            widget.onMessagesRead?.call();
          }
        });

        MessageCache.saveMessages(widget.chatId, messages);

        WidgetsBinding.instance.addPostFrameCallback((_) {
          _scrollToBottom(force: true);
          if (_pendingReadIds.isNotEmpty) {
            _scheduleReadReceipts();
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _refreshMessageStatus() async {
    try {
      final messages = await widget.api.getMessages(widget.chatId, limit: 50);
      if (!mounted) return;
      setState(() {
        for (final m in messages) {
          final index = _messages.indexWhere((existing) => existing.id == m.id);
          if (index != -1 && m.status.index > _messages[index].status.index) {
            _messages[index] = _messages[index].copyWith(status: m.status);
            MessageCache.saveMessage(_messages[index]);
          }
        }
      });
    } catch (_) {}
  }

  Future<void> _loadMoreMessages() async {
    if (_isLoadingMore || !_hasOlderMessages) return;
    _isLoadingMore = true;
    final oldest = _messages.isEmpty ? null : _messages.first.createdAt;
    try {
      final messages = await widget.api.getMessages(widget.chatId, before: oldest, limit: 50);
      if (mounted) {
        setState(() {
          _hasOlderMessages = messages.length >= 50;
          final toInsert = <Message>[];
          for (final m in messages) {
            if (!_messages.any((existing) => existing.id == m.id)) {
              toInsert.add(m);
            }
          }
          if (toInsert.isNotEmpty) {
            _messages.insertAll(0, toInsert);
          }
          _isLoadingMore = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoadingMore = false);
    }
  }

  Future<void> _loadParticipantNames() async {
    try {
      final participants = await widget.api.getParticipants(widget.chatId);
      if (mounted) {
        for (final p in participants) {
          _participantNames[p['user_id'] as String] = p['username'] as String? ?? 'Unknown';
        }
        setState(() {});
      }
    } catch (_) {}
  }

  void _scrollToBottom({bool force = false}) {
    if (!force && !_isNearBottom) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.jumpTo(0.0);
    });
  }

  void _scrollToBottomOnLoad() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) {
        Future.delayed(const Duration(milliseconds: 100), _scrollToBottomOnLoad);
        return;
      }
      _scrollController.jumpTo(0.0);
    });
  }

  bool get _isNearBottom {
    if (!_scrollController.hasClients) return false;
    final pos = _scrollController.position;
    return pos.pixels <= 100;
  }

  void _sendMessage() {
    if (_isEditing) {
      _saveEdit();
      return;
    }

    final text = _messageController.text.trim();
    if (text.isEmpty && _replyToMessageId == null) return;

    if (text.length > _maxMessageLength) {
      _showSnackBar('Сообщение слишком длинное (макс. $_maxMessageLength символов)');
      return;
    }

    final replyTo = _replyToMessageId;
    final pendingId = DateTime.now().millisecondsSinceEpoch.toString();

    _pendingMessageIds.add(pendingId);

    widget.api.sendMessage(widget.chatId, text, replyTo: replyTo, tempId: pendingId);

    _draftDebounce?.cancel();
    _messageController.clear();
    _cancelReply();
    _clearDraft();

    _pendingMessageTimers[pendingId]?.cancel();
    _pendingMessageTimers[pendingId] = Timer(const Duration(seconds: 5), () async {
      if (!mounted) return;
      _pendingMessageTimers.remove(pendingId);
      
      final wasPending = _pendingMessageIds.remove(pendingId);
      ApiService.addLog('_sendMessage: timer fired chatId=${widget.chatId} pendingId=$pendingId wasPending=$wasPending');
      if (!wasPending) return;

      // If WS dropped before the confirmation arrived, verify delivery via REST
      try {
        final recent = await widget.api.getMessages(widget.chatId, limit: 10);
        final chatTimestamp = DateTime.now().millisecondsSinceEpoch;
        final delivered = recent.any((m) =>
          m.userId == _currentUserId &&
          m.text == text &&
          (chatTimestamp - m.createdAt).abs() < 60000);
        if (delivered) {
          ApiService.addLog('_sendMessage: message verified delivered via REST, suppressing error');
          _refreshMessageStatus();
          return;
        }
      } catch (_) {}

      _messageController.text = text;
      if (replyTo != null) {
        setState(() {
          _replyToMessageId = replyTo;
          final msg = _messages.firstWhere(
            (m) => m.id == replyTo,
            orElse: () => Message(
              id: '',
              chatId: '',
              userId: '',
              text: '',
              createdAt: 0,
            ),
          );
          _replyToMessage = msg.id.isNotEmpty ? msg : null;
        });
      }
      _showSnackBar('Failed to send message');
    });
  }

  void _startReply(Message msg) {
    setState(() {
      _replyToMessageId = msg.id;
      _replyToMessage = msg;
    });
  }

  void _cancelReply() {
    setState(() {
      _replyToMessageId = null;
      _replyToMessage = null;
    });
  }

  void _startEdit(Message msg) {
    setState(() {
      _isEditing = true;
      _editingMessageId = msg.id;
      _editController.text = msg.text;
      _messageController.text = msg.text;
    });
  }

  void _saveEdit() async {
    final newText = _messageController.text.trim();
    if (newText.isEmpty || _editingMessageId == null) return;

    if (newText.length > _maxMessageLength) {
      _showSnackBar('Сообщение слишком длинное (макс. $_maxMessageLength символов)');
      return;
    }

    final success = await widget.api.editMessage(_editingMessageId!, newText);
    if (success) {
      setState(() {
        final index = _messages.indexWhere((m) => m.id == _editingMessageId);
        if (index != -1) {
          _messages[index] = _messages[index].copyWith(
            text: newText,
            isEdited: true,
          );
        }
      });
    }

    _cancelEdit();
  }

  void _cancelEdit() {
    setState(() {
      _isEditing = false;
      _editingMessageId = null;
      _messageController.clear();
      _editController.clear();
    });
  }

  void _deleteMessage(Message msg) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete message?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final success = await widget.api.deleteMessage(msg.id);
      if (success) {
        setState(() {
          final index = _messages.indexWhere((m) => m.id == msg.id);
          if (index != -1) {
            _messages[index] = _messages[index].copyWith(text: '[deleted]');
            MessageCache.saveMessage(_messages[index]);
          }
        });
      }
    }
  }

  void _showAttachmentOptions() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromGallery();
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Camera'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromCamera();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: const Text('File'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFile();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickFromGallery() async {
    try {
      if (await _requestGalleryPermission() == false) return;
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (picked != null) {
        await _uploadFile(File(picked.path));
      }
    } catch (e) {
      _showSnackBar('Error picking from gallery');
    }
  }

  Future<void> _pickFromCamera() async {
    try {
      final status = await Permission.camera.request();
      if (status.isDenied || status.isPermanentlyDenied) {
        _showSnackBar('Camera permission is required');
        return;
      }
      final picked = await ImagePicker().pickImage(source: ImageSource.camera);
      if (picked != null) {
        await _uploadFile(File(picked.path));
      }
    } catch (e) {
      _showSnackBar('Error taking photo');
    }
  }

  Future<bool> _requestGalleryPermission() async {
    try {
      if (await Permission.storage.isGranted) return true;
      final status = await Permission.storage.request();
      if (status.isGranted) return true;
      if (status.isPermanentlyDenied) {
        _showSnackBar('Storage permission is required to access gallery');
        return false;
      }
    } catch (_) {
      // On Android 13+ Permission.storage may not be available;
      // image_picker uses the system photo picker which needs no permission.
    }
    return true;
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.any,
        allowMultiple: false,
      );
      if (result != null && result.files.single.path != null) {
        await _uploadFile(File(result.files.single.path!));
      }
    } catch (e) {
      _showSnackBar('Error selecting file');
    }
  }

  Future<void> _uploadFile(File file) async {
    try {
      final fileSize = await file.length();
      if (fileSize > 10 * 1024 * 1024) {
        _showSnackBar('File too large (max 10MB)');
        return;
      }

      setState(() => _isUploading = true);

      final uploadResult = await widget.api.uploadFile(file);

      if (uploadResult != null) {
        widget.api.sendFile(
          widget.chatId,
          uploadResult['fileId']!,
          mimeType: uploadResult['mimeType'],
        );
      } else {
        _showSnackBar('Upload failed');
      }

      setState(() => _isUploading = false);
    } catch (e) {
      setState(() => _isUploading = false);
      _showSnackBar('Upload failed');
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), duration: const Duration(seconds: 2)),
    );
  }

  @override
  void dispose() {
    for (final timer in _pendingMessageTimers.values) {
      timer.cancel();
    }
    _pendingMessageTimers.clear();
    _draftDebounce?.cancel();
    _draftDebounce = null;
    _readDebounce?.cancel();
    _readDebounce = null;
    widget.api.clearDraft(widget.chatId);
    WidgetsBinding.instance.removeObserver(this);
    _messageController.dispose();
    _editController.dispose();
    _scrollController.dispose();
    widget.api.removeMessageListener(_handleMessage);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            GestureDetector(
              onTap: () {
                if (widget.otherUserId != null) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => UserProfileScreen(
                        api: widget.api,
                        userId: widget.otherUserId!,
                      ),
                    ),
                  );
                } else {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => GroupInfoScreen(
                        api: widget.api,
                        chatId: widget.chatId,
                      ),
                    ),
                  );
                }
              },
              child: Stack(
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: colorFromId(widget.chatId),
                    child: Text(widget.chatName[0].toUpperCase()),
                  ),
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: Colors.transparent,
                    backgroundImage: widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty
                        ? CachedNetworkImageProvider('http://77.34.76.27:3000${widget.avatarUrl}')
                        : null,
                    onBackgroundImageError: widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty
                        ? (_, __) {}
                        : null,
                  ),
                  if (widget.otherUserId != null)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: _isOtherOnline ? Colors.green : Colors.grey,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 1.5),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.chatName, style: const TextStyle(fontSize: 16)),
                  Builder(
                    builder: (context) {
                      if (_isOtherTyping) {
                        return Text(
                          'печатает...',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).appBarTheme.foregroundColor?.withOpacity(0.7),
                          ),
                        );
                      }
                      if (widget.otherUserId != null) {
                        if (_isOtherTyping) {
                          return const Text(
                            'печатает...',
                            style: TextStyle(
                              fontSize: 12,
                              fontStyle: FontStyle.italic,
                              color: Colors.green,
                            ),
                          );
                        }
                        if (_isOtherOnline) {
                          return Text(
                            'в сети',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.green.withOpacity(0.9),
                            ),
                          );
                        } else {
                          return Text(
                            'не в сети',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).appBarTheme.foregroundColor?.withOpacity(0.5),
                            ),
                          );
                        }
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) async {
              if (value == 'info') {
                if (widget.otherUserId != null) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => UserProfileScreen(
                        api: widget.api,
                        userId: widget.otherUserId!,
                      ),
                    ),
                  );
                } else {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => GroupInfoScreen(
                        api: widget.api,
                        chatId: widget.chatId,
                      ),
                    ),
                  );
                }
              } else if (value == 'mute') {
                await MuteService.toggle(widget.chatId);
                await _loadMuteStatus();
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'info',
                child: ListTile(
                  leading: const Icon(Icons.info_outline),
                  title: const Text('Information'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
                value: 'mute',
                child: ListTile(
                  leading: Icon(_isMuted ? Icons.notifications : Icons.notifications_off),
                  title: Text(_isMuted ? 'Unmute' : 'Mute'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: Stack(
        children: [
          const Positioned.fill(child: FallingIconsBackground()),
          GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            behavior: HitTestBehavior.translucent,
            child: Column(
          children: [
            if (_replyToMessage != null)
              Container(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 4,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Colors.blue,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _replyToMessage!.userId == _currentUserId
                                ? 'Reply to yourself'
                                : 'Reply to ${_replyToMessage!.replyUsername ?? 'message'}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            _replyToMessage!.text,
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: _cancelReply,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : (_messages.isEmpty
                        ? const Center(child: Text('No messages yet'))
                        : ListView.builder(
                            key: PageStorageKey('chat_${widget.chatId}'),
                            controller: _scrollController,
                            reverse: true,
                            padding: const EdgeInsets.all(8),
                            itemCount: _messages.length,
                            itemBuilder: (_, i) {
                              final msg = _messages[_messages.length - 1 - i];
                              return KeyedSubtree(key: ValueKey(msg.id), child: _buildMessage(msg));
                            },
                          )),
            ),
            if (_isEditing)
              Container(
                color: Colors.amber[100],
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.edit, size: 16),
                    const SizedBox(width: 8),
                    const Text('Editing message'),
                    const Spacer(),
                    TextButton(
                      onPressed: _cancelEdit,
                      child: const Text('Cancel'),
                    ),
                  ],
                ),
              ),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.1),
                    blurRadius: 4,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: SafeArea(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
          IconButton(
            onPressed: _isUploading ? null : _showAttachmentOptions,
            icon: _isUploading
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.attach_file),
          ),
                    Expanded(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 120),
                          child: TextField(
                            controller: _messageController,
                            maxLines: null,
                            minLines: 1,
                            textCapitalization: TextCapitalization.sentences,
                            inputFormatters: [
                              LengthLimitingTextInputFormatter(_maxMessageLength),
                            ],
                            decoration: InputDecoration(
                              hintText: _isEditing
                                  ? 'Edit message...'
                                  : 'Type a message...',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(24),
                                borderSide: BorderSide.none,
                              ),
                              filled: true,
                              fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 10,
                              ),
                              isDense: true,
                            ),
                            textInputAction: TextInputAction.newline,
                            onChanged: (value) {
                              _draftDebounce?.cancel();
                              _draftDebounce = Timer(const Duration(milliseconds: 300), _saveDraft);
                            },
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (_isRecording)
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.red,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.mic,
                                  color: Colors.white,
                                  size: 16,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  _getRecordingDuration(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filled(
                            onPressed: _stopRecording,
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.red,
                            ),
                            icon: const Icon(Icons.stop),
                          ),
                        ],
                      )
                    else
                      Row(
                        children: [
                          IconButton(
                            onPressed: _startRecording,
                            icon: const Icon(Icons.mic),
                          ),
                          IconButton.filled(
                            onPressed: _sendMessage,
                            icon: Icon(_isEditing ? Icons.check : Icons.send),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
        ],
      ),
    );
  }

  Widget _buildMessage(Message msg) {
    if (msg.isDeleted || msg.text == '[deleted]') {
      final isMe = msg.userId == _currentUserId;
      final bubbleColor = isMe
          ? Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.5)
          : Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5);
      final textColor = Theme.of(context).colorScheme.onSurfaceVariant;
      return Padding(
        padding: EdgeInsets.only(
          left: isMe ? 64 : 12,
          right: isMe ? 12 : 64,
          top: 2,
          bottom: 2,
        ),
        child: Align(
          alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.delete_outline, size: 16, color: textColor),
                const SizedBox(width: 6),
                Text(
                  'Message deleted',
                  style: TextStyle(
                    color: textColor,
                    fontStyle: FontStyle.italic,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final isMe = msg.userId == _currentUserId;
    final hasFile = msg.fileId != null;
    final fileName = hasFile ? msg.text.replaceFirst('[File] ', '') : '';
    final ext = fileName.split('.').last.toLowerCase();
    final isImage =
        hasFile && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].contains(ext);
    final isVideo =
        hasFile && ['mp4', 'webm', 'mov', 'avi', 'mkv'].contains(ext);
    final isAudio =
        hasFile && ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].contains(ext);

    if (hasFile && isImage) {
      final imageUrl = 'http://77.34.76.27:3000/download/${msg.fileId}?token=${widget.api.token}';
      return GestureDetector(
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ImageViewerScreen(
                imageUrl: imageUrl,
                heroTag: 'image_${msg.id}',
              ),
            ),
          );
        },
        onLongPress: () => _showMessageMenu(msg),
        child: Align(
          alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.6,
              maxHeight: MediaQuery.of(context).size.height * 0.4,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: isMe
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                Flexible(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: CachedNetworkImage(
                      imageUrl: 'http://77.34.76.27:3000/download/${msg.fileId}?token=${widget.api.token}',
                      fit: BoxFit.contain,
                      errorWidget: (_, __, ___) => Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isMe
                              ? Colors.blue
                              : Theme.of(
                                  context,
                                ).colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.broken_image,
                              size: 20,
                              color: isMe
                                  ? Colors.white70
                                  : Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                fileName,
                                style: TextStyle(
                                  color: isMe
                                      ? Colors.white
                                      : Theme.of(context).colorScheme.onSurface,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (msg.isEdited)
                        const Text(
                          'edited ',
                          style: TextStyle(
                            fontSize: 10,
                            fontStyle: FontStyle.italic,
                            color: Colors.white70,
                          ),
                        ),
                      Text(
                        _formatTime(msg.createdAt),
                        style: const TextStyle(
                          fontSize: 10,
                          color: Colors.white70,
                        ),
                      ),
                      if (isMe) ...[
                        const SizedBox(width: 4),
                        _buildStatusIcon(msg.status),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (hasFile && isVideo) {
      return GestureDetector(
        onLongPress: () => _showMessageMenu(msg),
        child: GestureDetector(
          onTap: () => _openVideoFullscreen(
            'http://77.34.76.27:3000/download/${msg.fileId}?token=${widget.api.token}',
          ),
          child: Align(
            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.6,
                maxHeight: MediaQuery.of(context).size.height * 0.4,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: isMe
                    ? CrossAxisAlignment.end
                    : CrossAxisAlignment.start,
                children: [
                  Flexible(
                    fit: FlexFit.loose,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: _VideoThumbnail(
                        videoUrl:
                            'http://77.34.76.27:3000/download/${msg.fileId}?token=${widget.api.token}',
                        fileName: fileName,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (msg.isEdited)
                          const Text(
                            'edited ',
                            style: TextStyle(
                              fontSize: 10,
                              fontStyle: FontStyle.italic,
                              color: Colors.white70,
                            ),
                          ),
                        Text(
                          _formatTime(msg.createdAt),
                          style: const TextStyle(
                            fontSize: 10,
                            color: Colors.white70,
                          ),
                        ),
                        if (isMe) ...[
                          const SizedBox(width: 4),
                          _buildStatusIcon(msg.status),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    if (hasFile && isAudio) {
      return GestureDetector(
        onLongPress: () => _showMessageMenu(msg),
        child: Align(
          alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            child: IntrinsicWidth(
              child: Container(
                margin: const EdgeInsets.symmetric(vertical: 2),
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                decoration: BoxDecoration(
                  color: isMe
                      ? Colors.blue
                      : Theme.of(context).colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(isMe ? 16 : 4),
                    bottomRight: Radius.circular(isMe ? 4 : 16),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _AudioPlayerWidget(
                      audioUrl:
                          'http://77.34.76.27:3000/download/${msg.fileId}?token=${widget.api.token}',
                      fileName: fileName,
                      isMe: isMe,
                      showFileName: ext != 'm4a',
                    ),
                    const SizedBox(height: 4),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (msg.isEdited)
                            Text(
                              'edited ',
                              style: TextStyle(
                                fontSize: 10,
                                fontStyle: FontStyle.italic,
                                color: isMe
                                    ? Colors.white70
                                    : Theme.of(
                                        context,
                                      ).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          Text(
                            _formatTime(msg.createdAt),
                            style: TextStyle(
                              fontSize: 10,
                              color: isMe
                                  ? Colors.white70
                                  : Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                          if (isMe) ...[
                            const SizedBox(width: 4),
                            _buildStatusIcon(msg.status),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onLongPress: () => _showMessageMenu(msg),
      child: Align(
        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          child: IntrinsicWidth(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 2),
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              decoration: BoxDecoration(
                color: isMe
                    ? Colors.blue
                    : Theme.of(context).colorScheme.surfaceContainerHigh,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMe ? 16 : 4),
                  bottomRight: Radius.circular(isMe ? 4 : 16),
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (msg.replyTo != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 4),
                      padding: const EdgeInsets.only(left: 6),
                      decoration: BoxDecoration(
                        border: Border(
                          left: BorderSide(
                            color: isMe
                                ? Colors.white70
                                : Theme.of(context).colorScheme.primary,
                            width: 2,
                          ),
                        ),
                      ),
                      child: Text(
                        msg.replyUsername != null && msg.replyText != null
                            ? '${msg.replyUsername}: ${msg.replyText}'
                            : _getReplyPreview(msg.replyTo!),
                        style: TextStyle(
                          fontSize: 10,
                          fontStyle: FontStyle.italic,
                          color: isMe
                              ? Colors.white70
                              : Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  if (hasFile)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.attach_file,
                          size: 20,
                          color: isMe
                              ? Colors.white70
                              : Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            fileName,
                            style: TextStyle(
                              color: isMe
                                  ? Colors.white
                                  : Theme.of(context).colorScheme.onSurface,
                            ),
                          ),
                        ),
                      ],
                    )
                  else
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (widget.chatType == 'group' && !isMe)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text(
                              _participantNames[msg.userId] ?? 'Unknown',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        Text(
                          msg.text,
                          style: TextStyle(
                            color: isMe
                                ? Colors.white
                                : Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (msg.isEdited)
                          Text(
                            'edited ',
                            style: TextStyle(
                              fontSize: 10,
                              fontStyle: FontStyle.italic,
                              color: isMe
                                  ? Colors.white70
                                  : Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        Text(
                          _formatTime(msg.createdAt),
                          style: TextStyle(
                            fontSize: 10,
                            color: isMe
                                ? Colors.white70
                                : Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                        if (isMe) ...[
                          const SizedBox(width: 4),
                          _buildStatusIcon(msg.status),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _VideoPlayerWidget({required String videoUrl}) {
    return FutureBuilder<bool>(
      future: _checkVideoCanPlay(videoUrl),
      builder: (context, snapshot) {
        if (snapshot.data != true) {
          return Container(
            height: 150,
            decoration: BoxDecoration(
              color: Colors.grey[800],
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          );
        }
        return _VideoPlayer(videoUrl: videoUrl);
      },
    );
  }

  Future<bool> _checkVideoCanPlay(String url) async {
    try {
      final controller = VideoPlayerController.networkUrl(Uri.parse(url));
      await controller.initialize();
      await controller.dispose();
      return true;
    } catch (e) {
      return false;
    }
  }

  Widget _VideoPlayer({required String videoUrl}) {
    return _SafeVideoPlayer(videoUrl: videoUrl);
  }

  Widget _buildStatusIcon(MessageStatus status) {
    switch (status) {
      case MessageStatus.read:
        return Icon(Icons.done_all, size: 14, color: Colors.blue[200]);
      case MessageStatus.delivered:
        return Icon(
          Icons.done_all,
          size: 14,
          color: Theme.of(context).colorScheme.outline,
        );
      case MessageStatus.sent:
        return Icon(
          Icons.check,
          size: 14,
          color: Theme.of(context).colorScheme.outline,
        );
    }
  }

  String _getReplyPreview(String replyId) {
    final replyMsg = _messages.firstWhere(
      (m) => m.id == replyId,
      orElse: () => Message(
        id: '',
        chatId: '',
        userId: '',
        text: '[message not found]',
        createdAt: 0,
      ),
    );
    if (replyMsg.replyUsername != null && replyMsg.replyText != null) {
      return '${replyMsg.replyUsername}: ${replyMsg.replyText}';
    }
    return replyMsg.text;
  }

  void _openVideoFullscreen(String videoUrl) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _VideoFullscreenPlayer(videoUrl: videoUrl),
      ),
    );
  }

  void _showMessageMenu(Message msg) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.reply),
              title: const Text('Reply'),
              onTap: () {
                Navigator.pop(ctx);
                _startReply(msg);
              },
            ),
            if (msg.userId == _currentUserId) ...[
              ListTile(
                leading: const Icon(Icons.edit),
                title: const Text('Edit'),
                onTap: () {
                  Navigator.pop(ctx);
                  _startEdit(msg);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete, color: Colors.red),
                title: const Text(
                  'Delete',
                  style: TextStyle(color: Colors.red),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  _deleteMessage(msg);
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(int timestamp) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  String _getRecordingDuration() {
    final min = (_recordingSeconds ~/ 60).toString().padLeft(2, '0');
    final sec = (_recordingSeconds % 60).toString().padLeft(2, '0');
    return '$min:$sec';
  }
}

class _AudioPlayerWidget extends StatefulWidget {
  final String audioUrl;
  final String fileName;
  final bool isMe;
  final bool showFileName;

  const _AudioPlayerWidget({
    required this.audioUrl,
    required this.fileName,
    required this.isMe,
    this.showFileName = true,
  });

  @override
  State<_AudioPlayerWidget> createState() => _AudioPlayerWidgetState();
}

class _AudioPlayerWidgetState extends State<_AudioPlayerWidget> {
  late AudioPlayer _audioPlayer;
  bool _isInitialized = false;
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _audioPlayer = AudioPlayer();
    _initAudio();
  }

  Future<void> _initAudio() async {
    try {
      await _audioPlayer.setUrl(widget.audioUrl);
      final duration = _audioPlayer.duration;
      if (mounted) {
        setState(() {
          _isInitialized = true;
          _duration = duration ?? Duration.zero;
        });
      }
      _audioPlayer.positionStream.listen((pos) {
        if (mounted) {
          setState(() => _position = pos);
        }
      });
      _audioPlayer.playerStateStream.listen((state) {
        if (mounted) {
          setState(() {
            _isPlaying = state.playing;
            if (state.processingState == ProcessingState.completed) {
              _audioPlayer.seek(Duration.zero);
              _audioPlayer.pause();
            }
          });
        }
      });
    } catch (e) {
      debugPrint('Audio init failed: $e');
    }
  }

  Future<void> _togglePlayPause() async {
    if (_isPlaying) {
      await _audioPlayer.pause();
    } else {
      await _audioPlayer.play();
    }
  }

  String _formatDuration(Duration d) {
    final min = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final sec = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$min:$sec';
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: _isInitialized ? _togglePlayPause : null,
              icon: Icon(
                _isPlaying ? Icons.pause : Icons.play_arrow,
                color: widget.isMe
                    ? Colors.white
                    : Theme.of(context).colorScheme.onSurface,
              ),
              iconSize: 32,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.showFileName)
                    Text(
                      widget.fileName,
                      style: TextStyle(
                        color: widget.isMe
                            ? Colors.white
                            : Theme.of(context).colorScheme.onSurface,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  if (_isInitialized) ...[
                    const SizedBox(height: 4),
                    SliderTheme(
                      data: SliderThemeData(
                        trackHeight: 4,
                        thumbShape: const RoundSliderThumbShape(
                          enabledThumbRadius: 6,
                        ),
                        overlayShape: const RoundSliderOverlayShape(
                          overlayRadius: 12,
                        ),
                        activeTrackColor: widget.isMe
                            ? Colors.white
                            : Theme.of(context).colorScheme.primary,
                        inactiveTrackColor: widget.isMe
                            ? Colors.white30
                            : Theme.of(context).colorScheme.outline,
                        thumbColor: widget.isMe
                            ? Colors.white
                            : Theme.of(context).colorScheme.primary,
                      ),
                      child: Slider(
                        value: _position.inMilliseconds.toDouble().clamp(
                          0,
                          _duration.inMilliseconds.toDouble(),
                        ),
                        min: 0,
                        max: _duration.inMilliseconds.toDouble().clamp(
                          1,
                          double.infinity,
                        ),
                        onChanged: (value) {
                          _audioPlayer.seek(
                            Duration(milliseconds: value.toInt()),
                          );
                        },
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          _formatDuration(_position),
                          style: TextStyle(
                            fontSize: 10,
                            color: widget.isMe
                                ? Colors.white70
                                : Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                        Text(
                          _formatDuration(_duration),
                          style: TextStyle(
                            fontSize: 10,
                            color: widget.isMe
                                ? Colors.white70
                                : Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ] else
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: SizedBox(
                        height: 4,
                        child: LinearProgressIndicator(),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _VideoThumbnail extends StatefulWidget {
  final String videoUrl;
  final String fileName;

  const _VideoThumbnail({required this.videoUrl, required this.fileName});

  @override
  State<_VideoThumbnail> createState() => _VideoThumbnailState();
}

class _VideoThumbnailState extends State<_VideoThumbnail> {
  Uint8List? _thumbnailBytes;

  @override
  void initState() {
    super.initState();
    _generateThumbnail();
  }

  Future<void> _generateThumbnail() async {
    try {
      final thumbnail = await VideoThumbnail.thumbnailData(
        video: widget.videoUrl,
        imageFormat: ImageFormat.JPEG,
        maxWidth: 400,
        quality: 75,
        timeMs: 1000,
      );
      if (mounted) {
        setState(() {
          _thumbnailBytes = thumbnail;
        });
      }
    } catch (e) {
      debugPrint('Thumbnail generation failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 150,
      width: 200,
      decoration: BoxDecoration(
        color: Colors.grey[800],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (_thumbnailBytes != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                _thumbnailBytes!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) =>
                    Container(color: Colors.grey[800]),
              ),
            ),
          Center(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                shape: BoxShape.circle,
              ),
              padding: const EdgeInsets.all(8),
              child: const Icon(
                Icons.play_arrow,
                color: Colors.white,
                size: 40,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SafeVideoPlayer extends StatefulWidget {
  final String videoUrl;

  const _SafeVideoPlayer({required this.videoUrl});

  @override
  State<_SafeVideoPlayer> createState() => _SafeVideoPlayerState();
}

class _SafeVideoPlayerState extends State<_SafeVideoPlayer> {
  VideoPlayerController? _controller;
  bool _isLoading = true;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  Future<void> _initVideo() async {
    try {
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.videoUrl),
      );
      await controller.initialize();

      if (mounted) {
        setState(() {
          _controller = controller;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Video initialization failed: $e');
      if (mounted) {
        setState(() {
          _hasError = true;
          _isLoading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Container(
        height: 150,
        width: 200,
        decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: CircularProgressIndicator(color: Colors.white),
        ),
      );
    }

    if (_hasError || _controller == null) {
      return Container(
        height: 150,
        width: 200,
        decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.videocam_off, color: Colors.white54, size: 40),
            SizedBox(height: 8),
            Text(
              'Video not supported',
              style: TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
      );
    }

    return AspectRatio(
      aspectRatio: _controller!.value.aspectRatio,
      child: Stack(
        alignment: Alignment.center,
        children: [
          VideoPlayer(_controller!),
          GestureDetector(
            onTap: () {
              setState(() {
                if (_controller!.value.isPlaying) {
                  _controller!.pause();
                } else {
                  _controller!.play();
                }
              });
            },
            child: AnimatedOpacity(
              opacity: _controller!.value.isPlaying ? 0.0 : 1.0,
              duration: const Duration(milliseconds: 300),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(12),
                child: const Icon(
                  Icons.play_arrow,
                  color: Colors.white,
                  size: 40,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoFullscreenPlayer extends StatefulWidget {
  final String videoUrl;

  const _VideoFullscreenPlayer({required this.videoUrl});

  @override
  State<_VideoFullscreenPlayer> createState() => _VideoFullscreenPlayerState();
}

class _VideoFullscreenPlayerState extends State<_VideoFullscreenPlayer> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  bool _hasError = false;
  bool _showControls = true;
  bool _isPlaying = false;
  double _currentPosition = 0;
  double _maxPosition = 1;

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  Future<void> _initVideo() async {
    try {
      _controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.videoUrl),
      );
      await _controller.initialize();
      _controller.addListener(_onVideoUpdate);
      if (mounted) {
        setState(() {
          _isInitialized = true;
          _maxPosition = _controller.value.duration.inMilliseconds.toDouble();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _hasError = true);
      }
    }
  }

  void _onVideoUpdate() {
    if (!mounted) return;
    final isPlaying = _controller.value.isPlaying;
    final position = _controller.value.position.inMilliseconds.toDouble();
    final duration = _controller.value.duration.inMilliseconds.toDouble();

    if (_isPlaying != isPlaying ||
        (_currentPosition - position).abs() > 500 ||
        _maxPosition != duration) {
      setState(() {
        _isPlaying = isPlaying;
        _currentPosition = position;
        _maxPosition = duration > 0 ? duration : 1;
      });
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onVideoUpdate);
    _controller.dispose();
    super.dispose();
  }

  void _togglePlayPause() {
    setState(() {
      if (_controller.value.isPlaying) {
        _controller.pause();
      } else {
        _controller.play();
      }
    });
  }

  void _toggleControls() {
    setState(() => _showControls = !_showControls);
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final hours = duration.inHours;
    final minutes = duration.inMinutes.remainder(60);
    final seconds = duration.inSeconds.remainder(60);
    if (hours > 0) {
      return '$hours:${twoDigits(minutes)}:${twoDigits(seconds)}';
    }
    return '${twoDigits(minutes)}:${twoDigits(seconds)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onTap: _toggleControls,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: _hasError
                  ? const Text(
                      'Video not supported',
                      style: TextStyle(color: Colors.white),
                    )
                  : !_isInitialized
                  ? const CircularProgressIndicator(color: Colors.white)
                  : AspectRatio(
                      aspectRatio: _controller.value.aspectRatio,
                      child: VideoPlayer(_controller),
                    ),
            ),
            if (_isInitialized && _showControls)
              Positioned.fill(
                child: Container(
                  color: Colors.black.withValues(alpha: 0.3),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (_controller.value.isPlaying)
                        const SizedBox(height: 60),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            Text(
                              _formatDuration(
                                Duration(
                                  milliseconds: _currentPosition.toInt(),
                                ),
                              ),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                            Expanded(
                              child: Slider(
                                value: _currentPosition.clamp(0, _maxPosition),
                                min: 0,
                                max: _maxPosition > 0 ? _maxPosition : 1,
                                onChanged: (value) {
                                  _controller.seekTo(
                                    Duration(milliseconds: value.toInt()),
                                  );
                                  setState(() {
                                    _currentPosition = value;
                                  });
                                },
                              ),
                            ),
                            Text(
                              _formatDuration(
                                Duration(milliseconds: _maxPosition.toInt()),
                              ),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            onPressed: () {
                              final newPosition =
                                  _controller.value.position -
                                  const Duration(seconds: 10);
                              _controller.seekTo(newPosition);
                            },
                            icon: const Icon(
                              Icons.replay_10,
                              color: Colors.white,
                              size: 36,
                            ),
                          ),
                          const SizedBox(width: 24),
                          IconButton(
                            onPressed: _togglePlayPause,
                            icon: Icon(
                              _controller.value.isPlaying
                                  ? Icons.pause
                                  : Icons.play_arrow,
                              color: Colors.white,
                              size: 48,
                            ),
                          ),
                          const SizedBox(width: 24),
                          IconButton(
                            onPressed: () {
                              final newPosition =
                                  _controller.value.position +
                                  const Duration(seconds: 10);
                              _controller.seekTo(newPosition);
                            },
                            icon: const Icon(
                              Icons.forward_10,
                              color: Colors.white,
                              size: 36,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            Positioned(
              top: 40,
              left: 16,
              child: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
