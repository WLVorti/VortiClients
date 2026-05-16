# Vorti Messenger — Android Client

Flutter-клиент для мессенджера Vorti.

## Требования

- Flutter SDK (последняя стабильная версия)
- Android Studio / VS Code с Flutter-плагином
- Firebase-проект (для push-уведомлений)

## Быстрый старт

```bash
cd flutter_app
flutter pub get
flutter run
```

## Подключение к серверу

Клиент подключается к серверу Vorti:

| Протокол | Адрес |
|----------|-------|
| REST API | `http://77.34.76.27:3000` |
| WebSocket | `ws://77.34.76.27:3000` |

Адрес жёстко прописан в `lib/services/api_service.dart:13-14` и не требует настройки. После `flutter pub get` и `flutter run` приложение сразу работает.

## Сборка APK

```bash
cd flutter_app
flutter build apk --release
```

Готовый APK: `flutter_app/build/app/outputs/flutter-apk/app-release.apk`

## Firebase

Для работы push-уведомлений нужен Firebase-проект:

1. Создайте проект в [Firebase Console](https://console.firebase.google.com)
2. Добавьте Android-приложение
3. Скачайте `google-services.json` и поместите в `flutter_app/android/app/`
4. На сервере настройте Firebase Admin SDK (Service Account)

## Структура проекта

```
flutter_app/
├── android/          # Android-платформа
├── lib/
│   ├── main.dart     # Точка входа
│   ├── models/       # Модели данных
│   ├── screens/      # Экраны приложения
│   └── services/     # API, тема, уведомления, mute
├── pubspec.yaml      # Зависимости
└── test/             # Тесты
```
