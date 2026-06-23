import 'package:flutter/material.dart';

/// 키보드가 나타날 때 자동으로 스크롤하여 입력 필드가 보이도록 하는 ScrollView
///
/// 사용법:
/// ```dart
/// KeyboardAwareScrollView(
///   child: Column(
///     children: [
///       AppTextField(...),
///       PasswordTextField(...),
///     ],
///   ),
/// )
/// ```
class KeyboardAwareScrollView extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final ScrollPhysics? physics;
  final bool reverse;
  final ScrollController? controller;

  const KeyboardAwareScrollView({
    super.key,
    required this.child,
    this.padding,
    this.physics,
    this.reverse = false,
    this.controller,
  });

  @override
  Widget build(BuildContext context) {
    // 키보드 높이 가져오기
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;

    return SingleChildScrollView(
      controller: controller,
      physics: physics ?? const ClampingScrollPhysics(),
      reverse: reverse,
      // 키보드가 올라오면 키보드 높이만큼 패딩 추가
      padding: padding?.add(EdgeInsets.only(bottom: keyboardHeight)) ??
          EdgeInsets.only(bottom: keyboardHeight),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
      child: child,
    );
  }
}

/// 키보드 인식 Scaffold - 키보드가 나타날 때 자동으로 화면을 조정
///
/// 사용법:
/// ```dart
/// KeyboardAwareScaffold(
///   appBar: AppBar(title: Text('제목')),
///   body: Column(
///     children: [
///       AppTextField(...),
///     ],
///   ),
/// )
/// ```
class KeyboardAwareScaffold extends StatelessWidget {
  final PreferredSizeWidget? appBar;
  final Widget body;
  final Widget? floatingActionButton;
  final FloatingActionButtonLocation? floatingActionButtonLocation;
  final Widget? bottomNavigationBar;
  final Color? backgroundColor;
  final EdgeInsetsGeometry? padding;
  final bool useSafeArea;
  final bool centerContent;

  const KeyboardAwareScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.floatingActionButton,
    this.floatingActionButtonLocation,
    this.bottomNavigationBar,
    this.backgroundColor,
    this.padding,
    this.useSafeArea = true,
    this.centerContent = false,
  });

  @override
  Widget build(BuildContext context) {
    Widget content = KeyboardAwareScrollView(
      padding: padding,
      child: centerContent ? Center(child: body) : body,
    );

    if (useSafeArea) {
      content = SafeArea(child: content);
    }

    return Scaffold(
      appBar: appBar,
      backgroundColor: backgroundColor,
      // 키보드가 나타날 때 자동으로 화면 크기 조정
      resizeToAvoidBottomInset: true,
      body: content,
      floatingActionButton: floatingActionButton,
      floatingActionButtonLocation: floatingActionButtonLocation,
      bottomNavigationBar: bottomNavigationBar,
    );
  }
}

/// 포커스 시 자동 스크롤되는 TextField 래퍼
///
/// 기존 TextField를 감싸서 포커스될 때 자동으로 화면에 보이도록 스크롤
class AutoScrollTextField extends StatefulWidget {
  final Widget child;
  final Duration scrollDelay;

  const AutoScrollTextField({
    super.key,
    required this.child,
    this.scrollDelay = const Duration(milliseconds: 300),
  });

  @override
  State<AutoScrollTextField> createState() => _AutoScrollTextFieldState();
}

class _AutoScrollTextFieldState extends State<AutoScrollTextField> {
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_onFocusChange);
  }

  @override
  void dispose() {
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    super.dispose();
  }

  void _onFocusChange() {
    if (_focusNode.hasFocus) {
      // 키보드가 완전히 올라온 후 스크롤
      Future.delayed(widget.scrollDelay, () {
        if (mounted && context.mounted) {
          Scrollable.ensureVisible(
            context,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            alignment: 0.5, // 화면 중앙에 위치
            alignmentPolicy: ScrollPositionAlignmentPolicy.explicit,
          );
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _focusNode,
      child: widget.child,
    );
  }
}
