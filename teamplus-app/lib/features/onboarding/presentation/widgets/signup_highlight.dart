import 'package:flutter/material.dart';
import 'signup_design_tokens.dart';

/// 참고자료 onboarding-1.jsx `Hl` 컴포넌트.
/// "linear-gradient(transparent 62%, #FFE890 62%)" — 텍스트 하단 38% 영역에 형광펜 노란색.
/// Flutter 에서는 underline thickness 와 색상을 직접 시뮬레이션.
class HighlightedText extends StatelessWidget {
  const HighlightedText(
    this.text, {
    super.key,
    required this.style,
  });

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final fontSize = style.fontSize ?? 18;
    final stripeHeight = fontSize * 0.38;
    return Stack(
      alignment: Alignment.bottomLeft,
      children: [
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: IgnorePointer(
            child: Container(
              height: stripeHeight,
              decoration: const BoxDecoration(color: ST.highlight),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Text(text, style: style.copyWith(fontWeight: FontWeight.w900)),
        ),
      ],
    );
  }
}

/// 인라인 형광펜용 InlineSpan helper (RichText 내부에서 사용).
WidgetSpan highlightSpan(String text, TextStyle style) => WidgetSpan(
      alignment: PlaceholderAlignment.baseline,
      baseline: TextBaseline.alphabetic,
      child: HighlightedText(text, style: style),
    );
