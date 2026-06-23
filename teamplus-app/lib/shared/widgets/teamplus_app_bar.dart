import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/colors.dart';

/// TEAMPLUS 공통 AppBar — SoT.
///
/// **모든 네이티브 화면**에서 동일한 스타일·높이·뒤로가기 동작·StatusBar 톤을
/// 보장하기 위한 단일 진입점.
///
/// 규칙:
/// - `toolbarHeight` 는 **60px 고정** (Material 기본 `kToolbarHeight=56` 과 다름).
///   - 작은 폰의 상단 터치 영역 확보 + 디자인 SoT (`#1f2536` 다크 슬레이트 톤과 균형).
/// - `systemOverlayStyle` 을 **명시적으로 부여**한다.
///   - 라이트 배경(default) → status bar 다크 아이콘.
///   - 다크 배경(`backgroundColor` 가 어두울 때) → status bar 라이트 아이콘.
/// - `elevation` 0, `scrolledUnderElevation` 1 (콘텐츠 스크롤 시에만 살짝 강조).
/// - `automaticallyImplyLeading: false` — 우리 로직으로 직접 leading 제어.
class TeamplusAppBar extends StatelessWidget implements PreferredSizeWidget {
  /// AppBar 의 기본 높이. 모든 화면 SoT.
  static const double kHeight = 60.0;

  final String title;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final bool showBackButton;
  final VoidCallback? onBackPressed;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final Widget? leading;
  final bool centerTitle;
  final double elevation;

  /// 명시적으로 systemOverlayStyle 을 강제하고 싶을 때 (예: 페이지마다 status bar
  /// 톤이 다른 경우). 기본은 backgroundColor 명도 기반 자동 계산.
  final SystemUiOverlayStyle? systemOverlayStyleOverride;

  const TeamplusAppBar({
    super.key,
    required this.title,
    this.actions,
    this.bottom,
    this.showBackButton = true,
    this.onBackPressed,
    this.backgroundColor,
    this.foregroundColor,
    this.leading,
    this.centerTitle = true,
    this.elevation = 0,
    this.systemOverlayStyleOverride,
  });

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    final router = GoRouter.of(context);
    final canGoBack = router.canPop();

    final theme = Theme.of(context);
    final isDarkMode = theme.brightness == Brightness.dark;

    final effectiveBg = backgroundColor ??
        (isDarkMode ? AppColors.darkSurface : AppColors.white);
    final effectiveFg =
        foregroundColor ?? (isDarkMode ? Colors.white : AppColors.darkText);

    // backgroundColor 명도 → status bar 아이콘 brightness 자동 결정.
    final isDarkBackground = _isDarkColor(effectiveBg);
    final autoOverlay = SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      // Android: 아이콘 brightness — 다크 배경엔 light 아이콘.
      statusBarIconBrightness:
          isDarkBackground ? Brightness.light : Brightness.dark,
      // iOS: status bar **배경 brightness** 의미. 배경이 dark 이면 light text 가 필요.
      statusBarBrightness:
          isDarkBackground ? Brightness.dark : Brightness.light,
    );

    return AppBar(
      title: Text(
        title,
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: effectiveFg,
          letterSpacing: -0.3,
        ),
      ),
      backgroundColor: effectiveBg,
      foregroundColor: effectiveFg,
      elevation: elevation,
      scrolledUnderElevation: 1,
      centerTitle: centerTitle,
      // 우리 로직으로 leading 제어 — Flutter 기본 자동 생성 비활성화.
      automaticallyImplyLeading: false,
      toolbarHeight: kHeight,
      // 명시적 systemOverlayStyle 부여 — AppBar 없는 화면에서도 글로벌
      // SystemChrome 가 backup 으로 동작하지만 AppBar 가 있는 화면은
      // 항상 이 SoT 가 우선한다.
      systemOverlayStyle: systemOverlayStyleOverride ?? autoOverlay,
      leading: leading ??
          (showBackButton && (canPop || canGoBack)
              ? IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, size: 20),
                  splashRadius: 22,
                  tooltip: '뒤로가기',
                  onPressed: onBackPressed ??
                      () {
                        if (canPop) {
                          Navigator.of(context).pop();
                        } else if (canGoBack) {
                          context.pop();
                        }
                      },
                )
              : null),
      actions: actions,
      bottom: bottom,
      iconTheme: IconThemeData(color: effectiveFg, size: 24),
    );
  }

  /// 색상의 휘도(luminance) 를 계산해 다크 여부를 판정.
  /// WCAG relative luminance 기준 0.5 미만이면 다크 배경으로 본다.
  static bool _isDarkColor(Color color) {
    return color.computeLuminance() < 0.5;
  }

  @override
  Size get preferredSize => Size.fromHeight(
        kHeight + (bottom?.preferredSize.height ?? 0),
      );
}
