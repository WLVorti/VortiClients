package com.wlvorti.vorti_messenger

import android.content.ContentValues
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.MediaStore
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class MainActivity : FlutterActivity() {
    companion object {
        private const val SHARE_CHANNEL = "com.wlvorti.vorti_messenger/share"
        private const val SAVE_CHANNEL = "com.wlvorti.vorti_messenger/save"
    }

    private var pendingShare: String? = null
    private var flutterEngine: FlutterEngine? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        this.flutterEngine = flutterEngine

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SHARE_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "getSharedData" -> result.success(pendingShare)
                "clearSharedData" -> {
                    pendingShare = null
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SAVE_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "saveToGallery" -> {
                    val filePath = call.argument<String>("filePath")!!
                    val mimeType = call.argument<String>("mimeType")!!
                    val fileName = call.argument<String>("fileName")!!
                    try {
                        val success = saveToGallery(filePath, mimeType, fileName)
                        result.success(success)
                    } catch (e: Exception) {
                        result.error("SAVE_ERROR", e.message, null)
                    }
                }
                "saveFileToDownloads" -> {
                    val filePath = call.argument<String>("filePath")!!
                    val mimeType = call.argument<String>("mimeType")!!
                    val fileName = call.argument<String>("fileName")!!
                    try {
                        val success = saveFileToDownloads(filePath, mimeType, fileName)
                        result.success(success)
                    } catch (e: Exception) {
                        result.error("SAVE_ERROR", e.message, null)
                    }
                }
                else -> result.notImplemented()
            }
        }

        pendingShare?.let { sendToFlutter(it) }
    }

    private fun saveToGallery(filePath: String, mimeType: String, fileName: String): Boolean {
        val sourceFile = File(filePath)
        if (!sourceFile.exists()) return false

        val isVideo = mimeType.startsWith("video/")
        val collection = if (isVideo) {
            MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        }

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH,
                    if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val resolver = contentResolver
        val uri = resolver.insert(collection, values) ?: return false

        return try {
            resolver.openOutputStream(uri)?.use { output ->
                sourceFile.inputStream().use { input ->
                    input.copyTo(output)
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            }
            MediaScannerConnection.scanFile(this, arrayOf(uri.toString()), arrayOf(mimeType), null)
            true
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            false
        }
    }

    private fun saveFileToDownloads(filePath: String, mimeType: String, fileName: String): Boolean {
        val sourceFile = File(filePath)
        if (!sourceFile.exists()) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }

            val resolver = contentResolver
            val uri = resolver.insert(collection, values) ?: return false

            return try {
                resolver.openOutputStream(uri)?.use { output ->
                    sourceFile.inputStream().use { input ->
                        input.copyTo(output)
                    }
                }
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                MediaScannerConnection.scanFile(this, arrayOf(uri.toString()), arrayOf(mimeType), null)
                true
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                false
            }
        } else {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            val targetFile = File(downloadsDir, fileName)
            sourceFile.copyTo(targetFile, overwrite = true)
            MediaScannerConnection.scanFile(this, arrayOf(targetFile.absolutePath), arrayOf(mimeType), null)
            return true
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        processIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        processIntent(intent)
    }

    private fun processIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
        val payload = buildPayload(intent) ?: return
        pendingShare = payload
        sendToFlutter(payload)
    }

    private fun buildPayload(intent: Intent): String? {
        val type = intent.type ?: "*/*"
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        val obj = JSONObject()
        obj.put("mimeType", type)
        if (!text.isNullOrBlank()) obj.put("text", text)
        if (!subject.isNullOrBlank()) obj.put("subject", subject)

        val files = JSONArray()
        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            val streams = getStreams(intent)
            for (uri in streams) {
                copyToCache(uri)?.let { files.put(it) }
            }
        } else {
            getStream(intent)?.let { uri ->
                copyToCache(uri)?.let { files.put(it) }
            }
        }

        if (obj.has("text") || files.length() > 0) {
            if (files.length() > 0) obj.put("files", files)
            return obj.toString()
        }
        return null
    }

    private fun getStream(intent: Intent): Uri? {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION") intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        }
    }

    private fun getStreams(intent: Intent): List<Uri> {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
        }
    }

    private fun copyToCache(uri: Uri): JSONObject? {
        return try {
            val dir = File(cacheDir, "shared").apply { mkdirs() }
            val displayName = queryDisplayName(uri) ?: "shared_${System.currentTimeMillis()}"
            val target = File(dir, "${System.currentTimeMillis()}_$displayName")
            val stream = contentResolver.openInputStream(uri) ?: return null
            stream.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            if (!target.exists() || target.length() == 0L) return null
            val mime = contentResolver.getType(uri) ?: "*/*"
            JSONObject()
                .put("path", target.absolutePath)
                .put("mimeType", mime)
                .put("name", displayName)
                .put("size", target.length())
        } catch (e: Exception) {
            null
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        return try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) cursor.getString(idx) else null
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun sendToFlutter(payload: String) {
        flutterEngine?.let { engine ->
            MethodChannel(engine.dartExecutor.binaryMessenger, SHARE_CHANNEL)
                .invokeMethod("onSharedData", payload)
        }
    }
}
