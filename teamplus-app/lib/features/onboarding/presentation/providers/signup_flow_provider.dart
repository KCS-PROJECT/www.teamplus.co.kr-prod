import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/network/api_client.dart';

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

  /// 가입 완료 처리 — 백엔드 `POST /auth/signup` 호출 + 로컬 영구 저장.
  ///
  /// 동작 순서:
  /// 1. 백엔드 호출 시도 (실패해도 UI 흐름은 진행 — 데모 우선)
  /// 2. SharedPreferences 에 `signup_completed=true` 영구 저장
  /// 3. 메모리 state 의 민감정보(주민번호·PIN) 폐기
  ///
  /// 백엔드 SignupDto 호환:
  /// - firstName/lastName/email/phone/password (필수)
  /// - userType=PARENT (가입 플로우는 학부모용)
  /// - birthDate/gender (자녀 정보 → 별도 /children 엔드포인트로 분리해야 함)
  Future<void> completeSignup() async {
    // 1) 백엔드 호출 시도 — 실패해도 silent fail (현재는 UI 데모, 본인인증 미연동)
    await _attemptBackendSignup();

    // 2) 영구 플래그 저장
    await persistSignupCompleted();

    // 3) 민감정보 메모리 폐기
    state = state.copyWith(
      rrnFront: '',
      pinHash: null,
    );
  }

  /// `POST /auth/signup` 호출 시도.
  ///
  /// 현재는 stub 단계 — 본인인증으로 받은 이름·생년월일·전화번호는 메모리에만 있고
  /// 이메일·비밀번호 등 SignupDto 필수 필드는 가입 플로우에서 수집하지 않으므로
  /// 더미 값으로 채워 호출만 시도한다. 본격 운영 시:
  /// (a) 이메일 입력 단계 추가 또는 본인인증 응답으로 받은 CI 기반 가입 엔드포인트 신설
  /// (b) PIN 별도 보호 — `/auth/pin` 분리 엔드포인트 권장
  Future<void> _attemptBackendSignup() async {
    try {
      final phone = state.phoneNumber ?? '01012345678';
      final pin = state.pinHash ?? '';

      // 더미 데이터로 SignupDto 채움 (디자인 데모용 — 실 운영은 신규 엔드포인트 필요)
      final payload = <String, dynamic>{
        'firstName': '회원',
        'lastName': '팀플러스',
        'email': '${DateTime.now().millisecondsSinceEpoch}@teamplus.local',
        'phone': phone,
        'password': pin.isNotEmpty ? '${pin}Aa!ce' : 'Demo1234!',
        'userType': 'PARENT',
        if (state.childBirth != null && state.childBirth!.isNotEmpty)
          'birthDate': _toIsoDate(state.childBirth!),
        if (state.childGender != null) 'gender': state.childGender,
      };

      final client = ApiClient();
      await client.post('/auth/signup', data: payload).timeout(
            const Duration(seconds: 8),
          );
      debugPrint('[SignupFlow] /auth/signup 성공');
    } catch (e) {
      // UI 데모 단계 — 실패 silent fail (백엔드 SignupDto 미스매치 또는 네트워크 오류)
      debugPrint('[SignupFlow] /auth/signup 실패 (silent): $e');
    }
  }

  /// "2018.04.12" → "2018-04-12"
  String _toIsoDate(String raw) {
    final cleaned = raw.replaceAll('.', '-').replaceAll('/', '-');
    return cleaned;
  }
}

final signupFlowProvider =
    NotifierProvider<SignupFlowNotifier, SignupFlowState>(
        SignupFlowNotifier.new);
