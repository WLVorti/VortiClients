import 'package:flutter_test/flutter_test.dart';
import 'package:vorti_messenger/main.dart';
import 'package:vorti_messenger/services/api_service.dart';

void main() {
  testWidgets('App starts', (WidgetTester tester) async {
    await tester.pumpWidget(VortiApp(api: ApiService()));
    await tester.pump();
    expect(find.byType(VortiApp), findsOneWidget);
  });
}
