import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:video_player/video_player.dart';
import '../l10n/app_localizations.dart';

class MediaViewerItem {
  final String messageId;
  final String url;
  final bool isVideo;
  final String? heroTag;

  const MediaViewerItem({
    required this.messageId,
    required this.url,
    required this.isVideo,
    this.heroTag,
  });
}

class MediaViewerScreen extends StatefulWidget {
  final List<MediaViewerItem> items;
  final int initialIndex;

  const MediaViewerScreen({
    super.key,
    required this.items,
    this.initialIndex = 0,
  });

  @override
  State<MediaViewerScreen> createState() => _MediaViewerScreenState();
}

class _MediaViewerScreenState extends State<MediaViewerScreen> {
  late final PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, widget.items.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.items.length,
            onPageChanged: (i) => setState(() => _currentIndex = i),
            itemBuilder: (context, i) {
              final item = widget.items[i];
              if (item.isVideo) {
                return _VideoPlayerView(
                  key: ValueKey(item.url),
                  url: item.url,
                  isActive: i == _currentIndex,
                );
              }
              return _ZoomableImage(key: ValueKey(item.url), item: item);
            },
          ),
          Positioned(
            top: 0,
            left: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close, color: Colors.white, size: 28),
                ),
              ),
            ),
          ),
          if (widget.items.length > 1)
            Positioned(
              top: 0,
              right: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '${_currentIndex + 1} / ${widget.items.length}',
                    style: const TextStyle(color: Colors.white70, fontSize: 14),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ZoomableImage extends StatefulWidget {
  final MediaViewerItem item;

  const _ZoomableImage({super.key, required this.item});

  @override
  State<_ZoomableImage> createState() => _ZoomableImageState();
}

class _ZoomableImageState extends State<_ZoomableImage>
    with SingleTickerProviderStateMixin {
  final TransformationController _transform = TransformationController();
  late final AnimationController _animController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );
  bool _isZoomed = false;

  @override
  void dispose() {
    _animController.dispose();
    _transform.dispose();
    super.dispose();
  }

  void _syncZoomState() {
    final zoomed = _transform.value.getMaxScaleOnAxis() > 1.01;
    if (zoomed != _isZoomed) setState(() => _isZoomed = zoomed);
  }

  void _toggleZoom() {
    final begin = _transform.value;
    Matrix4 end;
    if (_isZoomed) {
      end = Matrix4.identity();
    } else {
      final size = MediaQuery.of(context).size;
      end = Matrix4.identity()
        ..translateByDouble(size.width / 2, size.height / 2, 0, 1)
        ..scaleByDouble(2.5, 2.5, 1, 1)
        ..translateByDouble(-size.width / 2, -size.height / 2, 0, 1);
    }
    final anim = Matrix4Tween(
      begin: begin,
      end: end,
    ).animate(CurvedAnimation(parent: _animController, curve: Curves.easeOutCubic));
    void listener() {
      _transform.value = anim.value;
      _syncZoomState();
    }
    anim.addListener(listener);
    _animController.forward(from: 0).whenCompleteOrCancel(() {
      anim.removeListener(listener);
      _syncZoomState();
    });
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: _transform,
      panEnabled: _isZoomed,
      scaleEnabled: true,
      minScale: 1.0,
      maxScale: 5.0,
      onInteractionStart: (_) => _syncZoomState(),
      onInteractionUpdate: (_) => _syncZoomState(),
      onInteractionEnd: (_) {
        if (!_isZoomed) {
          _animController.stop();
          _transform.value = Matrix4.identity();
        }
      },
      child: GestureDetector(
        onDoubleTap: _toggleZoom,
        child: Hero(
          tag: widget.item.heroTag ?? widget.item.url,
          child: Center(
            child: CachedNetworkImage(
              imageUrl: widget.item.url,
              fit: BoxFit.contain,
              progressIndicatorBuilder: (_, _, progress) => Center(
                child: CircularProgressIndicator(
                  value: progress.progress,
                  color: Colors.white,
                ),
              ),
              errorWidget: (_, _, _) => Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.broken_image, color: Colors.white, size: 64),
                  const SizedBox(height: 16),
                  Text(
                    'Failed to load image',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.white,
                        ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VideoPlayerView extends StatefulWidget {
  final String url;
  final bool isActive;

  const _VideoPlayerView({super.key, required this.url, required this.isActive});

  @override
  State<_VideoPlayerView> createState() => _VideoPlayerViewState();
}

class _VideoPlayerViewState extends State<_VideoPlayerView> {
  VideoPlayerController? _controller;
  bool _initialized = false;
  bool _hasError = false;
  bool _showControls = true;
  double _currentPosition = 0;
  double _maxPosition = 1;

  @override
  void initState() {
    super.initState();
    if (widget.isActive) _initVideo();
  }

  @override
  void didUpdateWidget(covariant _VideoPlayerView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      if (_controller == null) {
        _initVideo();
      } else {
        _controller!.play();
      }
    } else if (!widget.isActive && oldWidget.isActive) {
      _controller?.pause();
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_onVideoUpdate);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _initVideo() async {
    try {
      final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
      _controller = controller;
      await controller.initialize();
      controller.addListener(_onVideoUpdate);
      if (!mounted) {
        controller.dispose();
        return;
      }
      setState(() {
        _initialized = true;
        _maxPosition = controller.value.duration.inMilliseconds.toDouble();
      });
      controller.play();
    } catch (e) {
      if (mounted) setState(() => _hasError = true);
    }
  }

  void _onVideoUpdate() {
    final controller = _controller;
    if (!mounted || controller == null) return;
    final position = controller.value.position.inMilliseconds.toDouble();
    final duration = controller.value.duration.inMilliseconds.toDouble();

    if ((_currentPosition - position).abs() > 500 ||
        _maxPosition != duration) {
      setState(() {
        _currentPosition = position;
        _maxPosition = duration > 0 ? duration : 1;
      });
    }
  }

  void _togglePlayPause() {
    final controller = _controller;
    if (controller == null) return;
    setState(() {
      if (controller.value.isPlaying) {
        controller.pause();
      } else {
        controller.play();
      }
    });
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final hours = duration.inHours;
    final minutes = duration.inMinutes.remainder(60);
    final seconds = duration.inSeconds.remainder(60);
    if (hours > 0) {
      return '$hours:${twoDigits(minutes)}:${twoDigits(seconds)}';
    }
    return '${twoDigits(minutes)}:${twoDigits(seconds)}';
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => setState(() => _showControls = !_showControls),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: _hasError
                ? Text(
                    AppLocalizations.of(context).videoNotSupported,
                    style: const TextStyle(color: Colors.white),
                  )
                : controller == null || !_initialized
                    ? const CircularProgressIndicator(color: Colors.white)
                    : AspectRatio(
                        aspectRatio: controller.value.aspectRatio,
                        child: VideoPlayer(controller),
                      ),
          ),
          if (_initialized && _showControls && controller != null)
            Positioned.fill(
              child: Container(
                color: Colors.black.withValues(alpha: 0.3),
                child: SafeArea(
                  top: false,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            Text(
                              _formatDuration(
                                Duration(milliseconds: _currentPosition.toInt()),
                              ),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                            Expanded(
                              child: SliderTheme(
                                data: SliderTheme.of(context).copyWith(
                                  trackHeight: 3,
                                  thumbShape: const RoundSliderThumbShape(
                                    enabledThumbRadius: 8,
                                  ),
                                ),
                                child: Slider(
                                  value: _currentPosition.clamp(0, _maxPosition),
                                  min: 0,
                                  max: _maxPosition > 0 ? _maxPosition : 1,
                                  onChanged: (value) {
                                    controller.seekTo(
                                      Duration(milliseconds: value.toInt()),
                                    );
                                    setState(() => _currentPosition = value);
                                  },
                                ),
                              ),
                            ),
                            Text(
                              _formatDuration(
                                Duration(milliseconds: _maxPosition.toInt()),
                              ),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            onPressed: () {
                              controller.seekTo(
                                controller.value.position -
                                    const Duration(seconds: 10),
                              );
                            },
                            icon: const Icon(
                              Icons.replay_10,
                              color: Colors.white,
                              size: 36,
                            ),
                          ),
                          const SizedBox(width: 24),
                          IconButton(
                            onPressed: _togglePlayPause,
                            icon: Icon(
                              controller.value.isPlaying
                                  ? Icons.pause
                                  : Icons.play_arrow,
                              color: Colors.white,
                              size: 48,
                            ),
                          ),
                          const SizedBox(width: 24),
                          IconButton(
                            onPressed: () {
                              controller.seekTo(
                                controller.value.position +
                                    const Duration(seconds: 10),
                              );
                            },
                            icon: const Icon(
                              Icons.forward_10,
                              color: Colors.white,
                              size: 36,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
