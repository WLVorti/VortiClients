import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import '../models/models.dart';

class ChatCache {
  static const _fileName = 'chats_cache.json';
  static List<Chat>? _memoryCache;

  static Future<void> init() async {
    // Preload into memory
    _memoryCache = await _readFromDisk();
  }

  static List<Chat> getChats() {
    if (_memoryCache != null) return _memoryCache!;
    return [];
  }

  static Future<void> saveChats(List<Chat> chats) async {
    _memoryCache = chats;
    await _writeToDisk(chats);
  }

  static Future<List<Chat>> _readFromDisk() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$_fileName');
      if (!await file.exists()) return [];
      final raw = await file.readAsString();
      if (raw.isEmpty) return [];
      final list = jsonDecode(raw) as List;
      return list.map((e) => Chat.fromJson(e as Map<String, dynamic>)).toList();
    } catch (e) {
      print('[ChatCache] read error: $e');
      return [];
    }
  }

  static Future<void> _writeToDisk(List<Chat> chats) async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$_fileName');
      final raw = jsonEncode(chats.map((c) => c.toJson()).toList());
      await file.writeAsString(raw, flush: true);
    } catch (e) {
      print('[ChatCache] write error: $e');
    }
  }
}
