import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../models/models.dart';

class MessageCache {
  static Database? _db;

  static Future<void> init() async {
    if (_db != null) return;
    final dir = await getApplicationDocumentsDirectory();
    _db = await openDatabase(
      p.join(dir.path, 'messages_cache.db'),
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            text TEXT,
            reply_to TEXT,
            reply_text TEXT,
            reply_username TEXT,
            file_id TEXT,
            file_mime_type TEXT,
            created_at INTEGER NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            is_edited INTEGER NOT NULL DEFAULT 0,
            edited_text TEXT,
            status TEXT NOT NULL DEFAULT 'sent'
          )
        ''');
        await db.execute('CREATE INDEX idx_messages_chat ON messages(chat_id, created_at)');
      },
    );
  }

  static Future<void> close() async {
    await _db?.close();
    _db = null;
  }

  static Future<List<Message>> getMessages(String chatId, {int limit = 50}) async {
    final db = _db;
    if (db == null) return [];
    final rows = await db.query(
      'messages',
      where: 'chat_id = ?',
      whereArgs: [chatId],
      orderBy: 'created_at DESC',
      limit: limit,
    );
    return rows.map((r) => Message.fromJson(r)).toList();
  }

  static Future<void> saveMessages(String chatId, List<Message> messages) async {
    final db = _db;
    if (db == null || messages.isEmpty) return;
    final batch = db.batch();
    for (final m in messages) {
      batch.insert('messages', m.toJson(),
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  static Future<void> saveMessage(Message message) async {
    final db = _db;
    if (db == null) return;
    await db.insert('messages', message.toJson(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<void> deleteChatMessages(String chatId) async {
    final db = _db;
    if (db == null) return;
    await db.delete('messages', where: 'chat_id = ?', whereArgs: [chatId]);
  }

  static Future<void> deleteMessage(String messageId) async {
    final db = _db;
    if (db == null) return;
    await db.delete('messages', where: 'id = ?', whereArgs: [messageId]);
  }
}
