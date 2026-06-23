"use client";

/**
 * useNavigation — TEAMPLUS 공통 네비게이션 훅
 *
 * 페이지 전환 시 자동으로 풀스크린 로더(L1/L2)를 표시하고,
 * 인증 가드 통과 + 인증 페이지 진입 시 쿠키 정리 후 router 호출.
 *
 * **모든 프로그래밍 방식 네비게이션은 이 훅을 사용한다.**
 * `useRouter().push/replace` 직접 호출 금지 — 풀스크린 로더가 표시되지 않음.
 *
 * ─── 두 가지 호출 형식 ─────────────────────────────
 * 1) **String 형식 (legacy · 호환 유지)** — 단순 라우팅
 *    navigate('/dashboard');
 *    navigate('/profile', { message: '프로필 로딩 중' });
 *    back();
 *
 * 2) **Object 형식 (typed · 권장)** — forward/onBack 데이터 전달
 *    navigate({ to: '/matches/1', forward: { tab: 'roster' }, onBack: (r) => {...} });
 *    back({ result: { applied: true } });
 *
 * 수신 화면은 `useRouteParams()` 로 forward 를 읽고 sendBack(result) 으로 결과를 큐잉한다.
 *
 * @example
 * const { navigate, replace, back } = useNavigation();
 *
 * // 기본
 * navigate('/dashboard');
 *
 * // 옵션
 * navigate('/external', { showSpinner: false });
 *
 * // 타입드 (forward + onBack)
 * navigate({
 *   to: '/matches/1',
 *   forward: { highlight: 'roster' },
 *   onBack: (result) => { if (result?.applied) toast.success('신청 완료'); },
 * });
 *
 * // 결과 보내며 뒤로가기
 * back({ result: { applied: true } });
 */

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { useLoading } from "@/contexts/LoadingContext";
import { useAuthClickGuard } from "@/hooks/useAuthClickGuard";
import {
  appendNavId,
  getCurrentNavId,
  pushNavEntry,
  setPendingBackward,
} from "@/lib/typed-navigation";
import { devWarn } from "@/lib/logger";

/**
 * 인증 페이지 경로 목록 — 이 경로로 이동 시 쿠키 선제 삭제로 middleware 리다이렉트 방지.
 */
const AUTH_PATHS = ["/login", "/register", "/signup", "/forgot-password"];

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * 쿠키 즉시 삭제 (동기). 인증 페이지로 이동 직전에 호출.
 */
function clearAccessTokenCookie(): void {
  if (typeof document !== "undefined") {
    document.cookie = "teamplus_access_token=; path=/; max-age=0";
  }
}

/**
 * 네비게이션 전 토큰/쿠키 정리 (동기). 인증 페이지로 이동하는 경우만 실행.
 */
export function cleanupBeforeNavigation(targetPath: string): void {
  if (isAuthPath(targetPath)) {
    clearAccessTokenCookie();
  }
}

export interface NavigateOptions {
  /** 스피너 표시 여부 — 기본: true */
  showSpinner?: boolean;
  /** 로딩 메시지 — 기본: '로딩중...' */
  message?: string;
}

/**
 * Object 형식 navigate/replace 옵션.
 *
 * @template TForward  forward 데이터 타입 (페이지 간 전달)
 * @template TBackward 수신 화면이 sendBack 으로 보내는 결과 타입
 */
export interface TypedNavigateOptions<
  TForward = unknown,
  TBackward = unknown,
> extends NavigateOptions {
  /** 이동할 경로. 절대 URL(`http(s)://`) 은 typed nav 미적용 — 외부 링크는 `window.open` 사용 권장. */
  to: string;
  /** 다음 화면이 `useRouteParams()` 로 읽을 수 있는 데이터. JSON 직렬화 가능 객체에 한정. */
  forward?: TForward;
  /**
   * 다음 화면이 닫힐 때(뒤로가기) 호출되는 콜백.
   * 수신 화면에서 `sendBack(result)` 또는 `back({ result })` 으로 보낸 값을 인자로 받는다.
   * 함수는 직렬화 불가하므로 새로고침 시 손실된다 (그 경우 송신 화면도 사라진 상태이므로 무관).
   */
  onBack?: (result: TBackward | undefined) => void;
}

/**
 * Object 형식 back 옵션.
 *
 * @template TBackward 부모 화면 onBack 으로 전달할 결과 타입
 */
export interface BackOptions<TBackward = unknown> extends NavigateOptions {
  /**
   * 부모 화면의 onBack 콜백으로 전달할 결과 데이터.
   * 수신 화면이 `sendBack` 을 거치지 않고 바로 보낼 때 사용.
   */
  result?: TBackward;
}

/** navigate / replace 의 인자 형태 — string(legacy) 또는 typed object. */
export type NavigateInput<F = unknown, B = unknown> =
  | string
  | TypedNavigateOptions<F, B>;

export interface UseNavigationReturn {
  /** 페이지 이동 (history push). string 또는 typed object 인자 지원. */
  navigate: <F = unknown, B = unknown>(
    arg: NavigateInput<F, B>,
    options?: NavigateOptions,
  ) => Promise<void>;
  /** 페이지 교체 (history replace). string 또는 typed object 인자 지원. */
  replace: <F = unknown, B = unknown>(
    arg: NavigateInput<F, B>,
    options?: NavigateOptions,
  ) => Promise<void>;
  /** 뒤로 가기. options.result 를 주면 부모 onBack 으로 전달. */
  back: <B = unknown>(options?: BackOptions<B>) => void;
  /** 앞으로 가기 */
  forward: (options?: NavigateOptions) => void;
  /** 새로고침 (스피너 없음 — Next.js router.refresh 위임) */
  refresh: () => void;
  /** 현재 경로 */
  pathname: string | null;
}

// v18 (2026-05-22): message 필드 제거 — LoadingPuck 은 텍스트를 렌더하지 않으므로
//   호출자가 어떤 문구를 넘겨도 fullsize 팝업의 시각은 동일하게 유지된다.
//   NavigateOptions.message 는 호환성을 위해 인터페이스에 유지하나 무시됨.
const DEFAULT_OPTIONS: Required<Omit<NavigateOptions, "message">> & {
  message?: string;
} = {
  showSpinner: true,
};

/** 입력 인자가 typed object 형식인지 판별. */
function isTypedNavigate<F, B>(
  arg: unknown,
): arg is TypedNavigateOptions<F, B> {
  return (
    typeof arg === "object" &&
    arg !== null &&
    typeof (arg as { to?: unknown }).to === "string"
  );
}

export function useNavigation(): UseNavigationReturn {
  const router = useRouter();
  const pathname = usePathname();
  const { startLoading } = useLoading();
  const authGuard = useAuthClickGuard();

  /** 내부 공통 라우팅 핸들러 — 스피너/가드/쿠키정리 후 router 호출. */
  const performRoute = useCallback(
    async (
      href: string,
      kind: "push" | "replace",
      options: NavigateOptions = {},
    ) => {
      const { showSpinner } = { ...DEFAULT_OPTIONS, ...options };

      // 현재 경로와 동일하면 이동 스킵 (쿼리 차이는 허용 — typed nav 의 _nav 추가 등)
      // pathname 은 쿼리/해시를 제외한 경로. href 는 쿼리/해시 포함 가능.
      const targetPath = href.split("?")[0].split("#")[0];
      if (
        pathname === targetPath &&
        !href.includes("?") &&
        !href.includes("#")
      ) {
        return;
      }

      const allowed = await authGuard(href);
      if (!allowed) return;

      // 토큰 선제 갱신 — fire-and-forget (v15, 2026-05-08).
      // 이전 v14 까지는 `await ensureFreshAccessToken()` 으로 동기 대기 → 느린 네트워크에서
      // 50~500ms 지연 → 사용자 보고 "버튼 클릭 후 2초+ 지연" 의 한 원인.
      // 401 발생 시점에 api-client.ts 의 singleton refresh promise 가 race condition 없이
      // 처리하므로 navigate 직전 동기 갱신 불필요. 실패해도 401 자동 재시도로 회복.
      void import("@/services/api-client")
        .then(({ ensureFreshAccessToken }) => ensureFreshAccessToken())
        .catch(() => {
          // 무시 — 401 시점 재시도 흐름이 처리
        });

      if (showSpinner) {
        // v18 (2026-05-22): 사용자 지시 — fullsize 팝업 단일화. message 인자 전달 금지.
        //   LoadingPuck 은 텍스트를 표시하지 않으므로 메시지 단계 변화 자체가 없음.
        startLoading("navigation");
      }

      cleanupBeforeNavigation(href);

      if (kind === "replace") {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router, pathname, startLoading, authGuard],
  );

  /**
   * String → 즉시 performRoute. Object → forward/onBack 등록 후 _nav 부착하여 performRoute.
   */
  const dispatch = useCallback(
    async <F, B>(
      arg: NavigateInput<F, B>,
      kind: "push" | "replace",
      options?: NavigateOptions,
    ) => {
      // String 형식 (legacy)
      if (typeof arg === "string") {
        return performRoute(arg, kind, options);
      }

      // Object 형식 (typed)
      if (isTypedNavigate<F, B>(arg)) {
        const { to, forward, onBack, ...navOpts } = arg;
        const parentId = getCurrentNavId() ?? undefined;
        const navId = pushNavEntry({
          forward,
          onBack: onBack
            ? (result: unknown) => onBack(result as B | undefined)
            : undefined,
          parentId,
        });
        const finalUrl = appendNavId(to, navId);
        return performRoute(finalUrl, kind, navOpts);
      }

      // 잘못된 인자 — 무시 (개발 환경에서 콘솔 경고)
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        devWarn("[useNavigation] 지원하지 않는 인자 형식:", arg);
      }
    },
    [performRoute],
  );

  const navigate = useCallback(
    <F = unknown, B = unknown>(
      arg: NavigateInput<F, B>,
      options?: NavigateOptions,
    ) => dispatch<F, B>(arg, "push", options),
    [dispatch],
  );

  const replace = useCallback(
    <F = unknown, B = unknown>(
      arg: NavigateInput<F, B>,
      options?: NavigateOptions,
    ) => dispatch<F, B>(arg, "replace", options),
    [dispatch],
  );

  const back = useCallback(
    <B = unknown>(options?: BackOptions<B>) => {
      const { showSpinner } = { ...DEFAULT_OPTIONS, ...options };

      // 결과 데이터가 있으면 현재 nav 엔트리에 큐잉 — popstate 핸들러가 onBack 발화 시 사용.
      if (options && "result" in options && options.result !== undefined) {
        setPendingBackward(getCurrentNavId(), options.result);
      }

      if (showSpinner) {
        // v18 (2026-05-22): 사용자 지시 — fullsize 팝업 단일화. message 인자 전달 금지.
        //   LoadingPuck 은 텍스트를 표시하지 않으므로 메시지 단계 변화 자체가 없음.
        startLoading("navigation");
      }
      router.back();
    },
    [router, startLoading],
  );

  const forward = useCallback(
    (options: NavigateOptions = {}) => {
      const { showSpinner } = { ...DEFAULT_OPTIONS, ...options };
      if (showSpinner) {
        // v18 (2026-05-22): 사용자 지시 — fullsize 팝업 단일화. message 인자 전달 금지.
        //   LoadingPuck 은 텍스트를 표시하지 않으므로 메시지 단계 변화 자체가 없음.
        startLoading("navigation");
      }
      router.forward();
    },
    [router, startLoading],
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return {
    navigate,
    replace,
    back,
    forward,
    refresh,
    pathname,
  };
}
