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

По умолчанию клиент подключён к серверу:

| Протокол | Адрес |
|----------|-------|
| REST API | `http://77.34.76.27:3000` |
| WebSocket | `ws://77.34.76.27:3000` |

### Как сменить сервер

Адрес сервера задаётся в `lib/services/api_service.dart:13-14`:

```dart
static const String baseUrl = 'http://77.34.76.27:3000';
static const String wsUrl = 'ws://77.34.76.27:3000';
```

Замените IP/домен на свой, затем пересоберите:

```bash
flutter run
```

### Запуск своего сервера

Серверная часть находится в отдельном репозитории. Для локальной разработки:

```bash
# Склонировать сервер
git clone <server-repo>
cd server
npm install
cp .env.example .env   # отредактировать JWT_SECRET
npm run dev             # сервер на http://localhost:3000
```

Затем в клиенте указать `baseUrl = 'http://localhost:3000'`.

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
