import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 민감 화면의 캡처/녹화를 방지하는 서비스
///
/// Android: FLAG_SECURE 플래그 설정 (WindowManager.LayoutParams.FLAG_SECURE)
/// iOS: UITextField.isSecureTextEntry 오버레이 트릭
///
/// 사용 예시:
/// ```dart
/// // 직접 호출
/// await ScreenCaptureGuard().enable();
/// await ScreenCaptureGuard().disable();
///
/// // Mixin 사용 (ConsumerStatefulWidget)
/// class _PaymentScreenState extends ConsumerState<PaymentScreen>
///     with ScreenCaptureMixin {
///   // initState/dispose에서 자동으로 enable/disable
/// }
/// ```
class ScreenCaptureGuard {
  static final ScreenCaptureGuard _instance = ScreenCaptureGuard._();
  factory ScreenCaptureGuard() => _instance;
  ScreenCaptureGuard._();

  /// 네이티브 플랫폼 채널
  static const MethodChannel _channel =
      MethodChannel('com.kr.www.teamplus/screen_capture');

  /// 현재 캡처 방지 활성화 여부
  bool _isEnabled = false;

  /// 활성화된 화면 수 (중첩 처리용)
  int _activeCount = 0;

  /// 현재 캡처 방지가 활성화되어 있는지 확인
  bool get isEnabled => _isEnabled;

  /// 캡처 방지 활성화
  ///
  /// [force] - true일 경우 kDebugMode에서도 강제 활성화
  ///
  /// kDebugMode에서는 기본적으로 비활성화 (개발 편의)
  /// 프로덕션에서는 항상 활성화
  Future<void> enable({bool force = false}) async {
    // 디버그 모드에서는 기본적으로 비활성화 (force로 오버라이드 가능)
    if (kDebugMode && !force) {
      debugPrint('[ScreenCaptureGuard] 디버그 모드 - 캡처 방지 건너뜀');
      return;
    }

    _activeCount++;

    // 이미 활성화된 경우 중복 호출 방지
    if (_isEnabled) {
      debugPrint(
        '[ScreenCaptureGuard] 이미 활성화됨 (activeCount: $_activeCount)',
      );
      return;
    }

    try {
      if (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS) {
        await _channel.invokeMethod('enableSecureMode');
        _isEnabled = true;
        debugPrint('[ScreenCaptureGuard] 캡처 방지 활성화 완료');
      } else {
        debugPrint(
            '[ScreenCaptureGuard] 미지원 플랫폼: ${defaultTargetPlatform.name}');
      }
    } on PlatformException catch (e) {
      debugPrint('[ScreenCaptureGuard] 활성화 실패: ${e.code} - ${e.message}');
    } on MissingPluginException {
      debugPrint('[ScreenCaptureGuard] 네이티브 플러그인 미등록 - 건너뜀');
    } catch (e) {
      debugPrint('[ScreenCaptureGuard] 예상치 못한 오류: $e');
    }
  }

  /// 캡처 방지 비활성화
  ///
  /// 중첩 호출을 지원하여, 모든 민감 화면이 닫힌 후에만 실제로 비활성화됨
  Future<void> disable() async {
    if (kDebugMode && !_isEnabled) {
      return;
    }

    _activeCount = (_activeCount - 1).clamp(0, 999);

    // 아직 다른 민감 화면이 활성화 상태인 경우 비활성화하지 않음
    if (_activeCount > 0) {
      debugPrint(
        '[ScreenCaptureGuard] 다른 민감 화면 활성 중 (activeCount: $_activeCount)',
      );
      return;
    }

    if (!_isEnabled) {
      return;
    }

    try {
      if (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS) {
        await _channel.invokeMethod('disableSecureMode');
        _isEnabled = false;
        debugPrint('[ScreenCaptureGuard] 캡처 방지 비활성화 완료');
      }
    } on PlatformException catch (e) {
      debugPrint('[ScreenCaptureGuard] 비활성화 실패: ${e.code} - ${e.message}');
    } on MissingPluginException {
      debugPrint('[ScreenCaptureGuard] 네이티브 플러그인 미등록 - 건너뜀');
    } catch (e) {
      debugPrint('[ScreenCaptureGuard] 예상치 못한 오류: $e');
    }
  }

  /// 강제 초기화 (앱 종료/로그아웃 시)
  ///
  /// 카운터와 상태를 모두 리셋
  Future<void> forceDisable() async {
    _activeCount = 0;
    if (_isEnabled) {
      try {
        if (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS) {
          await _channel.invokeMethod('disableSecureMode');
        }
      } catch (e) {
        debugPrint('[ScreenCaptureGuard] 강제 비활성화 오류: $e');
      }
      _isEnabled = false;
      debugPrint('[ScreenCaptureGuard] 강제 비활성화 완료');
    }
  }

  /// 디버그 정보 조회
  Map<String, dynamic> getDebugInfo() {
    return {
      'isEnabled': _isEnabled,
      'activeCount': _activeCount,
      'platform': defaultTargetPlatform.name,
    };
  }
}

/// Riverpod Provider
final screenCaptureGuardProvider = Provider<ScreenCaptureGuard>(
  (ref) => ScreenCaptureGuard(),
);

/// 민감 화면에 mixin으로 간편하게 캡처 방지를 적용
///
/// ConsumerStatefulWidget의 State에 적용:
/// ```dart
/// class _PaymentScreenState extends ConsumerState<PaymentScreen>
///     with ScreenCaptureMixin {
///   // initState/dispose에서 자동으로 enable/disable
/// }
/// ```
///
/// kDebugMode에서는 기본적으로 비활성화 (개발 편의)
mixin ScreenCaptureMixin<T extends StatefulWidget> on State<T> {
  @override
  void initState() {
    super.initState();
    ScreenCaptureGuard().enable();
  }

  @override
  void dispose() {
    ScreenCaptureGuard().disable();
    super.dispose();
  }
}

/// ConsumerState 전용 mixin
///
/// ConsumerStatefulWidget의 ConsumerState에 적용:
/// ```dart
/// class _PaymentScreenState extends ConsumerState<PaymentScreen>
///     with ConsumerScreenCaptureMixin {
///   // initState/dispose에서 자동으로 enable/disable
/// }
/// ```
mixin ConsumerScreenCaptureMixin<T extends ConsumerStatefulWidget>
    on ConsumerState<T> {
  @override
  void initState() {
    super.initState();
    ScreenCaptureGuard().enable();
  }

  @override
  void dispose() {
    ScreenCaptureGuard().disable();
    super.dispose();
  }
}

/// StatelessWidget (ConsumerWidget 포함)에서 사용하는 래퍼 위젯
///
/// ConsumerWidget처럼 State가 없는 위젯에서 캡처 방지를 적용할 때 사용:
/// ```dart
/// class ProfileSecurityScreen extends ConsumerWidget {
///   @override
///   Widget build(BuildContext context, WidgetRef ref) {
///     return ScreenCaptureWrapper(
///       child: Scaffold(...),
///     );
///   }
/// }
/// ```
class ScreenCaptureWrapper extends StatefulWidget {
  final Widget child;

  const ScreenCaptureWrapper({
    super.key,
    required this.child,
  });

  @override
  State<ScreenCaptureWrapper> createState() => _ScreenCaptureWrapperState();
}

class _ScreenCaptureWrapperState extends State<ScreenCaptureWrapper> {
  @override
  void initState() {
    super.initState();
    ScreenCaptureGuard().enable();
  }

  @override
  void dispose() {
    ScreenCaptureGuard().disable();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
