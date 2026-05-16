import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'services/api_service.dart';
import 'services/theme_provider.dart';
import 'services/notification_service.dart';
import 'services/mute_service.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'screens/chat_screen.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  ApiService.addLog('Firebase.initializeApp() starting...');
  await Firebase.initializeApp();
  ApiService.addLog('Firebase.initializeApp() done');
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

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
    ApiService.addLog('_checkAuth: loading credentials...');
    await _api.loadCredentials();
    ApiService.addLog('_checkAuth: credentials loaded');
    ThemeProvider().setCurrentUser(_api.userId);
    ApiService.addLog('_checkAuth: loading theme...');
    await ThemeProvider().loadTheme();
    ApiService.addLog('_checkAuth: theme loaded');
    ApiService.addLog('_checkAuth: initializing MuteService...');
    await MuteService.init();
    ApiService.addLog('_checkAuth: MuteService done');
    if (_api.token != null) {
      MuteService.setApi(_api);
      ApiService.addLog('_checkAuth: initializing notifications...');
      await _initNotifications();
      ApiService.addLog('_checkAuth: notifications done');
    }

    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _initNotifications() async {
    ApiService.addLog('_initNotifications: initialize()...');
    await _notifications.initialize();
    ApiService.addLog('_initNotifications: initialize() done');

    _notifications.onTokenRefresh.listen((token) async {
      if (token != null && _api.token != null) {
        await _api.registerDevice(token, 'android');
        await _api.saveFcmToken(token);
      }
    });

    _notifications.onNotificationTap = (chatId, data) async {
      ApiService.addLog('Notification tapped: chatId=$chatId');
      if (chatId != null && mounted) {
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
      }
    };

    ApiService.addLog('_initNotifications: getToken()...');
    final token = await _notifications.getToken();
    ApiService.addLog('_initNotifications: getToken() done, token=$token');
    if (token != null && _api.token != null) {
      await _api.registerDevice(token, 'android');
      await _api.saveFcmToken(token);
    }
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
