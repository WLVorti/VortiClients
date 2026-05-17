import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../models/account.dart';
import 'theme_provider.dart';

class ApiService {
  static const String baseUrl = 'http://77.34.76.27:3000';
  static const String wsUrl = 'ws://77.34.76.27:3000';
  static final List<String> logs = [];

  static void init() {
    addLog('App started');
    addLog('Server: $baseUrl');
    addLog('WS: $wsUrl');
  }

  static void addLog(String message) {
    final timestamp = DateTime.now().toIso8601String();
    logs.add('[$timestamp] $message');
    if (logs.length > 500) {
      logs.removeAt(0);
    }
  }

  static String getLogs() => logs.join('\n');

  final _storage = const FlutterSecureStorage();
  final _client = http.Client();
  String? _token;
  String? _userId;
  String? _fcmToken;
  WebSocketChannel? _wsChannel;
  final List<Function(Map<String, dynamic>)> _messageListeners = [];
  VoidCallback? onDisconnected;
  VoidCallback? onReconnecting;
  VoidCallback? onReconnected;
  VoidCallback? onOnlineUsersChanged;
  final Set<String> _onlineUsers = {};
  
  void addMessageListener(Function(Map<String, dynamic>) listener) {
    _messageListeners.add(listener);
  }
  
  void removeMessageListener(Function(Map<String, dynamic>) listener) {
    _messageListeners.remove(listener);
  }
  
  @Deprecated('Use addMessageListener/removeMessageListener instead')
  Function(Map<String, dynamic>)? get onMessage => null;
  
  @Deprecated('Use addMessageListener/removeMessageListener instead')
  set onMessage(Function(Map<String, dynamic>)? listener) {
    if (listener != null) {
      _messageListeners.clear();
      _messageListeners.add(listener);
    }
  }

  bool _isReconnecting = false;
  bool _isConnecting = false;
  bool _isIntentionalDisconnect = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 5;
  StreamSubscription<dynamic>? _wsStreamSubscription;

  String? get token => _token;
  String? get userId => _userId;
  Set<String> get onlineUsers => Set.unmodifiable(_onlineUsers);
  bool isUserOnline(String userId) => _onlineUsers.contains(userId);

  Future<void> saveCredentials(String token, String userId) async {
    _token = token;
    _userId = userId;
    await _storage.write(key: 'token', value: token);
    await _storage.write(key: 'userId', value: userId);
  }

  Future<void> loadCredentials() async {
    _token = await _storage.read(key: 'token');
    _userId = await _storage.read(key: 'userId');
    _fcmToken = await _storage.read(key: 'fcm_token');
    ApiService.addLog('Credentials loaded: token=${_token != null}, userId=$_userId');
  }

  Future<void> saveFcmToken(String token) async {
    _fcmToken = token;
    await _storage.write(key: 'fcm_token', value: token);
  }

  Future<void> clearCredentials() async {
    _token = null;
    _userId = null;
    await _storage.delete(key: 'token');
    await _storage.delete(key: 'userId');
  }

  // ==================== Account switcher ====================

  static const String _accountsKey = 'accounts_list';
  static const String _currentAccountKey = 'current_account_id';

  Future<List<Account>> getAccounts() async {
    final accountsJson = await _storage.read(key: _accountsKey);
    if (accountsJson == null) return [];
    final List<dynamic> decoded = jsonDecode(accountsJson);
    List<Account> accounts = decoded.map((a) => Account.fromJson(a)).toList();
    
    // Enrich accounts with data from separate keys if missing
    bool needsUpdate = false;
    for (int i = 0; i < accounts.length; i++) {
      Account acc = accounts[i];
      final username = await _storage.read(key: 'account_${acc.id}_username');
      final avatarUrl = await _storage.read(key: 'account_${acc.id}_avatar');
      final displayName = await _storage.read(key: 'account_${acc.id}_displayName');
      
      // Update if we have better data from storage
      if (username != null && (acc.username.isEmpty || acc.username == acc.id)) {
        accounts[i] = Account(
          id: acc.id,
          username: username,
          avatarUrl: avatarUrl ?? acc.avatarUrl,
          displayName: displayName ?? acc.displayName,
        );
        needsUpdate = true;
      }
    }
    
    // Save updated accounts list if we enriched any
    if (needsUpdate) {
      await _saveAccountsList(accounts);
    }
    
    return accounts;
  }

  Future<void> _saveAccountsList(List<Account> accounts) async {
    final encoded = jsonEncode(accounts.map((a) => a.toJson()).toList());
    await _storage.write(key: _accountsKey, value: encoded);
  }

  Future<String?> getCurrentAccountId() async {
    return await _storage.read(key: _currentAccountKey);
  }

  Future<void> _setCurrentAccountId(String accountId) async {
    await _storage.write(key: _currentAccountKey, value: accountId);
  }

  Future<void> addAccount(String token, String userId, String username, {String? avatarUrl, String? displayName}) async {
    final accounts = await getAccounts();
    final existing = accounts.indexWhere((a) => a.id == userId);
    final newAccount = Account(id: userId, username: username, avatarUrl: avatarUrl, displayName: displayName);

    if (existing >= 0) {
      accounts[existing] = newAccount;
    } else {
      accounts.add(newAccount);
    }

    await _saveAccountsList(accounts);
    await _storage.write(key: 'account_${userId}_token', value: token);
    await _storage.write(key: 'account_${userId}_username', value: username);
    if (avatarUrl != null) {
      await _storage.write(key: 'account_${userId}_avatar', value: avatarUrl);
    }
    if (displayName != null) {
      await _storage.write(key: 'account_${userId}_displayName', value: displayName);
    }
    await _setCurrentAccountId(userId);
    _token = token;
    _userId = userId;
  }

  Future<void> registerSavedDevice() async {
    if (_fcmToken != null && _token != null) {
      await registerDevice(_fcmToken!, 'android');
    }
  }

  Future<void> switchAccount(String accountId) async {
    final token = await _storage.read(key: 'account_${accountId}_token');
    if (token == null) return;

    _token = token;
    _userId = accountId;
    await _storage.write(key: 'token', value: token);
    await _storage.write(key: 'userId', value: accountId);
    await _setCurrentAccountId(accountId);
    disconnect();
    connectWebSocket();
    
    // Update account info if missing
    await updateAccountInfo(accountId);
    
    // Re-register FCM token for the new account
    if (_fcmToken != null) {
      await registerDevice(_fcmToken!, 'android');
    }
  }
  
  Future<void> updateAccountInfo(String accountId) async {
    try {
      final profile = await getProfile();
      if (profile != null) {
        final accounts = await getAccounts();
        final index = accounts.indexWhere((a) => a.id == accountId);
        if (index >= 0) {
          accounts[index] = Account(
            id: accountId,
            username: profile.username,
            avatarUrl: profile.avatarUrl ?? accounts[index].avatarUrl,
            displayName: profile.displayName,
          );
          await _saveAccountsList(accounts);
          // Also update separate keys
          await _storage.write(key: 'account_${accountId}_username', value: profile.username);
          await _storage.write(key: 'account_${accountId}_avatar', value: profile.avatarUrl ?? '');
          await _storage.write(key: 'account_${accountId}_displayName', value: profile.displayName);
        }
      }
    } catch (e) {
      print('Update account info error: $e');
    }
  }

  Future<bool> hasAccounts() async {
    final accounts = await getAccounts();
    return accounts.isNotEmpty;
  }

  Future<void> removeAccount(String accountId) async {
    final accounts = await getAccounts();
    accounts.removeWhere((a) => a.id == accountId);
    await _saveAccountsList(accounts);
    await _storage.delete(key: 'account_${accountId}_token');
    await _storage.delete(key: 'account_${accountId}_username');
    await _storage.delete(key: 'account_${accountId}_avatar');
    await _storage.delete(key: 'account_${accountId}_displayName');

    if (accountId == _userId) {
      _token = null;
      _userId = null;
      await _storage.delete(key: 'token');
      await _storage.delete(key: 'userId');
      if (accounts.isNotEmpty) {
        await switchAccount(accounts.first.id);
      }
    }
  }

  Future<Account?> getCurrentAccount() async {
    final currentId = await getCurrentAccountId();
    if (currentId == null) return null;
    final accounts = await getAccounts();
    return accounts.firstWhere((a) => a.id == currentId, orElse: () => accounts.first);
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  // ==================== Черновики ====================

  Future<void> saveDraft(String chatId, String text) async {
    try {
      await _client.post(
        Uri.parse('$baseUrl/drafts'),
        headers: _headers,
        body: jsonEncode({'chatId': chatId, 'text': text}),
      );
    } catch (e) {
      print('Save draft error: $e');
    }
  }

  Future<String?> getDraft(String chatId) async {
    try {
      final res = await _client.get(
        Uri.parse('$baseUrl/drafts/$chatId'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['draft'] != null) {
          return data['draft']['text'] as String;
        }
      }
    } catch (e) {
      print('Get draft error: $e');
    }
    return null;
  }

  Future<void> clearDraft(String chatId) async {
    try {
      await _client.delete(
        Uri.parse('$baseUrl/drafts/$chatId'),
        headers: _headers,
      );
    } catch (e) {
      print('Clear draft error: $e');
    }
  }

  // ==================== Auth ====================

  Future<Map<String, dynamic>> register(
    String username,
    String password,
  ) async {
    ApiService.addLog('Register attempt: $username to $baseUrl/register');
    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'username': username, 'password': password}),
      );

      ApiService.addLog('Register response: ${res.statusCode}');
      final data = jsonDecode(res.body);
      if (res.statusCode == 201) {
        await _saveAccountFromResponse(data, username);
        ApiService.addLog('Register success: ${data['userId']}');
        connectWebSocket();
        return data;
      } else {
        ApiService.addLog('Register failed: ${data['message']}');
        return data;
      }
    } catch (e) {
      ApiService.addLog('Register EXCEPTION: $e');
      return {'status': 'error', 'message': '$e'};
    }
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    ApiService.addLog('Login attempt: $username to $baseUrl/login');
    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'username': username, 'password': password}),
      );

      ApiService.addLog('Login response: ${res.statusCode}');
      final data = jsonDecode(res.body);
      if (res.statusCode == 200) {
        await _saveAccountFromResponse(data, username);
        ApiService.addLog('Login success: ${data['userId']}');
        connectWebSocket();
      } else {
        ApiService.addLog('Login failed: ${data['message']}');
      }
      return data;
    } catch (e) {
      ApiService.addLog('Login EXCEPTION: $e');
      return {'status': 'error', 'message': '$e'};
    }
  }

  Future<void> _saveAccountFromResponse(Map<String, dynamic> data, String username) async {
    final token = data['token'] as String;
    final userId = data['userId'] as String;
    _token = token;
    _userId = userId;
    
    await _storage.write(key: 'token', value: token);
    await _storage.write(key: 'userId', value: userId);

    ThemeProvider().setCurrentUser(userId);
    await ThemeProvider.loadTheme();
    
    // Try to get profile info
    Profile? profile;
    try {
      profile = await getProfile();
    } catch (_) {}
    
    // Add to accounts list
    await addAccount(
      token,
      userId,
      profile?.username ?? username,
      avatarUrl: profile?.avatarUrl,
      displayName: profile?.displayName,
    );
  }

  // ==================== API ====================

  Future<Profile?> getProfile() async {
    try {
      final res = await _client.get(
        Uri.parse('$baseUrl/profile'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        print('Get profile response: ${res.body}'); // Debug log
        if (data['profile'] != null) {
          return Profile.fromJson(data['profile']);
        } else if (data['id'] != null) {
          // Handle case where API returns profile directly
          return Profile.fromJson(data);
        } else if (data['status'] == 'success' && data['profile'] != null) {
          return Profile.fromJson(data['profile']);
        }
      }
    } catch (e) {
      print('Get profile error: $e');
    }
    return null;
  }

  Future<List<User>> searchUsers(String query) async {
    final res = await _client.get(
      Uri.parse('$baseUrl/users?search=$query'),
      headers: _headers,
    );

    final data = jsonDecode(res.body);
    return (data['users'] as List).map((u) => User.fromJson(u)).toList();
  }

  Future<List<Chat>> getChats() async {
    final res = await _client.get(
      Uri.parse('$baseUrl/chats'),
      headers: _headers,
    );

    final data = jsonDecode(res.body);
    ApiService.addLog('[API] getChats: ${res.statusCode}');
      print('[API] getChats response: ${res.body}');
    final chats = (data['chats'] as List).map((c) => Chat.fromJson(c)).toList();
    print(
      '[API] parsed chats: ${chats.map((c) => {'id': c.id, 'name': c.name}).toList()}',
    );
    return chats;
  }

  Future<Chat?> getChat(String chatId) async {
    final chats = await getChats();
    try {
      return chats.firstWhere((c) => c.id == chatId);
    } catch (_) {
      return null;
    }
  }

  Future<dynamic> getChatInfo(String chatId) async {
    final res = await _client.get(
      Uri.parse('$baseUrl/chats/$chatId'),
      headers: _headers,
    );
    final data = jsonDecode(res.body);
    if (data['status'] == 'success') {
      return data['chat'];
    }
    return null;
  }

  Future<List<dynamic>> getParticipants(String chatId) async {
    final res = await _client.get(
      Uri.parse('$baseUrl/chats/$chatId/participants'),
      headers: _headers,
    );
    final data = jsonDecode(res.body);
    if (data['status'] == 'success') {
      return data['participants'] as List<dynamic>;
    }
    return [];
  }

  Future<void> addParticipant(String chatId, String userId) async {
    await _client.post(
      Uri.parse('$baseUrl/chats/$chatId/participants'),
      headers: _headers,
      body: jsonEncode({'userId': userId}),
    );
  }

  Future<void> removeParticipant(String chatId, String userId) async {
    await _client.delete(
      Uri.parse('$baseUrl/chats/$chatId/participants/$userId'),
      headers: _headers,
    );
  }

  Future<void> setParticipantRole(String chatId, String userId, String role) async {
    await _client.put(
      Uri.parse('$baseUrl/chats/$chatId/participants/$userId/role'),
      headers: _headers,
      body: jsonEncode({'role': role}),
    );
  }

  Future<void> updateGroupName(String chatId, String name) async {
    await _client.put(
      Uri.parse('$baseUrl/chats/$chatId/name'),
      headers: _headers,
      body: jsonEncode({'name': name}),
    );
  }

  Future<void> transferOwnership(String chatId, String userId) async {
    await _client.put(
      Uri.parse('$baseUrl/chats/$chatId/transfer'),
      headers: _headers,
      body: jsonEncode({'userId': userId}),
    );
  }

  Future<bool> leaveGroup(String chatId) async {
    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/chats/$chatId/leave'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      ApiService.addLog('Leave group error: $e');
      return false;
    }
  }

  Future<bool> deleteGroup(String chatId) async {
    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/chats/$chatId'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      ApiService.addLog('Delete group error: $e');
      return false;
    }
  }

  Future<String?> createChat(
    String type,
    List<String> participants, {
    String? name,
  }) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/chats'),
      headers: _headers,
      body: jsonEncode({
        'type': type,
        'participants': participants,
        if (name != null) 'name': name,
      }),
    );

    final data = jsonDecode(res.body);
    return data['chatId'];
  }

  Future<List<Message>> getMessages(String chatId, {int limit = 50}) async {
    final res = await _client.get(
      Uri.parse('$baseUrl/chats/$chatId/messages?limit=$limit'),
      headers: _headers,
    );

    final data = jsonDecode(res.body);
    return (data['messages'] as List).map((m) => Message.fromJson(m)).toList();
  }

  // ==================== WebSocket ====================

  void connectWebSocket() {
    ApiService.addLog('WS: Connecting to $wsUrl');
    if (_token == null) {
      ApiService.addLog('WS: No token, skipping connection');
      return;
    }
    if (_isConnecting) {
      ApiService.addLog('WS: Already connecting...');
      return;
    }
    if (_wsChannel != null) {
      ApiService.addLog('WS: Already connected');
      return;
    }
    if (_isReconnecting && _reconnectAttempts >= _maxReconnectAttempts) {
      ApiService.addLog('WS: Max reconnect attempts reached');
      print('WS: Max reconnect attempts reached');
      return;
    }

    _isConnecting = true;
    try {
      ApiService.addLog('WS: Creating connection...');
      _wsChannel = WebSocketChannel.connect(Uri.parse(wsUrl));

      _wsStreamSubscription = _wsChannel!.stream.listen(
        (data) {
          final msg = jsonDecode(data);

          if (msg['type'] == 'online') {
            final userId = msg['userId'] as String?;
            final status = msg['status'] as String?;
            if (userId != null && status != null) {
              if (status == 'online') {
                _onlineUsers.add(userId);
              } else {
                _onlineUsers.remove(userId);
              }
              onOnlineUsersChanged?.call();
            }
          }

          if (msg['type'] == 'online_users') {
            final users = msg['users'] as List<dynamic>?;
            if (users != null) {
              _onlineUsers.clear();
              _onlineUsers.addAll(users.cast<String>());
              onOnlineUsersChanged?.call();
            }
          }

          if (msg['type'] == 'incoming_call') {
            ApiService.addLog('Incoming call: ${msg['callId']} from ${msg['callerId']}');
            onIncomingCall?.call(Map<String, dynamic>.from(msg));
          }

          if (msg['type'] == 'call_accepted') {
            final callId = msg['callId'] as String?;
            if (callId != null) {
              ApiService.addLog('Call accepted: $callId');
              onCallAccepted?.call(callId);
            }
          }

          if (msg['type'] == 'call_rejected') {
            final callId = msg['callId'] as String?;
            if (callId != null) {
              ApiService.addLog('Call rejected: $callId');
              onCallRejected?.call(callId);
            }
          }

          if (msg['type'] == 'call_ended') {
            final callId = msg['callId'] as String?;
            if (callId != null) {
              ApiService.addLog('Call ended: $callId');
              onCallEnded?.call(callId);
            }
          }

          if (msg['type'] == 'call_signal') {
            ApiService.addLog('Call signal received: ${msg['signalType']}');
            onCallSignal?.call(Map<String, dynamic>.from(msg));
          }

          for (final listener in List.from(_messageListeners)) {
            listener(msg);
          }
        },
        onError: (err) {
          ApiService.addLog('WS Error: $err');
      print('WS Error: $err');
          _wsStreamSubscription = null;
          _isConnecting = false;
          _handleDisconnect();
        },
        onDone: () {
          ApiService.addLog('WS Closed');
      print('WS Closed');
          _wsStreamSubscription = null;
          _isConnecting = false;
          _handleDisconnect();
        },
      );

      // Guard: if onDone/onError fired synchronously during listen(), channel is dead
      if (_wsChannel == null) {
        _isConnecting = false;
        return;
      }

      _wsChannel!.sink.add(jsonEncode({'type': 'auth', 'token': _token}));
      _isConnecting = false;

      if (_isReconnecting) {
        _isReconnecting = false;
        _reconnectAttempts = 0;
        onReconnected?.call();
      }
    } catch (e) {
      ApiService.addLog('WS Connect Error: $e');
      print('WS Connect Error: $e');
      _isConnecting = false;
      _wsStreamSubscription = null;
      _wsChannel = null;
      if (_isReconnecting) {
        _isReconnecting = false;
      }
      _handleDisconnect();
    }
  }

  void _handleDisconnect() {
    _isConnecting = false;
    if (_isReconnecting) return;
    if (_isIntentionalDisconnect) {
      _isIntentionalDisconnect = false;
      return;
    }

    // Close and discard dead channel so connectWebSocket can create a new one
    _wsStreamSubscription?.cancel();
    _wsStreamSubscription = null;
    try { _wsChannel?.sink.close(); } catch (_) {}
    _wsChannel = null;

    _isReconnecting = true;
    _reconnectAttempts++;

    onDisconnected?.call();

    if (_reconnectAttempts <= _maxReconnectAttempts) {
      onReconnecting?.call();

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      final delay = Duration(seconds: _reconnectAttempts);
      print(
        'WS: Reconnecting in ${delay.inSeconds}s (attempt $_reconnectAttempts/$_maxReconnectAttempts)',
      );

      Future.delayed(delay, () {
        if (_token != null && _isReconnecting) {
          connectWebSocket();
        }
      });
    }
  }

  Future<void> sendMessageViaWs(String chatId, String text, {String? replyTo, String? tempId}) async {
    if (_wsChannel?.sink != null) {
      try {
        _wsChannel!.sink.add(
          jsonEncode({
            'type': 'send',
            'chatId': chatId,
            'text': text,
            if (replyTo != null) 'replyTo': replyTo,
            if (tempId != null) 'tempId': tempId,
          }),
        );
        return;
      } catch (e) {
        print('WS send error: $e');
      }
    }
    await sendMessageViaRest(chatId, text, replyTo: replyTo);
  }

  Future<void> sendMessageViaRest(String chatId, String text, {String? replyTo}) async {
    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/chats/$chatId/messages'),
        headers: _headers,
        body: jsonEncode({'text': text, if (replyTo != null) 'replyTo': replyTo}),
      );
      if (res.statusCode == 200) {
        // Don't call onMessage here - server will broadcast it back via WebSocket
      }
    } catch (e) {
      print('REST send error: $e');
    }
  }

  void sendMessage(String chatId, String text, {String? replyTo, String? tempId}) {
    sendMessageViaWs(chatId, text, replyTo: replyTo, tempId: tempId);
  }

  void sendTyping(String chatId, bool isTyping) {
    _wsChannel?.sink.add(
      jsonEncode({'type': 'typing', 'chatId': chatId, 'isTyping': isTyping}),
    );
  }

  void sendPing() {
    _wsChannel?.sink.add(jsonEncode({'type': 'ping'}));
  }

  void sendRead(String messageId) {
    _wsChannel?.sink.add(jsonEncode({'type': 'read', 'messageId': messageId}));
  }

  // ==================== Files ====================

  Future<Map<String, String>?> uploadFile(File file) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/upload'));

    request.headers.addAll({'Authorization': 'Bearer $_token'});

    final mimeType = _getMimeType(file.path);
    request.files.add(
      await http.MultipartFile.fromPath(
        'file',
        file.path,
        contentType: MediaType.parse(mimeType),
      ),
    );

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    final data = jsonDecode(response.body);

    if (response.statusCode == 200 || response.statusCode == 201) {
      return {'fileId': data['fileId'], 'mimeType': mimeType};
    }
    return null;
  }

  String _getMimeType(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'doc':
      case 'docx':
        return 'application/msword';
      case 'txt':
        return 'text/plain';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'm4a':
      case 'aac':
        return 'audio/mp4';
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      default:
        return 'application/octet-stream';
    }
  }

  Future<void> sendFileViaWs(String chatId, String fileId, {String? replyTo, String? mimeType}) async {
    try {
      _wsChannel?.sink.add(
        jsonEncode({
          'type': 'sendFile',
          'chatId': chatId,
          'fileId': fileId,
          if (replyTo != null) 'replyTo': replyTo,
          if (mimeType != null) 'fileMimeType': mimeType,
        }),
      );
    } catch (e) {
      await sendFileViaRest(chatId, fileId, replyTo: replyTo, mimeType: mimeType);
    }
  }

  Future<void> sendFileViaRest(String chatId, String fileId, {String? replyTo, String? mimeType}) async {
    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/chats/$chatId/messages'),
        headers: _headers,
        body: jsonEncode({
          'text': '[File]',
          'fileId': fileId,
          if (replyTo != null) 'replyTo': replyTo,
        }),
      );
      if (res.statusCode == 200) {
        // Don't call onMessage here - server will broadcast it back via WebSocket
      }
    } catch (e) {
      print('REST sendFile error: $e');
    }
  }

  void sendFile(
    String chatId,
    String fileId, {
    String? replyTo,
    String? mimeType,
  }) {
    sendFileViaWs(chatId, fileId, replyTo: replyTo, mimeType: mimeType);
  }

  // ==================== Messages ====================

  Future<bool> editMessage(String messageId, String newText) async {
    try {
      final res = await _client.put(
        Uri.parse('$baseUrl/messages/$messageId'),
        headers: _headers,
        body: jsonEncode({'text': newText}),
      );
      return res.statusCode == 200;
    } catch (e) {
      print('Edit message error: $e');
      return false;
    }
  }

  Future<bool> deleteMessage(String messageId) async {
    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/messages/$messageId'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      print('Delete message error: $e');
      return false;
    }
  }

  Future<Map<String, int>> getUnreadCounts() async {
    try {
      final res = await _client.get(
        Uri.parse('$baseUrl/chats/unread'),
        headers: _headers,
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return Map<String, int>.from(data['unread'] ?? {});
      }
    } catch (e) {
      print('Get unread counts error: $e');
    }
    return {};
  }

  // ==================== Profile ====================

  Future<Profile?> updateProfile({String? displayName, String? bio}) async {
    try {
      final res = await _client.put(
        Uri.parse('$baseUrl/profile'),
        headers: _headers,
        body: jsonEncode({
          if (displayName != null) 'displayName': displayName,
          if (bio != null) 'bio': bio,
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['profile'] != null) {
          return Profile.fromJson(data['profile']);
        }
      }
    } catch (e) {
      print('Update profile error: $e');
    }
    return null;
  }

  Future<String?> uploadAvatar(File file) async {
    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/profile/avatar'),
      );
      request.headers.addAll({'Authorization': 'Bearer $_token'});
      request.files.add(await http.MultipartFile.fromPath('avatar', file.path));

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);
      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        return '$baseUrl${data['avatarUrl']}';
      }
    } catch (e) {
      print('Upload avatar error: $e');
    }
    return null;
  }

  Future<bool> deleteAvatar() async {
    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/profile/avatar'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      print('Delete avatar error: $e');
      return false;
    }
  }

  Future<String?> uploadGroupAvatar(String chatId, File file) async {
    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/chats/$chatId/avatar'),
      );
      request.headers.addAll({'Authorization': 'Bearer $_token'});
      request.files.add(await http.MultipartFile.fromPath('avatar', file.path));

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);
      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        return '$baseUrl${data['avatarUrl']}';
      }
    } catch (e) {
      print('Upload group avatar error: $e');
    }
    return null;
  }

  Future<bool> deleteGroupAvatar(String chatId) async {
    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/chats/$chatId/avatar'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      print('Delete group avatar error: $e');
      return false;
    }
  }

  Future<Profile?> getUserProfile(String userId) async {
    try {
      final res = await _client.get(
        Uri.parse('$baseUrl/users/$userId/profile'),
        headers: _headers,
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['profile'] != null) {
          return Profile.fromJson(data['profile']);
        }
      }
    } catch (e) {
      print('Get user profile error: $e');
    }
    return null;
  }

  void disconnect() {
    _isIntentionalDisconnect = true;
    _isReconnecting = false;
    _reconnectAttempts = 0;
    _isConnecting = false;
    _wsStreamSubscription?.cancel();
    _wsStreamSubscription = null;
    try { _wsChannel?.sink.close(); } catch (_) {}
    _wsChannel = null;
  }

  void reconnectWebSocket() {
    _isConnecting = false;
    _wsStreamSubscription?.cancel();
    _wsStreamSubscription = null;
    try { _wsChannel?.sink.close(); } catch (_) {}
    _wsChannel = null;
    _isReconnecting = true;
    _reconnectAttempts = 0;
    connectWebSocket();
  }

  Future<bool> registerDevice(
    String token,
    String platform, {
    String? deviceName,
  }) async {
    if (_token == null) return false;

    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/devices'),
        headers: _headers,
        body: jsonEncode({
          'token': token,
          'platform': platform,
          'deviceName': deviceName,
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (kDebugMode) {
          print('Device registered: ${data['id']}');
        }
        return true;
      }
    } catch (e) {
      if (kDebugMode) {
        print('Register device error: $e');
      }
    }
    return false;
  }

  Future<List<Map<String, dynamic>>> getDevices() async {
    if (_token == null) return [];

    try {
      final res = await _client.get(
        Uri.parse('$baseUrl/devices'),
        headers: _headers,
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return List<Map<String, dynamic>>.from(data['devices'] ?? []);
      }
    } catch (e) {
      if (kDebugMode) {
        print('Get devices error: $e');
      }
    }
    return [];
  }

  Future<bool> unregisterDevice(String deviceId) async {
    if (_token == null) return false;

    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/devices/$deviceId'),
        headers: _headers,
      );

      return res.statusCode == 200;
    } catch (e) {
      if (kDebugMode) {
        print('Unregister device error: $e');
      }
    }
    return false;
  }

  Future<bool> unregisterAllDevices() async {
    if (_token == null) return false;

    try {
      final res = await _client.delete(
        Uri.parse('$baseUrl/devices'),
        headers: _headers,
      );

      return res.statusCode == 200;
    } catch (e) {
      if (kDebugMode) {
        print('Unregister all devices error: $e');
      }
    }
    return false;
  }

  // ==================== Calls ====================

  Future<Map<String, dynamic>?> createCall(String chatId, {String callType = 'video'}) async {
    try {
      ApiService.addLog('Creating call for chat: $chatId');
      final res = await _client.post(
        Uri.parse('$baseUrl/chats/$chatId/call'),
        headers: _headers,
        body: jsonEncode({'callType': callType}),
      );
      ApiService.addLog('Create call response: ${res.statusCode}');
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      ApiService.addLog('Create call error: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> getCall(String callId) async {
    try {
      final res = await _client.get(
        Uri.parse('$baseUrl/calls/$callId'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      ApiService.addLog('Get call error: $e');
    }
    return null;
  }

  Future<bool> acceptCall(String callId) async {
    try {
      ApiService.addLog('Accepting call: $callId');
      final res = await _client.post(
        Uri.parse('$baseUrl/calls/$callId/accept'),
        headers: _headers,
      );
      ApiService.addLog('Accept call response: ${res.statusCode}');
      return res.statusCode == 200;
    } catch (e) {
      ApiService.addLog('Accept call error: $e');
    }
    return false;
  }

  Future<bool> rejectCall(String callId) async {
    try {
      ApiService.addLog('Rejecting call: $callId');
      final res = await _client.post(
        Uri.parse('$baseUrl/calls/$callId/reject'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      ApiService.addLog('Reject call error: $e');
    }
    return false;
  }

  Future<bool> endCall(String callId) async {
    try {
      ApiService.addLog('Ending call: $callId');
      final res = await _client.delete(
        Uri.parse('$baseUrl/calls/$callId'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (e) {
      ApiService.addLog('End call error: $e');
    }
    return false;
  }

  // Callbacks for WebSocket call events
  Function(Map<String, dynamic>)? onIncomingCall;
  Function(String callId)? onCallAccepted;
  Function(String callId)? onCallRejected;
  Function(String callId)? onCallEnded;

  // WebRTC signaling
  void sendCallSignal(String callId, Map<String, dynamic> signal) {
    if (_wsChannel != null) {
      _wsChannel!.sink.add(jsonEncode({
        'type': 'call_signal',
        'callId': callId,
        ...signal,
      }));
    }
  }

  Function(Map<String, dynamic>)? onCallSignal;
}

typedef VoidCallback = void Function();
