# Mainprj API Documentation

> Real-time мессенджер с E2E шифрованием, REST API и WebSocket

**Версия:** 4.5.0

---

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Аутентификация](#аутентификация)
- [REST API](#rest-api)
- [WebSocket](#websocket)
- [Безопасность](#безопасность)
- [Схемы данных](#схемы-данных)
- [Примеры](#примеры)
- [FAQ](#faq)

---

## История изменений (Changelog)

### v4.6.0 (XX.XX.XXXX)

**Новые функции:**
- Управление участниками групповых чатов
- Роли участников (owner, admin, member)
- Изменение названия группы
- Покинуть группу
- Удалить группу (только owner)

**Изменения в API:**
- Добавлен эндпоинт `GET /chats/:chatId` - информация о чате
- Добавлен эндпоинт `GET /chats/:chatId/participants` - список участников группы
- Добавлен эндпоинт `POST /chats/:chatId/participants` - добавить участника
- Добавлен эндпоинт `DELETE /chats/:chatId/participants/:userId` - удалить участника
- Добавлен эндпоинт `PUT /chats/:chatId/participants/:userId/role` - изменить роль
- Добавлен эндпоинт `PUT /chats/:chatId/name` - изменить название группы
- Добавлен эндпоинт `PUT /chats/:chatId/transfer` - передать права owner
- Добавлен эндпоинт `DELETE /chats/:chatId/leave` - покинуть группу
- Добавлен эндпоинт `DELETE /chats/:chatId` - удалить группу

**Изменения в БД:**
- Добавлена колонка `role` в таблицу participants (owner/admin/member)
- При создании группы создатель становится owner

**WebSocket события:**
- `participant_added` - участник добавлен в группу
- `participant_removed` - участник удалён из группы
- `role_changed` - роль изменена
- `group_name_changed` - название группы изменено
- `group_deleted` - группа удалена

### v4.5.0 (07.04.2026)

**Новые функции:**
- Push-уведомления для оффлайн пользователей
- Регистрация устройств для получения уведомлений
- Автоматическая отправка push при получении сообщения

**Изменения в API:**
- Добавлен эндпоинт `POST /devices` - регистрация устройства
- Добавлен эндпоинт `GET /devices` - список устройств
- Добавлен эндпоинт `DELETE /devices/:tokenId` - удаление устройства
- Добавлен эндпоинт `DELETE /devices` - удаление всех устройств

**Новые переменные окружения:**
- `FCM_API_KEY` - серверный ключ FCM
- `FCM_SENDER_ID` - ID отправителя FCM

### v4.4.0 (06.04.2026)

**Новые функции:**
- Отображение аватаров пользователей в списке чатов
- Отображение аватара собеседника в экране чата
- Экран просмотра профиля другого пользователя (нажмите на аватар)
- Поиск пользователей с отображением их аватаров

**Исправления:**
- Исправлена загрузка аватаров с расширением .jpg/.png без mime-type

**Изменения в API:**
- `GET /chats` теперь возвращает `avatarUrl` для direct чатов
- `GET /users` теперь возвращает `avatarUrl` для каждого пользователя
- Добавлен эндпоинт `GET /users/:userId/profile`

### v4.3.0
- Черновики сообщений (сохранение и синхронизация)
- Индикатор силы пароля при регистрации
- Ответы на сообщения
- Редактирование и удаление сообщений
- Подтверждения о прочтении (delivered/read статусы)

### v4.2.0
- WebSocket reconnect с exponential backoff
- Сохранение черновиков между устройствами
- Система rate limiting

### v4.1.0
- E2E шифрование сообщений (Curve25519)
- Шифрование сообщений в БД (AES-256-GCM)

### v4.0.0
- Полный рефакторинг API
- WebSocket поддержка
- Загрузка файлов

---

## Быстрый старт

```bash
npm install
cp .env.example .env
# Настройте JWT_SECRET и MESSAGE_ENCRYPTION_KEY
npm start
```

### Переменные окружения

| Переменная | Обязательно | Описание |
|-----------|-------------|---------|
| `PORT` | Нет | Порт сервера (по умолч. 3000) |
| `JWT_SECRET` | Да | Секретный ключ для JWT токенов |
| `MESSAGE_ENCRYPTION_KEY` | Да | 64-символьный hex ключ для AES-256 |
| `NODE_ENV` | Нет | development / production |
| `RATE_LIMIT_WINDOW_MS` | Нет | Окно rate limiting (по умолч. 300000 = 5 мин) |
| `RATE_LIMIT_MAX_REQUESTS` | Нет | Макс. попыток в окно (по умолч. 20) |
| `JWT_EXPIRY` | Нет | Срок действия JWT (по умолч. 7d) |
| `CORS_ORIGIN` | Нет | Разрешённые origins (* для всех) |
| `SSL_ENABLED` | Нет | Включить HTTPS (по умолч. false) |
| `SSL_CERT_PATH` | Да* | Путь к SSL сертификату |
| `SSL_KEY_PATH` | Да* | Путь к SSL ключу |
| `SSL_CA_PATH` | Нет | Путь к CA сертификату |

*Требуется если `SSL_ENABLED=true` |

### Генерация ключей

```bash
# JWT_SECRET - любая строка
JWT_SECRET=your_secret_key_here

# MESSAGE_ENCRYPTION_KEY - 64 hex символа (32 байта)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Аутентификация

### Требования к паролю

| Требование | Описание |
|------------|----------|
| Длина | 8-128 символов |
| Заглавная буква | Минимум одна (A-Z) |
| Строчная буква | Минимум одна (a-z) |
| Цифра | Минимум одна (0-9) |
| Спецсимвол | Минимум один (!@#$%^&*(),.?":{}<>) |

**Пример валидного пароля:** `SecurePass123!`

### Требования к username

| Требование | Описание |
|------------|----------|
| Длина | 3-32 символа |
| Символы | Латинские буквы (a-z, A-Z), цифры (0-9), подчёркивание (_) |
| Регистр | Не учитывается (приводится к lowercase) |

**Примеры валидных username:** `alice`, `bob_123`, `CryptoUser42`

### Ограничения сообщений

| Параметр | Лимит |
|----------|-------|
| Текст сообщения | 1-5000 символов |
| Файл | до 10 МБ |

### Регистрация

```
POST /register
Content-Type: application/json

{
  "username": "alice",
  "password": "Secure123!"
}
```

**Ответ (201):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Логин

```
POST /login
Content-Type: application/json

{
  "username": "alice",
  "password": "Secure123!"
}
```

**Ответ (200):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Ошибки

**400 - Неверный формат:**
```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    { "path": ["body", "password"], "message": "Password must contain a number" }
  ]
}
```

**401 - Неверные данные:**
```json
{
  "status": "error",
  "message": "Invalid username or password"
}
```

**423 - Аккаунт заблокирован:**
```json
{
  "status": "error",
  "message": "Account locked. Try again in 300 seconds."
}
```

---

## REST API

Все защищённые эндпоинты требуют заголовок:
```
Authorization: Bearer <token>
```

### Профиль

#### GET /profile
Получить свой профиль.

```bash
curl "http://localhost:3000/profile"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "profile": {
    "id": "user-uuid",
    "username": "alice",
    "displayName": "Alice",
    "bio": "Hello, I'm Alice!",
    "avatarUrl": "/uploads/avatars/avatar.jpg",
    "createdAt": 1704067200000
  }
}
```

#### PUT /profile
Обновить профиль.

```bash
curl -X PUT "http://localhost:3000/profile"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"displayName": "New Name", "bio": "New bio"}'
```

**Поля:**
| Поле | Лимит | Описание |
|------|-------|----------|
| `displayName` | 50 символов | Отображаемое имя |
| `bio` | 160 символов | Описание профиля |

**Ответ:**
```json
{
  "status": "success",
  "profile": { ... }
}
```

#### POST /profile/avatar
Загрузить аватарку.

```
Content-Type: multipart/form-data
```

| Поле | Тип | Описание |
|------|-----|----------|
| `avatar` | File | Изображение (JPEG, PNG, GIF, WebP) до 5MB |

```bash
curl -X POST "http://localhost:3000/profile/avatar"
  -H "Authorization: Bearer <token>"
  -F "avatar=@photo.jpg"
```

**Ответ:**
```json
{
  "status": "success",
  "avatarUrl": "/uploads/avatars/abc123.jpg"
}
```

#### DELETE /profile/avatar
Удалить аватарку.

```bash
curl -X DELETE "http://localhost:3000/profile/avatar"
  -H "Authorization: Bearer <token>"
```

#### GET /users/:userId/profile
Получить профиль другого пользователя.

```bash
curl "http://localhost:3000/users/user-uuid/profile"
  -H "Authorization: Bearer <token>"
```

---

### Пользователи

#### GET /users
Поиск пользователей.

| Параметр | Тип | Описание |
|----------|-----|---------|
| `search` | string | Фильтр по username |
| `limit` | number | Лимит (по умолч. 50, макс. 100) |

```bash
curl "http://localhost:3000/users?search=al"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "users": [
    {
      "id": "uuid",
      "username": "alice",
      "avatarUrl": "/uploads/avatars/abc123.jpg",
      "created_at": 1704067200000
    }
  ]
}
```

#### GET /users/:userId/public-key
Получить публичный ключ пользователя для E2E шифрования.

```bash
curl "http://localhost:3000/users/user-uuid/public-key"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "publicKey": "base64_encoded_public_key"
}
```

---

### Чаты

#### GET /chats
Список чатов пользователя.

```bash
curl "http://localhost:3000/chats"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "chats": [
    {
      "id": "chat-uuid",
      "name": null,
      "type": "direct",
      "created_at": 1704067200000,
      "last_message": "Привет!",
      "last_message_at": 1704070800000,
      "avatarUrl": "/uploads/avatars/abc123.jpg",
      "is_online": true,
      "participants": ["user1-uuid", "user2-uuid"]
    }
  ]
}
```

> **Примечание:**
> - Поле `avatarUrl` присутствует только для direct чатов и содержит URL аватарки другого участника. Для group чатов поле отсутствует.
> - Поле `is_online` показывает статус онлайн другого участника (только для direct чатов).

#### POST /chats
Создание чата.

**Body:**
```json
{
  "type": "direct" | "group",
  "name": "Название группы",      // опционально, для group
  "participants": ["userId1", "userId2"]
}
```

```bash
curl -X POST "http://localhost:3000/chats"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"type":"direct","participants":["user2-id"]}'
```

**Ответ (201):**
```json
{
  "status": "success",
  "chatId": "new-chat-uuid"
}
```

> **Примечание:**
> - При создании группы (`type: "group"`) создатель автоматически становится `owner`
> - Для групповых чатов name является обязательным
> - Максимальное количество участников: ограничено только логикой сервера
```

> Для `type: "direct"` с 2 участниками — возвращает существующий чат.

#### GET /chats/:chatId
Информация о чате (для участников).

```bash
curl "http://localhost:3000/chats/chat-uuid"
  -H "Authorization: Bearer <token>"
```

**Ответ (direct):**
```json
{
  "status": "success",
  "chat": {
    "id": "chat-uuid",
    "name": "username",
    "type": "direct",
    "createdAt": 1704067200000,
    "participantsCount": 2
  }
}
```

**Ответ (group):**
```json
{
  "status": "success",
  "chat": {
    "id": "chat-uuid",
    "name": "Group Name",
    "type": "group",
    "createdAt": 1704067200000,
    "participantsCount": 5,
    "role": "admin"
  }
}
```

#### GET /chats/:id/messages
История сообщений (пагинация).

| Параметр | Тип | Описание |
|----------|-----|---------|
| `limit` | number | Лимит (по умолч. 50) |
| `before` | timestamp | Загрузить сообщения до (по умолч. now) |

```bash
curl "http://localhost:3000/chats/chat-uuid/messages?limit=20"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "messages": [
    {
      "id": "msg-uuid",
      "chat_id": "chat-uuid",
      "user_id": "user-uuid",
      "text": "Hello!",
      "reply_to": "reply-msg-uuid",
      "reply": {
        "replyId": "reply-msg-uuid",
        "replyText": "Original message...",
        "replyUser": "username"
      },
      "file_id": null,
      "status": "delivered",
      "created_at": 1704067200000
    }
  ]
}
```

> **Примечание:**
> - Поле `reply` содержит информацию о сообщении на которое отвечают (если есть)
> - Поле `status` может быть: `sent`, `delivered`, `read`

#### GET /chats/unread
Счётчики непрочитанных сообщений по чатам.

```bash
curl "http://localhost:3000/chats/unread"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "unread": {
    "chat-uuid-1": 5,
    "chat-uuid-2": 2
  }
}
```

---

### Управление группой

#### GET /chats/:chatId/participants
Получить список участников группы.

```bash
curl "http://localhost:3000/chats/group-uuid/participants"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "participants": [
    { "user_id": "uuid", "username": "owner", "role": "owner", "avatar_url": null },
    { "user_id": "uuid", "username": "admin", "role": "admin", "avatar_url": null },
    { "user_id": "uuid", "username": "member", "role": "member", "avatar_url": null }
  ]
}
```

#### POST /chats/:chatId/participants
Добавить участника в группу (только admin/owner).

```bash
curl -X POST "http://localhost:3000/chats/group-uuid/participants"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"userId": "user-uuid-to-add"}'
```

**Ответ:**
```json
{ "status": "success" }
```

#### DELETE /chats/:chatId/participants/:userId
Удалить участника из группы.

- Admin может удалять обычных участников
- Owner может удалять admin и участников
- Нельзя удалить owner
- Участник может удалить себя сам

```bash
curl -X DELETE "http://localhost:3000/chats/group-uuid/participants/user-uuid"
  -H "Authorization: Bearer <token>"
```

#### PUT /chats/:chatId/participants/:userId/role
Изменить роль участника (только owner).

```bash
curl -X PUT "http://localhost:3000/chats/group-uuid/participants/user-uuid/role"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"role": "admin"}'
```

**Ответ:**
```json
{ "status": "success" }
```

#### PUT /chats/:chatId/name
Изменить название группы (только admin/owner).

```bash
curl -X PUT "http://localhost:3000/chats/group-uuid/name"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"name": "New Group Name"}'
```

**Ответ:**
```json
{ "status": "success" }
```

#### PUT /chats/:chatId/transfer
Передать права owner другому участнику (только current owner).

```bash
curl -X PUT "http://localhost:3000/chats/group-uuid/transfer"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"userId": "new-owner-uuid"}'
```

> После передачи прав вы становитесь обычным участником (member).

#### DELETE /chats/:chatId/leave
Покинуть группу.

```bash
curl -X DELETE "http://localhost:3000/chats/group-uuid/leave"
  -H "Authorization: Bearer <token>"
```

> Owner не может покинуть группу - нужно передать права или удалить группу.

#### DELETE /chats/:chatId
Удалить группу (только owner).

```bash
curl -X DELETE "http://localhost:3000/chats/group-uuid"
  -H "Authorization: Bearer <token>"
```

> Удаляет группу и всех участников.

---

### Сообщения

#### PUT /messages/:id
Редактирование (только автор).

```bash
curl -X PUT "http://localhost:3000/messages/msg-uuid"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"text": "Новый текст"}'
```

> Отправляет WebSocket событие `message_edited`.

#### DELETE /messages/:id
Мягкое удаление (только автор).

```bash
curl -X DELETE "http://localhost:3000/messages/msg-uuid"
  -H "Authorization: Bearer <token>"
```

> Текст заменяется на `[deleted]`. Отправляет `message_deleted`.

---

### Push-уведомления (устройства)

Регистрация устройств для получения push-уведомлений когда приложение в фоне.

#### POST /devices
Зарегистрировать устройство для push-уведомлений.

```bash
curl -X POST "http://localhost:3000/devices"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{"token": "fcm-token-xxx", "platform": "android", "deviceName": "Samsung Galaxy"}'
```

**Тело запроса:**
| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `token` | string | Да | Push-токен (FCM для Android) |
| `platform` | string | Да | `android` или `ios` |
| `deviceName` | string | Нет | Название устройства |

**Ответ:**
```json
{
  "status": "success",
  "id": "device-uuid"
}
```

#### GET /devices
Получить список зарегистрированных устройств.

```bash
curl "http://localhost:3000/devices"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "devices": [
    {
      "id": "device-uuid",
      "platform": "android",
      "device_name": "Samsung Galaxy",
      "created_at": 1704067200000,
      "last_active": 1704067200000
    }
  ]
}
```

#### DELETE /devices/:tokenId
Удалить устройство.

```bash
curl -X DELETE "http://localhost:3000/devices/device-uuid"
  -H "Authorization: Bearer <token>"
```

#### DELETE /devices
Удалить все устройства пользователя (при logout).

```bash
curl -X DELETE "http://localhost:3000/devices"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "count": 3
}
```

> **Настройка FCM (FCM V1 API):**
> Для работы push-уведомлений:
> 1. Скачайте сервисный аккаунт из Firebase Console → Project Settings → Service Accounts → Generate new private key
> 2. Сохраните JSON файл как `src/config/firebase-service-account.json`
> 3. Включите Cloud Messaging API (V1) в Google Cloud Console
> 
> FCM токен устройства можно получить используя `firebase_messaging` плагин во Flutter.

---

### Черновики сообщений

Черновики сохраняются локально на устройстве клиента и синхронизируются между устройствами.

#### POST /drafts
Сохранение черновика.

```
POST /drafts
Authorization: Bearer <token>
Content-Type: application/json

{
  "chatId": "chat-uuid",
  "text": "Текст черновика"
}
```

**Ответ (200):**
```json
{
  "status": "success"
}
```

#### GET /drafts/:chatId
Получение черновика для чата.

```bash
curl "http://localhost:3000/drafts/chat-uuid"
  -H "Authorization: Bearer <token>"
```

**Ответ (200):**
```json
{
  "status": "success",
  "draft": {
    "chatId": "chat-uuid",
    "text": "Текст черновика",
    "updatedAt": 1704070800000
  }
}
```

**Ответ если черновик не найден (200):**
```json
{
  "status": "success",
  "draft": null
}
```

#### DELETE /drafts/:chatId
Удаление черновика.

```bash
curl -X DELETE "http://localhost:3000/drafts/chat-uuid"
  -H "Authorization: Bearer <token>"
```

**Ответ (200):**
```json
{
  "status": "success"
}
```

---

### Файлы

#### POST /upload
Загрузка файла.

```
Content-Type: multipart/form-data
```

| Поле | Тип | Описание |
|------|-----|---------|
| `file` | File | Файл (до 10MB) |

**Разрешённые типы:**
- Изображения: jpeg, png, gif, webp
- Документы: pdf, doc, docx, txt
- Аудио: mp3, wav, ogg, m4a, x-m4a, aac
- Видео: mp4, webm

```bash
curl -X POST "http://localhost:3000/upload"
  -H "Authorization: Bearer <token>"
  -F "file=@image.jpg"
```

**Ответ:**
```json
{
  "status": "success",
  "fileId": "file-uuid",
  "filename": "image.jpg",
  "mimeType": "image/jpeg",
  "size": 12345
}
```

#### GET /files/:fileId
Информация о файле.

```bash
curl "http://localhost:3000/files/file-uuid"
  -H "Authorization: Bearer <token>"
```

**Ответ:**
```json
{
  "status": "success",
  "file": {
    "id": "file-uuid",
    "filename": "image.jpg",
    "mimeType": "image/jpeg",
    "size": 12345,
    "uploadedBy": "user-uuid",
    "createdAt": 1704067200000
  }
}
```

#### GET /download/:fileId
Скачивание файла.

```bash
curl "http://localhost:3000/download/file-uuid"
  -H "Authorization: Bearer <token>"
  -o downloaded_file.jpg
```

> Примечание: Файл доступен только автору или участникам чатов, где файл использовался.

---

### Система

#### GET /health
Health check (без авторизации).

```bash
curl http://localhost:3000/health
```

**Ответ:**
```json
{
  "status": "ok",
  "timestamp": 1704070800000,
  "uptime": 3600.5,
  "db": "connected"
}
```

#### GET /admin/health
Расширенный health check.

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "clients": 5,
  "onlineUsers": ["user1-uuid", "user2-uuid"],
  "memory": { "heapUsed": 12345678 }
}
```

#### POST /admin/clear-rate-limits
Сброс rate limits (только development).

---

## WebSocket

**URL:** `ws://localhost:3000`

### Авторизация

Отправить первым сообщением:
```json
{ "type": "auth", "token": "JWT_TOKEN" }
```

**Ответ:**
```json
{ "type": "connected", "userId": "uuid" }
```

Также сервер отправляет список всех пользователей онлайн:
```json
{ "type": "online_users", "users": ["user1-id", "user2-id"] }
```

### Отправка сообщения

```json
{
  "type": "send",
  "chatId": "chat-uuid",
  "text": "Hello!",
  "replyTo": "msg-uuid"
}
```

**Сервер рассылает всем участникам:**
```json
{
  "type": "message",
  "id": "msg-uuid",
  "chatId": "chat-uuid",
  "userId": "sender-uuid",
  "text": "Hello!",
  "fileId": null,
  "timestamp": 1704070800000,
  "reply": {
    "replyId": "original-msg-uuid",
    "replyText": "Original message text...",
    "replyUser": "username"
  }
}
```

> Поле `reply` присутствует только если сообщение является ответом на другое.

### Отправка файла

1. Загрузить файл через REST `POST /upload`
2. Отправить ссылку через WebSocket:

```json
{
  "type": "sendFile",
  "chatId": "chat-uuid",
  "fileId": "file-uuid",
  "fileMimeType": "audio/mp4",
  "replyTo": "msg-uuid"
}
```

**Ответ:** Сервер отправляет событие `message` с `fileId` и `file_mime_type` всем участникам.

### Статус печати

```json
{ "type": "typing", "chatId": "chat-uuid", "isTyping": true }
```

> Сервер автоматически отправляет `isTyping: false` через 3 сек.

### Прочтение

```json
{ "type": "read", "messageId": "msg-uuid" }
```

### Статусы сообщений

Сервер поддерживает два статуса: `delivered` и `read`.

#### Событие delivered (от сервера)

Отправляется отправителю когда получатель получает сообщение:

```json
{ "type": "delivered", "messageId": "msg-uuid", "userId": "receiver-uuid" }
```

#### Событие read (от сервера)

Отправляется отправителю когда получатель прочитал сообщение:

```json
{ "type": "read", "messageId": "msg-uuid", "userId": "receiver-uuid" }
```

#### Статусы в API

При получении сообщений через `GET /chats/:id/messages`, каждое сообщение содержит поле `status`:

```json
{
  "id": "msg-uuid",
  "text": "Hello!",
  "status": "delivered",  // "sent" | "delivered" | "read"
  ...
}
```

| Статус | Описание |
|--------|---------|
| `sent` | Сообщение отправлено, но ещё не доставлено получателю |
| `delivered` | Сообщение доставлено получателю (онлайн) |
| `read` | Сообщение прочитано получателем |

### Ping/Pong

```json
{ "type": "ping" }     // клиент
{ "type": "pong" }     // сервер (автоматически каждые 30 сек)
```

### Синхронизация

```json
{ "type": "sync", "lastMessageId": "msg-uuid" }
```
> Отправляет все офлайн-сообщения после указанного.

### E2E Шифрование

#### Отправка публичного ключа

```json
{
  "type": "keyExchange",
  "publicKey": "base64_encoded_key"
}
```

**Ответ:**
```json
{ "type": "keyReceived", "userId": "uuid" }
```

#### Запрос ключа пользователя

```json
{ "type": "requestKey", "userId": "other-user-uuid" }
```

**Ответ:**
```json
{ "type": "publicKey", "userId": "other-user-uuid", "publicKey": "..." }
```

### События от сервера

| Тип | Описание |
|-----|---------|
| `connected` | Подтверждение успешной аутентификации |
| `online_users` | Список всех пользователей онлайн (при подключении) |
| `message` | Новое сообщение |
| `message` с `fileId` | Сообщение с файлом |
| `typing` | Кто-то печатает |
| `delivered` | Сообщение доставлено |
| `read` | Сообщение прочитано |
| `message_edited` | Сообщение изменено |
| `message_deleted` | Сообщение удалено |
| `online` | Статус online/offline пользователя |
| `publicKey` | Публичный ключ пользователя |
| `keyReceived` | Публичный ключ сохранён |
| `participant_added` | Участник добавлен в группу |
| `participant_removed` | Участник удалён из группы |
| `role_changed` | Роль участника изменена |
| `group_name_changed` | Название группы изменено |
| `group_deleted` | Группа удалена |
| `error` | Ошибка |
| `pong` | Keep-alive |

### Редактирование сообщения

**PUT /messages/:id**

**WebSocket событие (рассылается всем участникам чата):**
```json
{ "type": "message_edited", "messageId": "msg-uuid", "chatId": "chat-uuid", "newText": "Updated text" }
```

### Удаление сообщения

**DELETE /messages/:id**

**WebSocket событие (рассылается всем участникам чата):**
```json
{ "type": "message_deleted", "messageId": "msg-uuid", "chatId": "chat-uuid" }
```

---

## SSL/HTTPS

Для production рекомендуется использовать HTTPS.

### Генерация самоподписанного сертификата

```bash
# Создайте папку для сертификатов
mkdir ssl

# Генерация ключа и сертификата
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=localhost"

# Для production с реальным CA (например Let's Encrypt)
# Сертификаты обычно находятся в /etc/letsencrypt/live/domain/
```

### Настройка

```bash
# .env
SSL_ENABLED=true
SSL_CERT_PATH=./ssl/cert.pem
SSL_KEY_PATH=./ssl/key.pem
```

### WebSocket через HTTPS

```javascript
// wss:// для защищённых соединений
const ws = new WebSocket('wss://localhost:3000');
```

---

## Безопасность

### Защита данных

1. **JWT Authentication** - токены для API
2. **bcrypt** - хеширование паролей (12 раундов)
3. **AES-256-GCM** - шифрование сообщений в БД
4. **libsodium** - E2E шифрование (Curve25519)
5. **XSS Protection** - экранирование HTML
6. **SQL Injection Protection** - prepared statements
7. **Rate Limiting** - защита от брутфорса
8. **Brute Force Protection** - блокировка аккаунта

### Шифрование на сервере

Сообщения шифруются AES-256-GCM перед сохранением в БД:
```
iv:authTag:ciphertext
```

Пример: `a1b2c3d4...:e5f6g7h8...:encrypted_data_here`

### E2E Шифрование (опционально)

Клиенты генерируют пары ключей Curve25519. Сообщения шифруются на стороне клиента и расшифровываются получателем.

---

## Схемы данных

### User
```typescript
interface User {
  id: string;           // UUID
  username: string;
  created_at: number;    // Unix timestamp (ms)
}
```

### Profile
```typescript
interface Profile {
  id: string;           // UUID
  username: string;
  displayName: string;   // отображаемое имя
  bio: string;           // описание (до 160 символов)
  avatarUrl: string | null;  // URL аватарки
  createdAt: number;     // Unix timestamp (ms)
}
```

### Chat
```typescript
interface Chat {
  id: string;
  name: string | null;     // для group чатов
  type: 'direct' | 'group';
  created_at: number;
  participants: string[];   // массив user ID
  avatarUrl: string | null;  // URL аватарки собеседника (только для direct)
}
```

> **Примечание:** Поле `avatarUrl` заполняется только для direct чатов и содержит URL аватарки другого участника чата (не текущего пользователя).

### Message
```typescript
interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  text: string;            // расшифрованный текст
  reply_to: string | null;
  file_id: string | null;  // если есть вложение
  created_at: number;
}
```

### File
```typescript
interface File {
  id: string;
  filename: string;       // оригинальное имя
  mimeType: string;
  size: number;           // в байтах
  uploadedBy: string;      // user ID
  createdAt: number;
}
```

---

## Примеры

### JavaScript (Browser)

```javascript
// REST
const res = await fetch('http://localhost:3000/chats', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { chats } = await res.json();

// WebSocket
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'message') {
    console.log('New message:', data.text);
  }
};
```

### Python

```python
import asyncio
import websockets
import aiohttp

# REST
async with aiohttp.ClientSession() as session:
    async with session.get(
        'http://localhost:3000/chats',
        headers={'Authorization': f'Bearer {token}'}
    ) as resp:
        data = await resp.json()

# WebSocket
async with websockets.connect('ws://localhost:3000') as ws:
    await ws.send(json.dumps({'type': 'auth', 'token': token}))
    async for msg in ws:
        print(json.loads(msg))
```

### curl

```bash
# Регистрация
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"SecurePass123!"}'

# Загрузка файла
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@photo.jpg"
```

---

## FAQ

**Q: Браузерный клиент не подключается?**
A: Настройте `CORS_ORIGIN` в `.env`.

**Q: WS соединение закрывается?**
A: Проверьте валидность токена. Отправьте `auth` сразу после подключения.

**Q: 429 Too Many Requests?**
A: Сработал rate limit. Подождите 5 минут.

**Q: E2E шифрование не работает?**
A: Убедитесь, что браузер не блокирует libsodium. Попробуйте другой браузер.

**Q: Файл не загружается?**
A: Проверьте размер (макс 10MB) и тип файла.

---

## Коды ошибок

| Код | Значение |
|-----|---------|
| 400 | Bad Request — неверный формат |
| 401 | Unauthorized — нет/невалидный токен |
| 403 | Forbidden — нет прав |
| 404 | Not Found — ресурс не существует |
| 429 | Too Many Requests — rate limit |
| 500 | Internal Server Error |

### WebSocket ошибки (type: "error")

| Сообщение | Причина |
|-----------|---------|
| `Not authenticated` | Не отправлен `auth` |
| `Invalid token` | Невалидный JWT |
| `Too many messages` | Превышен лимит 50 msg/сек |
| `Chat not found` | Чат не существует |
| `Not a participant` | Вы не участник чата |
| `File not found` | Файл не существует |

---

## Чек-лист для тестировщиков (QA) — Мобильное приложение

---

# 1. Аватарки пользователей

## Своя аватарка (вкладка Account)
- [ ] Загрузка аватара в формате JPEG
- [ ] Загрузка аватара в формате PNG
- [ ] Загрузка аватара в формате GIF
- [ ] Загрузка аватара в формате WebP
- [ ] Ошибка при загрузке файла размером более 5MB
- [ ] Ошибка при загрузке не изображения (txt, pdf)
- [ ] Удаление аватара (возврат к букве)
- [ ] Аватар сохраняется после перезапуска приложения
- [ ] После загрузки аватара он сразу виден в профиле

## Аватарка в списке чатов
- [ ] Отображается аватарка собеседника (если установлена)
- [ ] Отображается первая буква имени (если аватарки нет)
- [ ] Аватарка обновляется после загрузки новой у собеседника
- [ ] Аватарка видна для всех direct чатов

## Аватарка в экране чата (AppBar)
- [ ] Аватарка собеседника отображается в заголовке
- [ ] Размер аватарки в чате соответствует дизайну
- [ ] Аватарка кликабельна (открывает профиль)

## Аватарка в поиске пользователей
- [ ] В результатах поиска отображается аватарка
- [ ] Если аватарки нет — отображается первая буква username
- [ ] Аватарка в поиске соответствует аватарке в профиле

## Аватарка в профиле другого пользователя
- [ ] Открывается при нажатии на аватарку в чате
- [ ] Открывается при нажатии на аватарку в списке чатов
- [ ] Открывается при нажатии на аватарку в поиске
- [ ] Аватарка в профиле большого размера (как на дизайне)
- [ ] Если аватарки нет — отображается первая буква

---

# 2. Сообщения

## Отправка сообщений
- [ ] Отправка текстового сообщения
- [ ] Кнопка отправки активна только при непустом тексте
- [ ] Enter отправляет сообщение
- [ ] Многострочный ввод (перенос строки по Shift+Enter)
- [ ] Сообщение появляется сразу в списке
- [ ] Сообщение появляется у получателя в реальном времени
- [ ] Ошибка при отправке пустого сообщения

## Лимиты сообщений
- [ ] Сообщение длиной 1 символ отправляется
- [ ] Сообщение длиной 5000 символов отправляется
- [ ] Визуальный индикатор при приближении к лимиту (если есть)

## Получение сообщений
- [ ] История сообщений загружается при открытии чата
- [ ] Сообщения отсортированы по времени (старые вверху)
- [ ] Новые сообщения появляются в реальном времени
- [ ] Прокрутка к новым сообщениям автоматическая (если внизу)
- [ ] Pull-to-refresh загружает историю

## Статусы сообщений
- [ ] Отправленное сообщение (sent) — одна галочка
- [ ] Доставленное сообщение (delivered) — две галочки
- [ ] Прочитанное сообщение (read) — две синие галочки
- [ ] Статусы обновляются в реальном времени

## Редактирование сообщений
- [ ] Долгое нажатие открывает контекстное меню
- [ ] Пункт "Редактировать" присутствует
- [ ] После редактирования появляется пометка "(edited)"
- [ ] Редактированное сообщение обновляется у получателя
- [ ] Нельзя редактировать чужие сообщения

## Удаление сообщений
- [ ] Долгое нажатие открывает контекстное меню
- [ ] Пункт "Удалить" присутствует
- [ ] После удаления текст заменяется на "[deleted]"
- [ ] Удалённое сообщение обновляется у получателя
- [ ] Нельзя удалить чужое сообщение

---

# 3. Ответы на сообщения (Reply)

## Создание reply
- [ ] Кнопка reply появляется при долгом нажатии (или свайп)
- [ ] Нажатие на reply открывает режим ответа
- [ ] Поле ввода показывает "Ответ на: [текст сообщения]"
- [ ] Отправка reply работает

## Отображение reply
- [ ] Reply отображается под сообщением
- [ ] Показывается текст оригинального сообщения
- [ ] Показывается username автора оригинального сообщения
- [ ] Reply виден у получателя

## Отмена reply
- [ ] Кнопка отмены reply работает
- [ ] После отмены поле ввода очищается

---

# 4. Индикаторы онлайн/офлайн

## В списке чатов
- [ ] Зелёный кружок отображается рядом с аватаркой онлайн пользователя
- [ ] Серый/белый кружок отображается рядом с аватаркой офлайн пользователя
- [ ] Индикатор обновляется при изменении статуса собеседника
- [ ] Индикатор соответствует статусу в поиске

## В экране чата (AppBar)
- [ ] Зелёный кружок рядом с аватаркой когда собеседник онлайн
- [ ] Серый кружок когда собеседник офлайн
- [ ] Статус обновляется без перезагрузки чата
- [ ] Статус соответствует списку чатов

## Логика статусов
- [ ] Пользователь "онлайн" когда приложение открыто
- [ ] Пользователь "офлайн" когда приложение закрыто
- [ ] При повторном открытии статус меняется на "онлайн"
- [ ] Индикатор появляется сразу после подключения WebSocket

---

# 5. Настройки профиля

## Display Name
- [ ] Изменение display name работает
- [ ] Сохраняется после перезапуска приложения
- [ ] Обновляется в чатах и списке контактов
- [ ] Лимит 50 символов соблюдается
- [ ] Пустой display name показывает username

## Bio (описание)
- [ ] Изменение bio работает
- [ ] Сохраняется после перезапуска приложения
- [ ] Отображается в профиле
- [ ] Лимит 160 символов соблюдается

## Сохранение профиля
- [ ] Кнопка сохранения присутствует
- [ ] После сохранения появляется уведомление
- [ ] Ошибка при потере интернет-соединения

---

# 6. Черновики

- [ ] Черновик сохраняется при выходе из чата
- [ ] Черновик восстанавливается при повторном входе
- [ ] Черновик очищается после отправки сообщения
- [ ] Черновик виден в поле ввода
- [ ] Черновик синхронизируется между устройствами (если поддерживается)

---

# 7. UI/UX

- [ ] Навигация между вкладками Chats/Account работает
- [ ] Кнопка "назад" работает корректно
- [ ] Pull-to-refresh работает в списке чатов
- [ ] Клавиатура закрывается после отправки сообщения
- [ ] Индикатор загрузки отображается при загрузке данных
- [ ] Ошибки отображаются пользователю (snackbar)
- [ ] Пустые состояния отображаются (нет чатов, нет сообщений)

---

# 8. Edge Cases

- [ ] Отправка сообщения при медленном интернете
- [ ] Мгновенная отправка нескольких сообщений
- [ ] Открытие чата с большим количеством сообщений
- [ ] Поиск пользователя с кириллицей
- [ ] Поиск пользователя с символом _
- [ ] Пустой поиск (менее 2 символов) не ищет
- [ ] Аватарка не грузится (показывает букву)
- [ ] Очень длинное сообщение в reply

---

## Приоритеты тестирования

### P0 — Критично
1. Отправка/получение сообщений
2. Аватарка в списке чатов
3. Индикатор онлайн/офлайн
4. Редактирование/удаление сообщений
5. Вход/регистрация/logout

### P1 — Важно
1. Загрузка аватара
2. Reply на сообщения
3. Профиль другого пользователя
4. Черновики
5. Display name и bio

### P2 — Желательно
1. Поиск пользователей с аватарками
2. Статусы сообщений (sent/delivered/read)
3. Edge cases
