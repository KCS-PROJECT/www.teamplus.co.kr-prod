import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../../../core/security/biometric_auth_messages.dart';
import '../../../auth/presentation/providers/biometric_provider.dart';
import '../providers/signup_flow_provider.dart';
import '../widgets/signup_button.dart';
import '../widgets/signup_design_tokens.dart';

/// A5 · 권한 안내 (참고: onboarding-1.jsx OnPermissionsScreen)
/// [동의하고 시작하기] 탭 시 OS 권한을 순차 요청하고 A6 약관 동의로 진행.
class SignupPermissionsScreen extends ConsumerStatefulWidget {
  const SignupPermissionsScreen({super.key});

  @override
  ConsumerState<SignupPermissionsScreen> createState() =>
      _SignupPermissionsScreenState();
}

class _SignupPermissionsScreenState
    extends ConsumerState<SignupPermissionsScreen> {
  // 2026-05-26: 위치·캘린더·연락처·신체활동 항목 제거.
  // 실제 사용 기능·플러그인이 없어 미사용 민감 권한 요청은 스토어 리젝 사유(iOS 5.1.1·Google Play 민감권한).
  // 해당 기능 구현 시 항목 + 권한 요청 + 매니페스트/Info.plist 선언을 함께 재추가할 것.
  // 생체인증 항목은 플랫폼별 수단명(iOS "Face ID" / Android "지문인식 인증" —
  // 2026-07-15 사용자 직접 지시)을 반영하므로 런타임 getter.
  List<_PermItem> get _items => <_PermItem>[
        const _PermItem(
            icon: Icons.camera_alt_outlined,
            name: '카메라',
            desc: 'QR · 바코드 정보 인식'),
        const _PermItem(
            icon: Icons.notifications_none_rounded,
            name: '알림',
            desc: '수업 시작 · 코치 메모 알림'),
        _PermItem(
            icon: Platform.isIOS ? Icons.face_outlined : Icons.fingerprint,
            name: biometricMethodLabel,
            // 짧은 라벨 사용 — Android 에서 "지문인식 인증 로그인" 겹말 방지
            // (iOS "Face ID 로그인 · 결제 인증" / Android "지문인식 로그인 · 결제 인증")
            desc: '$biometricMethodShortLabel 로그인 · 결제 인증'),
        const _PermItem(
            icon: Icons.image_outlined,
            name: '이미지 저장',
            desc: '영수증 · 진도 리포트 저장'),
      ];

  bool _isRequesting = false;

  /// 선택적 권한을 OS에 순차 요청 (UI 안내 항목과 1:1 매칭).
  /// - 카메라 / 알림 / 이미지 저장 → `permission_handler`
  /// - 생체인증(iOS Face ID·Touch ID / Android 지문·얼굴) → `local_auth`
  ///   (OS 권한 모델이 없어 첫 authenticate 호출 시점에 다이얼로그 노출)
  /// - 거부/영구거부 도 silent — A6 약관 동의로 계속 진행 (선택적 권한이므로)
  /// - 2026-05-26: 위치·캘린더·연락처·신체활동 제거 (미구현 기능 → 미사용 민감 권한 리젝 방지).
  Future<void> _requestAllPermissions() async {
    if (_isRequesting) return;
    setState(() => _isRequesting = true);

    // [2026-07-18 권한 순서 수정] 요청 순서: 카메라 → 알림 → 생체인증 → 이미지 저장.
    //   기존엔 이미지 저장을 생체인증보다 먼저 요청해서, 사용자가 생체인증 다이얼로그를
    //   취소('미선택')하면 그 앞에서 이미 조용히 지나간 이미지 저장이 안 물어본 것처럼
    //   보였다(사용자 보고). 생체인증을 먼저 처리하고, 그 결과(허용/취소)와 무관하게
    //   마지막에 이미지 저장 권한까지 반드시 요청·설정한 뒤 다음 화면으로 이동한다.

    // 1) 카메라 · 알림 — permission_handler 순차 요청.
    await _requestPermission(Permission.camera);
    await _requestPermission(Permission.notification);

    // 2) 생체인증(iOS Face ID·Touch ID / Android 지문·얼굴) — local_auth.
    //    취소/미지원/미등록 모두 silent (선택적 권한). 결과와 무관하게 아래 3)로 진행.
    await _requestBiometricConsent();

    // 3) 이미지 저장 — 생체인증 이후에도 반드시 요청한다.
    //    iOS: photosAddOnly(저장 전용) 다이얼로그 노출.
    //    Android 13+: 갤러리 저장은 Scoped Storage(MediaStore)라 런타임 권한이
    //      필요 없어 OS 다이얼로그가 없다(READ_MEDIA_* 는 Play 정책상 매니페스트에서
    //      의도적으로 제거됨). 그래도 상태를 조회·기록해 흐름이 건너뛴 것처럼 보이지
    //      않게 하고, 구형(API 28 이하)에서는 storage 권한 다이얼로그가 노출된다.
    await _requestPermission(
      Platform.isIOS ? Permission.photosAddOnly : Permission.photos,
    );

    if (!mounted) return;

    ref.read(signupFlowProvider.notifier).acceptPermissions();
    setState(() => _isRequesting = false);
    context.push('/signup/agreements');
  }

  /// 단일 권한 요청 헬퍼. 미결정(denied) 상태면 OS 다이얼로그를 띄우고, 이미 확정된
  /// (granted/permanentlyDenied/restricted) 상태면 조용히 통과한다. 예외는 무시하고
  /// 흐름을 계속한다(선택적 권한).
  Future<void> _requestPermission(Permission permission) async {
    try {
      final before = await permission.status;
      if (before.isGranted ||
          before.isPermanentlyDenied ||
          before.isRestricted) {
        if (kDebugMode) {
          debugPrint('[A5 Permission] $permission 이미 결정됨: $before → 스킵');
        }
        return;
      }
      final after = await permission.request();
      if (kDebugMode) {
        debugPrint('[A5 Permission] $permission: $before → $after');
      }
    } catch (e) {
      debugPrint('[A5 Permission] $permission 요청 중 예외 (무시): $e');
    }
  }

  /// 생체인증(iOS Face ID·Touch ID / Android 지문·얼굴) 사전 동의.
  ///
  /// [2026-07-18 생체인증 수정] 기존엔 프롬프트만 띄우고 결과(성공/취소)를 버려서
  ///   생체인증 설정에 아무 영향이 없는 "빈 껍데기"였다(사용자 보고: 인증을 취소해도
  ///   그냥 넘어감). 이제 인증 결과를 생체인증 로그인 설정에 확정적으로 반영한다.
  ///   - 성공 → `enableBiometric()` (로그인 후 생체 로그인 활성) 저장.
  ///   - 취소/실패/미지원/미등록 → `disableBiometric()` 로 명시적 off (결정적 상태).
  ///   두 경우 모두 가입 흐름은 계속 진행한다(선택적 권한이므로 차단 X).
  ///
  /// 플랫폼 분기(직접 분석·검증):
  ///   - iOS: `canCheckBiometrics` + `getAvailableBiometrics()` 로 Face ID/Touch ID
  ///     등록 여부 확인. 미등록이면 프롬프트를 띄우지 않고 off (OS 설정 유도 다이얼로그
  ///     회피). 인증 취소는 `LocalAuthException(code: UserCancel/UserFallback)`.
  ///   - Android: `canCheckBiometrics` 는 하드웨어 존재만 보장하므로
  ///     `getAvailableBiometrics()` 로 지문·얼굴 실제 등록 여부를 반드시 재확인한다.
  ///     미등록 기기에서 `authenticate(biometricOnly: true)` 호출 시 뜨는
  ///     "등록된 지문 없음" OEM 다이얼로그를 이 게이트로 차단. 취소는 code: userCanceled.
  Future<void> _requestBiometricConsent() async {
    // 성공/취소 어느 쪽이든 생체 로그인 설정을 확정 저장하기 위한 notifier.
    final biometricNotifier = ref.read(biometricEnabledProvider.notifier);
    try {
      final localAuth = LocalAuthentication();
      final isSupported = await localAuth.isDeviceSupported();
      final canCheck = await localAuth.canCheckBiometrics;
      if (!isSupported || !canCheck) {
        if (kDebugMode) {
          debugPrint(
              '[A5 Permission] 생체인증 미지원 (supported=$isSupported, canCheck=$canCheck) → off');
        }
        await biometricNotifier.disableBiometric();
        return;
      }
      // 등록된 생체 수단 게이트 (iOS Face ID/Touch ID · Android 지문/얼굴 등록 확인).
      final enrolled = await localAuth.getAvailableBiometrics();
      if (enrolled.isEmpty) {
        if (kDebugMode) {
          debugPrint('[A5 Permission] 등록된 생체 수단 없음 → off');
        }
        await biometricNotifier.disableBiometric();
        return;
      }
      // 실제 OS 생체인증 프롬프트 (iOS Face ID/Touch ID · Android BiometricPrompt).
      final ok = await localAuth.authenticate(
        localizedReason: biometricReason('팀플러스 로그인·결제에 사용할'),
        authMessages: kBiometricAuthMessages,
        biometricOnly: true,
        persistAcrossBackgrounding: false,
      );
      if (ok) {
        if (kDebugMode) {
          debugPrint('[A5 Permission] 생체인증 성공 → 생체 로그인 on');
        }
        await biometricNotifier.enableBiometric();
      } else {
        if (kDebugMode) {
          debugPrint('[A5 Permission] 생체인증 미완료(취소/실패) → off');
        }
        await biometricNotifier.disableBiometric();
      }
    } catch (e) {
      // 취소(userCanceled/UserCancel) 및 기타 예외 → off 로 확정, 흐름 계속.
      debugPrint('[A5 Permission] 생체인증 예외 → off: $e');
      try {
        await biometricNotifier.disableBiometric();
      } catch (_) {
        /* 설정 저장 실패도 무시 — 선택적 권한 */
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // appBar 없는 풀스크린 — 글로벌 SystemChrome SoT(라이트 배경 + 다크 아이콘)를
    // 명시적으로 재선언해 이전 화면 AppBarTheme의 systemOverlayStyle 잔존을 방지.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark, // Android: light bg
        statusBarBrightness: Brightness.light, // iOS: light bg
        systemNavigationBarColor: Colors.white,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: ST.surface,
        body: SafeArea(
          child: Column(
            children: [
              // [2026-06-15] 팝업이 아닌 풀스크린 가입 단계라 우상단 X(닫기) 제거.
              //   진행은 하단 '동의하고 시작하기' CTA 로만(시스템 뒤로가기로 복귀).
              const SizedBox(height: 24),

              // 로고 + 헤드라인
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // 공식 팀플러스 로고(앱 아이콘) — 원형 클립.
                        // 기존 Material Icons.sports_hockey(범용 아이콘) 대체.
                        ClipOval(
                          child: Image.asset(
                            'assets/images/teamplus_app_icon.png',
                            width: 28,
                            height: 28,
                            fit: BoxFit.cover,
                            filterQuality: FilterQuality.medium,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          '팀플러스',
                          style: TextStyle(
                            fontFamily: ST.font,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: ST.rink900,
                            letterSpacing: -0.66,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      '학부모님의 안전하고 편리한 서비스 이용을 위해\n아래의 권한 허용이 필요해요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 14,
                        color: ST.text2,
                        height: 1.55,
                      ),
                    ),
                  ],
                ),
              ),

              // 권한 카드 (선택적 접근 권한)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                  child: SingleChildScrollView(
                    child: Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: ST.ice50,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '선택적 접근 권한',
                            style: TextStyle(
                              fontFamily: ST.font,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: ST.ice600,
                              letterSpacing: -0.15,
                            ),
                          ),
                          const SizedBox(height: 14),
                          for (int i = 0; i < _items.length; i++) ...[
                            if (i != 0) const SizedBox(height: 12),
                            _buildItem(_items[i]),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              // 풋노트 + CTA
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  children: [
                    const Text(
                      '선택 항목을 허용하지 않으실 경우,\n일부 서비스의 이용이 제한될 수 있어요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 12,
                        color: ST.text3,
                        height: 1.55,
                      ),
                    ),
                    const SizedBox(height: 14),
                    SignupButton(
                      label: _isRequesting ? '권한 요청 중…' : '동의하고 시작하기',
                      onPressed: _isRequesting ? null : _requestAllPermissions,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildItem(_PermItem it) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.only(top: 7),
          width: 6,
          height: 6,
          decoration:
              const BoxDecoration(color: ST.ice500, shape: BoxShape.circle),
        ),
        const SizedBox(width: 10),
        Icon(it.icon, size: 14, color: ST.ice600),
        const SizedBox(width: 6),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: const TextStyle(
                fontFamily: ST.font,
                fontSize: 13,
                height: 1.5,
              ),
              children: [
                TextSpan(
                  text: it.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: ST.text1,
                  ),
                ),
                const TextSpan(text: '  '),
                TextSpan(
                  text: it.desc,
                  style: const TextStyle(
                      color: ST.text3, fontWeight: FontWeight.w400),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PermItem {
  const _PermItem({required this.icon, required this.name, required this.desc});
  final IconData icon;
  final String name;
  final String desc;
}
