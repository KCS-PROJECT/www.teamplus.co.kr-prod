"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeApp } from "@/lib/environment";
import { ui as nativeUI } from "@/services/native-bridge";
import { resolveAppStatusVisibility } from "@/lib/app-status";

/**
 * AppStatusController — 네이티브 상단 상태바(AppStatus) 노출을 **한 곳에서** 보장한다.
 *
 * 배경(회귀):
 *   페이지 전환마다 LoadingContext 가 `ui.startLoading()` / `ui.enterFullscreen()` 으로
 *   상태바를 끄지만(webview_screen.dart), 로딩 종료 시 Flutter 는 상태바를 **자동
 *   복원하지 않는다**(정책 — 페이지의 `showStatusBar:true` 재전송에 의존).
 *   `useNativeUI` 를 호출하지 않는 페이지(목록·관리 페이지 다수)는 복원 신호가 없어
 *   실기기에서 상태바가 **영영 숨겨지는** 회귀가 있었다.
 *
 * 해결:
 *   경로(pathname) 변경마다 정책(`resolveAppStatusVisibility`)에 따라 `ui.setConfig` 로
 *   상태바 노출을 재확정한다. 로딩 중에는 native-bridge-ui 의 `_isFullscreenActive`
 *   가드가 `setConfig` 의 `showStatusBar:true` 를 막으므로(로딩 화면 깨끗하게 유지),
 *   로딩 종료 후를 겨냥해 여러 시점에 재적용한다(useNativeUI 의 400/800ms 안전망과 동일 사상).
 *
 * 정책 매핑:
 *   - "hide" : 인증 화면 그룹(login/signup/find-id/find-password) → 상태바 숨김.
 *   - "skip" : splash/onboarding → 관여하지 않음(네이티브 splash 제어 보존).
 *   - "show" : 그 외 전부 → 상태바 표시.
 *
 * 페이지가 자체 `useNativeUI({showStatusBar})` / `useFullscreen()` 을 호출하면 동일
 * `setConfig` 경로로 함께 적용되며(idempotent), 풀스크린 의도 페이지(갤러리 뷰어 등)는
 * 자신의 `useFullscreen` 이 우선한다. 상태바 외 AppBar/BottomNav 설정은 건드리지 않는다
 * (부분 UIConfig — showStatusBar 키만 전송).
 */
// [appstatus-fix F2] 가드-존중 재적용 시점. 이들은 `setConfig` 경로라 로딩 중
//   (_isFullscreenActive=true)이면 자동으로 showStatusBar:false 로 다운그레이드되어
//   **로더 위로 상태바를 절대 노출하지 않는다**. 로드 완료(가드 해제) 직후 통과되어
//   느린 로드(2~5s) 케이스의 상태바를 빠르게 복원하도록 3000/4000ms 까지 확장한다.
const REAPPLY_DELAYS_MS = [400, 1000, 2000, 3000, 4000];

// [appstatus-fix F2] 가드-**우회** force-show 시점 — **로더 실제 unmount 상한 이후**.
//   ⚠️ 정정(reviewer-fe): LoadingContext MAX_WAIT(5000ms)는 hide 를 *시작*만 한다.
//   실제 PageTransitionLoader unmount 는 MAX_WAIT(5000) + FONTS_READY_TIMEOUT(1500) +
//   2 RAF + FADE_OUT_DURATION(300) = **≈6832ms** 뒤다(LoadingContext.tsx:215-216·411).
//   따라서 5200ms force-show 는 stuck 페이지에서 로더가 아직 보이는 5000~6832ms 구간에
//   상태바를 켜는 회귀였다. 이를 unmount 상한 너머인 7000ms 로 상향해 로더 위 노출을
//   원천 차단한다. 동시에 MAX_WAIT 페일세이프(LoadingContext.tsx:709-715)가
//   `hideLoadingAfterNextPaint({syncNative:true})`로 ~6832ms 에 상태바를 이미 정상
//   복원하므로, 이 force-show 는 그 복원마저 실패한 경우의 **3차 백스톱**이다(FM1/FM2).
const FORCE_SHOW_DELAYS_MS = [7000];

export function AppStatusController(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeApp()) return;

    const visibility = resolveAppStatusVisibility(pathname);
    if (visibility === "skip") return;

    const showStatusBar = visibility === "show";
    const apply = () => {
      void nativeUI.setConfig({ showStatusBar }).catch(() => {});
    };

    apply();
    const timers = REAPPLY_DELAYS_MS.map((delay) => setTimeout(apply, delay));

    // [appstatus-fix F2] 표시 정책("show")일 때만 가드-우회 force-show 추가.
    //   숨김 정책("hide")은 force-show 하지 않아 정당한 숨김을 보존한다.
    //   forceShowStatusBar 는 _isFullscreenActive 가드를 무시하므로, 어떤 이유로든
    //   가드가 고착되어 있어도 비풀스크린 라우트는 유한 시간 내 상태바가 복원된다.
    if (showStatusBar) {
      const forceShow = () => {
        void nativeUI.forceShowStatusBar().catch(() => {});
      };
      for (const delay of FORCE_SHOW_DELAYS_MS) {
        timers.push(setTimeout(forceShow, delay));
      }
    }

    return () => timers.forEach((t) => clearTimeout(t));
  }, [pathname]);

  return null;
}

export default AppStatusController;
