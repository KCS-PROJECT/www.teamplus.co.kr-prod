import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// NativeBackGuard — 페이지 단위 안드로이드 하드웨어 백키 가드.
///
/// 2026-05-17 v6 — 디자인 리뉴얼 (홈 · 종료 컴펌 ExitConfirmScreen 1:1 매칭):
///   * AlertDialog → 커스텀 Dialog 위젯으로 교체 (참고: screen-exit-confirm.jsx)
///   * Pretendard 토큰 적용 (ice50/ice600/text1/text2/text3/line2)
///   * 56×56 원형 아이콘 영역 + 가로 분할 액션 버튼 (52px 높이)
///   * 진입 애니메이션: fade + scale (0.9 → 1.0, 280ms, easeOutBack 유사)
///
/// 동작 (v5 그대로):
///   - Android 만 활성. iOS / 기타 → child 그대로 반환.
///   - Navigator stack pop 가능 → Navigator.pop() (이전 화면 복귀) 후 종결.
///   - stack 루트 → 종료 confirm 다이얼로그.
///     "예" → `SystemNavigator.pop()` (Activity finish).
///     "아니요" → 다이얼로그만 닫힘.
///   - 다이얼로그 중복 표시 방지 (백키 연타 가드).
///
/// 사용:
/// ```dart
/// @override
/// Widget build(BuildContext context) {
///   return NativeBackGuard(
///     child: Scaffold(...),
///   );
/// }
/// ```
class NativeBackGuard extends StatefulWidget {
  const NativeBackGuard({
    super.key,
    required this.child,
    this.title = '팀플러스를\n완전히 종료하시겠습니까?',
    this.message = '종료하면 알림을 받을 수 없으며,\n다음 수업 일정도 확인할 수 없어요.',
    this.confirmText = '예',
    this.cancelText = '아니요',
  });

  final Widget child;
  final String title;
  final String message;
  final String confirmText;
  final String cancelText;

  @override
  State<NativeBackGuard> createState() => _NativeBackGuardState();
}

class _NativeBackGuardState extends State<NativeBackGuard> {
  bool _isDialogOpen = false;

  Future<void> _onBackPressed() async {
    if (!mounted) return;

    // 1) Navigator stack pop 가능 → 일반 뒤로가기
    final navigator = Navigator.maybeOf(context);
    if (navigator != null && navigator.canPop()) {
      navigator.pop();
      return;
    }

    // 2) stack 루트 → 종료 confirm 다이얼로그
    if (_isDialogOpen) return;
    _isDialogOpen = true;

    try {
      final confirmed = await _showExitConfirmDialog(context);
      if (confirmed == true && Platform.isAndroid) {
        await SystemNavigator.pop();
      }
    } finally {
      _isDialogOpen = false;
    }
  }

  Future<bool?> _showExitConfirmDialog(BuildContext context) {
    return showGeneralDialog<bool>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: const Color(0x8C080C18), // rgba(8, 12, 24, 0.55)
      transitionDuration: const Duration(milliseconds: 280),
      pageBuilder: (dialogContext, _, __) {
        return _ExitConfirmDialog(
          title: widget.title,
          message: widget.message,
          confirmText: widget.confirmText,
          cancelText: widget.cancelText,
          onCancel: () => Navigator.of(dialogContext).pop(false),
          onConfirm: () => Navigator.of(dialogContext).pop(true),
        );
      },
      transitionBuilder: (_, animation, __, child) {
        // 참고 JSX와 정확히 일치: cubic-bezier(0.22, 1.2, 0.36, 1)
        const exitDialogIn = Cubic(0.22, 1.2, 0.36, 1.0);
        final scaleCurve = CurvedAnimation(
          parent: animation,
          curve: exitDialogIn,
        );
        final fadeCurve = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOut,
        );
        return FadeTransition(
          opacity: fadeCurve,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.9, end: 1.0).animate(scaleCurve),
            child: child,
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!Platform.isAndroid) return widget.child;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _onBackPressed();
      },
      child: widget.child,
    );
  }
}

/// ExitConfirmDialog — 홈 · 종료 컴펌 디자인 위젯
///
/// 참고: www.teampluss_claude_design/app/screen-exit-confirm.jsx
/// 토큰:
///   - ice50  #eef4ff (아이콘 배경)
///   - ice600 #1f47e6 (아이콘 / "예" 버튼 텍스트)
///   - text1  #0a0d14 (타이틀)
///   - text2  #2a3247 ("아니요" 버튼 텍스트)
///   - text3  #6b7588 (본문)
///   - line2  #eef1f7 (구분선)
///   - surface #ffffff (다이얼로그 배경)
class _ExitConfirmDialog extends StatelessWidget {
  const _ExitConfirmDialog({
    required this.title,
    required this.message,
    required this.confirmText,
    required this.cancelText,
    required this.onCancel,
    required this.onConfirm,
  });

  final String title;
  final String message;
  final String confirmText;
  final String cancelText;
  final VoidCallback onCancel;
  final VoidCallback onConfirm;

  // 디자인 토큰
  static const Color _ice50 = Color(0xFFEEF4FF);
  static const Color _ice600 = Color(0xFF1F47E6);
  static const Color _text1 = Color(0xFF0A0D14);
  static const Color _text2 = Color(0xFF2A3247);
  static const Color _text3 = Color(0xFF6B7588);
  static const Color _line2 = Color(0xFFEEF1F7);
  static const Color _surface = Color(0xFFFFFFFF);

  static const String _fontFamily = 'Pretendard';

  @override
  Widget build(BuildContext context) {
    // 참고 JSX: width: "82%", maxWidth: 320 ─ 화면 너비의 82% 적용
    final screenWidth = MediaQuery.of(context).size.width;
    final dialogWidth = (screenWidth * 0.82).clamp(0.0, 320.0);

    return Center(
      child: SizedBox(
        width: dialogWidth,
        child: Material(
          color: Colors.transparent,
          child: Container(
            decoration: const BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.all(Radius.circular(20)),
              boxShadow: [
                BoxShadow(
                  color: Color(0x59000000), // rgba(0,0,0,0.35)
                  offset: Offset(0, 30),
                  blurRadius: 80,
                ),
                BoxShadow(
                  color: Color(0x2E000000), // rgba(0,0,0,0.18)
                  offset: Offset(0, 12),
                  blurRadius: 24,
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ─────────── Header padding 28 24 0 ───────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // 56×56 원형 아이콘 (ice50 배경 + ice600 logout SVG)
                      Container(
                        width: 56,
                        height: 56,
                        decoration: const BoxDecoration(
                          color: _ice50,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: const SizedBox(
                          width: 28,
                          height: 28,
                          child: CustomPaint(
                            painter: _LogoutIconPainter(
                              color: _ice600,
                              strokeWidth: 1.8,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Title — 17px / weight 800 / line-height 1.4 / letter-spacing -0.025em
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: _fontFamily,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: _text1,
                          height: 1.4,
                          letterSpacing: -0.425, // -0.025em × 17px
                        ),
                      ),
                      const SizedBox(height: 10),

                      // Body — 12.5px / weight 500 / line-height 1.55 / text3
                      Text(
                        message,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: _fontFamily,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          color: _text3,
                          height: 1.55,
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),

                // ─────────── Actions: full-bleed 가로 분할 ───────────
                const _TopDivider(),
                SizedBox(
                  height: 52,
                  child: Row(
                    children: [
                      // 좌: "아니요" — text2 / weight 700
                      Expanded(
                        child: _ActionButton(
                          label: cancelText,
                          onTap: onCancel,
                          color: _text2,
                          fontWeight: FontWeight.w700,
                          borderRadius: const BorderRadius.only(
                            bottomLeft: Radius.circular(20),
                          ),
                        ),
                      ),
                      // 세로 구분선
                      Container(
                        width: 1,
                        height: 52,
                        color: _line2,
                      ),
                      // 우: "예" — ice600 / weight 800
                      Expanded(
                        child: _ActionButton(
                          label: confirmText,
                          onTap: onConfirm,
                          color: _ice600,
                          fontWeight: FontWeight.w800,
                          borderRadius: const BorderRadius.only(
                            bottomRight: Radius.circular(20),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TopDivider extends StatelessWidget {
  const _TopDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 1,
      color: _ExitConfirmDialog._line2,
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.onTap,
    required this.color,
    required this.fontWeight,
    required this.borderRadius,
  });

  final String label;
  final VoidCallback onTap;
  final Color color;
  final FontWeight fontWeight;
  final BorderRadius borderRadius;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: borderRadius,
      child: Container(
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontFamily: _ExitConfirmDialog._fontFamily,
            fontSize: 14.5,
            fontWeight: fontWeight,
            color: color,
            letterSpacing: -0.29, // -0.02em × 14.5px
          ),
        ),
      ),
    );
  }
}

/// Logout SVG 아이콘 — 참고 JSX의 path 정확히 재현.
///
/// 원본 (viewBox 0 0 28 28, strokeWidth 1.8):
///   path 1: `M11 4 H7 a2 2 0 00-2 2 v16 a2 2 0 002 2 h4` — 좌측 열린 박스
///   path 2: `M17 8 l6 6 -6 6 M23 14 H11` — 우측 화살표 + 가로 라인
class _LogoutIconPainter extends CustomPainter {
  const _LogoutIconPainter({
    required this.color,
    required this.strokeWidth,
  });

  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    // viewBox 0 0 28 28 — size에 비례 스케일
    final scaleX = size.width / 28.0;
    final scaleY = size.height / 28.0;
    canvas.save();
    canvas.scale(scaleX, scaleY);

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // Path 1: 좌측 열린 박스
    final path1 = Path()
      ..moveTo(11, 4)
      ..lineTo(7, 4)
      ..arcToPoint(
        const Offset(5, 6),
        radius: const Radius.circular(2),
        clockwise: false,
      )
      ..lineTo(5, 22)
      ..arcToPoint(
        const Offset(7, 24),
        radius: const Radius.circular(2),
        clockwise: false,
      )
      ..lineTo(11, 24);

    // Path 2: 우측 화살표 + 가로 라인
    final path2 = Path()
      ..moveTo(17, 8)
      ..lineTo(23, 14)
      ..lineTo(17, 20)
      ..moveTo(23, 14)
      ..lineTo(11, 14);

    canvas.drawPath(path1, paint);
    canvas.drawPath(path2, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LogoutIconPainter oldDelegate) {
    return oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
  }
}
