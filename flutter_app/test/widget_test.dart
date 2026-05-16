import 'package:flutter_test/flutter_test.dart';
import 'package:vorti_messenger/main.dart';

void main() {
  testWidgets('App starts', (WidgetTester tester) async {
    await tester.pumpWidget(const VortiApp());
    await tester.pump();
    expect(find.byType(VortiApp), findsOneWidget);
  });
}
