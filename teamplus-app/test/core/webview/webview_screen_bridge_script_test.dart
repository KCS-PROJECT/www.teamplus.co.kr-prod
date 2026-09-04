import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String bridgeScript;

  setUpAll(() async {
    bridgeScript = await File(
      'lib/core/webview/webview_screen_bridge_script.dart',
    ).readAsString();
  });

  group('FlutterBridge upload.openSettings', () {
    test('브리지 PATCH 버전이 1.1.1이다', () {
      expect(bridgeScript, contains("__VERSION__: '1.1.1'"));
      expect(bridgeScript, isNot(contains("__VERSION__: '1.1.0'")));
    });

    test('기존 upload 핸들러에 openSettings 액션을 전달한다', () {
      expect(bridgeScript, contains('openSettings: function()'));
      expect(
        bridgeScript,
        contains(
          "window.flutter_inappwebview.callHandler('upload', "
          "{ action: 'openSettings' })",
        ),
      );
      expect(
        RegExp("action: 'openSettings'").allMatches(bridgeScript),
        hasLength(1),
      );
    });

    test('성공 data를 반환하고 실패 응답은 오류로 전파한다', () {
      final wrapperStart = bridgeScript.indexOf('openSettings: function()');
      final wrapperEnd = bridgeScript.indexOf(
        "'기기 설정 열기 실패'",
        wrapperStart,
      );

      expect(wrapperStart, greaterThanOrEqualTo(0));
      expect(wrapperEnd, greaterThan(wrapperStart));

      final wrapper = bridgeScript.substring(
        wrapperStart,
        wrapperEnd + "'기기 설정 열기 실패'".length,
      );
      expect(wrapper, contains('if (response && response.success)'));
      expect(wrapper, contains('resolve(response.data)'));
      expect(wrapper, contains('response?.error?.message'));
      expect(wrapper, contains('reject(new Error('));
    });
  });
}
