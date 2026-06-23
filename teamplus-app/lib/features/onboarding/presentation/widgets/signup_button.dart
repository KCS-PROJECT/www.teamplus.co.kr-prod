import 'package:flutter/material.dart';
import 'signup_design_tokens.dart';

/// 참고자료 ui.jsx Btn 컴포넌트 1:1 매핑.
/// primary: ice500 + 그림자, ghost: outline, disabled: 회색.
enum SignupBtnVariant { primary, ghost, disabled }

class SignupButton extends StatelessWidget {
  const SignupButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = SignupBtnVariant.primary,
    this.fullWidth = true,
    this.height = 56,
    this.radius = 14,
  });

  final String label;
  final VoidCallback? onPressed;
  final SignupBtnVariant variant;
  final bool fullWidth;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final isDisabled =
        variant == SignupBtnVariant.disabled || onPressed == null;
    final bg = switch (variant) {
      SignupBtnVariant.primary => ST.ice500,
      SignupBtnVariant.ghost => Colors.transparent,
      SignupBtnVariant.disabled => ST.line2,
    };
    final fg = switch (variant) {
      SignupBtnVariant.primary => Colors.white,
      SignupBtnVariant.ghost => ST.text2,
      SignupBtnVariant.disabled => ST.text4,
    };
    final border = variant == SignupBtnVariant.ghost
        ? Border.all(color: ST.line, width: 1)
        : null;
    final shadow = variant == SignupBtnVariant.primary
        ? [
            BoxShadow(
              color: ST.ice500.withValues(alpha: 0.32),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ]
        : <BoxShadow>[];

    return SizedBox(
      width: fullWidth ? double.infinity : null,
      height: height,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          onTap: isDisabled ? null : onPressed,
          borderRadius: BorderRadius.circular(radius),
          child: Container(
            decoration: BoxDecoration(
              border: border,
              borderRadius: BorderRadius.circular(radius),
              boxShadow: shadow,
            ),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  fontFamily: ST.font,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: fg,
                  letterSpacing: -0.16,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 풀-블리드 하단 비활성 다음 버튼 (A7 RRN 입력 화면 패턴 — 라운드 0, 회색 배경)
class SignupNextStripBar extends StatelessWidget {
  const SignupNextStripBar({
    super.key,
    required this.label,
    this.enabled = false,
    this.onPressed,
  });

  final String label;
  final bool enabled;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: enabled ? ST.ice500 : ST.line2,
      child: InkWell(
        onTap: enabled ? onPressed : null,
        child: SizedBox(
          height: 52,
          width: double.infinity,
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: ST.font,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: enabled ? Colors.white : ST.text4,
                letterSpacing: -0.15,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
