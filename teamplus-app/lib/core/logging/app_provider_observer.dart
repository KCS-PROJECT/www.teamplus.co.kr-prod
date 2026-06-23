// AppProviderObserver — Riverpod 3 상태 변경 추적 (v8.6 P4-4, 2026-05-20)
//
// Provider 상태 변경 시 AppLogger.activity() 호출. 민감 Provider는
// `runtimeType.toString()`에 `Auth/Token/Secret/Pin/Password` 포함 시 skip.
//
// Riverpod 3.x: ProviderObserverContext 단일 인자로 변경됨
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_logger.dart';

base class AppLogProviderObserver extends ProviderObserver {
  static final RegExp _sensitivePattern =
      RegExp(r'(auth|token|secret|pin|password|crypto)', caseSensitive: false);

  bool _shouldSkip(ProviderObserverContext context) {
    final name = context.provider.runtimeType.toString();
    return _sensitivePattern.hasMatch(name);
  }

  @override
  void didAddProvider(
    ProviderObserverContext context,
    Object? value,
  ) {
    if (_shouldSkip(context)) return;
    AppLogger.instance.debug(
      'Provider added: ${context.provider.runtimeType}',
      context: {
        'name': context.provider.name ?? context.provider.runtimeType.toString(),
      },
    );
  }

  @override
  void didUpdateProvider(
    ProviderObserverContext context,
    Object? previousValue,
    Object? newValue,
  ) {
    if (_shouldSkip(context)) return;
    AppLogger.instance.debug(
      'Provider updated: ${context.provider.runtimeType}',
      context: {
        'name': context.provider.name ?? context.provider.runtimeType.toString(),
        'prev': _safeToString(previousValue),
        'next': _safeToString(newValue),
      },
    );
  }

  @override
  void providerDidFail(
    ProviderObserverContext context,
    Object error,
    StackTrace stackTrace,
  ) {
    AppLogger.instance.errorAs(
      ErrorCategory.client,
      'Provider failed: ${context.provider.runtimeType}',
      error: error,
      stackTrace: stackTrace,
      context: {
        'name': context.provider.name ?? context.provider.runtimeType.toString(),
      },
    );
  }

  String _safeToString(Object? v) {
    if (v == null) return 'null';
    final s = v.toString();
    return s.length > 100 ? '${s.substring(0, 100)}...(${s.length})' : s;
  }
}
