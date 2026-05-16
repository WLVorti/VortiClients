# Mainprj Messenger Backend

Высокопроизводительный бэкенд для мессенджера, построенный на Node.js, Express и WebSocket.

---

## Возможности

- **Real-time сообщения** — мгновенная доставка через WebSocket
- **Приватные и групповые чаты** — создавайте личные и групповые обсуждения
- **Управление сообщениями** — редактирование и удаление с мгновенным уведомлением
- **Статусы** — онлайн/оффлайн, печатает, прочитано
- **Production-ready** — graceful shutdown, логирование, CORS, health check

---

## Безопасность

- **Пароли** — bcrypt (12 rounds), требования: 8+ символов, A-Z, a-z, 0-9, спецсимвол
- **JWT** — токены с автоистечением, FATAL в production без секрета
- **Brute-force protection** — блокировка на 15 мин после 5 неудачных попыток
- **Rate limiting** — 5 auth/15 мин, 10 WS msg/сек
- **Input validation** — Zod валидация всех входных данных
- **WS валидация** — UUID, type, все поля валидируются
- **XSS protection** — HTML экранирование сообщений
- **SQL injection** — prepared statements
- **DoS protection** — max 1000 соединений, batch отправка
- **Auto-reconnect** — БД переподключается автоматически

---

## Быстрый старт

```bash
# Установка
npm install

# Настройка
cp .env.example .env
# Отредактируйте .env: измените JWT_SECRET

# Разработка
npm run dev

# Сборка и запуск
npm run build
npm start

# Тестирование
run-tests.bat
```

---

## Стек

| Компонент | Технология |
|-----------|------------|
| Runtime | Node.js (v18+) |
| Language | TypeScript |
| HTTP | Express.js |
| Real-time | WebSocket (`ws`) |
| Database | SQLite (`better-sqlite3`) |
| Validation | Zod |
| Logging | Pino |
| Auth | JWT & bcrypt |
| CORS | `cors` middleware |

---

## API

Полная документация: [API.md](./API.md)

### REST Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/register` | Регистрация |
| POST | `/login` | Логин |
| GET | `/users` | Поиск пользователей |
| GET | `/chats` | Список чатов |
| POST | `/chats` | Создание чата |
| GET | `/chats/:id/messages` | История сообщений |
| GET | `/chats/unread` | Счётчики непрочитанных |
| PUT | `/messages/:id` | Редактирование |
| DELETE | `/messages/:id` | Удаление |
| GET | `/health` | Health check |

### WebSocket Events

**Клиент → Сервер:** `auth`, `send`, `typing`, `read`, `sync`, `ping`

**Сервер → Клиент:** `connected`, `message`, `typing`, `read`, `message_edited`, `message_deleted`, `online`, `error`, `pong`

---

## Конфигурация (.env)

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | 3000 | Порт сервера |
| `JWT_SECRET` | — | Секретный ключ JWT (обязательно!) |
| `NODE_ENV` | development | development / production |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Окно rate limit (15 мин) |
| `RATE_LIMIT_MAX_REQUESTS` | 5 | Макс. попыток в окно |
| `LOG_LEVEL` | info | error, warn, info, debug |
| `CORS_ORIGIN` | * | Разрешённые origins |

---

## Структура проекта

```
src/
├── auth/           # JWT токены
├── db/             # SQLite схема и подключение
├── handlers/
│   ├── rest/       # REST эндпоинты
│   └── websocket/  # WebSocket логика
├── middleware/     # Auth, validation, rate limit
├── types/          # TypeScript интерфейсы
├── utils/          # Логгер
├── client/         # Demo клиент (HTML)
├── config.ts       # Конфигурация
└── index.ts        # Точка входа
```

---

## Production запуск

```bash
npm run build
NODE_ENV=production npm start
```

### PM2
```bash
npm run build
pm2 start dist/index.js --name messenger
pm2 save
```

---

## Лимиты

| Параметр | Значение |
|----------|---------|
| Длина сообщения | 5000 символов |
| Длина пароля | 8-128 символов |
| Username | 3-32 символа (a-z, 0-9, _) |
| WS rate limit | 10 msg/сек |
| Auth rate limit | 5 попыток/15 мин |
| Max WS connections | 1000 |
| Блокировка аккаунта | 15 мин после 5 неудачных попыток |

---

## Roadmap

- [ ] Загрузка файлов и изображений
- [ ] Аватарки пользователей
- [ ] Push-уведомления
- [ ] E2E шифрование
- [ ] Полнотекстовый поиск

---

## Лицензия

MIT
