import 'dart:io';
import 'package:flutter/material.dart';
import 'package:vorti_messenger/l10n/app_localizations.dart';
import 'package:vorti_messenger/services/theme_provider.dart';

class ChatPreviewWidget extends StatelessWidget {
  final ThemeProvider themeProvider;
  final String? wallpaperPath;

  const ChatPreviewWidget({
    required this.themeProvider,
    this.wallpaperPath,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = themeProvider.themeMode == ThemeMode.dark;
    final colors = themeProvider.colors;
    final myBubble = isDark
        ? colors.primary.withValues(alpha: 0.35)
        : colors.primary.withValues(alpha: 0.10);
    final theirBubble = isDark
        ? colors.surface
        : Colors.grey.shade200;
    final textColor = isDark ? Colors.white : Colors.black87;
    final theirTextColor = isDark ? Colors.white70 : Colors.black87;

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 200,
        child: Stack(
          children: [
            if (wallpaperPath != null && File(wallpaperPath!).existsSync())
              Positioned.fill(
                child: Image.file(
                  File(wallpaperPath!),
                  fit: BoxFit.cover,
                ),
              )
            else
              Positioned.fill(
                child: Container(color: colors.background),
              ),
            Positioned.fill(
              child: Container(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: _bubble('Hey, how are you?', myBubble, textColor, true),
                    ),
                    const SizedBox(height: 6),
                    _bubble("I'm good, thanks!", theirBubble, theirTextColor, false),
                    const SizedBox(height: 6),
                    Align(
                      alignment: Alignment.centerRight,
                      child: _bubble('See you tomorrow!', myBubble, textColor, true),
                    ),
                    const Spacer(),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black26,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          AppLocalizations.of(context).wallpaperPreview,
                          style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _bubble(String text, Color bg, Color textColor, bool isMe) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 200),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isMe ? 16 : 4),
            bottomRight: Radius.circular(isMe ? 4 : 16),
          ),
        ),
        child: Text(
          text,
          style: TextStyle(color: textColor, fontSize: 12),
        ),
      ),
    );
  }
}
