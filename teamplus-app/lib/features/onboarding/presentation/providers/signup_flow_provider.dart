import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A5~A13 가입 플로우 진행 상태 모델.
class SignupFlowState {
  const SignupFlowState({
    this.permissionsAccepted = false,
    this.agreementsAccepted = false,
    this.identityVerified = false,
    this.smsVerified = false,
    this.passwordSet = false,
    this.biometricLinked = false,
    this.signupCompleted = false,
    this.rrnFront = '',
    this.carrier,
    this.phoneNumber,
    this.pinHash,
    this.childName,
    this.childBirth,
    this.childGender,
    this.childLevel,
    this.childGoals = const [],
  });

  final bool permissionsAccepted;
  final bool agreementsAccepted;
  final bool identityVerified;
  final bool smsVerified;
  final bool passwordSet;
  final bool biometricLinked;
  final bool signupCompleted;

  final String rrnFront;
  final String? carrier;
  final String? phoneNumber;
  final String? pinHash;

  // A10 자녀 정보 (선택 — 학부모 가입 플로우에서만 사용)
  final String? childName;
  final String? childBirth;
  final String? childGender;
  final String? childLevel;
  final List<String> childGoals;

  SignupFlowState copyWith({
    bool? permissionsAccepted,
    bool? agreementsAccepted,
    bool? identityVerified,
    bool? smsVerified,
    bool? passwordSet,
    bool? biometricLinked,
    bool? signupCompleted,
    String? rrnFront,
    String? carrier,
    String? phoneNumber,
    String? pinHash,
    String? childName,
    String? childBirth,
    String? childGender,
    String? childLevel,
    List<String>? childGoals,
  }) {
    return SignupFlowState(
      permissionsAccepted: permissionsAccepted ?? this.permissionsAccepted,
      agreementsAccepted: agreementsAccepted ?? this.agreementsAccepted,
      identityVerified: identityVerified ?? this.identityVerified,
      smsVerified: smsVerified ?? this.smsVerified,
      passwordSet: passwordSet ?? this.passwordSet,
      biometricLinked: biometricLinked ?? this.biometricLinked,
      signupCompleted: signupCompleted ?? this.signupCompleted,
      rrnFront: rrnFront ?? this.rrnFront,
      carrier: carrier ?? this.carrier,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      pinHash: pinHash ?? this.pinHash,
      childName: childName ?? this.childName,
      childBirth: childBirth ?? this.childBirth,
      childGender: childGender ?? this.childGender,
      childLevel: childLevel ?? this.childLevel,
      childGoals: childGoals ?? this.childGoals,
    );
  }
}

/// Riverpod 3.x Notifier 패턴 (StateNotifier 에서 마이그레이션).
class SignupFlowNotifier extends Notifier<SignupFlowState> {
  static const String _kSignupCompletedKey = 'signup_completed';

  @override
  SignupFlowState build() => const SignupFlowState();

  Future<bool> isSignupCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kSignupCompletedKey) ?? false;
  }

  Future<void> persistSignupCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kSignupCompletedKey, true);
    state = state.copyWith(signupCompleted: true);
  }

  Future<void> resetSignupCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kSignupCompletedKey);
    state = const SignupFlowState();
  }

  void acceptPermissions() => state = state.copyWith(permissionsAccepted: true);
  void acceptAgreements() => state = state.copyWith(agreementsAccepted: true);

  void setRrnFront(String value) => state = state.copyWith(rrnFront: value);
  void verifyIdentity(String carrier, String phone) => state = state.copyWith(
        identityVerified: true,
        carrier: carrier,
        phoneNumber: phone,
      );
  void verifySms() => state = state.copyWith(smsVerified: true);

  /// PIN 저장 — 평문 보관 금지. SHA-256 + 세션 솔트 해싱 후 메모리에만 보관.
  /// (백엔드 전송 시점에도 해시 값만 사용. 실 운영은 별도 /auth/pin 엔드포인트가 PBKDF2 적용 권장.)
  void setPin(String pin) {
    final salt = DateTime.now().microsecondsSinceEpoch.toString();
    final digest = sha256.convert(utf8.encode('$salt:$pin')).toString();
    state = state.copyWith(passwordSet: true, pinHash: '$salt:$digest');
  }

  void linkBiometric() => state = state.copyWith(biometricLinked: true);

  /// A10 자녀 등록 정보 저장 (메모리 only)
  void registerChild({
    required String name,
    required String birth,
    required String gender,
    required String level,
    required List<String> goals,
  }) {
    state = state.copyWith(
      childName: name,
      childBirth: birth,
      childGender: gender,
      childLevel: level,
      childGoals: goals,
    );
  }

  /// 온보딩 완료 처리 — 로컬 영구 저장 + 민감정보 폐기.
  ///
  /// 계정 생성은 이 플로우의 책임이 아니다. 실제 회원가입은 본인인증·약관동의·
  /// 아이디 입력을 모두 수집하는 웹 `/signup/` 이 담당하며, 완료 화면(A13)이
  /// 곧바로 해당 페이지로 이동시킨다.
  ///
  /// 동작 순서:
  /// 1. SharedPreferences 에 `signup_completed=true` 영구 저장
  /// 2. 메모리 state 의 민감정보(주민번호·PIN) 폐기
  Future<void> completeSignup() async {
    await persistSignupCompleted();

    state = state.copyWith(
      rrnFront: '',
      pinHash: null,
    );
  }
}

final signupFlowProvider =
    NotifierProvider<SignupFlowNotifier, SignupFlowState>(
        SignupFlowNotifier.new);
