'use client';

import { useState, useCallback, useRef, useEffect, type RefObject } from 'react';

/**
 * usePullToRefresh - 모바일 Pull-to-Refresh 제스처 커스텀 훅
 *
 * coach, director, admin, parent, child, teen 6개 역할별 메인 대시보드에서
 * 공용으로 사용하는 당겨서 새로고침 제스처 훅. PULL_THRESHOLD(80px) 이상
 * 당기고 릴리스하면 onRefresh 실행.
 *
 * v2 (2026-04-22 SPEC_PULL_TO_REFRESH 수정본):
 *  · React onTouch* 핸들러 대신 mainRef 엘리먼트에 native addEventListener 등록.
 *    `{ passive: false }` 로 등록해야 당김 중일 때 `preventDefault()` 호출로
 *    iOS Safari / WebView 의 네이티브 bounce 스크롤을 차단할 수 있다.
 *    (React onTouchMove 는 React 17+ 에서 passive 로 등록되어 preventDefault 가
 *    무시되는 경우가 있어 제스처가 네이티브 스크롤에 먹히는 버그가 발생했다.)
 *  · dampingFactor 기본값 0.5 → 0.7 로 상향 (손가락 이동의 70% 반영 · 당김이
 *    부족하다는 피드백 반영).
 *  · maxDistance 120 → 160 상향.
 *  · scrollTop === 0 가드는 touchstart 와 touchmove 양쪽에서 수행하여
 *    중간에 스크롤이 일어나도 제스처를 안전하게 종료.
 *
 * @param onRefresh - 새로고침 시 실행할 비동기 함수
 * @param options.threshold - 새로고침 트리거 거리 (기본 80)
 * @param options.maxDistance - 최대 당기기 거리 (기본 160)
 * @param options.dampingFactor - 스크롤 감쇠 계수 (기본 0.7)
 */

interface UsePullToRefreshOptions {
  /** 새로고침 트리거 거리 (px) */
  threshold?: number;
  /** 최대 당기기 거리 (px) */
  maxDistance?: number;
  /** 스크롤 감쇠 계수 */
  dampingFactor?: number;
  /**
   * Pull-to-Refresh 비활성화 (기본 false).
   * `true` 일 때 touch listener 가 부착되지 않아 input/textarea 포커스 상태나
   * 폼 입력 페이지에서 의도치 않은 새로고침이 발생하지 않는다.
   *
   * 권장 사용 패턴 (2026-05-13, 이슈 D1):
   *   const [hasFocusInput, setHasFocusInput] = useState(false);
   *   const ptr = usePullToRefresh(onRefresh, { disabled: hasFocusInput });
   *   <input onFocus={() => setHasFocusInput(true)}
   *          onBlur={() => setHasFocusInput(false)} />
   *
   * 또는 단순히 form 페이지 전체 비활성:
   *   usePullToRefresh(onRefresh, { disabled: true })
   */
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  /** 스크롤 영역에 연결할 ref (native listener 가 부착된다) */
  mainRef: RefObject<HTMLElement | null>;
  /** 현재 당기기 거리 (UI 인디케이터용) */
  pullDistance: number;
  /** 새로고침 진행 중 여부 */
  isRefreshing: boolean;
  /**
   * Legacy React 핸들러 — 하위 호환용(사용 안 해도 훅이 native listener 로 동작).
   * 일부 테스트 또는 폴백 환경에서만 사용.
   */
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  /** 수동 새로고침 트리거 */
  handleRefresh: () => Promise<void>;
  /** PULL_THRESHOLD 값 (UI 인디케이터에서 비교용) */
  PULL_THRESHOLD: number;
}

export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  options?: UsePullToRefreshOptions,
): UsePullToRefreshReturn {
  const {
    threshold = 80,
    maxDistance = 160,
    dampingFactor = 0.7,
    disabled = false,
  } = options ?? {};

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // 최신값을 effect 내부에서 참조하기 위한 ref (effect 재등록 방지)
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);
  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefreshRef.current();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Native touch listener — passive: false 로 등록해 preventDefault 가능.
  useEffect(() => {
    // [2026-05-13 이슈 D1] disabled 옵션 즉시 단락 — form 입력 페이지에서
    //   2번째 input 포커스 시 의도치 않은 pull-to-refresh 발화 차단.
    if (disabled) {
      // disabled 전환 시 진행 중 상태 정리
      isPulling.current = false;
      if (pullDistanceRef.current !== 0) setPullDistance(0);
      return;
    }
    const el = mainRef.current;
    if (!el) return;

    // [2026-05-13 이슈 D1 보조 가드] touch 시작 지점이 form 입력 요소(또는 그 자손) 인 경우
    //   사용자가 키보드를 위로 밀어내는 의도가 아니라 다음 input 으로 이동/스크롤하는
    //   의도일 가능성이 높다. 해당 케이스에서도 pull-to-refresh 를 발화시키지 않는다.
    const isFormInputTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      // closest 로 input/textarea/select/contenteditable 자손까지 커버
      return !!target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
      );
    };

    // [2026-05-13 parent-common-designer 가드 보강] PTR 발화를 막아야 하는 영역을
    //   페이지 단위로 disabled prop 을 전달하지 않고도 DOM 측에 `data-disable-ptr` 속성으로
    //   선언할 수 있도록 한다. 폼/카메라/지도/캘린더 등 제스처 충돌 가능 영역에 적용.
    //   예) <section data-disable-ptr>...</section>
    //   주의: 본 가드는 보조 수단이며, 폼 페이지 전체는 여전히 훅 옵션 `disabled: true` 사용 권장.
    const isDisabledPtrRegion = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest('[data-disable-ptr]');
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      if (el.scrollTop > 0) return;
      if (isFormInputTarget(e.target)) return;
      if (isDisabledPtrRegion(e.target)) return;
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshingRef.current) return;
      // 중간에 스크롤이 발생해도 안전하게 종료.
      if (el.scrollTop > 0) {
        isPulling.current = false;
        setPullDistance(0);
        return;
      }
      const diff = e.touches[0].clientY - touchStartY.current;
      if (diff > 0) {
        // 아래로 당기는 제스처가 확정된 순간부터 네이티브 bounce / 부모 스크롤 차단.
        if (e.cancelable) e.preventDefault();
        const dist = Math.min(diff * dampingFactor, maxDistance);
        setPullDistance(dist);
      } else {
        // 위로 스크롤 복귀는 정상 스크롤에 위임.
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      if (pullDistanceRef.current >= threshold && !isRefreshingRef.current) {
        handleRefresh();
      }
      setPullDistance(0);
      touchStartY.current = 0;
    };

    const handleTouchCancel = () => {
      isPulling.current = false;
      setPullDistance(0);
      touchStartY.current = 0;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [dampingFactor, maxDistance, threshold, handleRefresh, disabled]);

  // Legacy React 핸들러 — 하위 호환용 no-op (native listener 가 이미 처리).
  // 기존 페이지들이 <main onTouchStart={onTouchStart} ...> 를 유지해도 충돌 없이 동작.
  const onTouchStart = useCallback((_e: React.TouchEvent) => {}, []);
  const onTouchMove = useCallback((_e: React.TouchEvent) => {}, []);
  const onTouchEnd = useCallback(() => {}, []);

  return {
    mainRef,
    pullDistance,
    isRefreshing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    handleRefresh,
    PULL_THRESHOLD: threshold,
  };
}
