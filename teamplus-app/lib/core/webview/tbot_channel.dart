// ignore_for_file: avoid_print
//
// tbot_channel.dart
// ─────────────────────────────────────────────────────────────
// PlayUp T Bot · Native Channel Bridge (선택형 브릿지 전략 2)
//
// 이 파일은 기본적으로 비활성 상태이며, 다음 조건을 모두 만족할 때만 동작한다:
//   1. dart-define: TBOT_ENABLED=true
//   2. WebViewBridge.registerHandlers() 에서 TbotChannel.registerIfEnabled(webViewController) 호출
//
// 목적 (TEST_DRIVEN.md §5.0.6 / §6.3.4):
//   · postMessage 만으로 관측 불가능한 native 영역(Dio 인터셉터, 에러 핸들러, 앱 수명주기) 이벤트를
//     tbot 러너가 수신할 수 있도록 별도 "native 채널" 제공
//   · Web 에서 window.flutter_inappwebview.callHandler('tbot', action, data) 로 호출
//
// 파일 격리 원칙 (TEST_DRIVEN.md §6.3.1):
//   · 본 파일은 브릿지 전략 2 선택 시만 활성 → 예외 목록에 포함됨
//   · TBOT_ENABLED=false (기본) 이면 registerIfEnabled() 는 no-op · 프로덕션 영향 없음
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class TbotChannel {
  /// dart-define 로 주입된 TBOT_ENABLED 플래그. const 이므로 컴파일 타임 결정.
  static const bool _enabled =
      bool.fromEnvironment('TBOT_ENABLED', defaultValue: false);

  /// 활성 상태일 때만 핸들러 등록. 프로덕션 빌드 (TBOT_ENABLED=false) 에서는 no-op.
  ///
  /// 반환: 등록 여부 (true=등록됨 / false=dart-define 비활성 or kReleaseMode 가드)
  static bool registerIfEnabled(InAppWebViewController controller) {
    if (!_enabled) return false;

    // release 모드에서도 TBOT_ENABLED=true 로 명시 주입했다면 허용.
    // (TEAMPLUS 하네스는 staging backend + 테스트 전용 빌드 플레이버에서만 사용)
    // 추가 가드가 필요하면 여기서 `if (kReleaseMode && !staging) return false;` 등으로 제한 가능.

    controller.addJavaScriptHandler(
      handlerName: 'tbot',
      callback: (args) async {
        // args 스키마:
        //   ["ping"]                                          → health check
        //   ["log", { "level": "info", "msg": "..." }]        → tbot 러너가 수집
        //   ["bridge-status"]                                 → 현재 JS bridge 등록 목록 요약
        //   ["query", { "key": "appVersion" }]                → 네이티브 쪽 값 조회
        final action = args.isNotEmpty ? args[0].toString() : '';
        final payload = args.length > 1 && args[1] is Map
            ? Map<String, dynamic>.from(args[1] as Map)
            : <String, dynamic>{};

        switch (action) {
          case 'ping':
            return <String, dynamic>{
              'ok': true,
              'channel': 'tbot',
              'ts': DateTime.now().millisecondsSinceEpoch,
              'enabled': _enabled,
            };

          case 'log':
            // tbot 러너가 adb logcat / xcrun simctl log stream 으로 이 로그를 수집
            if (kDebugMode || _enabled) {
              final level = (payload['level'] ?? 'info').toString();
              final msg = (payload['msg'] ?? '').toString();
              print('[TBOT:$level] $msg');
            }
            return <String, dynamic>{'ok': true};

          case 'bridge-status':
            return <String, dynamic>{
              'ok': true,
              'handlers': [
                'auth',
                'qrScan',
                'payment',
                'biometric',
                'notification',
                'navigation',
                'identityVerification',
                'api',
                'cancelRequest',
                'ui',
                'theme',
                'upload',
                'tbot',
              ],
              'channelEnabled': _enabled,
            };

          case 'query':
            final key = (payload['key'] ?? '').toString();
            // 네이티브에서 제공 가능한 값만 허용 목록으로 제한 — 사생활 보호
            const allowed = {'appVersion', 'platform', 'isDebug'};
            if (!allowed.contains(key)) {
              return <String, dynamic>{
                'ok': false,
                'error': 'key not allowed: $key'
              };
            }
            return <String, dynamic>{
              'ok': true,
              'key': key,
              'value': _resolveQueryValue(key),
            };

          default:
            return <String, dynamic>{
              'ok': false,
              'error': 'unknown action: $action',
            };
        }
      },
    );
    return true;
  }

  static Object? _resolveQueryValue(String key) {
    switch (key) {
      case 'platform':
        return defaultTargetPlatform.name;
      case 'isDebug':
        return kDebugMode;
      case 'appVersion':
        // 실제 버전은 PackageInfo.fromPlatform() 비동기 필요 — 여기선 컴파일 타임 상수만
        return const String.fromEnvironment('APP_VERSION',
            defaultValue: 'unknown');
      default:
        return null;
    }
  }
}
