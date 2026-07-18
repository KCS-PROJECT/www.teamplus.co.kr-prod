import 'dart:io' show Platform;

// local_auth 의 플랫폼 구현 패키지 — 다이얼로그 문구(AndroidAuthMessages /
// IOSAuthMessages) 커스터마이즈에 필요. local_auth 3.x 의 sibling 전이 의존성이라
// pubspec 직접 선언 대신 참조한다(버전은 local_auth 가 함께 고정).
// ignore_for_file: depend_on_referenced_packages
import 'package:local_auth_android/local_auth_android.dart';
import 'package:local_auth_darwin/local_auth_darwin.dart';

/// 생체인증 다이얼로그(local_auth) 한글 문구 SoT.
///
/// `authenticate()` 에 `authMessages` 를 전달하지 않으면 Android 는 다이얼로그
/// 제목 "Authentication required" · 부제 "Verify identity" · 버튼 "Cancel" 이,
/// iOS 는 취소 버튼 "OK" 가 영문 기본값으로 노출된다. 모든 호출에 이 상수를
/// 넘겨 다이얼로그 chrome 을 한글화한다.
const List<AuthMessages> kBiometricAuthMessages = <AuthMessages>[
  AndroidAuthMessages(
    // [2026-07-15 사용자 직접 지시] Android 표기는 "지문인식 인증" 으로 통일 —
    // 선택적 접근 권한(A5) 안내 항목과 OS 다이얼로그 제목이 1:1 로 일치해야
    // 사용자가 다른 인증을 요구받았다고 오인하지 않는다.
    signInTitle: '지문인식 인증',
    signInHint: '등록된 지문으로 인증해 주세요',
    cancelButton: '취소',
  ),
  IOSAuthMessages(
    cancelButton: '취소',
  ),
];

/// 생체인증 사용 목적 안내 문구(`localizedReason`).
///
/// 플랫폼별 수단 라벨([biometricMethodLabel])을 사용해 화면 안내 항목 ·
/// OS 다이얼로그 제목 · 목적 문구의 표기를 일치시킨다.
///
/// 예: `biometricReason('팀플러스 로그인·결제에 사용할')`
///   → iOS    : "팀플러스 로그인·결제에 사용할 Face ID 사용을 허용해 주세요."
///   → Android: "팀플러스 로그인·결제에 사용할 지문인식 인증 사용을 허용해 주세요."
String biometricReason(String purpose) {
  return '$purpose $biometricMethodLabel 사용을 허용해 주세요.';
}

/// 화면 안내용 생체인증 수단 라벨 — iOS "Face ID" / Android "지문인식 인증".
///
/// [2026-07-15 사용자 직접 지시] Android 는 "생체인증" 통칭 대신 "지문인식 인증"
/// 으로 표기한다. (일부 Android 기기는 얼굴 인식도 지원하지만, 제품 표기는
/// 대표 수단인 지문 기준 — 실제 인증은 OS BiometricPrompt 가 기기에 등록된
/// 수단(지문/얼굴)을 그대로 사용하므로 동작에는 영향 없음.)
String get biometricMethodLabel => Platform.isIOS ? 'Face ID' : '지문인식 인증';

/// 설명문 조합용 짧은 수단 라벨 — iOS "Face ID" / Android "지문인식".
///
/// "$라벨 로그인 · 결제 인증" 처럼 뒤에 명사가 이어지는 문장에서
/// "지문인식 인증 로그인" 같은 겹말을 피하기 위한 변형.
String get biometricMethodShortLabel => Platform.isIOS ? 'Face ID' : '지문인식';
