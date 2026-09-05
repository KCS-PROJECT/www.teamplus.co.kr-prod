import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/services.dart';

import '../auth/session_cleaner.dart';

/// 앱 완전 종료 SoT (Android 전용).
///
/// **문제 (2026-07-15)**:
///   기존 종료 코드는 `SystemNavigator.pop()` 을 사용했다. 그러나 `MainActivity`
///   가 `FlutterFragmentActivity`(= `OnBackPressedDispatcherOwner`) 를 상속하므로
///   `SystemNavigator.pop()` 은 `activity.finish()` 가 아니라
///   `onBackPressedDispatcher.onBackPressed()` 로 위임된다. Android 12+ 에서
///   루트 태스크의 activity 는 등록된 `OnBackPressedCallback` 이 없으면 기본
///   동작이 `moveTaskToBack()`(=홈으로 내려 백그라운드 전환)이라, 사용자가
///   "앱 종료"를 눌러도 앱이 실제로 종료되지 않고 그냥 백그라운드로 내려간다.
///
/// **해결**:
///   네이티브 MethodChannel(`app_control.exitApp`) 로 `finishAndRemoveTask()` 를
///   직접 호출해 태스크의 모든 activity 를 finish 하고 recents 목록에서도 제거한다
///   → 사용자 관점에서 앱이 완전히 종료된다. `System.exit()` 은 Play 정책상
///   비정상 종료(크래시)로 오탐될 수 있어 사용하지 않는다.
///
/// **iOS**: Apple 심사 정책(HIG)상 프로그램적 앱 종료가 금지되므로 no-op.
class AppExit {
  const AppExit._();

  static const MethodChannel _channel =
      MethodChannel('com.kr.www.teamplus/app_control');

  /// 앱 종료를 시도했음을 나타내는 플래그 (2026-07-16 재실행 로그인 버그 fix).
  ///
  /// `finishAndRemoveTask()` 로 태스크를 종료해도 OS 가 프로세스/엔진을 살려두고
  /// 앱을 resume 으로 되살리는 경우가 있다(그러면 InitialDestinationGate 가 재실행되지
  /// 않아 WebView 가 직전 화면 그대로 남는다 = "종료 후 재실행 시 메인화면" 회귀).
  /// terminate() 가 이 플래그를 세우고, `TeamplusApp._onAppResumed` 가 resume 시
  /// 이 플래그가 있으면 로그인 게이트로 재진입시킨다.
  ///
  /// 프로세스가 실제로 죽으면 static 이 리셋되며 콜드스타트가 로그인을 처리하므로
  /// 어느 경로든 재실행 시 로그인 화면이 보장된다. 정상 미인증 상태(로그인/회원가입
  /// 진행 중)에서는 이 플래그가 서지 않으므로 그 화면들의 resume 은 영향받지 않는다.
  static bool exitAttempted = false;

  /// 앱을 실제로 종료한다.
  ///
  /// - Android: 네이티브 `finishAndRemoveTask()` → 완전 종료 + recents 제거.
  /// - iOS/기타: no-op (Apple 정책상 프로그램적 종료 금지).
  ///
  /// 네이티브 채널이 미준비된 예외 상황에서는 최소한 백그라운드 전환을 보장하도록
  /// `SystemNavigator.pop()` 으로 폴백한다.
  static Future<void> terminate() async {
    if (!Platform.isAndroid) return;
    // 프로세스가 살아남아 resume 될 경우 로그인 게이트 재진입을 트리거하기 위한 마킹.
    exitAttempted = true;
    try {
      await _channel.invokeMethod<void>('exitApp');
    } catch (e) {
      debugPrint('[AppExit] 네이티브 종료 실패 → SystemNavigator.pop 폴백: $e');
      await SystemNavigator.pop();
    }
  }

  /// 세션 클리어 후 앱 종료 — "종료 확인 팝업 → 확인" 경로 SoT (2026-07-16).
  ///
  /// 요구사항: 종료 확인 시 로컬·세션(토큰)을 클리어하여 다음 실행에서 반드시
  /// 로그인 화면을 거치게 한다. Web 주도 경로(useAppBack → logout → 브릿지
  /// clearToken → exitApp)가 이미 클리어를 마친 뒤 호출해도 이중 실행은 무해하다
  /// (clearAll 멱등 · FCM 해제는 토큰 없으면 조용히 실패).
  ///
  /// 세션 클리어는 [SessionCleaner] SoT 로 위임한다 (FCM 해제 → 토큰 삭제 →
  /// 쿠키 삭제, 각 단계 독립 try). 2초 단계별 타임아웃은 platform channel hang
  /// 시 terminate 에 영영 도달하지 못해 "종료를 눌렀는데 앱이 안 꺼지는" 상태를
  /// 막기 위함이다.
  static Future<void> terminateWithSessionClear() async {
    await SessionCleaner.clearSession(stepTimeout: const Duration(seconds: 2));
    await terminate();
  }
}
