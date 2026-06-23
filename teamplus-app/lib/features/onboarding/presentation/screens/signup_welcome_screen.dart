import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/providers/shared_providers.dart';
import '../providers/signup_flow_provider.dart';
import '../widgets/signup_button.dart';
import '../widgets/signup_design_tokens.dart';
import '../widgets/signup_highlight.dart';

/// A13 · 가입 완료 · 환영 — onboarding-3.jsx OnWelcomeScreen
/// Confetti + Hero skater illustration + 미니 성취 칩 + 2 CTA.
class SignupWelcomeScreen extends ConsumerWidget {
  const SignupWelcomeScreen({super.key});

  Future<void> _finishSignup(BuildContext context, WidgetRef ref) async {
    // 1) 가입 완료 처리 (stub — 추후 백엔드 POST /auth/signup 호출 자리)
    //    - signup_completed=true SharedPreferences 영구 저장
    //    - 메모리 state 의 민감정보(주민번호·PIN) 폐기
    await ref.read(signupFlowProvider.notifier).completeSignup();

    // 2) 온보딩 완료 표시 (재실행 시 온보딩 스킵)
    await ref.read(appPreferencesProvider).setOnboardingCompleted(true);

    if (!context.mounted) return;

    // 3) WebView 웹 회원가입(/signup/) 으로 이동
    // [변경 2026-05-28 사용자 요구] 기존 /login/ → /signup/ :
    //   가입 완료 환영(A13) '둘러보기' 클릭 시 웹 회원가입 페이지로 진입.
    // [2026-05-19] trailing slash — next.config trailingSlash:true 로 308 redirect 회피.
    final signupUrl = '${ApiConstants.webAppUrl}/signup/';
    context.goNamed(
      'webview',
      extra: {
        'title': 'TEAMPLUS',
        'url': signupUrl,
        'targetPath': '/signup/',
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          child: Stack(
            children: [
              // Confetti
              Positioned(
                top: 60,
                left: 0,
                right: 0,
                height: 200,
                child: IgnorePointer(
                  child: CustomPaint(
                    painter: _ConfettiPainter(),
                    size: const Size.fromHeight(200),
                  ),
                ),
              ),

              Column(
                children: [
                  const SizedBox(height: 24),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Hero skater illustration
                          SizedBox(
                            width: 220,
                            height: 200,
                            child: CustomPaint(painter: _SkaterPainter()),
                          ),
                          const SizedBox(height: 24),
                          const Text(
                            '🎉 설치 완료',
                            style: TextStyle(
                              fontFamily: ST.font,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: ST.flame500,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 8),
                          DefaultTextStyle(
                            style: const TextStyle(
                              fontFamily: ST.font,
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              color: ST.text1,
                              height: 1.35,
                              letterSpacing: -0.65,
                            ),
                            textAlign: TextAlign.center,
                            child: const Text('우리 자녀의 첫 빙판,'),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              HighlightedText(
                                '팀플러스',
                                style: const TextStyle(
                                  fontFamily: ST.font,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  color: ST.text1,
                                ),
                              ),
                              const Text(
                                '가 함께해요',
                                style: TextStyle(
                                  fontFamily: ST.font,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  color: ST.text1,
                                  height: 1.35,
                                  letterSpacing: -0.65,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          RichText(
                            textAlign: TextAlign.center,
                            text: TextSpan(
                              style: const TextStyle(
                                fontFamily: ST.font,
                                fontSize: 14,
                                color: ST.text3,
                                height: 1.6,
                              ),
                              children: [
                                const TextSpan(text: '회원가입만 하면 준비 끝!\n'),
                                TextSpan(
                                  text: '우리 동네 빙상장과 코치',
                                  style: const TextStyle(
                                    color: ST.ice500,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const TextSpan(text: '를 바로 추천해드려요.'),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          // 미니 성취 칩
                          Wrap(
                            spacing: 8,
                            children: const [
                              _AchievementChip(label: '프로필', color: ST.mint500),
                              _AchievementChip(
                                  label: '본인인증', color: ST.mint500),
                              _AchievementChip(
                                  label: '자녀 등록', color: ST.flame500),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    child: Column(
                      children: [
                        SignupButton(
                          label: '회원가입',
                          onPressed: () => _finishSignup(context, ref),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AchievementChip extends StatelessWidget {
  const _AchievementChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: ST.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontFamily: ST.font,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: ST.text2,
            ),
          ),
        ],
      ),
    );
  }
}

/// Confetti — onboarding-3.jsx 의 SVG confetti 8개 1:1 매핑
class _ConfettiPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final sx = w / 390;
    final sy = h / 200;

    void drawRect(double x, double y, Color color, double angleDeg) {
      final rad = angleDeg * 3.1415926 / 180;
      canvas.save();
      canvas.translate((x + 3) * sx, (y + 7) * sy);
      canvas.rotate(rad);
      final paint = Paint()..color = color;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: 6, height: 14),
          const Radius.circular(1),
        ),
        paint,
      );
      canvas.restore();
    }

    void drawCircle(double x, double y, double r, Color color) {
      canvas.drawCircle(
        Offset(x * sx, y * sy),
        r,
        Paint()..color = color,
      );
    }

    drawRect(40, 20, ST.flame500, 20);
    drawRect(86, 60, ST.mint500, -30);
    drawRect(320, 36, ST.sun500, 35);
    drawRect(280, 90, ST.ice500, -15);
    drawCircle(160, 40, 4, ST.flame500);
    drawCircle(220, 20, 3, ST.mint500);
    drawCircle(60, 120, 3, ST.sun500);
    drawCircle(340, 140, 4, ST.ice400);
  }

  @override
  bool shouldRepaint(_) => false;
}

/// 지호 스케이터 SVG illustration (240x220 viewbox 기준)
class _SkaterPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 240;
    final sy = size.height / 220;

    Paint fill(Color c) => Paint()..color = c;
    Paint stroke(Color c, double w, {bool roundCap = true}) => Paint()
      ..color = c
      ..strokeWidth = w
      ..style = PaintingStyle.stroke
      ..strokeCap = roundCap ? StrokeCap.round : StrokeCap.butt;

    Offset p(double x, double y) => Offset(x * sx, y * sy);

    // Ice ellipse
    canvas.drawOval(
      Rect.fromCenter(center: p(120, 180), width: 200 * sx, height: 44 * sy),
      fill(ST.ice100),
    );
    canvas.drawOval(
      Rect.fromCenter(center: p(120, 180), width: 200 * sx, height: 44 * sy),
      stroke(ST.ice300, 2),
    );
    // Ice line
    final iceLinePath = Path()
      ..moveTo(40 * sx, 178 * sy)
      ..quadraticBezierTo(120 * sx, 168 * sy, 200 * sx, 178 * sy);
    canvas.drawPath(
        iceLinePath, stroke(Colors.white, 1.5)..style = PaintingStyle.stroke);

    // Body shadow
    canvas.drawOval(
      Rect.fromCenter(center: p(120, 186), width: 80 * sx, height: 6 * sy),
      fill(ST.rink900.withValues(alpha: 0.16)),
    );

    // Legs
    canvas.drawLine(p(110, 130), p(96, 174), stroke(ST.rink900, 9));
    canvas.drawLine(p(126, 130), p(142, 172), stroke(ST.rink900, 9));

    // Skates
    canvas.drawOval(
      Rect.fromCenter(center: p(92, 178), width: 28 * sx, height: 8 * sy),
      fill(ST.flame500),
    );
    canvas.drawOval(
      Rect.fromCenter(center: p(146, 176), width: 28 * sx, height: 8 * sy),
      fill(ST.flame500),
    );

    // Body (sweater)
    final body = Path()
      ..moveTo(96 * sx, 80 * sy)
      ..quadraticBezierTo(90 * sx, 120 * sy, 110 * sx, 142 * sy)
      ..lineTo(132 * sx, 142 * sy)
      ..quadraticBezierTo(150 * sx, 120 * sy, 144 * sx, 80 * sy)
      ..close();
    canvas.drawPath(body, fill(ST.ice500));

    // Arms
    canvas.drawLine(p(100, 92), p(70, 110), stroke(ST.ice500, 14));
    canvas.drawLine(p(140, 92), p(172, 86), stroke(ST.ice500, 14));
    canvas.drawCircle(p(68, 112), 7 * sx, fill(const Color(0xFFFFCFA0)));
    canvas.drawCircle(p(174, 84), 7 * sx, fill(const Color(0xFFFFCFA0)));

    // Head
    canvas.drawCircle(p(120, 64), 20 * sx, fill(const Color(0xFFFFCFA0)));

    // Helmet
    final helmet = Path()
      ..moveTo(100 * sx, 56 * sy)
      ..quadraticBezierTo(120 * sx, 38 * sy, 140 * sx, 56 * sy)
      ..lineTo(142 * sx, 68 * sy)
      ..quadraticBezierTo(120 * sx, 64 * sy, 98 * sx, 68 * sy)
      ..close();
    canvas.drawPath(helmet, fill(ST.flame500));
    canvas.drawRect(
      Rect.fromLTWH(98 * sx, 64 * sy, 44 * sx, 6 * sy),
      fill(ST.flame500),
    );

    // Face
    canvas.drawCircle(p(113, 68), 1.5 * sx, fill(ST.text1));
    canvas.drawCircle(p(127, 68), 1.5 * sx, fill(ST.text1));
    final smilePath = Path()
      ..moveTo(115 * sx, 76 * sy)
      ..quadraticBezierTo(120 * sx, 80 * sy, 125 * sx, 76 * sy);
    canvas.drawPath(smilePath, stroke(ST.text1, 1.6));

    // Cheek blush
    canvas.drawCircle(
        p(108, 74), 2.5 * sx, fill(ST.flame500.withValues(alpha: 0.45)));
    canvas.drawCircle(
        p(132, 74), 2.5 * sx, fill(ST.flame500.withValues(alpha: 0.45)));

    // Hockey stick
    canvas.drawLine(p(174, 86), p(210, 60), stroke(ST.rink900, 5));
    canvas.drawLine(p(210, 60), p(218, 74), stroke(ST.rink900, 6));

    // Puck floating
    canvas.drawOval(
      Rect.fromCenter(center: p(50, 140), width: 20 * sx, height: 7 * sy),
      fill(ST.puck),
    );
    canvas.drawOval(
      Rect.fromCenter(center: p(50, 138), width: 20 * sx, height: 4 * sy),
      fill(const Color(0xFF3A3F4A)),
    );
  }

  @override
  bool shouldRepaint(_) => false;
}
