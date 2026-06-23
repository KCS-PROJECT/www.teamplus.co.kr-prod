import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 웹 모달과 동일한 dim 톤으로 시스템 UI(StatusBar · NavigationBar) 색상을 조정하면서
/// [showDialog]를 띄우는 공통 래퍼.
///
/// 네이티브 다이얼로그(Flutter [AlertDialog] · [CupertinoAlertDialog] 등)가 열릴 때
/// iOS safe area 상/하단과 Android system bar가 기본 색(흰색)으로 남아 dim 오버레이와
/// 시각적으로 분리되는 문제를 해결한다.
///
/// 사용 예시:
/// ```dart
/// await showDimDialog<void>(
///   context: context,
///   builder: (ctx) => AlertDialog(
///     title: const Text('확인'),
///     content: const Text('정말 진행하시겠습니까?'),
///     actions: [ ... ],
///   ),
/// );
/// ```
///
/// - [overlayColor]는 기본적으로 slate-950 @ 70% alpha (웹 모달 backdrop과 동일).
/// - 다이얼로그 닫힘 시 자동으로 진입 전 스타일로 복원.
Future<T?> showDimDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
  Color? barrierColor,
  bool useRootNavigator = true,
  bool useSafeArea = true,
  String? barrierLabel,
  Color overlayColor = const Color(0xB3020617),
}) async {
  final SystemUiOverlayStyle dimStyle = SystemUiOverlayStyle(
    statusBarColor: overlayColor,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: overlayColor,
    systemNavigationBarIconBrightness: Brightness.light,
  );

  // 진입 전 스타일은 Flutter에서 직접 읽을 수 없으므로, 닫힌 뒤 [SystemChrome.restoreSystemUIOverlays]
  // + 기본 dark 스타일 복원으로 안전하게 되돌린다. WebViewScreen이 마운트된 상태에서는
  // 해당 화면의 build 시 `_applyStatusBarStyle`이 재호출돼 원래 톤으로 자연스럽게 복귀된다.
  SystemChrome.setSystemUIOverlayStyle(dimStyle);

  try {
    return await showDialog<T>(
      context: context,
      barrierDismissible: barrierDismissible,
      barrierColor: barrierColor,
      useRootNavigator: useRootNavigator,
      useSafeArea: useSafeArea,
      barrierLabel: barrierLabel,
      builder: builder,
    );
  } finally {
    // 다이얼로그 닫힘 직후 시스템 UI 복원 요청.
    // WebViewScreen 위에서 열렸다면 해당 화면의 다음 프레임에서 자체 스타일이 재적용된다.
    SystemChrome.restoreSystemUIOverlays();
  }
}
