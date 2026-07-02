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
    signInTitle: '생체인증',
    signInHint: '등록된 생체정보로 인증해 주세요',
    cancelButton: '취소',
  ),
  IOSAuthMessages(
    cancelButton: '취소',
  ),
];

/// 생체인증 사용 목적 안내 문구(`localizedReason`).
///
/// 등록된 생체 수단(지문/얼굴)은 기기·플랫폼마다 다르고 Android 는 구체 타입을
/// 신뢰성 있게 구분하지 못하므로, 특정 수단을 나열하지 않고 "생체인증" 으로 통칭한다.
///
/// 예: `biometricReason('팀플러스 로그인·결제에 사용할')`
///   → "팀플러스 로그인·결제에 사용할 생체인증 사용을 허용해 주세요."
String biometricReason(String purpose) {
  return '$purpose 생체인증 사용을 허용해 주세요.';
}

/// 화면 안내용 생체인증 수단 라벨 — iOS "Face ID" / Android "생체인증".
String get biometricMethodLabel => Platform.isIOS ? 'Face ID' : '생체인증';
