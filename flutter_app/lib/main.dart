import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'services/api_service.dart';
import 'services/theme_provider.dart';
import 'services/notification_service.dart';
import 'services/mute_service.dart';
import 'services/message_cache.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'screens/chat_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  ApiService.addLog('Firebase.initializeApp() starting...');
  await Firebase.initializeApp();
  ApiService.addLog('Firebase.initializeApp() done');
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  await MessageCache.init();

  runApp(const VortiApp());
}

class VortiApp extends StatefulWidget {
  const VortiApp({super.key});

  @override
  State<VortiApp> createState() => _VortiAppState();
}

class _VortiAppState extends State<VortiApp> {
  final _api = ApiService();
  final _notifications = NotificationService();
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    ApiService.init();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    try {
      ApiService.addLog('_checkAuth: loading credentials...');
      await _api.loadCredentials().timeout(const Duration(seconds: 10));
      ApiService.addLog('_checkAuth: credentials loaded');

      // Check if session expired due to inactivity (> 7 days)
      if (_api.token != null) {
        final expired = await _api.isSessionExpired();
        if (expired) {
          ApiService.addLog('_checkAuth: session expired by inactivity, clearing credentials');
          _api.clearCredentials();
        }
      }

      ApiService.addLog('_checkAuth: saved token=${_api.token != null}');
      ThemeProvider().setCurrentUser(_api.userId);
      ApiService.addLog('_checkAuth: loading theme...');
      await ThemeProvider().loadTheme();
      ApiService.addLog('_checkAuth: theme loaded');
      ApiService.addLog('_checkAuth: initializing MuteService...');
      await MuteService.init();
      ApiService.addLog('_checkAuth: MuteService done');
      MuteService.setApi(_api);
      ApiService.addLog('_checkAuth: initializing notifications...');
      await _initNotifications();
      ApiService.addLog('_checkAuth: notifications done');
    } catch (e) {
      ApiService.addLog('_checkAuth error: $e');
    }

    _api.onAuthExpired = () {
      if (mounted) setState(() {});
    };

    if (_api.token != null) {
      _api.updateLastActive();
    }

    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  StreamSubscription<String?>? _tokenSubscription;

  Future<void> _initNotifications() async {
    ApiService.addLog('_initNotifications: initialize()...');
    await _notifications.initialize();
    ApiService.addLog('_initNotifications: initialize() done');

    _tokenSubscription?.cancel();
    _tokenSubscription = _notifications.onTokenRefresh.listen((token) async {
      if (token != null && _api.token != null) {
        await _api.registerDevice(token, 'android');
        await _api.saveFcmToken(token);
      }
    }, onError: (e) {
      ApiService.addLog('Token refresh error: $e');
    });

    _notifications.onNavigateToChat = (chatId, data) async {
      ApiService.addLog('Notification tapped: chatId=$chatId');
      if (!mounted) return;
      final chat = await _api.getChat(chatId);
      if (mounted && chat != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChatScreen(
              api: _api,
              chatId: chat.id,
              chatName: chat.name ?? 'Chat',
              avatarUrl: chat.avatarUrl,
            ),
          ),
        );
      }
    };

    ApiService.addLog('_initNotifications: getToken()...');
    final token = await _notifications.getToken();
    ApiService.addLog('_initNotifications: getToken() done, token=$token');
    if (token != null) {
      await _api.saveFcmToken(token);
      if (_api.token != null) {
        await _api.registerDevice(token, 'android');
      }
    }

    ApiService.addLog('_initNotifications: getInitialMessage()...');
    final initialData = await _notifications.getInitialMessage();
    if (initialData != null) {
      ApiService.addLog('App launched from notification: $initialData');
      final chatId = initialData['chatId'] as String?;
      if (chatId != null) {
        _notifications.onNavigateToChat?.call(chatId, initialData);
      }
    }
  }

  @override
  void dispose() {
    _tokenSubscription?.cancel();
    MuteService.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ThemeProvider(),
      builder: (context, _) {
        return MaterialApp(
          title: 'Vorti Messenger',
          debugShowCheckedModeBanner: false,
          themeMode: ThemeProvider().themeMode,
          theme: ThemeProvider().getThemeData(),
          darkTheme: ThemeProvider().getThemeData(),
          home: _isLoading
              ? Scaffold(
                  body: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 24),
                        Text(
                          ApiService.logs.isNotEmpty
                              ? 'Step: ${ApiService.logs.last}'
                              : 'Starting...',
                          style: Theme.of(context).textTheme.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),
                        FilledButton.icon(
                          onPressed: () {
                            Clipboard.setData(
                              ClipboardData(text: ApiService.getLogs()),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Logs copied to clipboard'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                          },
                          icon: const Icon(Icons.copy, size: 18),
                          label: const Text('Copy logs'),
                        ),
                      ],
                    ),
                  ),
                )
              : _api.token != null
              ? HomeScreen(api: _api)
              : AuthScreen(api: _api),
        );
      },
    );
  }
}
