"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeApp } from "@/lib/environment";

/**
 * AndroidScrollGeometryFix — Android WebView 스크롤 범위 잔존 버그 워크어라운드.
 *
 * Android WebView(flutter_inappwebview)에서 SPA 라우트 전환 시 새 페이지의
 * 스크롤 컨테이너(`[data-mobile-shell] > main`)가 이전 페이지의 scrollHeight 를
 * 물려받은 채 갱신하지 않는 버그가 있다. DOM/CSS 는 정상인데 scrollHeight 만
 * 실제 콘텐츠보다 수백~수천 px 크게 잡혀, 콘텐츠가 전부 화면 밖으로 나갈 만큼
 * 빈 영역이 스크롤되는 증상으로 나타난다 (DevTools attach 나 overflow 토글 등
 * 전체 재계산이 일어나면 즉시 정상화됨 — 실기기 계측으로 확인).
 *
 * 대응: 라우트 전환 후 스크롤 컨테이너가 나타나면 overflow 토글 → 강제 reflow 로
 * 스크롤 지오메트리 재계산을 1회(+ 지연 콘텐츠 대비 1회 추가) 강제한다.
 * Android 네이티브 앱 환경에서만 동작하며 웹 브라우저에는 영향이 없다.
 */

const SCROLLER_SELECTOR =
  '[data-mobile-shell] > main, [data-mobile-shell] > [class*="overflow-y-auto"]';

/** 스크롤러 탐색 최대 대기 시간 — 데이터 로딩 페이지(usePageReady)가 main 을 늦게 그린다 */
const SCROLLER_WAIT_DEADLINE_MS = 5000;

/** 늦게 붙는 콘텐츠(지연 fetch/이미지) 대비 2차 재계산 지연 */
const SECOND_PASS_DELAY_MS = 700;

function isAndroidNative(): boolean {
  if (typeof document === "undefined" || !isNativeApp()) return false;
  const platform = document.documentElement.dataset.nativePlatform;
  if (platform) return platform === "android";
  return /android/i.test(navigator.userAgent);
}

function forceScrollGeometryReflow(el: HTMLElement) {
  const prevScrollTop = el.scrollTop;
  const prevOverflow = el.style.overflow;
  el.style.overflow = "hidden";
  void el.offsetHeight; // 동기 reflow 강제 — 이 시점에 스크롤 범위가 재계산된다
  el.style.overflow = prevOverflow;
  if (prevScrollTop) el.scrollTop = prevScrollTop;
}

function fixAllScrollers() {
  document
    .querySelectorAll<HTMLElement>(SCROLLER_SELECTOR)
    .forEach(forceScrollGeometryReflow);
}

export function AndroidScrollGeometryFix() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isAndroidNative()) return;

    let cancelled = false;
    let rafId = 0;
    let timerId = 0;
    const deadline = performance.now() + SCROLLER_WAIT_DEADLINE_MS;

    const waitForScroller = () => {
      if (cancelled) return;
      if (!document.querySelector(SCROLLER_SELECTOR)) {
        if (performance.now() < deadline) {
          rafId = requestAnimationFrame(waitForScroller);
        }
        return;
      }
      // double RAF — 첫 paint 커밋 이후에 재계산해야 stale 값이 확실히 교체된다
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          if (cancelled) return;
          fixAllScrollers();
          timerId = window.setTimeout(() => {
            if (!cancelled) fixAllScrollers();
          }, SECOND_PASS_DELAY_MS);
        });
      });
    };

    rafId = requestAnimationFrame(waitForScroller);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [pathname]);

  return null;
}

export default AndroidScrollGeometryFix;
