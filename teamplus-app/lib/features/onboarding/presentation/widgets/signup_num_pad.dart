import 'dart:math';
import 'package:flutter/material.dart';
import 'signup_design_tokens.dart';

/// 참고자료 onboarding-2.jsx NumPad 컴포넌트 1:1 매핑.
/// iOS 풍 3x4 키패드. dark=true 시 rink800 배경, randomize=true 시 숫자 셔플 + "재배열" 버튼.
class SignupNumPad extends StatefulWidget {
  const SignupNumPad({
    super.key,
    this.dark = false,
    this.randomize = false,
    required this.onTap,
    required this.onBackspace,
    this.onShuffle,
  });

  final bool dark;
  final bool randomize;
  final ValueChanged<String> onTap;
  final VoidCallback onBackspace;
  final VoidCallback? onShuffle;

  @override
  State<SignupNumPad> createState() => _SignupNumPadState();
}

class _SignupNumPadState extends State<SignupNumPad> {
  late List<String> _digits;

  @override
  void initState() {
    super.initState();
    _resetDigits();
  }

  void _resetDigits() {
    if (widget.randomize) {
      _digits = List.generate(10, (i) => '$i')..shuffle(Random());
    } else {
      _digits = List.generate(10, (i) => '$i');
    }
  }

  List<String> get _keys {
    if (widget.randomize) {
      // 0~9 셔플 후 [..8, '재배열', 9, '⌫'] 패턴 (참고: ["8","9","5","4","2","6","0","3","7","재배열","1","⌫"])
      return [
        ..._digits.take(9),
        '재배열',
        _digits.last,
        '⌫',
      ];
    }
    return [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '',
      '0',
      '⌫',
    ];
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.dark ? ST.rink800 : ST.surface;
    final fg = widget.dark ? Colors.white : ST.text1;
    final sub = widget.dark ? const Color(0xFF9AA4BA) : ST.text3;
    final keys = _keys;

    return Container(
      color: bg,
      padding: const EdgeInsets.only(top: 8, bottom: 28),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          childAspectRatio: 130 / 56,
        ),
        itemCount: keys.length,
        itemBuilder: (context, i) {
          final k = keys[i];
          return _NumPadKey(
            label: k,
            fg: fg,
            sub: sub,
            onTap: () {
              if (k == '재배열') {
                setState(_resetDigits);
                widget.onShuffle?.call();
              } else if (k == '⌫') {
                widget.onBackspace();
              } else if (k.isNotEmpty) {
                widget.onTap(k);
              }
            },
          );
        },
      ),
    );
  }
}

class _NumPadKey extends StatelessWidget {
  const _NumPadKey({
    required this.label,
    required this.fg,
    required this.sub,
    required this.onTap,
  });

  final String label;
  final Color fg;
  final Color sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (label.isEmpty) {
      // 빈 셀이라도 다른 셀과 같은 영역을 차지해 GridView 레이아웃 안정
      return const SizedBox.expand();
    }
    final isShuffle = label == '재배열';
    // InkWell 은 Material 부모 없이 hit area 가 child 크기로 제한될 수 있어
    // GridView 셀에서 셀 가장자리를 탭하면 onTap 이 호출되지 않는 이슈가 있다.
    // GestureDetector(opaque) + Container alignment 로 셀 전체에서 탭 가능하도록 보강.
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: double.infinity,
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontFamily: ST.font,
            fontSize: isShuffle ? 14 : (label == '⌫' ? 22 : 26),
            fontWeight: isShuffle ? FontWeight.w600 : FontWeight.w500,
            color: isShuffle ? sub : fg,
            letterSpacing: -0.16,
          ),
        ),
      ),
    );
  }
}
