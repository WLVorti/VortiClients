import 'dart:io';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:permission_handler/permission_handler.dart';
import '../services/api_service.dart';

class SaveFileUtils {
  static const _channel = MethodChannel('com.wlvorti.vorti_messenger/save');

  static Future<bool> saveFile({
    required String downloadUrl,
    required String fileName,
    required String mimeType,
  }) async {
    final tempDir = await getTemporaryDirectory();
    final tempFile = File('${tempDir.path}/$fileName');

    final response = await http.get(Uri.parse(downloadUrl));
    if (response.statusCode != 200) {
      throw Exception('Download failed: ${response.statusCode}');
    }
    await tempFile.writeAsBytes(response.bodyBytes);

    final isMedia = mimeType.startsWith('image/') ||
        mimeType.startsWith('video/') ||
        mimeType.startsWith('audio/');

    bool result;
    if (isMedia) {
      final hasPermission = await _requestMediaPermission(mimeType);
      if (!hasPermission) {
        throw Exception('permission_denied');
      }
      result = await _channel.invokeMethod<bool>('saveToGallery', {
        'filePath': tempFile.path,
        'mimeType': mimeType,
        'fileName': fileName,
      }) ?? false;
    } else {
      result = await _channel.invokeMethod<bool>('saveFileToDownloads', {
        'filePath': tempFile.path,
        'mimeType': mimeType,
        'fileName': fileName,
      }) ?? false;
    }

    try {
      await tempFile.delete();
    } catch (_) {}

    return result;
  }

  static Future<bool> _requestMediaPermission(String mimeType) async {
    if (Platform.isAndroid) return true;

    if (Platform.isIOS) {
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        final status = await Permission.photos.status;
        if (status.isGranted || status.isLimited) return true;
        final result = await Permission.photos.request();
        return result.isGranted || result.isLimited;
      }
    }

    return true;
  }

  static String getDownloadUrl(String fileId, String? token) {
    return '${ApiService.baseUrl}/download/$fileId?token=$token';
  }

  static String getFileExtension(String fileName) {
    return p.extension(fileName).replaceFirst('.', '').toLowerCase();
  }

  static bool isMediaFile(String ext) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    return imageExts.contains(ext) ||
        videoExts.contains(ext) ||
        audioExts.contains(ext);
  }
}
