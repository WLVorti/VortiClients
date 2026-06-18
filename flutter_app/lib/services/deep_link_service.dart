import 'dart:async';
import 'package:app_links/app_links.dart';

class DeepLinkService {
  static final DeepLinkService _instance = DeepLinkService._();
  factory DeepLinkService() => _instance;
  DeepLinkService._();

  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _sub;

  void init(void Function(Uri uri) onLink) {
    _sub?.cancel();
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) onLink(uri);
    });
    _sub = _appLinks.uriLinkStream.listen(onLink);
  }

  void dispose() {
    _sub?.cancel();
  }
}
