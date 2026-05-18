import 'package:flutter/material.dart';

Color colorFromId(String id) {
  final hash = id.codeUnits.fold<int>(0, (prev, c) => prev * 31 + c);
  final hue = hash.abs() % 360;
  return HSLColor.fromAHSL(1, hue.toDouble(), 0.5, 0.55).toColor();
}
