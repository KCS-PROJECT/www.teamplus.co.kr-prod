import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'signup_design_tokens.dart';

/// 참고자료 ui.jsx AppBar 컴포넌트 1:1 매핑.
/// 높이 52px(내부 콘텐츠) + status bar 영역.
/// 좌측 back/close/none, 중앙 타이틀, 우측 X 닫기.
///
/// (2026-05-12) iPhone Dynamic Island 와 타이틀 겹침 이슈 수정:
/// - preferredSize 에 status bar 높이 가산
/// - 내부 콘텐츠를 SafeArea 안에 배치
class SignupAppBar extends StatelessWidget implements PreferredSizeWidget {
  const SignupAppBar({
    super.key,
    this.title,
    this.leading = SignupAppBarLeading.back,
    this.showClose = true,
    this.onClose,
    this.onBack,
    this.transparent = false,
  });

  final String? title;
  final SignupAppBarLeading leading;
  final bool showClose;
  final VoidCallback? onClose;
  final VoidCallback? onBack;
  final bool transparent;

  static const double _contentHeight = 52;

  /// View padding 의 top(=status bar/notch 높이) 을 build 외부에서 안전하게 조회.
  /// PlatformDispatcher 의 첫 view 를 사용 — 다중 화면 환경에서도 메인 디스플레이를 가리킴.
  double get _statusBarHeight {
    final view = ui.PlatformDispatcher.instance.views.first;
    return view.padding.top / view.devicePixelRatio;
  }

  @override
  Size get preferredSize => Size.fromHeight(_contentHeight + _statusBarHeight);

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Container(
      // status bar 영역까지 배경 칠하고, 내부 콘텐츠는 그 아래 52px 영역만 사용.
      padding: EdgeInsets.only(top: topPadding),
      decoration: BoxDecoration(
        color: transparent ? Colors.transparent : ST.surface,
        border: transparent
            ? null
            : const Border(
                bottom: BorderSide(color: ST.line2, width: 1),
              ),
      ),
      child: Container(
        height: _contentHeight,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(
          children: [
            SizedBox(
              width: 40,
              height: 40,
              child: leading == SignupAppBarLeading.none
                  ? null
                  : IconButton(
                      padding: EdgeInsets.zero,
                      tooltip:
                          leading == SignupAppBarLeading.back ? '뒤로가기' : '닫기',
                      onPressed:
                          onBack ?? () => Navigator.of(context).maybePop(),
                      icon: Icon(
                        leading == SignupAppBarLeading.back
                            ? Icons.arrow_back_ios_new_rounded
                            : Icons.close_rounded,
                        size: 22,
                        color: transparent ? Colors.white : ST.text1,
                      ),
                    ),
            ),
            Expanded(
              child: Center(
                child: Text(
                  title ?? '',
                  style: TextStyle(
                    fontFamily: ST.font,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: transparent ? Colors.white : ST.text1,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
            ),
            SizedBox(
              width: 40,
              height: 40,
              child: showClose
                  ? IconButton(
                      padding: EdgeInsets.zero,
                      tooltip: '닫기',
                      onPressed:
                          onClose ?? () => Navigator.of(context).maybePop(),
                      icon: Icon(
                        Icons.close_rounded,
                        size: 22,
                        color: transparent ? Colors.white : ST.text1,
                      ),
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

enum SignupAppBarLeading { back, close, none }
