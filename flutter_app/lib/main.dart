import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'services/api_service.dart';
import 'services/theme_provider.dart';
import 'services/locale_provider.dart';
import 'services/notification_service.dart';
import 'services/mute_service.dart';
import 'services/chat_storage.dart';
import 'services/hidden_chats.dart';
import 'services/crypto_service.dart';
import 'services/wallpaper_service.dart';
import 'services/deep_link_service.dart';
import 'services/share_receiver.dart';
import 'utils/avatar_utils.dart';
import 'l10n/app_localizations.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/share_forward_screen.dart';
import 'screens/profile_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // До первого кадра грузим только то, без чего нельзя решить, какой экран
  // показывать (токен), и отрисовать его в нужной теме. Всё остальное —
  // Firebase, пуши, E2EE, WebSocket — поднимается уже в фоне с экрана чатов.
  ApiService.init();
  final api = ApiService();

  // Независимые локальные инициализации идут параллельно с credentials —
  // secure storage и shared prefs не должны складываться в очередь.
  final localInit = Future.wait([
    LocaleProvider().loadLocale(),
    ChatStorage.init(),
    HiddenChats.init(),
  ]);

  try {
    // Проверка сессии не зависит от credentials — читаем параллельно.
    final sessionExpired = api.isSessionExpired();
    await api.loadCredentials().timeout(const Duration(seconds: 5));
    if (api.token != null && await sessionExpired) {
      ApiService.addLog(
        'startup: session expired by inactivity, clearing credentials',
      );
      await api.clearCredentials();
    }
  } catch (e) {
    ApiService.addLog('startup: credentials error: $e');
  }

  ThemeProvider().setCurrentUser(api.userId);
  WallpaperService().setCurrentUser(api.userId);
  // Резолвер владельца кэша нужен уже здесь — профиль читается до runApp.
  ChatStorage.ownerResolver = () => api.userId;
  // Профиль с диска грузим параллельно с темой — вкладка Account
  // будет заполнена с первого кадра, без пустых полей.
  final profilePrime = localInit.then((_) async {
    final p = await ChatStorage.loadProfile();
    if (p != null) ProfileScreen.primeProfileCache(p);
  });
  try {
    // Ключи темы привязаны к userId — грузим только после credentials.
    await Future.wait([ThemeProvider().loadTheme(), localInit, profilePrime]);
  } catch (e) {
    ApiService.addLog('startup: theme/locale error: $e');
  }

  runApp(VortiApp(api: api));
}

class VortiApp extends StatefulWidget {
  final ApiService api;

  const VortiApp({super.key, required this.api});

  @override
  State<VortiApp> createState() => _VortiAppState();
}

class _VortiAppState extends State<VortiApp> {
  ApiService get _api => widget.api;
  // Создаётся лениво: NotificationService нельзя трогать до Firebase.
  late final _notifications = NotificationService();
  final _navigatorKey = GlobalKey<NavigatorState>();
  Future<void> _shareInit = Future.value();
  StreamSubscription<String?>? _tokenSubscription;

  @override
  void initState() {
    super.initState();
    // Кэш истории всегда относится к текущему аккаунту.
    ChatStorage.ownerResolver = () => _api.userId;

    _api.onAuthExpired = () {
      if (mounted) setState(() {});
    };
    if (_api.token != null) _api.updateLastActive();

    _shareInit = ShareReceiver.init(_handleSharedContent);
    DeepLinkService().init(_handleDeepLink);

    // Экран чатов уже строится из аргументов main(), а подключение,
    // пуши и остальная инициализация идут следом, не блокируя вход.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_initInBackground());
    });
  }

  void _handleSharedContent(SharedContent content) {
    if (!mounted || _api.token == null || content.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _navigatorKey.currentContext;
      if (ctx == null || !mounted) return;
      Navigator.of(ctx).push(
        MaterialPageRoute(
          builder: (_) => ShareForwardScreen(api: _api, content: content),
        ),
      );
    });
  }

  void _handleDeepLink(Uri uri) {
    if (uri.scheme != 'vortimes' || uri.host != 'reset-password') return;
    String? token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) {
      final m = RegExp(r'[?&]token=([^&]+)').firstMatch(uri.toString());
      token = m?.group(1);
    }
    if (token == null || token.isEmpty || !mounted || _api.token != null) {
      return;
    }
    _showResetPasswordFromDeepLink(token);
  }

  void _showResetPasswordFromDeepLink(String token) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _navigatorKey.currentContext;
      if (ctx != null && mounted) showResetPasswordDialog(ctx, _api, '', token);
    });
  }

  Future<void> _initInBackground() async {
    // Всё локальное и необязательное для первого экрана.
    try {
      await WallpaperService().load();
      await MuteService.init();
      MuteService.setApi(_api);
    } catch (e) {
      ApiService.addLog('background init: local services error: $e');
    }

    // Аватар профиля прогреваем заранее — вкладка Account покажет фото
    // сразу, без цветной подложки.
    if (_api.token != null) {
      unawaited(() async {
        try {
          final profile = await ChatStorage.loadProfile();
          final u = profile?.avatarUrl;
          if (u != null && u.isNotEmpty) {
            final url = u.startsWith('http') ? u : '${ApiService.baseUrl}$u';
            await precacheNetworkImage(
              url,
              timeout: const Duration(seconds: 5),
            );
          }
        } catch (_) {}
      }());
    }

    // E2EE-ключ нужен до первого отправленного сообщения, но не до входа.
    if (_api.token != null) {
      try {
        await CryptoService.initForUser(_api.userId!);
        ApiService.addLog('background init: E2EE ready=${CryptoService.isReady}');
      } catch (e) {
        ApiService.addLog('background init: E2EE error: $e');
      }
    }

    // Firebase и пуши — самый долгий этап, поэтому строго после первого кадра.
    await _initFirebaseAndNotifications();

    // Consume share payload received at cold start (opened via "Share")
    if (_api.token != null) {
      try {
        await _shareInit;
        final initial = ShareReceiver.takeInitial();
        if (initial != null && !initial.isEmpty && mounted) {
          _handleSharedContent(initial);
          await ShareReceiver.clear();
        }
      } catch (e) {
        ApiService.addLog('background init: share error: $e');
      }
    }
  }

  Future<void> _initFirebaseAndNotifications() async {
    try {
      ApiService.addLog('Firebase.initializeApp() starting...');
      await Firebase.initializeApp();
      ApiService.addLog('Firebase.initializeApp() done');
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      ApiService.addLog('_initNotifications: initialize()...');
      await _notifications.initialize();
      ApiService.addLog('_initNotifications: initialize() done');
    } catch (e) {
      ApiService.addLog('background init: firebase/notifications error: $e');
      return;
    }

    _setupNotificationHandlers();
  }

  void _setupNotificationHandlers() {
    _tokenSubscription?.cancel();
    _tokenSubscription = _notifications.onTokenRefresh.listen(
      (token) async {
        if (token != null && _api.token != null) {
          await _api.registerDevice(token, 'android');
          await _api.saveFcmToken(token);
        }
      },
      onError: (e) {
        ApiService.addLog('Token refresh error: $e');
      },
    );

    _notifications.onNavigateToChat = (chatId, data) async {
      ApiService.addLog('Notification tapped: chatId=$chatId');
      if (!mounted) return;
      if (NotificationService.activeChatId == chatId) return;
      final ctx = _navigatorKey.currentContext;
      if (ctx == null) return;
      final chat = await _api.getChat(chatId);
      if (mounted && ctx.mounted && chat != null) {
        Navigator.of(ctx).push(
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

    () async {
      try {
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
      } catch (e) {
        ApiService.addLog('notification post-init error: $e');
      }
    }();
  }

  @override
  void dispose() {
    _tokenSubscription?.cancel();
    DeepLinkService().dispose();
    MuteService.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([ThemeProvider(), LocaleProvider()]),
      builder: (context, _) {
        return MaterialApp(
          navigatorKey: _navigatorKey,
          title: 'Vorti Messenger',
          debugShowCheckedModeBanner: false,
          locale: LocaleProvider().locale,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          themeMode: ThemeProvider().themeMode,
          theme: ThemeProvider().getThemeData(brightness: Brightness.light),
          darkTheme: ThemeProvider().getThemeData(brightness: Brightness.dark),
          home: _api.token != null
              ? HomeScreen(api: _api)
              : AuthScreen(api: _api),
        );
      },
    );
  }
}
