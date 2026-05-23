import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';

class FallingIconsBackground extends StatefulWidget {
  final List<IconData> icons;
  final int maxConcurrent;
  final Duration spawnInterval;
  final double minSpeed;
  final double maxSpeed;

  const FallingIconsBackground({
    super.key,
    this.icons = _defaultIcons,
    this.maxConcurrent = 15,
    this.spawnInterval = const Duration(milliseconds: 800),
    this.minSpeed = 8,
    this.maxSpeed = 16,
  });

  static const List<IconData> _defaultIcons = [
    Icons.chat_bubble_outline,
    Icons.message_outlined,
    Icons.send_outlined,
    Icons.forum_outlined,
    Icons.mail_outline,
    Icons.notifications_outlined,
    Icons.star_outline,
    Icons.favorite_outline,
    Icons.thumb_up_outlined,
    Icons.emoji_emotions_outlined,
    Icons.tag,
    Icons.alternate_email,
  ];

  @override
  State<FallingIconsBackground> createState() => _FallingIconsBackgroundState();
}

class _FallingIcon {
  final IconData icon;
  final double x;
  final double size;
  final double speed;
  final double rotation;
  final double maxOpacity;
  final DateTime startTime;

  _FallingIcon({
    required this.icon,
    required this.x,
    required this.size,
    required this.speed,
    required this.rotation,
    required this.maxOpacity,
    required this.startTime,
  });
}

class _FallingIconsBackgroundState extends State<FallingIconsBackground>
    with TickerProviderStateMixin {
  final List<_FallingIcon> _icons = [];
  final Random _random = Random();
  Timer? _spawnTimer;
  late Ticker _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick);
    _ticker.start();
    _spawnTimer = Timer.periodic(widget.spawnInterval, (_) => _spawnIcon());
    for (int i = 0; i < 5; i++) {
      _spawnIcon(initialOffset: _random.nextDouble() * 0.5);
    }
  }

  void _spawnIcon({double? initialOffset}) {
    if (_icons.length >= widget.maxConcurrent) return;
    final size = 16.0 + _random.nextDouble() * 20.0;
    _icons.add(_FallingIcon(
      icon: widget.icons[_random.nextInt(widget.icons.length)],
      x: _random.nextDouble(),
      size: size,
      speed: widget.minSpeed + _random.nextDouble() * (widget.maxSpeed - widget.minSpeed),
      rotation: _random.nextDouble() * 0.3 - 0.15,
      maxOpacity: 0.15 + _random.nextDouble() * 0.2,
      startTime: DateTime.now().subtract(
        Duration(milliseconds: (initialOffset ?? 0) * widget.maxSpeed * 1000 ~/ 1),
      ),
    ));
  }

  void _onTick(Duration elapsed) {
    final now = DateTime.now();
    _icons.removeWhere((icon) {
      final age = now.difference(icon.startTime).inMilliseconds / 1000.0;
      return age > icon.speed;
    });
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _spawnTimer?.cancel();
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = constraints.maxWidth;
        final screenHeight = constraints.maxHeight;
        final now = DateTime.now();

        return Stack(
          children: _icons.map((icon) {
            final age = now.difference(icon.startTime).inMilliseconds / 1000.0;
            final progress = (age / icon.speed).clamp(0.0, 1.0);
            final y = -icon.size + progress * (screenHeight + icon.size * 2);
            final x = icon.x * (screenWidth - icon.size);

            double opacity;
            if (progress < 0.15) {
              opacity = icon.maxOpacity * (progress / 0.15);
            } else if (progress > 0.85) {
              opacity = icon.maxOpacity * ((1.0 - progress) / 0.15);
            } else {
              opacity = icon.maxOpacity;
            }

            return Positioned(
              left: x,
              top: y,
              child: Opacity(
                opacity: opacity,
                child: Transform.rotate(
                  angle: icon.rotation,
                  child: Icon(
                    icon.icon,
                    size: icon.size,
                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.5),
                  ),
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}
