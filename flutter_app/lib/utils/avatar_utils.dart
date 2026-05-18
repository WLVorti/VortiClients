import 'package:flutter/material.dart';

final _avatarColors = [
  Color(0xFFE53935), // red
  Color(0xFF1E88E5), // blue
  Color(0xFF43A047), // green
  Color(0xFFFB8C00), // orange
  Color(0xFF8E24AA), // purple
  Color(0xFF00ACC1), // cyan
  Color(0xFFD81B60), // pink
  Color(0xFF3949AB), // indigo
  Color(0xFF6D4C41), // brown
  Color(0xFF546E7A), // blue-grey
  Color(0xFFF4511E), // deep orange
  Color(0xFF00897B), // teal
];

Color colorFromId(String id) {
  final hash = id.codeUnits.fold<int>(0, (prev, c) => prev * 31 + c);
  return _avatarColors[hash.abs() % _avatarColors.length];
}
