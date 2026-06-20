import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:just_audio/just_audio.dart';
import 'package:audio_waveforms/audio_waveforms.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../utils/avatar_utils.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/message_cache.dart';
import '../services/mute_service.dart';
import '../services/crypto_service.dart';
import '../services/wallpaper_service.dart';
import '../models/models.dart';
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
  double _uploadProgress = 0.0;
  String _uploadStatus = '';
  bool _isEditing = false;
  bool _isOtherTyping = false;
  bool _isOtherOnline = false;
  String? _editingMessageId;
  String? _replyToMessageId;
  Message? _replyToMessage;
  late final String _currentUserId;
  final Set<String> _readMessages = {};
  final Map<String, int> _decryptRetries = {};
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
  final Map<String, AudioPlayer> _audioPlayers = {};
  final Map<String, String> _decryptedTexts = {};
  bool _isMuted = false;
  File? _pendingFile;
  String? _pendingFileName;
  String? _pendingFileMimeType;
  String? _wallpaperPath;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _currentUserId = widget.api.userId ?? '';
    _wallpaperPath = WallpaperService().wallpaperPath;
    _loadCachedMessages();
    _loadMessages();
    _loadDraft();
    _loadMuteStatus();
    widget.api.addMessageListener(_handleMessage);
    widget.api.onReconnected = _refreshMessageStatus;
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
            if (m.plainText != null && m.keyType == 'e2ee_v1') {
              _decryptedTexts[m.id] = m.plainText!;
            }
            _messages.add(m);
            if (m.plainText == null) _decryptMessage(m);
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
      _showSnackBar(AppLocalizations.of(context).microphonePermissionDenied);
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
      _showSnackBar(AppLocalizations.of(context).failedToStartRecording);
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

  void _decryptMessage(Message msg) {
    if (msg.keyType != 'e2ee_v1' || msg.text.isEmpty || _decryptedTexts.containsKey(msg.id) || msg.plainText != null) return;
    try {
      final otherId = widget.otherUserId ?? (widget.chatType == 'group' ? msg.userId : null);
      if (otherId == null || otherId == _currentUserId) return;
      CryptoService.getBox(otherId, widget.api).then((box) {
        if (box == null) {
          _scheduleDecryptRetry(msg);
          return;
        }
        final plain = CryptoService.decryptMessage(msg.text, box);
        if (plain != null && mounted) {
          setState(() {
            _decryptedTexts[msg.id] = plain;
            final idx = _messages.indexWhere((m) => m.id == msg.id);
            if (idx != -1) {
              _messages[idx] = _messages[idx].copyWith(plainText: plain);
              MessageCache.saveMessage(_messages[idx]);
            }
          });
        }
      });
    } catch (_) {}
  }

  void _scheduleDecryptRetry(Message msg) {
    final retries = _decryptRetries[msg.id] ?? 0;
    if (retries >= 3) return;
    _decryptRetries[msg.id] = retries + 1;
    Future.delayed(const Duration(seconds: 2), () {
      if (!mounted) return;
      _decryptMessage(msg);
      if (_decryptedTexts.containsKey(msg.id)) {
        _decryptRetries.remove(msg.id);
      }
    });
  }

  void _handleMessage(Map<String, dynamic> msg) {
    switch (msg['type']) {
      case 'message':
        if (msg['chatId'] == widget.chatId) _handleNewMessage(msg);
        break;
      case 'message_edited':
        if (msg['chatId'] == widget.chatId) _handleMessageEdit(msg);
        break;
      case 'message_deleted':
        if (msg['chatId'] == widget.chatId) _handleMessageDelete(msg);
        break;
      case 'error':
        _handleErrorMessage(msg);
        break;
      case 'online':
        _handleOnlineStatus(msg);
        break;
      case 'online_users':
        if (widget.otherUserId != null) {
          setState(() => _isOtherOnline = widget.api.isUserOnline(widget.otherUserId!));
        }
        break;
      case 'delivered':
        _handleDelivered(msg);
        break;
      case 'read':
        if (msg['userId'] != _currentUserId) _handleReadReceipt(msg);
        break;
      case 'typing':
        if (msg['chatId'] == widget.chatId && msg['userId'] != _currentUserId) _handleTyping(msg);
        break;
    }
  }

  void _handleNewMessage(Map<String, dynamic> msg) {
    final messageId = msg['id'] as String;
    final tempId = msg['tempId'] as String?;
    final userId = msg['userId'] as String;

    final replyData = msg['reply'] as Map<String, dynamic>?;
    final message = Message.fromJson({
      'id': messageId,
      'chat_id': msg['chatId'],
      'user_id': userId,
      'text': msg['text'],
      'file_id': msg['fileId'],
      'reply': replyData,
      'created_at': msg['timestamp'],
      'key_type': msg['keyType'],
    });

    _decryptMessage(message);

    if (!mounted) return;

    debugPrint('[_handleNewMessage] ABOUT TO setState messageId=$messageId tempId=$tempId messages.len=${_messages.length}');
    setState(() {
      // 1) Remove any existing copy by tempId OR real messageId (dedup)
      if (tempId != null) {
        _messages.removeWhere((m) => m.id == tempId);
      }
      _messages.removeWhere((m) => m.id == messageId);

      // 2) If own message without tempId (e.g. offline sync), find + remove pending optimistic
      if (userId == _currentUserId && tempId == null) {
        final optimisticIdx = _messages.indexWhere((m) =>
          m.userId == _currentUserId &&
          m.status == MessageStatus.sending &&
          (message.createdAt - m.createdAt).abs() < 15000);
        if (optimisticIdx != -1) {
          if (_decryptedTexts.containsKey(_messages[optimisticIdx].id)) {
            _decryptedTexts[messageId] = _decryptedTexts[_messages[optimisticIdx].id]!;
            _decryptedTexts.remove(_messages[optimisticIdx].id);
          }
          _messages.removeAt(optimisticIdx);
        }
      }

      // 3) Transfer decrypted text from tempId to real id
      if (tempId != null && _decryptedTexts.containsKey(tempId)) {
        _decryptedTexts[messageId] = _decryptedTexts[tempId]!;
        _decryptedTexts.remove(tempId);
      }

      // 4) Add the real message once
      _messages.add(message);
      MessageCache.saveMessage(message);

      // 5) Mark for read receipts
      if (userId != _currentUserId) {
        _pendingReadIds.add(message.id);
      }
    });

    if (userId != _currentUserId) {
      _scheduleReadReceipts();
      widget.onMessagesRead?.call();
    }

    if (_isNearBottom) _scrollToBottom(force: true);
  }

  void _handleMessageEdit(Map<String, dynamic> msg) {
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

  void _handleMessageDelete(Map<String, dynamic> msg) {
    final deletedId = msg['messageId'] as String;
    setState(() {
      final index = _messages.indexWhere((m) => m.id == deletedId);
      if (index != -1) {
        _messages[index] = _messages[index].copyWith(text: '[deleted]');
        MessageCache.saveMessage(_messages[index]);
      }
      for (int i = 0; i < _messages.length; i++) {
        if (_messages[i].replyTo == deletedId) {
          _messages[i] = _messages[i].copyWith(replyText: '[deleted]');
          MessageCache.saveMessage(_messages[i]);
        }
      }
    });
  }

  void _handleErrorMessage(Map<String, dynamic> msg) {
    final errorMsg = msg['message'] as String? ?? 'Ошибка отправки';
    final failedTempId = msg['tempId'] as String?;

    ApiService.addLog('_handleErrorMessage: chatId=${widget.chatId} tempId=$failedTempId error=$errorMsg');

    if (failedTempId != null && mounted) {
      // Remove failed optimistic message from UI
      setState(() => _messages.removeWhere((m) => m.id == failedTempId));
      _decryptedTexts.remove(failedTempId);

      // Restore text for retry
      final failedText = msg['text'] as String?;
      if (failedText != null) {
        _messageController.text = failedText;
        final failedReplyTo = msg['replyTo'] as String?;
        if (failedReplyTo != null) {
          setState(() {
            _replyToMessageId = failedReplyTo;
            final reply = _messages.firstWhere(
              (m) => m.id == failedReplyTo,
              orElse: () => Message(id: '', chatId: '', userId: '', text: '', createdAt: 0),
            );
            _replyToMessage = reply.id.isNotEmpty ? reply : null;
          });
        }
      }
    }

    _showSnackBar('${AppLocalizations.of(context).failedToSend}: $errorMsg');
  }

  void _handleOnlineStatus(Map<String, dynamic> msg) {
    if (msg['userId'] == widget.otherUserId) {
      setState(() => _isOtherOnline = msg['status'] == 'online');
    }
  }

  void _handleDelivered(Map<String, dynamic> msg) {
    final messageId = msg['messageId'];
    final index = _messages.indexWhere(
      (m) => m.id == messageId && m.userId == _currentUserId,
    );
    if (index != -1) {
      setState(() {
        _messages[index] = _messages[index].copyWith(status: MessageStatus.delivered);
      });
      MessageCache.saveMessage(_messages[index]);
    }
  }

  void _handleReadReceipt(Map<String, dynamic> msg) {
    final messageId = msg['messageId'];
    final index = _messages.indexWhere(
      (m) => m.id == messageId && m.userId == _currentUserId,
    );
    if (index != -1) {
      setState(() {
        _messages[index] = _messages[index].copyWith(status: MessageStatus.read);
      });
      MessageCache.saveMessage(_messages[index]);
    }
    setState(() => _readMessages.add(messageId));
  }

  void _handleTyping(Map<String, dynamic> msg) {
    setState(() => _isOtherTyping = msg['isTyping'] == true);
    if (msg['isTyping'] == true) {
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _isOtherTyping = false);
      });
    }
  }

  Future<void> _loadMessages() async {
    if (_messagesLoaded) return;
    try {
      final messages = await widget.api.getMessages(widget.chatId);
      if (mounted) {
        setState(() {
          final now = DateTime.now().millisecondsSinceEpoch;
          for (final m in messages) {
            // Skip own messages that still have a pending optimistic counterpart
            if (m.userId == _currentUserId && _messages.any((o) =>
              o.userId == _currentUserId &&
              o.status == MessageStatus.sending &&
              o.text == m.text &&
              (now - o.createdAt).abs() < 10000)) continue;

            final index = _messages.indexWhere((existing) => existing.id == m.id);
            if (index != -1) {
              if (m.status.index > _messages[index].status.index) {
                _messages[index] = _messages[index].copyWith(status: m.status);
              }
            } else {
              _messages.add(m);
            }
          }
          _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
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

        for (final m in messages) {
          _decryptMessage(m);
        }

        MessageCache.saveMessages(widget.chatId, messages);
        _scrollToBottom(force: true);
        if (_pendingReadIds.isNotEmpty) {
          _scheduleReadReceipts();
        }
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
      final toAdd = <Message>[];
      final now = DateTime.now().millisecondsSinceEpoch;
      for (final m in messages) {
        // Skip own messages that still have a pending optimistic counterpart
        if (m.userId == _currentUserId && _messages.any((o) =>
          o.userId == _currentUserId &&
          o.status == MessageStatus.sending &&
          o.text == m.text &&
          (now - o.createdAt).abs() < 10000)) continue;

        final index = _messages.indexWhere((existing) => existing.id == m.id);
        if (index != -1) {
          if (m.status.index > _messages[index].status.index) {
            _messages[index] = _messages[index].copyWith(status: m.status);
            MessageCache.saveMessage(_messages[index]);
          }
        } else {
          toAdd.add(m);
        }
      }
      if (toAdd.isEmpty) return;
      final actuallyAdded = <Message>[];
      setState(() {
        for (final m in toAdd) {
          if (!_messages.any((existing) => existing.id == m.id)) {
            _messages.add(m);
            actuallyAdded.add(m);
          }
        }
        if (actuallyAdded.length > 1) {
          _messages.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        }
      });
      if (actuallyAdded.isEmpty) return;
      for (final m in actuallyAdded) {
        _decryptMessage(m);
        if (m.userId != _currentUserId) {
          _pendingReadIds.add(m.id);
        }
      }
      if (actuallyAdded.any((m) => m.userId != _currentUserId)) {
        widget.onMessagesRead?.call();
      }
      MessageCache.saveMessages(widget.chatId, actuallyAdded);
      if (_isNearBottom) _scrollToBottom(force: true);
    } catch (_) {}
  }

  Future<void> _loadMoreMessages() async {
    if (_isLoadingMore || !_hasOlderMessages) return;
    _isLoadingMore = true;
    final oldest = _messages.isEmpty ? null : _messages.first.createdAt;
    try {
      final messages = await widget.api.getMessages(widget.chatId, before: oldest, limit: 50);
      final toInsert = <Message>[];
      for (final m in messages) {
        if (!_messages.any((existing) => existing.id == m.id)) {
          toInsert.add(m);
        }
      }
      if (mounted) {
        setState(() {
          _hasOlderMessages = messages.length >= 50;
          if (toInsert.isNotEmpty) {
            toInsert.sort((a, b) => a.createdAt.compareTo(b.createdAt));
            _messages.insertAll(0, toInsert);
          }
          _isLoadingMore = false;
        });
      }
      for (final m in toInsert) {
        _decryptMessage(m);
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

  void _navigateToProfileOrGroup() {
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
  }

  bool get _isNearBottom {
    if (!_scrollController.hasClients) return false;
    final pos = _scrollController.position;
    return pos.pixels <= 100;
  }

  Future<void> _sendMessage() async {
    if (_isEditing) {
      _saveEdit();
      return;
    }
    if (_isUploading) return;

    final text = _messageController.text.trim();
    final hasPendingFile = _pendingFile != null;
    if (text.isEmpty && !hasPendingFile) return;

    if (text.length > _maxMessageLength) {
      _showSnackBar(AppLocalizations.of(context).messageTooLong);
      return;
    }

    final replyTo = _replyToMessageId;

    // Upload and send pending file first
    if (hasPendingFile) {
      setState(() {
        _isUploading = true;
        _uploadProgress = 0.0;
        _uploadStatus = AppLocalizations.of(context).starting;
      });
      try {
        final fileSize = await _pendingFile!.length();
        final sizeMb = (fileSize / (1024 * 1024)).toStringAsFixed(1);
        if (fileSize > 100 * 1024 * 1024) {
          _showSnackBar(AppLocalizations.of(context).fileTooLarge);
          setState(() => _isUploading = false);
          return;
        }
        final useChunked = _pendingFileMimeType != null && _pendingFileMimeType!.startsWith('video/') && fileSize > 5 * 1024 * 1024;
        final l = AppLocalizations.of(context);
        final uploadResult = useChunked
          ? await widget.api.uploadFileChunked(_pendingFile!,
              onProgress: (p) => setState(() {
                _uploadProgress = p;
                _uploadStatus = l.uploadProgress((p * 100).toStringAsFixed(0), sizeMb);
              }),
            )
          : await widget.api.uploadFile(_pendingFile!);
        if (uploadResult != null) {
          setState(() => _uploadStatus = l.sending);
          widget.api.sendFile(
            widget.chatId,
            uploadResult['fileId']!,
            replyTo: replyTo,
            mimeType: uploadResult['mimeType'],
          );
        } else {
          _showSnackBar(AppLocalizations.of(context).uploadFailed);
          setState(() => _isUploading = false);
          return;
        }
      } catch (e) {
        _showSnackBar(AppLocalizations.of(context).uploadFailed);
        setState(() => _isUploading = false);
        return;
      }
      setState(() => _isUploading = false);
      _cancelPendingFile();

      // If no text to send separately, done
      if (text.isEmpty) return;
    }

    final tempId = DateTime.now().millisecondsSinceEpoch.toString();

    // Encrypt for direct chats
    String sendText = text;
    String? keyType;
    if (widget.chatType == 'direct' && widget.otherUserId != null && text.isNotEmpty) {
      try {
        final box = await CryptoService.getBox(widget.otherUserId!, widget.api);
        if (box != null) {
          sendText = CryptoService.encryptMessage(text, box);
          keyType = 'e2ee_v1';
        }
      } catch (_) {}
    }

    // Store plaintext for E2EE messages
    if (keyType == 'e2ee_v1') {
      _decryptedTexts[tempId] = text;
    }

    // Add optimistic message to UI
    setState(() {
      _messages.add(Message(
        id: tempId,
        chatId: widget.chatId,
        userId: _currentUserId,
        text: keyType == 'e2ee_v1' ? text : sendText,
        replyTo: replyTo,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        status: MessageStatus.sending,
        keyType: keyType,
      ));
    });
    _scrollToBottom(force: true);

    // Send via WebSocket with tempId
    widget.api.sendMessage(widget.chatId, sendText, replyTo: replyTo, tempId: tempId, keyType: keyType);

    // Clear input
    _draftDebounce?.cancel();
    _messageController.clear();
    _cancelReply();
    _clearDraft();
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
      _showSnackBar(AppLocalizations.of(context).messageTooLong);
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
        title: Text(AppLocalizations.of(context).deleteMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(AppLocalizations.of(context).cancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(AppLocalizations.of(context).delete, style: const TextStyle(color: Colors.red)),
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
              title: Text(AppLocalizations.of(context).gallery),
              onTap: () {
                Navigator.pop(ctx);
                _pickMedia(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.video_library),
              title: Text(AppLocalizations.of(context).videoLabel),
              onTap: () {
                Navigator.pop(ctx);
                _pickVideoFromGallery();
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(AppLocalizations.of(context).camera),
              onTap: () {
                Navigator.pop(ctx);
                _pickMedia(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.videocam),
              title: Text(AppLocalizations.of(context).recordVideo),
              onTap: () {
                Navigator.pop(ctx);
                _recordVideo();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: Text(AppLocalizations.of(context).file),
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

  Future<void> _pickVideoFromGallery() async {
    try {
      if (await _requestGalleryPermission() == false) return;
      final picked = await ImagePicker().pickVideo(source: ImageSource.gallery);
      if (picked != null) {
        final file = File(picked.path);
        setState(() {
          _pendingFile = file;
          _pendingFileName = picked.name;
          _pendingFileMimeType = 'video/${picked.path.split('.').last.toLowerCase()}';
        });
      }
    } catch (e) {
      _showSnackBar(AppLocalizations.of(context).errorPickingVideo);
    }
  }

  Future<void> _recordVideo() async {
    try {
      final status = await Permission.camera.request();
      if (status.isDenied || status.isPermanentlyDenied) {
        _showSnackBar(AppLocalizations.of(context).cameraPermissionRequired);
        return;
      }
      final picked = await ImagePicker().pickVideo(source: ImageSource.camera);
      if (picked != null) {
        final file = File(picked.path);
        setState(() {
          _pendingFile = file;
          _pendingFileName = picked.name;
          _pendingFileMimeType = 'video/${picked.path.split('.').last.toLowerCase()}';
        });
      }
    } catch (e) {
      _showSnackBar(AppLocalizations.of(context).errorRecordingVideo);
    }
  }

  Future<void> _pickMedia(ImageSource source) async {
    try {
      if (source == ImageSource.gallery && await _requestGalleryPermission() == false) return;
      if (source == ImageSource.camera) {
        final status = await Permission.camera.request();
        if (status.isDenied || status.isPermanentlyDenied) {
          _showSnackBar(AppLocalizations.of(context).cameraPermissionRequired);
          return;
        }
      }
      final picked = await ImagePicker().pickImage(source: source, imageQuality: 85);
      if (picked != null) {
        final file = File(picked.path);
        final ext = picked.path.split('.').last.toLowerCase();
        final compressed = await _compressImage(file);
        setState(() {
          _pendingFile = compressed ?? file;
          _pendingFileName = picked.name;
          _pendingFileMimeType = 'image/$ext';
        });
      }
    } catch (e) {
      _showSnackBar(
        source == ImageSource.camera
            ? AppLocalizations.of(context).errorTakingPhoto
            : AppLocalizations.of(context).errorPickingGallery,
      );
    }
  }

  Future<bool> _requestGalleryPermission() async {
    try {
      if (await Permission.storage.isGranted) return true;
      final status = await Permission.storage.request();
      if (status.isGranted) return true;
      if (status.isPermanentlyDenied) {
        _showSnackBar(AppLocalizations.of(context).storagePermissionRequired);
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
        final file = File(result.files.single.path!);
        final ext = result.files.single.path!.split('.').last.toLowerCase();
        final mimeType = _getPreviewMimeType(ext);
        final compressed = mimeType.startsWith('image/') ? await _compressImage(file) : null;
        setState(() {
          _pendingFile = compressed ?? file;
          _pendingFileName = result.files.single.name;
          _pendingFileMimeType = mimeType;
        });
      }
    } catch (e) {
      _showSnackBar(AppLocalizations.of(context).errorSelectingFile);
    }
  }

  String _getPreviewMimeType(String ext) {
    switch (ext) {
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'mp4': case 'mov': case 'avi': case 'mkv': return 'video/$ext';
      default: return 'application/octet-stream';
    }
  }

  Future<File?> _compressImage(File file) async {
    try {
      final ext = file.path.split('.').last.toLowerCase();
      if (ext == 'gif' || ext == 'webp') return null;
      final dir = await getTemporaryDirectory();
      final outPath = '${dir.path}/${DateTime.now().millisecondsSinceEpoch}.jpg';
      final xfile = await FlutterImageCompress.compressAndGetFile(
        file.absolute.path, outPath,
        quality: 80,
        minWidth: 1920,
        minHeight: 1920,
      );
      if (xfile != null && await xfile.length() < await file.length()) return File(xfile.path);
    } catch (_) {}
    return null;
  }

  void _cancelPendingFile() {
    setState(() {
      _pendingFile = null;
      _pendingFileName = null;
      _pendingFileMimeType = null;
      _uploadProgress = 0.0;
      _uploadStatus = '';
    });
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), duration: const Duration(seconds: 2)),
    );
  }

  @override
  void dispose() {
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
    if (widget.api.onReconnected == _refreshMessageStatus) {
      widget.api.onReconnected = null;
    }
    for (final player in _audioPlayers.values) {
      player.dispose();
    }
    _audioPlayers.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    debugPrint('[_ChatScreenState.build] messages.len=${_messages.length}');
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            GestureDetector(
              onTap: _navigateToProfileOrGroup,
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
                        ? CachedNetworkImageProvider('${ApiService.baseUrl}${widget.avatarUrl}')
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
                          AppLocalizations.of(context).typing,
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).appBarTheme.foregroundColor?.withOpacity(0.7),
                          ),
                        );
                      }
                      if (widget.otherUserId != null) {
                        if (_isOtherOnline) {
                          return Text(
                            AppLocalizations.of(context).online,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.green.withOpacity(0.9),
                            ),
                          );
                        } else {
                          return Text(
                            AppLocalizations.of(context).offline,
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
                _navigateToProfileOrGroup();
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
                  title: Text(AppLocalizations.of(context).information),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
                value: 'mute',
                child: ListTile(
                  leading: Icon(_isMuted ? Icons.notifications : Icons.notifications_off),
                  title: Text(_isMuted ? AppLocalizations.of(context).unmute : AppLocalizations.of(context).mute),
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
          if (_wallpaperPath != null && File(_wallpaperPath!).existsSync())
            Positioned.fill(
              child: Image.file(
                File(_wallpaperPath!),
                fit: BoxFit.cover,
              ),
            ),
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
                                ? AppLocalizations.of(context).replyToYourself
                                : '${AppLocalizations.of(context).replyTo} ${_replyToMessage!.replyUsername ?? ''}',
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
                        ? Center(child: Text(AppLocalizations.of(context).noMessagesYet))
                        : ListView.builder(
                            key: PageStorageKey('chat_${widget.chatId}'),
                            controller: _scrollController,
                            reverse: true,
                            padding: const EdgeInsets.all(8),
                            itemCount: _messages.length,
                            itemBuilder: (_, i) {
                              final msg = _messages[_messages.length - 1 - i];
                              final child = _buildMessage(msg);
                              if (msg.isDeleted || msg.text == '[deleted]') {
                                return KeyedSubtree(key: ValueKey(msg.id), child: child);
                              }
                              return KeyedSubtree(
                                key: ValueKey('swipe_${msg.id}'),
                                child: _buildSwipeableMessage(msg, child),
                              );
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
                    Text(AppLocalizations.of(context).editingMessage),
                    const Spacer(),
                    TextButton(
                      onPressed: _cancelEdit,
                      child: Text(AppLocalizations.of(context).cancel),
                    ),
                  ],
                ),
              ),
            if (_pendingFile != null && !_isEditing)
              _buildPendingFilePreview(),
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
                                  ? AppLocalizations.of(context).editMessageHint
                                  : AppLocalizations.of(context).typeMessage,
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
                            onPressed: _isUploading ? null : _sendMessage,
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
    final svc = WallpaperService();
    final bool adaptive = svc.adaptiveTheme && svc.lastAnalysis != null;
    final WallpaperAnalysis? wa = svc.lastAnalysis;

    Color myBubbleColor;
    Color myTextColor;
    Color mySecTextColor;
    Color theirBubbleColor;
    Color theirTextColor;
    Color theirSecTextColor;

    if (adaptive) {
      myBubbleColor = wa!.accentColor;
      myTextColor = wa.textOnAccent;
      mySecTextColor = wa.textOnAccent.withValues(alpha: 0.7);
      theirBubbleColor = wa.surfaceColor;
      theirTextColor = wa.textMain;
      theirSecTextColor = wa.textSecondary;
    } else {
      myBubbleColor = Theme.of(context).colorScheme.primary;
      myTextColor = Theme.of(context).colorScheme.onPrimary;
      mySecTextColor = Theme.of(context).colorScheme.onPrimary.withValues(alpha: 0.7);
      theirBubbleColor = Theme.of(context).colorScheme.surfaceContainerHigh;
      theirTextColor = Theme.of(context).colorScheme.onSurface;
      theirSecTextColor = Theme.of(context).colorScheme.onSurfaceVariant;
    }

    if (msg.isDeleted || msg.text == '[deleted]') {
      final isMe = msg.userId == _currentUserId;
      final bubbleColor = isMe
          ? myBubbleColor
          : Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5);
      final textColor = isMe ? mySecTextColor : Theme.of(context).colorScheme.onSurfaceVariant;
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
                  AppLocalizations.of(context).messageDeleted,
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
      final imageUrl = '${ApiService.baseUrl}/download/${msg.fileId}?token=${widget.api.token}';
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
                      imageUrl: '${ApiService.baseUrl}/download/${msg.fileId}?token=${widget.api.token}',
                      fit: BoxFit.contain,
                      errorWidget: (_, __, ___) => Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isMe
                              ? myBubbleColor
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
                                  ? mySecTextColor
                                  : theirSecTextColor,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                fileName,
                                style: TextStyle(
color: isMe ? myTextColor : theirTextColor,
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
                        Text(
                          '${AppLocalizations.of(context).editedLabel} ',
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
        onTap: () => _openVideoFullscreen(
          '${ApiService.baseUrl}/download/${msg.fileId}?token=${widget.api.token}',
        ),
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
                    fit: FlexFit.loose,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: _VideoThumbnail(
                        videoUrl:
                          '${ApiService.baseUrl}/download/${msg.fileId}?token=${widget.api.token}',
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
                          Text(
                            '${AppLocalizations.of(context).editedLabel} ',
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

    if (hasFile && isAudio) {
      debugPrint('[_buildMessage.audio] msgId=${msg.id} deleted=${msg.isDeleted} fileId=${msg.fileId} playerExists=${_audioPlayers.containsKey(msg.id)}');
      final audioPlayer = _audioPlayers.putIfAbsent(msg.id, () => AudioPlayer(
        handleInterruptions: false,
        androidApplyAudioAttributes: false,
      ));
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
                      ? myBubbleColor
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
                      key: ValueKey('audio_${msg.id}'),
                      audioPlayer: audioPlayer,
                      audioUrl:
          '${ApiService.baseUrl}/download/${msg.fileId}?token=${widget.api.token}',
                      fileName: fileName,
                      isMe: isMe,
                      showFileName: ext != 'm4a',
                      onComplete: () => _onAudioComplete(msg.id),
                    ),
                    const SizedBox(height: 4),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (msg.isEdited)
                            Text(
                              '${AppLocalizations.of(context).editedLabel} ',
                              style: TextStyle(
                                fontSize: 10,
                                fontStyle: FontStyle.italic,
                                color: isMe ? mySecTextColor : theirSecTextColor,
                              ),
                            ),
                            Text(
                              _formatTime(msg.createdAt),
                              style: TextStyle(
                                fontSize: 10,
                                color: isMe ? mySecTextColor : theirSecTextColor,
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
                color: isMe ? myBubbleColor : theirBubbleColor,
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
                          color: isMe ? mySecTextColor : Theme.of(context).colorScheme.primary,
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
                          color: isMe ? mySecTextColor : theirSecTextColor,
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
                          color: isMe ? mySecTextColor : theirSecTextColor,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            fileName,
                            style: TextStyle(
                              color: isMe
                                  ? Theme.of(context).colorScheme.onSurface
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
                              _participantNames[msg.userId] ?? AppLocalizations.of(context).unknown,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: adaptive ? theirSecTextColor : Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        _buildMessageText(
                          _decryptedTexts[msg.id] ?? msg.plainText ?? (msg.keyType == 'e2ee_v1' ? AppLocalizations.of(context).e2eeLabel : msg.text),
                          isMe ? myTextColor : theirTextColor,
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
                            '${AppLocalizations.of(context).editedLabel} ',
                            style: TextStyle(
                              fontSize: 10,
                              fontStyle: FontStyle.italic,
                              color: isMe
                                  ? mySecTextColor
                                  : theirSecTextColor,
                            ),
                          ),
                        Text(
                          _formatTime(msg.createdAt),
                          style: TextStyle(
                            fontSize: 10,
                            color: isMe ? mySecTextColor : theirSecTextColor,
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

  Widget _buildSwipeableMessage(Message msg, Widget child) {
    final isMe = msg.userId == _currentUserId;
    return Dismissible(
      key: ValueKey('dismiss_${msg.id}'),
      direction: isMe ? DismissDirection.startToEnd : DismissDirection.endToStart,
      dismissThresholds: {
        isMe ? DismissDirection.startToEnd : DismissDirection.endToStart: 0.18,
      },
      movementDuration: const Duration(milliseconds: 200),
      confirmDismiss: (direction) async {
        _startReply(msg);
        return false;
      },
      background: Container(
        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        color: Colors.blue.withAlpha(50),
        child: const Icon(Icons.reply, color: Colors.blue),
      ),
      child: child,
    );
  }

  Widget _buildPendingFilePreview() {
    final isImage = _pendingFileMimeType?.startsWith('image/') ?? false;
    return Container(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: isImage && _pendingFile != null
                      ? Image.file(_pendingFile!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _fileIcon())
                      : _fileIcon(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _pendingFileName ?? AppLocalizations.of(context).file,
                  style: const TextStyle(fontSize: 13),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (_isUploading)
                Text(_uploadStatus, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500))
              else
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: _cancelPendingFile,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
            ],
          ),
          if (_isUploading) ...[
            const SizedBox(height: 6),
            LinearProgressIndicator(value: _uploadProgress > 0 ? _uploadProgress : null),
          ],
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  Widget _fileIcon() {
    final isVideo = _pendingFileMimeType?.startsWith('video/') ?? false;
    return Container(
      color: Theme.of(context).colorScheme.surfaceContainerHigh,
      child: Icon(
        isVideo ? Icons.videocam : Icons.insert_drive_file,
        size: 28,
      ),
    );
  }

  Widget _buildStatusIcon(MessageStatus status) {
    switch (status) {
      case MessageStatus.sending:
        return SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: Theme.of(context).colorScheme.outline,
          ),
        );
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
        text: AppLocalizations.of(context).messageNotFound,
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

  Widget _buildMessageText(String text, Color textColor) {
    final urlRegExp = RegExp(r'https?://[^\s]+');
    final matches = urlRegExp.allMatches(text).toList();

    if (matches.isEmpty) {
      return Text(text, style: TextStyle(color: textColor));
    }

    String stripTrailingPunctuation(String url) {
      return url.replaceAll(RegExp(r'[.,!?;:)]+$'), '');
    }

    final spans = <InlineSpan>[];
    int lastEnd = 0;

    for (final m in matches) {
      if (m.start > lastEnd) {
        spans.add(TextSpan(text: text.substring(lastEnd, m.start)));
      }
      final rawUrl = text.substring(m.start, m.end);
      final cleanUrl = stripTrailingPunctuation(rawUrl);
      spans.add(TextSpan(
        text: rawUrl,
        style: const TextStyle(color: Colors.blue, decoration: TextDecoration.underline),
        recognizer: TapGestureRecognizer()
          ..onTap = () => _openUrl(cleanUrl),
      ));
      lastEnd = m.end;
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastEnd)));
    }

    return RichText(
      text: TextSpan(style: TextStyle(color: textColor), children: spans),
    );
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme) return;
    try {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
    } catch (e) {
      debugPrint('=== URL LAUNCH ERROR: $e ===');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), duration: const Duration(seconds: 3)),
        );
      }
    }
  }

  void _showMessageMenu(Message msg) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.content_copy),
              title: Text(AppLocalizations.of(context).copy),
              onTap: () {
                Navigator.pop(ctx);
                final msgText = _decryptedTexts[msg.id] ?? msg.text;
                if (msgText.isNotEmpty) {
                  Clipboard.setData(ClipboardData(text: msgText));
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Скопировано'), duration: Duration(seconds: 2)),
                    );
                  }
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.reply),
              title: Text(AppLocalizations.of(context).reply),
              onTap: () {
                Navigator.pop(ctx);
                _startReply(msg);
              },
            ),
            if (msg.userId == _currentUserId) ...[
              ListTile(
                leading: const Icon(Icons.edit),
                title: Text(AppLocalizations.of(context).edit),
                onTap: () {
                  Navigator.pop(ctx);
                  _startEdit(msg);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete, color: Colors.red),
                title: Text(
                  AppLocalizations.of(context).delete,
                  style: const TextStyle(color: Colors.red),
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

  void _onAudioComplete(String completedId) {
    final completed = _messages.where((m) => m.id == completedId).firstOrNull;
    if (completed == null) return;
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    bool isAudioFile(Message m) {
      if (m.fileId == null) return false;
      final fileName = m.text.replaceFirst('[File] ', '');
      final ext = fileName.split('.').last.toLowerCase();
      return audioExts.contains(ext);
    }
    final next = _messages
        .where((m) => m.createdAt > completed.createdAt && isAudioFile(m))
        .fold<Message?>(null, (min, m) =>
            min == null || m.createdAt < min.createdAt ? m : min);
    if (next == null) return;
    for (final entry in _audioPlayers.entries) {
      if (entry.key != next.id) entry.value.pause();
    }
    _audioPlayers[next.id]?.play();
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
  final AudioPlayer audioPlayer;
  final String fileName;
  final bool isMe;
  final bool showFileName;
  final VoidCallback? onComplete;

  const _AudioPlayerWidget({
    super.key,
    required this.audioPlayer,
    required this.audioUrl,
    required this.fileName,
    required this.isMe,
    this.showFileName = true,
    this.onComplete,
  });

  @override
  State<_AudioPlayerWidget> createState() => _AudioPlayerWidgetState();
}

class _AudioPlayerWidgetState extends State<_AudioPlayerWidget> {
  static int _instanceCounter = 0;
  static final Map<AudioPlayer, String> _playerUrls = {};
  final int _instanceId = _instanceCounter++;
  late AudioPlayer _audioPlayer;
  bool _isInitialized = false;
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  StreamSubscription? _positionSub;
  StreamSubscription? _playerStateSub;

  @override
  void initState() {
    super.initState();
    debugPrint('[_AudioPlayerWidgetState#$runtimeType.initState] instance=$_instanceId url=${widget.audioUrl}');
    _audioPlayer = widget.audioPlayer;
    _setupStreams();
    _initAudio();
  }

  void _setupStreams() {
    _positionSub?.cancel();
    _playerStateSub?.cancel();
    _positionSub = _audioPlayer.positionStream.listen((pos) {
      if (mounted && pos.inSeconds >= 0) {
        if (_position > Duration.zero && pos == Duration.zero) {
          debugPrint('[_AudioWidget#${_instanceId}.positionStream] RESET TO ZERO _isPlaying=$_isPlaying');
        }
        setState(() => _position = pos);
      }
    });
    _playerStateSub = _audioPlayer.playerStateStream.listen((state) {
      if (mounted) {
        if (_isPlaying && !state.playing) {
          debugPrint('[_AudioWidget#${_instanceId}.playerStateStream] PLAYING→STOPPED processingState=${state.processingState}');
        }
        setState(() {
          _isPlaying = state.playing;
          if (state.processingState == ProcessingState.completed) {
            _audioPlayer.seek(Duration.zero);
            _audioPlayer.pause();
          }
        });
        if (state.processingState == ProcessingState.completed) {
          widget.onComplete?.call();
        }
      }
    });
  }

  @override
  void didUpdateWidget(covariant _AudioPlayerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    debugPrint('[_AudioWidget#${_instanceId}.didUpdateWidget] url=${widget.audioUrl} sameUrl=${oldWidget.audioUrl == widget.audioUrl}');
    if (oldWidget.audioUrl != widget.audioUrl) {
      debugPrint('[_AudioWidget#${_instanceId}.didUpdateWidget] URL CHANGED, reloading');
      _playerUrls.remove(_audioPlayer);
      _initAudio();
    }
  }

  Future<void> _initAudio() async {
    final cachedUrl = _playerUrls[_audioPlayer];
    debugPrint('[_AudioWidget#${_instanceId}._initAudio] cachedUrl=$cachedUrl widgetUrl=${widget.audioUrl} skip=${cachedUrl == widget.audioUrl}');
    if (cachedUrl == widget.audioUrl) {
      final duration = _audioPlayer.duration;
      if (mounted) {
        setState(() {
          _isInitialized = true;
          _duration = duration ?? Duration.zero;
        });
      }
      return;
    }
    try {
      debugPrint('[_AudioWidget#${_instanceId}._initAudio] CALLING setUrl url=${widget.audioUrl}');
      await _audioPlayer.setUrl(widget.audioUrl);
      _playerUrls[_audioPlayer] = widget.audioUrl;
      debugPrint('[_AudioWidget#${_instanceId}._initAudio] setUrl OK');
      final duration = _audioPlayer.duration;
      if (mounted) {
        setState(() {
          _isInitialized = true;
          _duration = duration ?? Duration.zero;
        });
      }
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
    final min = d.inMinutes.remainder(60);
    final sec = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$min:$sec';
  }

  @override
  void dispose() {
    debugPrint('[_AudioPlayerWidgetState#$runtimeType.dispose] instance=$_instanceId');
    _positionSub?.cancel();
    _playerStateSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textColor = widget.isMe
        ? Theme.of(context).colorScheme.onPrimary
        : Theme.of(context).colorScheme.onSurface;
    final dimColor = textColor.withValues(alpha: 0.6);
    final accentColor = widget.isMe ? dimColor : Theme.of(context).colorScheme.primary;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: _isInitialized ? _togglePlayPause : null,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: textColor.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(
              _isPlaying ? Icons.pause : Icons.play_arrow,
              color: textColor,
              size: 24,
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 160,
          child: _isInitialized
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (widget.showFileName)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          widget.fileName,
                          style: TextStyle(
                            color: textColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapDown: (details) {
                        if (!_isInitialized) return;
                        final ratio = (details.localPosition.dx / 160.0).clamp(0.0, 1.0);
                        _audioPlayer.seek(
                          Duration(milliseconds: (_duration.inMilliseconds * ratio).toInt()),
                        );
                      },
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          value: _duration.inMilliseconds > 0
                              ? (_position.inMilliseconds / _duration.inMilliseconds)
                                  .clamp(0.0, 1.0)
                              : 0,
                          backgroundColor: dimColor.withValues(alpha: 0.25),
                          color: accentColor,
                          minHeight: 8,
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          _formatDuration(_position),
                          style: TextStyle(fontSize: 10, color: dimColor),
                        ),
                        Text(
                          ' / ',
                          style: TextStyle(fontSize: 10, color: dimColor),
                        ),
                        Text(
                          _formatDuration(_duration),
                          style: TextStyle(fontSize: 10, color: dimColor),
                        ),
                      ],
                    ),
                  ],
                )
              : const SizedBox(
                  height: 4,
                  child: LinearProgressIndicator(),
                ),
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.videocam_off, color: Colors.white54, size: 40),
            const SizedBox(height: 8),
            Text(
              AppLocalizations.of(context).videoNotSupported,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
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
                  ? Text(
                      AppLocalizations.of(context).videoNotSupported,
                      style: const TextStyle(color: Colors.white),
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
