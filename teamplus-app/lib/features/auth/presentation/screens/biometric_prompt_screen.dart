import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/security/biometric_service.dart';
import '../providers/biometric_provider.dart';

/// 생체인증 프롬프트 화면
/// 앱 실행 시 또는 세션 타임아웃 후 표시
class BiometricPromptScreen extends ConsumerStatefulWidget {
  /// 프롬프트 제목
  final String title;

  /// 프롬프트 메시지
  final String? message;

  /// 비활성화 버튼 클릭 시 콜백
  final VoidCallback? onCancel;

  /// 인증 성공 시 콜백
  final VoidCallback? onSuccess;

  /// 취소 버튼 표시 여부
  final bool showCancel;

  const BiometricPromptScreen({
    super.key,
    this.title = '생체인증',
    this.message,
    this.onCancel,
    this.onSuccess,
    this.showCancel = true,
  });

  @override
  ConsumerState<BiometricPromptScreen> createState() =>
      _BiometricPromptScreenState();
}

class _BiometricPromptScreenState extends ConsumerState<BiometricPromptScreen>
    with SingleTickerProviderStateMixin {
  bool _isAuthenticating = false;
  String? _errorMessage;
  late AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );
    _animationController.forward();

    // 자동으로 생체인증 시작
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _performBiometricAuth();
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  /// 생체인증 실행
  Future<void> _performBiometricAuth() async {
    if (_isAuthenticating) return;

    setState(() {
      _isAuthenticating = true;
      _errorMessage = null;
    });

    try {
      final reason = widget.message ?? '앱을 사용하기 위해 생체인증이 필요합니다.';

      final result = await ref.read(
        biometricAuthenticateProvider(reason).future,
      );

      if (!mounted) return;

      switch (result) {
        case BiometricResult.success:
          // ✅ 인증 성공
          if (widget.onSuccess != null) {
            widget.onSuccess!();
          } else {
            // 기본 동작: 이전 화면으로 돌아가기
            context.pop();
          }
          break;

        case BiometricResult.userCancelled:
          // ⛔ 사용자가 취소함
          setState(() {
            _errorMessage = '생체인증이 취소되었습니다.';
            _isAuthenticating = false;
          });
          break;

        case BiometricResult.failed:
          // ❌ 인증 실패
          setState(() {
            _errorMessage = '생체인증 실패: 지문 또는 얼굴이 일치하지 않습니다.';
            _isAuthenticating = false;
          });
          break;

        case BiometricResult.locked:
          // 🔒 계정 잠금
          setState(() {
            _errorMessage = '생체인증이 너무 많이 실패했습니다.\n나중에 다시 시도해주세요.';
            _isAuthenticating = false;
          });
          break;

        case BiometricResult.deviceNotSupported:
          // 🚫 기기 미지원
          setState(() {
            _errorMessage = '이 기기는 생체인증을 지원하지 않습니다.';
            _isAuthenticating = false;
          });
          break;

        case BiometricResult.unknown:
          // 알 수 없는 오류
          setState(() {
            _errorMessage = '생체인증 중 오류가 발생했습니다.';
            _isAuthenticating = false;
          });
          break;
      }
    } catch (e) {
      debugPrint('[BiometricPrompt] Error: $e');
      setState(() {
        _errorMessage = '생체인증 처리 중 오류: $e';
        _isAuthenticating = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // appBar 없는 풀스크린 생체인증 — 글로벌 SystemChrome SoT(라이트 배경 + 다크
    // 아이콘)를 명시적으로 재선언해 status bar 가시성을 보장.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark, // Android: white bg
        statusBarBrightness: Brightness.light, // iOS: white bg
        systemNavigationBarColor: Colors.white,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.8, end: 1.0).animate(
              CurvedAnimation(
                  parent: _animationController, curve: Curves.easeOut),
            ),
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // 🔐 생체인증 아이콘 (장식용 — SR 제외)
                    ExcludeSemantics(
                      child: Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Colors.blue.shade400,
                              Colors.blue.shade600,
                            ],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.blue.withValues(alpha: 0.3),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.fingerprint,
                          size: 60,
                          color: Colors.white,
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // 📝 제목
                    Text(
                      widget.title,
                      style:
                          Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.grey.shade900,
                              ),
                      textAlign: TextAlign.center,
                    ),

                    const SizedBox(height: 12),

                    // 📋 메시지
                    if (widget.message != null)
                      Text(
                        widget.message!,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Colors.grey.shade600,
                            ),
                        textAlign: TextAlign.center,
                      ),

                    const SizedBox(height: 24),

                    // ⏳ 로딩 상태 (SR liveRegion — 인증 진행 상황 자동 안내)
                    if (_isAuthenticating)
                      Semantics(
                        label: '생체인증을 진행하고 있습니다. 잠시만 기다려주세요.',
                        liveRegion: true,
                        child: Column(
                          children: [
                            const SizedBox(
                              width: 40,
                              height: 40,
                              child: CircularProgressIndicator(
                                strokeWidth: 3,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.blue,
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              '생체인증 중...',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(
                                    color: Colors.grey.shade500,
                                  ),
                            ),
                          ],
                        ),
                      ),

                    // ❌ 에러 메시지 (SR liveRegion — 에러 발생 시 즉시 안내)
                    if (_errorMessage != null && !_isAuthenticating)
                      Semantics(
                        liveRegion: true,
                        label: '오류: ${_errorMessage!}',
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            border: Border.all(
                              color: Colors.red.shade200,
                              width: 1,
                            ),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.error_outline,
                                color: Colors.red.shade600,
                                size: 20,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: TextStyle(
                                    color: Colors.red.shade700,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                    const SizedBox(height: 32),

                    // 🔄 재시도 버튼
                    if (_errorMessage != null && !_isAuthenticating)
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _performBiometricAuth,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue.shade600,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            '다시 시도',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),

                    const SizedBox(height: 12),

                    // ❌ 취소 버튼
                    if (widget.showCancel)
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: _isAuthenticating
                              ? null
                              : () {
                                  if (widget.onCancel != null) {
                                    widget.onCancel!();
                                  } else {
                                    context.pop();
                                  }
                                },
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            side: BorderSide(
                              color: Colors.grey.shade300,
                            ),
                          ),
                          child: Text(
                            '취소',
                            style: TextStyle(
                              color: Colors.grey.shade700,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
