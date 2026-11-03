import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../models/models.dart';

/// Локальная история чатов.
///
/// Схема работы повторяет проверенный веб-клиент:
///  * при открытии чата сначала показываем страницу с диска, потом тихо
///    обновляем её с сервера;
///  * всё, что пришло с сервера или по WebSocket, сразу пишем на диск;
///  * на каждый чат храним не больше [maxMessagesPerChat] последних сообщений;
///  * данные привязаны к пользователю, поэтому на одном устройстве аккаунты
///    не видят историю друг друга;
///  * при выходе из аккаунта кэш стирается.
///
/// Хранение — обычные JSON-файлы в папке документов приложения. Это работает
/// на Windows, Linux, macOS, Android и iOS без нативных плагинов БД
/// (sqflite на десктопе без FFI просто не открывает базу).
///
/// Структура:
/// ```
/// chat_history_v1/<userId>/chats.json
/// chat_history_v1/<userId>/messages/<chatId>.json
/// ```
class ChatStorage {
  ChatStorage._();

  /// Сколько последних сообщений держим на чат.
  static const int maxMessagesPerChat = 500;

  /// Сколько сообщений показываем сразу при открытии чата.
  static const int openPageSize = 100;

  /// Размер страницы при прокрутке вверх.
  static const int olderPageSize = 50;

  static const String _rootDirName = 'chat_history_v1';
  static const String _chatsFileName = 'chats.json';
  static const String _messagesDirName = 'messages';
  static const String _legacyDbName = 'messages_cache.db';
  static const String _legacyChatsFile = 'chats_cache.json';

  /// Откуда брать id текущего пользователя. Задаётся один раз в main.dart,
  /// чтобы кэш автоматически следовал за текущим аккаунтом.
  static String? Function()? ownerResolver;

  static String? get ownerId => ownerResolver?.call();

  static Directory? _root;

  static String? _loadedOwner;
  static bool _chatsLoaded = false;
  static List<Chat> _chats = [];

  /// Загруженные в память сообщения по chatId.
  static final Map<String, List<Message>> _messages = {};

  /// Очередь записи на чат, чтобы параллельные сохранения не перемешивались.
  static final Map<String, Future<void>> _writes = {};

  /// Отложенная запись. Раньше каждое входящее сообщение переписывало весь
  /// файл чата (до 500 сообщений) и делало fsync. При синхронизации офлайн-
  /// истории это сотни записей подряд. Теперь изменения копятся и пишутся
  /// одним снимком.
  static final Map<String, Timer> _writeTimers = {};
  static final Map<String, Directory> _writeDirs = {};
  static const Duration _writeDelay = Duration(milliseconds: 300);

  static bool get isReady => _root != null;

  static Future<void> init() async {
    if (_root != null) return;
    final docs = await getApplicationDocumentsDirectory();
    final root = Directory(p.join(docs.path, _rootDirName));
    if (!await root.exists()) {
      await root.create(recursive: true);
    }
    _root = root;
    await _removeLegacyCache(docs.path);
  }

  /// Старый кэш (sqflite + json) больше не используется — удаляем, чтобы
  /// не тянуть за собой повреждённые или устаревшие данные.
  static Future<void> _removeLegacyCache(String dirPath) async {
    const names = [
      _legacyDbName,
      '$_legacyDbName-wal',
      '$_legacyDbName-shm',
      _legacyChatsFile,
    ];
    for (final name in names) {
      try {
        final file = File(p.join(dirPath, name));
        if (await file.exists()) await file.delete();
      } catch (_) {
        // Файл может быть занят старым процессом — не критично.
      }
    }
  }

  /// Папка текущего пользователя. При смене аккаунта сбрасывает память.
  static Future<Directory?> _ownerDir() async {
    final root = _root;
    final owner = ownerId;
    if (root == null || owner == null || owner.isEmpty) return null;

    if (_loadedOwner != owner) {
      _loadedOwner = owner;
      _chatsLoaded = false;
      _chats = [];
      _messages.clear();
      _writes.clear();
      for (final timer in _writeTimers.values) {
        timer.cancel();
      }
      _writeTimers.clear();
      _writeDirs.clear();
    }

    final dir = Directory(p.join(root.path, owner));
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  // ==================== Сообщения ====================

  static int _compare(Message a, Message b) {
    final byTime = a.createdAt.compareTo(b.createdAt);
    return byTime != 0 ? byTime : a.id.compareTo(b.id);
  }

  /// Пишем ли сообщение на диск. Оптимистичные (ещё не подтверждённые
  /// сервером) сообщения не сохраняем: после перезапуска они станут
  /// «фантомами» без настоящего id.
  static bool _shouldStore(Message message) {
    if (message.id.isEmpty || message.chatId.isEmpty) return false;
    if (message.status == MessageStatus.sending) return false;
    // Временные id оптимистичных сообщений — числа или 'up_...', а не UUID.
    if (message.id.length < 30) return false;
    return true;
  }

  static Future<File> _chatFile(Directory dir, String chatId) async {
    final messagesDir = Directory(p.join(dir.path, _messagesDirName));
    if (!await messagesDir.exists()) {
      await messagesDir.create(recursive: true);
    }
    return File(p.join(messagesDir.path, '$chatId.json'));
  }

  /// Сообщения чата из памяти или с диска (по возрастанию времени).
  static Future<List<Message>> _messagesFor(String chatId) async {
    final dir = await _ownerDir();
    if (dir == null) return [];
    final cached = _messages[chatId];
    if (cached != null) return cached;

    final list = <Message>[];
    try {
      final file = await _chatFile(dir, chatId);
      if (await file.exists()) {
        final raw = await file.readAsString();
        if (raw.isNotEmpty) {
          final decoded = jsonDecode(raw);
          if (decoded is List) {
            for (final item in decoded) {
              if (item is Map<String, dynamic>) {
                list.add(Message.fromJson(item));
              }
            }
          }
        }
      }
    } catch (e) {
      print('[ChatStorage] read error $chatId: $e');
    }
    list.sort(_compare);
    _messages[chatId] = list;
    return list;
  }

  static Future<void> saveMessages(String chatId, List<Message> messages) async {
    if (chatId.isEmpty || messages.isEmpty) return;
    final dir = await _ownerDir();
    if (dir == null) return;

    final list = await _messagesFor(chatId);
    final indexById = {for (var i = 0; i < list.length; i++) list[i].id: i};

    var changed = false;
    for (final message in messages) {
      if (!_shouldStore(message)) continue;
      final index = indexById[message.id];
      if (index != null) {
        list[index] = message;
      } else {
        indexById[message.id] = list.length;
        list.add(message);
      }
      changed = true;
    }
    if (!changed) return;

    list.sort(_compare);
    if (list.length > maxMessagesPerChat) {
      list.removeRange(0, list.length - maxMessagesPerChat);
    }
    await _persistChat(dir, chatId);
  }

  static Future<void> saveMessage(Message message) =>
      saveMessages(message.chatId, [message]);

  /// Последние [limit] сообщений чата по возрастанию времени.
  ///
  /// [beforeCreatedAt]/[beforeId] — курсор для прокрутки вверх: вернёт
  /// сообщения строго старше указанной пары (created_at, id).
  static Future<List<Message>> loadMessages(
    String chatId, {
    int limit = openPageSize,
    int? beforeCreatedAt,
    String? beforeId,
  }) async {
    if (chatId.isEmpty) return [];
    final list = await _messagesFor(chatId);

    var filtered = list;
    if (beforeCreatedAt != null) {
      filtered = list.where((m) {
        if (m.createdAt != beforeCreatedAt) {
          return m.createdAt < beforeCreatedAt;
        }
        if (beforeId == null || beforeId.isEmpty) return false;
        return m.id.compareTo(beforeId) < 0;
      }).toList();
    }
    if (filtered.length > limit) {
      filtered = filtered.sublist(filtered.length - limit);
    }
    return List<Message>.from(filtered);
  }

  static Future<void> deleteMessage(String chatId, String messageId) async {
    final dir = await _ownerDir();
    if (dir == null) return;
    final list = await _messagesFor(chatId);
    final before = list.length;
    list.removeWhere((m) => m.id == messageId);
    if (list.length == before) return;
    await _persistChat(dir, chatId);
  }

  static Future<void> deleteChatMessages(String chatId) async {
    final dir = await _ownerDir();
    if (dir == null) return;
    _writeTimers.remove(chatId)?.cancel();
    _writeDirs.remove(chatId);
    // Даём уже начатой записи завершиться, иначе она вернёт файл после удаления.
    await (_writes[chatId] ?? Future<void>.value()).catchError((_) {});
    _writes.remove(chatId);
    _messages.remove(chatId);
    try {
      final file = await _chatFile(dir, chatId);
      if (await file.exists()) await file.delete();
    } catch (e) {
      print('[ChatStorage] deleteChatMessages error: $e');
    }
  }

  // ==================== Список чатов ====================

  static Future<List<Chat>> loadChats() async {
    final dir = await _ownerDir();
    if (dir == null) return [];
    if (!_chatsLoaded) {
      _chats = await _readChats(dir);
      _chatsLoaded = true;
    }
    return List<Chat>.from(_chats);
  }

  static Future<List<Chat>> _readChats(Directory dir) async {
    final result = <Chat>[];
    try {
      final file = File(p.join(dir.path, _chatsFileName));
      if (!await file.exists()) return result;
      final raw = await file.readAsString();
      if (raw.isEmpty) return result;
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        for (final item in decoded) {
          if (item is Map<String, dynamic>) {
            result.add(Chat.fromJson(item));
          }
        }
      }
    } catch (e) {
      print('[ChatStorage] loadChats error: $e');
    }
    return result;
  }

  static Future<void> saveChats(List<Chat> chats) async {
    if (chats.isEmpty) return;
    final dir = await _ownerDir();
    if (dir == null) return;
    _chats = List<Chat>.from(chats);
    _chatsLoaded = true;
    await _writeJson(
      File(p.join(dir.path, _chatsFileName)),
      chats.map((c) => c.toJson()).toList(),
    );
  }

  static Future<void> deleteChat(String chatId) async {
    final dir = await _ownerDir();
    if (dir == null) return;
    _chats.removeWhere((c) => c.id == chatId);
    _chatsLoaded = true;
    await _writeJson(
      File(p.join(dir.path, _chatsFileName)),
      _chats.map((c) => c.toJson()).toList(),
    );
  }

  /// Полная очистка локальной истории (выход из аккаунта).
  static Future<void> clearAll() async {
    final root = _root;
    for (final timer in _writeTimers.values) {
      timer.cancel();
    }
    _writeTimers.clear();
    _writeDirs.clear();
    _messages.clear();
    _chats = [];
    _chatsLoaded = false;
    // Ждём уже начатые записи, иначе они воссоздадут удалённые файлы.
    await Future.wait(_writes.values.map((f) => f.catchError((_) {})));
    _writes.clear();
    if (root == null) return;
    try {
      if (await root.exists()) await root.delete(recursive: true);
      await root.create(recursive: true);
    } catch (e) {
      print('[ChatStorage] clearAll error: $e');
    }
  }

  // ==================== Запись на диск ====================

  /// Сохранение чата ставится в очередь: две параллельные записи одного файла
  /// не должны перетирать друг друга.
  ///
  /// Сам снимок и запись откладываются на [_writeDelay], поэтому серия
  /// изменений (офлайн-синхронизация, пачка сообщений) превращается в одну
  /// запись файла вместо сотен.
  static Future<void> _persistChat(Directory dir, String chatId) {
    _writeDirs[chatId] = dir;
    _writeTimers[chatId]?.cancel();
    _writeTimers[chatId] = Timer(_writeDelay, () {
      _writeTimers.remove(chatId);
      _flushChat(chatId);
    });
    // Вызывающий код не должен ждать записи на диск.
    return Future<void>.value();
  }

  /// Записывает актуальное состояние чата на диск.
  static Future<void> _flushChat(String chatId) {
    final dir = _writeDirs[chatId];
    final list = _messages[chatId];
    if (dir == null || list == null) return Future<void>.value();

    // Снимок делается в момент записи, а не на каждое входящее сообщение.
    final snapshot = list.map((m) => m.toJson()).toList();
    final previous = _writes[chatId] ?? Future<void>.value();
    final next = previous.catchError((_) {}).then((_) async {
      final file = await _chatFile(dir, chatId);
      await _writeJson(file, snapshot);
    });
    _writes[chatId] = next.catchError((_) {});
    return next;
  }

  /// Немедленно сбрасывает отложенные записи (например, при уходе в фон).
  static Future<void> flushPending() async {
    final ids = _writeTimers.keys.toList();
    for (final id in ids) {
      _writeTimers.remove(id)?.cancel();
    }
    await Future.wait(ids.map(_flushChat));
  }

  static Future<void> _writeJson(File file, Object? data) async {
    try {
      await file.parent.create(recursive: true);
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode(data), flush: true);
      if (await file.exists()) {
        await file.delete();
      }
      await tmp.rename(file.path);
    } catch (e) {
      print('[ChatStorage] write error ${file.path}: $e');
    }
  }
}
