import 'package:flutter/material.dart';
import 'signup_design_tokens.dart';

/// 참고자료 onboarding-2.jsx PwDots — 채워진 점만 ice500, 나머지 line.
class SignupPwDots extends StatelessWidget {
  const SignupPwDots({
    super.key,
    required this.filled,
    this.total = 6,
    this.size = 10,
    this.color,
  });

  final int filled;
  final int total;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (int i = 0; i < total; i++) ...[
          if (i != 0) const SizedBox(width: 14),
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: i < filled ? (color ?? ST.ice500) : ST.line,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ],
    );
  }
}
