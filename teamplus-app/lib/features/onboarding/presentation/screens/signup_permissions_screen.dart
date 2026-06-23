import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import 'package:permission_handler/permission_handler.dart';
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
  static const _items = <_PermItem>[
    _PermItem(
        icon: Icons.camera_alt_outlined, name: '카메라', desc: 'QR · 바코드 정보 인식'),
    _PermItem(
        icon: Icons.notifications_none_rounded,
        name: '알림',
        desc: '수업 시작 · 코치 메모 알림'),
    _PermItem(
        icon: Icons.face_outlined,
        name: 'Face ID',
        desc: 'Face ID 로그인 · 결제 인증'),
    _PermItem(
        icon: Icons.image_outlined, name: '이미지 저장', desc: '영수증 · 진도 리포트 저장'),
  ];

  bool _isRequesting = false;

  /// 선택적 권한을 OS에 순차 요청 (UI 안내 항목과 1:1 매칭).
  /// - 카메라 / 알림 / 이미지 저장 → `permission_handler`
  /// - Face ID → `local_auth` (OS 권한 모델이 없어 첫 authenticate 호출 시점에 다이얼로그 노출)
  /// - 거부/영구거부 도 silent — A6 약관 동의로 계속 진행 (선택적 권한이므로)
  /// - 2026-05-26: 위치·캘린더·연락처·신체활동 제거 (미구현 기능 → 미사용 민감 권한 리젝 방지).
  Future<void> _requestAllPermissions() async {
    if (_isRequesting) return;
    setState(() => _isRequesting = true);

    final permissions = <Permission>[
      Permission.camera,
      Permission.notification,
      // 이미지 저장 — iOS 는 photosAddOnly, Android 는 photos (또는 storage)
      Platform.isIOS ? Permission.photosAddOnly : Permission.photos,
    ];

    // 1) 순차 요청 — 이미 결정된 권한은 스킵해 OS 다이얼로그 누락 진단 가능
    for (final permission in permissions) {
      try {
        final before = await permission.status;
        if (before.isGranted ||
            before.isPermanentlyDenied ||
            before.isRestricted) {
          if (kDebugMode) {
            debugPrint('[A5 Permission] $permission 이미 결정됨: $before → 스킵');
          }
          continue;
        }
        final after = await permission.request();
        if (kDebugMode) {
          debugPrint('[A5 Permission] $permission: $before → $after');
        }
      } catch (e) {
        debugPrint('[A5 Permission] $permission 요청 중 예외 (무시): $e');
      }
    }

    // 2) Face ID — local_auth 로 사전 인증 호출 → 권한 다이얼로그 + 생체 등록 확인
    await _requestFaceIdConsent();

    if (!mounted) return;

    ref.read(signupFlowProvider.notifier).acceptPermissions();
    setState(() => _isRequesting = false);
    context.push('/signup/agreements');
  }

  /// Face ID / Touch ID 사전 동의.
  /// - `local_auth` 는 `authenticate()` 호출 시점에 iOS Face ID 권한 다이얼로그를
  ///   띄우므로 가입 단계에서 한 번 실행해 UI 안내(8개)와 실제 동작을 일치시킨다.
  /// - 실패/취소 모두 silent — 선택적 권한이므로 가입 흐름 차단 X
  Future<void> _requestFaceIdConsent() async {
    try {
      final localAuth = LocalAuthentication();
      final isSupported = await localAuth.isDeviceSupported();
      final canCheck = await localAuth.canCheckBiometrics;
      if (!isSupported || !canCheck) {
        if (kDebugMode) {
          debugPrint(
              '[A5 Permission] Face ID 미지원 (supported=$isSupported, canCheck=$canCheck) → 스킵');
        }
        return;
      }
      final ok = await localAuth.authenticate(
        localizedReason: '팀플러스 로그인·결제에 사용할 Face ID 사용을 허용해 주세요.',
        biometricOnly: true,
        persistAcrossBackgrounding: false,
      );
      if (kDebugMode) {
        debugPrint('[A5 Permission] Face ID 사전 동의 결과: $ok');
      }
    } catch (e) {
      debugPrint('[A5 Permission] Face ID 사전 동의 예외 (무시): $e');
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
