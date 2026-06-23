import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/signup_flow_provider.dart';
import '../widgets/signup_app_bar.dart';
import '../widgets/signup_button.dart';
import '../widgets/signup_design_tokens.dart';
import '../widgets/signup_highlight.dart';

/// A10 · 자녀 등록 — onboarding-3.jsx OnChildRegisterScreen
/// Avatar + 이름 + 생년월일/성별 + 스킬레벨 2x2 + 목표 태그.
class SignupChildRegisterScreen extends ConsumerStatefulWidget {
  const SignupChildRegisterScreen({super.key});

  @override
  ConsumerState<SignupChildRegisterScreen> createState() =>
      _SignupChildRegisterScreenState();
}

class _SignupChildRegisterScreenState
    extends ConsumerState<SignupChildRegisterScreen> {
  final String _name = '박지호';
  final String _birth = '2018.04.12';
  String _gender = 'M';
  String _level = 'inter';
  final Set<String> _goals = {'취미·체력', '선수반 진입'};

  static const _levels = [
    _LevelItem('first', '처음이에요', '스케이팅이 처음'),
    _LevelItem('basic', '기초', '혼자 일어서고 미는 단계'),
    _LevelItem('inter', '중급', '전진·후진·턴 가능'),
    _LevelItem('adv', '고급·선수반', '스피드·점프·시합'),
  ];

  static const _allGoals = [
    '취미·체력',
    '선수반 진입',
    '시합 출전',
    '친구 사귀기',
    '체형 교정',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ST.surface,
      appBar: SignupAppBar(
        title: '자녀 등록',
        leading: SignupAppBarLeading.back,
        onBack: () => context.pop(),
        onClose: () => context.go('/onboarding'),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 헤드라인 (형광펜 강조)
                    DefaultTextStyle(
                      style: const TextStyle(
                        fontFamily: ST.font,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: ST.text1,
                        height: 1.45,
                        letterSpacing: -0.18,
                      ),
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          const Text('빙판에서 만날 '),
                          HighlightedText(
                            '아이의 정보',
                            style: const TextStyle(
                              fontFamily: ST.font,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: ST.text1,
                            ),
                          ),
                          const Text('를'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      '알려주세요.',
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: ST.text1,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '코치 매칭과 수업 추천에 활용돼요. 나중에 마이페이지에서 수정할 수 있어요.',
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 13,
                        color: ST.text3,
                        height: 1.5,
                      ),
                    ),

                    // Avatar picker
                    const SizedBox(height: 28),
                    Center(
                      child: SizedBox(
                        width: 88,
                        height: 88,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 88,
                              height: 88,
                              decoration: BoxDecoration(
                                color: ST.ice50,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: ST.ice200,
                                  width: 2,
                                ),
                              ),
                              child: CustomPaint(
                                painter: _AvatarSilhouettePainter(),
                              ),
                            ),
                            Positioned(
                              right: -2,
                              bottom: -2,
                              child: Container(
                                width: 26,
                                height: 26,
                                decoration: BoxDecoration(
                                  color: ST.ice500,
                                  shape: BoxShape.circle,
                                  border:
                                      Border.all(color: Colors.white, width: 3),
                                ),
                                child: const Icon(Icons.add_rounded,
                                    size: 16, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Center(
                      child: Text(
                        '프로필 사진 추가',
                        style: TextStyle(
                          fontFamily: ST.font,
                          fontSize: 12,
                          color: ST.text3,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // 이름 (with trailing badge)
                    _FieldWithTrail(
                      label: '아이 이름',
                      value: _name,
                      trail: const Text(
                        '✓ 사용 가능',
                        style: TextStyle(
                          fontFamily: ST.font,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: ST.mint500,
                        ),
                      ),
                    ),

                    // 생년월일 + 성별
                    const SizedBox(height: 22),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: _FieldWithTrail(label: '생년월일', value: _birth),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '성별',
                                style: TextStyle(
                                  fontFamily: ST.font,
                                  fontSize: 12,
                                  color: ST.text3,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  _Pill(
                                    label: '남',
                                    active: _gender == 'M',
                                    onTap: () => setState(() => _gender = 'M'),
                                  ),
                                  const SizedBox(width: 6),
                                  _Pill(
                                    label: '여',
                                    active: _gender == 'F',
                                    onTap: () => setState(() => _gender = 'F'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    // 스킬레벨
                    const SizedBox(height: 24),
                    const Text(
                      '현재 스케이팅 레벨',
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 12,
                        color: ST.text3,
                      ),
                    ),
                    const SizedBox(height: 10),
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      padding: EdgeInsets.zero,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 152 / 56,
                      children: [
                        for (final l in _levels)
                          _LevelCard(
                            item: l,
                            active: _level == l.id,
                            onTap: () => setState(() => _level = l.id),
                          ),
                      ],
                    ),

                    // 주된 목표
                    const SizedBox(height: 24),
                    Row(
                      children: const [
                        Text(
                          '주된 목표',
                          style: TextStyle(
                            fontFamily: ST.font,
                            fontSize: 12,
                            color: ST.text3,
                          ),
                        ),
                        SizedBox(width: 4),
                        Text(
                          '(복수 선택)',
                          style: TextStyle(
                            fontFamily: ST.font,
                            fontSize: 12,
                            color: ST.text4,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final g in _allGoals)
                          _Pill(
                            label: g,
                            active: _goals.contains(g),
                            onTap: () => setState(() {
                              if (_goals.contains(g)) {
                                _goals.remove(g);
                              } else {
                                _goals.add(g);
                              }
                            }),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: SignupButton(
                label: '다음',
                onPressed: () {
                  ref.read(signupFlowProvider.notifier).registerChild(
                        name: _name,
                        birth: _birth,
                        gender: _gender,
                        level: _level,
                        goals: _goals.toList(),
                      );
                  context.push('/signup/welcome');
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LevelItem {
  const _LevelItem(this.id, this.label, this.sub);
  final String id;
  final String label;
  final String sub;
}

class _LevelCard extends StatelessWidget {
  const _LevelCard(
      {required this.item, required this.active, required this.onTap});
  final _LevelItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: active ? ST.ice50 : ST.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active ? ST.ice500 : ST.line,
            width: 1.5,
          ),
        ),
        child: Stack(
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.label,
                  style: TextStyle(
                    fontFamily: ST.font,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: active ? ST.ice600 : ST.text1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  item.sub,
                  style: const TextStyle(
                    fontFamily: ST.font,
                    fontSize: 11,
                    color: ST.text3,
                    height: 1.3,
                  ),
                ),
              ],
            ),
            if (active)
              Positioned(
                top: 0,
                right: 0,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: const BoxDecoration(
                    color: ST.ice500,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_rounded,
                      size: 11, color: Colors.white),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? ST.ice50 : ST.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? ST.ice500 : ST.line,
            width: 1.5,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: ST.font,
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: active ? ST.ice600 : ST.text2,
          ),
        ),
      ),
    );
  }
}

class _FieldWithTrail extends StatelessWidget {
  const _FieldWithTrail({
    required this.label,
    required this.value,
    this.trail,
  });

  final String label;
  final String value;
  final Widget? trail;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontFamily: ST.font,
                fontSize: 12,
                color: ST.text3,
              ),
            ),
            if (trail != null) trail!,
          ],
        ),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: ST.line, width: 1.5)),
          ),
          child: Text(
            value,
            style: const TextStyle(
              fontFamily: ST.font,
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: ST.text1,
            ),
          ),
        ),
      ],
    );
  }
}

/// Avatar 실루엣 — onboarding-3.jsx SVG 1:1 매핑 (circle 머리 + 어깨 곡선)
class _AvatarSilhouettePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 40;
    final sy = size.height / 40;
    final paint = Paint()..color = ST.ice300;

    // Head
    canvas.drawCircle(Offset(20 * sx, 14 * sy), 6 * sx, paint);

    // Shoulders (path: 8,34 quadratic to 32,34)
    final shoulders = Path()
      ..moveTo(8 * sx, 34 * sy)
      ..relativeMoveTo(0, 0)
      ..moveTo(8 * sx, 34 * sy)
      ..cubicTo(
        10 * sx,
        28 * sy,
        14 * sx,
        25 * sy,
        20 * sx,
        25 * sy,
      )
      ..cubicTo(
        26 * sx,
        25 * sy,
        30 * sx,
        28 * sy,
        32 * sx,
        34 * sy,
      )
      ..lineTo(8 * sx, 34 * sy)
      ..close();
    canvas.drawPath(shoulders, paint);
  }

  @override
  bool shouldRepaint(_) => false;
}
