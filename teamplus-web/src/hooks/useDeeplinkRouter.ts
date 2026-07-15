'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  parseDeeplink,
  resolveInternalPath,
  buildDeeplink,
  DEEPLINK_SCHEME,
  type DeeplinkTarget,
} from '@/lib/deeplink';
import { useNavigation } from '@/hooks/useNavigation';
import {
  detectPlatform,
  detectInAppBrowser,
  planAppOpen,
  tryOpenAppWithFallback,
} from '@/lib/app-install';
import { isNativeApp } from '@/lib/environment';

/**
 * useDeeplinkRouter — 외부/내부 진입점에서 Deeplink를 라우팅하는 훅
 *
 * 역할:
 *   1. 현재 URL의 `?deeplink=...` 또는 `?redirect=...` 쿼리를 감지
 *   2. `parseDeeplink`로 안전성 검사
 *   3. 통과 시 `router.replace()`로 원래 경로 정리 + 내부 라우팅
 *   4. 실패 시 조용히 무시 (사용자는 현재 페이지에 머무름)
 *
 * 사용 위치: `ClientProviders`에서 전역 1회 마운트하거나,
 *            진입 페이지(`/splash`, `/onboarding`)에서 개별 호출.
 *
 * 수동 호출 API:
 *   - `navigateToDeeplink(input)` — 임의 문자열을 즉시 라우팅
 *   - `buildAndNavigate({ path, query })` — 안전 객체로 라우팅
 */

interface UseDeeplinkRouterOptions {
  /**
   * 자동 파싱할 쿼리 키 목록 (기본값: `['deeplink', 'redirect']`)
   * 진입 URL이 `?redirect=/classes/123` 형태일 때 유용
   */
  queryKeys?: readonly string[];
  /**
   * 자동 라우팅 활성 여부 (기본: true)
   * false로 넘기면 훅이 수동 API만 제공하고 useEffect는 비활성
   */
  auto?: boolean;
  /** 파싱 성공 시 호출되는 콜백 (analytics용) */
  onDeeplink?: (target: DeeplinkTarget) => void;
}

interface UseDeeplinkRouterResult {
  navigateToDeeplink: (input: string) => boolean;
  buildAndNavigate: (target: { path: string; query?: Record<string, string> }) => boolean;
  /**
   * 모바일 웹에서 호출 시: `teamplus://` 스킴을 시도하고 1.5s 이내 앱이 열리지 않으면
   * `/get-app?redirect=<현재경로>` 로 이동.
   * 네이티브/데스크탑/SSR 환경에서는 그냥 내부 라우팅으로 fallback.
   *
   * 사용 예 (카카오톡 공유 링크 진입 시):
   *   `<button onClick={() => openInAppOrInstall('/classes/123')}>앱에서 보기</button>`
   *
   * @returns 시도 성공 여부 (path 검증 통과 시 true)
   */
  openInAppOrInstall: (input: string) => boolean;
}

const DEFAULT_QUERY_KEYS = ['deeplink', 'redirect'] as const;

export function useDeeplinkRouter(
  options: UseDeeplinkRouterOptions = {},
): UseDeeplinkRouterResult {
  const { queryKeys = DEFAULT_QUERY_KEYS, auto = true, onDeeplink } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const consumedRef = useRef(false);
  // 라우팅 SoT 통합 (v15, 2026-05-08) — `router.push` 직접 호출 대신
  // `useNavigation` 을 거쳐 startLoading/authGuard/cleanupBeforeNavigation 정합성 확보.
  // history clean(아래 useEffect) 는 동일 pathname replace 라 useNavigation 의 동일 경로
  // 가드에 걸리므로 그대로 router.replace 사용하고, 실제 진입만 navigate 로 위임.
  const { navigate } = useNavigation();

  const navigateToDeeplink = useCallback(
    (input: string): boolean => {
      const target = parseDeeplink(input);
      if (!target) return false;
      onDeeplink?.(target);
      void navigate(resolveInternalPath(target));
      return true;
    },
    [navigate, onDeeplink],
  );

  const buildAndNavigate = useCallback(
    (target: { path: string; query?: Record<string, string> }): boolean => {
      // parseDeeplink가 path + query를 재검증하므로 안전
      const inputUrl = (() => {
        const qs = new URLSearchParams(target.query ?? {}).toString();
        return target.path + (qs ? `?${qs}` : '');
      })();
      return navigateToDeeplink(inputUrl);
    },
    [navigateToDeeplink],
  );

  const openInAppOrInstall = useCallback(
    (input: string): boolean => {
      const target = parseDeeplink(input);
      if (!target) return false;
      onDeeplink?.(target);

      const internalPath = resolveInternalPath(target);

      // SSR → 내부 라우팅으로 안전 폴백
      if (typeof window === 'undefined') {
        void navigate(internalPath);
        return true;
      }

      // 순수 함수 planAppOpen 으로 전략 결정 (플랫폼 × 인앱브라우저 조합) →
      // 결정된 전략에 따라 부수효과만 여기서 수행.
      const { https: universalUrl } = buildDeeplink({
        path: target.path,
        query: target.query,
      });
      const schemeUrl = `${DEEPLINK_SCHEME}://${target.path.replace(/^\//, '')}`;
      const plan = planAppOpen({
        internalPath,
        universalUrl,
        schemeUrl,
        platform: detectPlatform(),
        inApp: detectInAppBrowser(),
        isNative: isNativeApp(),
      });

      switch (plan.strategy) {
        case 'internal':
        case 'ios-inapp-guide':
          void navigate(plan.path as string);
          break;
        case 'android-intent':
        case 'ios-kakao-escape':
          window.location.href = plan.href as string;
          break;
        case 'scheme-timeout':
          tryOpenAppWithFallback(plan.schemeUrl as string, {
            timeoutMs: 1500,
            // tryOpenAppWithFallback 은 window.location.href 를 직접 변경하므로
            // 동일 origin 상대 경로면 그대로 동작.
            fallbackUrl: plan.fallbackPath as string,
          });
          break;
      }
      return true;
    },
    [navigate, onDeeplink],
  );

  useEffect(() => {
    if (!auto) return;
    if (consumedRef.current) return;
    if (!searchParams) return;

    // 지정된 쿼리 키 중 첫 번째 유효한 값을 소비
    for (const key of queryKeys) {
      const value = searchParams.get(key);
      if (!value) continue;

      const target = parseDeeplink(value);
      if (!target) continue;

      consumedRef.current = true;
      onDeeplink?.(target);

      // 현재 URL에서 해당 쿼리 제거 (history clean up)
      const cleanedParams = new URLSearchParams(searchParams.toString());
      for (const k of queryKeys) cleanedParams.delete(k);
      const cleanedQs = cleanedParams.toString();
      const cleanedCurrent = pathname + (cleanedQs ? `?${cleanedQs}` : '');

      // 1. 먼저 history 정리 (동일 pathname 의 query 제거 → 풀스크린 로더 불필요,
      //    `useNavigation` 의 동일 경로 가드에 걸리므로 직접 router.replace 사용)
      router.replace(cleanedCurrent);
      // 2. 이어서 deeplink 경로 진입 — `useNavigation.navigate` 로 위임하여
      //    startLoading + authGuard + cleanupBeforeNavigation 정합성 확보 (v15 SoT 통합)
      void navigate(resolveInternalPath(target));
      return;
    }
  }, [auto, queryKeys, searchParams, pathname, router, navigate, onDeeplink]);

  return { navigateToDeeplink, buildAndNavigate, openInAppOrInstall };
}

export default useDeeplinkRouter;
