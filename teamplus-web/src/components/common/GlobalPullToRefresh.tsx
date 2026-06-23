'use client';

/**
 * GlobalPullToRefresh — 전역 당겨서 새로고침 (2026-06-04)
 *
 * 모든 페이지에서 스크롤 컨테이너 최상단을 아래로 당기면 `location.reload()`.
 * web 은 페이지마다 자체 `<main className="overflow-y-auto">` 가 스크롤 컨테이너이므로
 * (body 가 아님) document 레벨 touch 리스너로 동작 대상 컨테이너를 동적으로 찾는다.
 *
 * 가드:
 *  · 입력 포커스(input/textarea/select/contenteditable) 중 → 비활성 (의도치 않은 새로고침 방지)
 *  · `[data-ptr-self]`(자체 PTR 페이지: child/teen 등) · `[data-no-ptr]` 영역 → skip
 *  · 스크롤 컨테이너 scrollTop > 0 (최상단 아님) → skip
 *  · 멀티터치(핀치/줌) → skip
 *
 * 새로고침 동작은 사용자 지시(2026-06-04)에 따라 전체 새로고침(location.reload) 으로 통일.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { isNativeApp } from '@/lib/environment';

const THRESHOLD = 80; // 새로고침 트리거 거리(px)
const MAX_DISTANCE = 140; // 최대 당김 거리(px)
const DAMPING = 0.5; // 감쇠 계수

/** target 에서 가장 가까운 세로 스크롤 컨테이너를 찾는다 (없으면 null). */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function GlobalPullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // 리스너를 mount 시 1회만 등록하고 effect 내부에서 최신값을 ref 로 참조.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // [2026-06-05] 네이티브(Flutter WebView)에서는 비활성화 — Flutter 가 자체 네이티브
    //   PullToRefreshController(당기면 webViewController.reload())를 제공한다.
    //   web JS PTR 이 touchmove 를 preventDefault 로 가로채면 네이티브 PTR 제스처
    //   (SwipeRefreshLayout/UIRefreshControl)가 발동하지 못하므로, 브라우저 환경에서만 동작.
    if (isNativeApp()) return;

    const setPullBoth = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;

      const targetEl = e.target as HTMLElement | null;
      if (!targetEl) return;

      // 입력 포커스 중에는 비활성
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) ||
          active.isContentEditable)
      ) {
        return;
      }

      // 자체 PTR 페이지 · opt-out 영역 skip
      if (targetEl.closest('[data-ptr-self], [data-no-ptr]')) return;

      const sc = findScrollableAncestor(targetEl);
      // 스크롤 컨테이너가 최상단이 아니면(이미 내려가 있으면) 일반 스크롤로 둔다
      if (sc && sc.scrollTop > 0) return;

      containerRef.current = sc;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;

      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        if (pullRef.current !== 0) setPullBoth(0);
        return;
      }
      // 당기는 도중 컨테이너가 스크롤되었으면 취소
      if (containerRef.current && containerRef.current.scrollTop > 0) {
        pullingRef.current = false;
        setPullBoth(0);
        return;
      }
      const distance = Math.min(MAX_DISTANCE, dy * DAMPING);
      setPullBoth(distance);
      // 당기는 동안 네이티브 오버스크롤/스크롤 억제
      if (distance > 4 && e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;

      if (pullRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullBoth(THRESHOLD);
        // 인디케이터를 잠깐 보여준 뒤 전체 새로고침
        window.setTimeout(() => {
          window.location.reload();
        }, 180);
      } else {
        setPullBoth(0);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);
  const reached = pull >= THRESHOLD;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translateY(${(refreshing ? THRESHOLD : pull) - 44}px)`,
        opacity: visible ? 1 : 0,
        transition: pullingRef.current ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
      }}
    >
      <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-w-pill border border-wline bg-wsurface shadow-sh-2 dark:border-rink-700 dark:bg-rink-800">
        {refreshing ? (
          <span className="block h-5 w-5 animate-spin rounded-full border-2 border-wline-2 border-t-ice-500 dark:border-rink-600 dark:border-t-ice-400" />
        ) : (
          <Icon
            name="refresh"
            className={reached ? 'text-ice-500' : 'text-wtext-3 dark:text-rink-400'}
            style={{
              transform: `rotate(${progress * 270}deg)`,
              transition: 'transform 0.05s linear',
            }}
          />
        )}
      </div>
    </div>
  );
}
