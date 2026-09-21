import 'package:flutter/material.dart';

const List<String> kolobokGifs = [
  'acute_mini', 'aggressive_mini', 'air_kiss_mini', 'angel_mini', 'beee_mini',
  'biggrin_mini', 'biggrin_mini2', 'blum_mini', 'blush_mini', 'bo_mini',
  'bomb_mini', 'boredom_mini', 'bye_mini', 'chok_mini', 'clapping_mini',
  'cray_mini', 'cray_mini2', 'crazy_mini', 'dance_mini', 'dash_mini',
  'diablo_mini', 'dirol_mini', 'drink_mini', 'drink2_mini', 'fool_mini',
  'fool_mini2', 'good_mini', 'greeting_mini', 'happy_mini', 'heart_mini',
  'help_mini', 'kiss_mini', 'kiss3_mini', 'laugh_mini', 'laugh_mini2',
  'lol_mini', 'lol_mini2', 'mad_mini', 'mail1_mini', 'mamba_mini',
  'man_in_love_mini', 'mocking_mini', 'music_mini', 'music_mini2', 'nea_mini',
  'new_russian_mini', 'ok_mini', 'pardon_mini', 'rofl_mini', 'rolleyes_mini',
  'rose_mini', 'sad_mini', 'sad_mini2', 'scratch_one-s_head_mini', 'secret_mini',
  'shout_mini', 'smile_mini', 'smile_mini2', 'sorry_mini', 'stop_mini',
  'unknw_mini', 'unsure_mini', 'vava_mini', 'wacko_mini', 'wacko_mini2',
  'wink_mini', 'yahoo_mini', 'yes_mini',
];

final RegExp kolobokMarkerRegExp =
    RegExp(r'::kolobok:([A-Za-z0-9_\-]+)::|:k(\d+):');

String? kolobokAssetForMarker(String marker) {
  final explicit = RegExp(r'^::kolobok:([A-Za-z0-9_\-]+)::$')
      .firstMatch(marker)
      ?.group(1);
  if (explicit != null) return kolobokGifs.contains(explicit) ? explicit : null;

  final index = RegExp(r'^:k(\d+):$').firstMatch(marker)?.group(1);
  if (index == null) return null;
  final i = int.tryParse(index);
  if (i == null || i < 0 || i >= kolobokGifs.length) return null;
  return kolobokGifs[i];
}

List<InlineSpan> kolobokPreviewSpans(String text, {double size = 18}) {
  if (text.isEmpty || !kolobokMarkerRegExp.hasMatch(text)) {
    return [TextSpan(text: text)];
  }

  final children = <InlineSpan>[];
  int lastEnd = 0;
  for (final match in kolobokMarkerRegExp.allMatches(text)) {
    if (match.start > lastEnd) {
      children.add(TextSpan(text: text.substring(lastEnd, match.start)));
    }
    final asset = kolobokAssetForMarker(match.group(0)!);
    if (asset != null) {
      children.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1),
            child: Image.asset(
              'assets/mini/$asset.gif',
              width: size,
              height: size,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.low,
              gaplessPlayback: true,
            ),
          ),
        ),
      );
    } else {
      children.add(TextSpan(text: match.group(0)));
    }
    lastEnd = match.end;
  }
  if (lastEnd < text.length) {
    children.add(TextSpan(text: text.substring(lastEnd)));
  }
  return children;
}
