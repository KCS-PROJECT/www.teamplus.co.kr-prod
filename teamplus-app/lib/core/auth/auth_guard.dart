import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/providers/auth_provider.dart';

/// 미로그인 시 알림 + 이동 옵션
class RequireLoginOptions {
  final String? message;
  final String? returnPath;
  final bool showSnackBar;
  final bool navigate;

  const RequireLoginOptions({
    this.message,
    this.returnPath,
    this.showSnackBar = true,
    this.navigate = true,
  });
}

/// `callApi` 전·후처리 옵션
class CallApiOptions<T> {
  final Future<bool> Function()? onBefore;
  final Future<void> Function(T result)? onAfter;
  final Future<void> Function(Object error)? onError;
  final RequireLoginOptions? guard;
  final bool skipAuth;

  const CallApiOptions({
    this.onBefore,
    this.onAfter,
    this.onError,
    this.guard,
    this.skipAuth = false,
  });
}

/// 공통 인증 가드 + API 래퍼 (Web/Admin 의 `useAuthGuard` 와 동일한 시멘틱)
///
/// 사용 예 (ConsumerWidget 또는 ConsumerStatefulWidget 의 build/이벤트 안):
/// ```dart
/// final guard = useAuthGuard(ref, context);
/// if (!await guard.requireLogin()) return;
/// final data = await guard.callApi<MyDto>(() => api.getSomething());
/// ```
class AuthGuard {
  final WidgetRef ref;
  final BuildContext context;

  const AuthGuard({required this.ref, required this.context});

  /// 동기적 캐시 기반 인증 여부 (Provider 가 아직 미해결이면 false)
  bool get isAuthenticatedCached => ref.read(authStateProvider).value ?? false;

  bool get isLoading => ref.read(authStateProvider).isLoading;

  /// 정확한 인증 여부 (Future 해결 대기) — 토큰 만료까지 검증
  Future<bool> isAuthenticated() async {
    return await ref.read(authStateProvider.future);
  }

  /// 미로그인 시 알림 + 로그인 화면 이동 (returnPath 부착)
  /// 반환: true(인증됨) / false(미인증)
  Future<bool> requireLogin([RequireLoginOptions? options]) async {
    final authed = await isAuthenticated();
    if (authed) return true;

    final opts = options ?? const RequireLoginOptions();
    final message = opts.message ?? '로그인이 필요합니다.';

    if (opts.showSnackBar && context.mounted) {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }

    if (opts.navigate && context.mounted) {
      final target =
          opts.returnPath ?? GoRouterState.of(context).uri.toString();
      // GoRouter query param 으로 returnPath 전달 → 로그인 성공 후 이동에 사용
      final encoded = Uri.encodeQueryComponent(target);
      context.go('/login?returnPath=$encoded');
    }

    return false;
  }

  /// 공통 API 호출 래퍼 (전처리 → 가드 → 호출 → 후처리)
  ///
  /// - 미로그인: null 반환 (호출 안 됨)
  /// - 정상: 결과 반환
  /// - 에러: onError 호출 후 throw
  ///
  /// `onAfter` 는 현재 단순 위임(bypass). 향후 공통 후처리(분석·캐시 갱신·메트릭) 추가 지점.
  Future<T?> callApi<T>(
    Future<T> Function() fn, {
    CallApiOptions<T>? options,
  }) async {
    final opts = options ?? const CallApiOptions<Never>() as CallApiOptions<T>;

    // 0) 사용자 정의 전처리
    if (opts.onBefore != null) {
      final ok = await opts.onBefore!();
      if (!ok) return null;
    }

    // 1) 인증 가드
    if (!opts.skipAuth) {
      final authed = await requireLogin(opts.guard);
      if (!authed) return null;
    }

    // 2) 실제 호출
    late T result;
    try {
      result = await fn();
    } catch (e) {
      if (opts.onError != null) {
        await opts.onError!(e);
      }
      rethrow;
    }

    // 3) 후처리 (현재 bypass — 향후 공통 후처리 추가 지점)
    if (opts.onAfter != null) {
      await opts.onAfter!(result);
    }

    return result;
  }
}

/// React `useAuthGuard` 와 동일한 사용감의 Flutter 헬퍼
///
/// ConsumerWidget 의 build 또는 이벤트 핸들러 안에서 호출.
AuthGuard useAuthGuard(WidgetRef ref, BuildContext context) =>
    AuthGuard(ref: ref, context: context);
