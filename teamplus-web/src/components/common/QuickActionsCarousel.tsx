'use client';

/**
 * QuickActionsCarousel
 * ─────────────────────────────────────────────────────────
 * 역할별 메인 대시보드의 "바로가기" 카드 영역을 iOS 네이티브 느낌의
 * 좌우 스와이프 캐러셀로 표시한다.
 *
 * 패턴: `/child`의 "내 기록"(`SwipeStatCards`)과 동일한 스냅/도트 구조를 따른다.
 *   - 개별 카드 단위 스냅 (페이지 단위가 아닌 카드 한 장씩 이동)
 *   - 고정 카드 너비 + 12~14px gap → 한 번에 1.5~2장 + 다음 카드 peek
 *   - 하단 도트 페이지네이션 (w-5 ↔ w-1.5 토글, SwipeIndicator 스타일)
 *
 * 핵심 동작
 *   1. 터치/마우스/키보드(←/→/Home/End) 모두 지원
 *   2. iOS 표준 이징 `cubic-bezier(0.32, 0.72, 0, 1)`
 *   3. Velocity 기반 throw — 빠르게 튕기면 다음 카드, 매우 빠르면 2칸 점프
 *   4. Rubber band overscroll — 끝 카드를 넘어가면 0.4x 저항
 *   5. 가로/세로 축 락 — 세로 스크롤 동작 보존 (axis-lock)
 *   6. ARIA carousel 패턴 + tablist 도트 인디케이터
 *   7. 다크모드 / `variant="child"` (WCAG AAA 큰 터치 영역)
 *   8. 페이지 변경 시 햅틱 피드백 + sr-only 상태 알림
 *
 * 접근성 (WCAG 2.1 AA / 아동 화면 AAA)
 *   - `prefers-reduced-motion: reduce` → 모든 트랜지션 즉시 전환 (WCAG 2.3.3)
 *   - `aria-roledescription="carousel" / "slide"` 표준 패턴
 *   - `aria-live="polite"` + sr-only 상태 텍스트로 SR 사용자에게 변경 안내
 *   - 키보드(←/→/Home/End)로 카드 탐색 가능
 *   - child variant: 7:1 대비율 + 최소 128px 터치 영역 (WCAG AAA)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────────
export interface QuickActionItem {
  icon: string;
  label: string;
  href: string;
  /** Tailwind 컬러 클래스 (예: 'text-indigo-500') */
  iconColor: string;
  /** 아이콘 옆 빨간 알림 dot 표시 */
  showDot?: boolean;
  /**
   * 클릭 시 navigate 대신 호출할 콜백. 지정 시 NavLink → button 으로 렌더.
   * "전체보기" 타일이 GlobalMenu drawer 를 여는 경우 등에 사용.
   */
  onClick?: () => void;
}

export interface QuickActionsCarouselProps {
  /** 표시할 액션 카드 배열 */
  actions: QuickActionItem[];
  /** 'child' 사용 시 WCAG AAA 큰 터치 영역 + 큰 폰트 */
  variant?: 'default' | 'child';
  /** 캐러셀 ARIA 라벨 */
  ariaLabel?: string;
  /**
   * 한 번에 노출할 카드 최대 개수. 초과분은 마지막 "전체보기" 타일로 접힘.
   * Hick's Law 대응 — DIRECTOR(11개→5개), CHILD(6개→3개) 등 인지 부하 축소.
   */
  maxVisible?: number;
  /**
   * maxVisible 초과 시 나타나는 "전체보기" 타일 href.
   * 기본: '/menu'
   */
  overflowHref?: string;
  /**
   * "전체보기" 타일 라벨 텍스트. 기본: '전체보기'
   */
  overflowLabel?: string;
  /**
   * 지정 시 "전체보기" 타일 클릭 → navigate 대신 이 콜백 호출.
   * GlobalMenu drawer 등 모달 열기에 사용 (사용자 요청 2026-04-29).
   */
  onOverflowClick?: () => void;
}

// ────────────────────────────────────────────────────────────────
// 상수 — iOS 네이티브 캐러셀 튜닝값
// ────────────────────────────────────────────────────────────────
/** iOS 표준 ease curve (UIScrollView 시뮬레이션) */
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** 카드 스냅 애니메이션 길이 */
const SNAP_DURATION_MS = 380;
/** 손가락 throw 속도 임계값 (px/ms) */
const VELOCITY_THRESHOLD = 0.45;
/** 매우 빠른 throw → 2칸 점프 임계값 */
const FAST_THROW_THRESHOLD = 1.4;
/** 카드 너비 대비 드래그 비율 임계값 (20%) */
const DRAG_RATIO_THRESHOLD = 0.2;
/** 가로/세로 축 락 결정 픽셀 임계값 */
const AXIS_LOCK_PX = 6;
/** 끝 카드 overscroll 저항 계수 (0~1, 작을수록 저항 강함) */
const RUBBER_BAND_RESISTANCE = 0.4;

/** variant별 카드 너비 (px) — 1.5~2장 가시 + 다음 카드 peek */
const CARD_WIDTH = {
  default: 164,
  child: 184,
} as const;
/** variant별 카드 간격 (px) */
const CARD_GAP = {
  default: 12,
  child: 14,
} as const;

// ────────────────────────────────────────────────────────────────
// prefers-reduced-motion 감지 (WCAG 2.3.3)
// ────────────────────────────────────────────────────────────────
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    // Safari < 14 fallback
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return reduced;
}

// ────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────────
export function QuickActionsCarousel({
  actions: actionsProp,
  variant = 'default',
  ariaLabel = '바로가기 캐러셀',
  maxVisible,
  overflowHref = '/menu',
  overflowLabel = '전체보기',
  onOverflowClick,
}: QuickActionsCarouselProps) {
  // maxVisible 적용 — 초과 시 마지막에 "전체보기" 타일 추가
  const actions = useMemo<QuickActionItem[]>(() => {
    if (!maxVisible || actionsProp.length <= maxVisible) return actionsProp;
    const visible = actionsProp.slice(0, maxVisible);
    const overflowItem: QuickActionItem = {
      icon: 'more_horiz',
      label: overflowLabel,
      href: overflowHref,
      iconColor: 'text-wtext-2 dark:text-rink-100',
      // [추가 2026-04-29] onOverflowClick 지정 시 navigate 대신 콜백 실행 (GlobalMenu 열기)
      onClick: onOverflowClick,
    };
    return [...visible, overflowItem];
  }, [actionsProp, maxVisible, overflowHref, overflowLabel, onOverflowClick]);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  const cardWidth = CARD_WIDTH[variant];
  const gap = CARD_GAP[variant];
  const stepWidth = cardWidth + gap; // 한 카드 + 간격 = 1칸 이동량

  // 드래그 ref (re-render 회피)
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);
  const currentTranslateX = useRef(0);
  const prevTranslateX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);

  const totalCards = actions.length;
  const swipeable = totalCards > 1;

  // 카드 스냅 (개별 카드 단위, 내기록/SwipeStatCards 패턴)
  // prefers-reduced-motion: reduce → 사용자 의사 존중하여 즉시 전환
  // 카드가 실제로 바뀌었을 때만 짧은 햅틱 피드백 (iPhone 네이티브 감각)
  const snapToIndex = useCallback(
    (index: number, animate = true) => {
      const clamped = Math.max(0, Math.min(index, totalCards - 1));
      const changed = clamped !== currentIndex;
      setCurrentIndex(clamped);
      const offset = -clamped * stepWidth;
      currentTranslateX.current = offset;
      prevTranslateX.current = offset;
      if (trackRef.current) {
        trackRef.current.style.transition =
          animate && !prefersReducedMotion
            ? `transform ${SNAP_DURATION_MS}ms ${IOS_EASE}`
            : 'none';
        trackRef.current.style.transform = `translateX(${offset}px)`;
      }

      // Haptic feedback (지원하는 모바일 디바이스에서 8ms 짧은 진동)
      if (
        animate &&
        changed &&
        !prefersReducedMotion &&
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        try {
          navigator.vibrate(8);
        } catch {
          /* 일부 브라우저는 user gesture 외 vibrate 거부 — 무시 */
        }
      }
    },
    [totalCards, currentIndex, stepWidth, prefersReducedMotion],
  );

  const setPosition = useCallback((x: number) => {
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translateX(${x}px)`;
    }
  }, []);

  // 카드 개수/variant 변경 시 현재 인덱스 위치 재정렬
  useEffect(() => {
    snapToIndex(currentIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardWidth, gap, totalCards]);

  // ── 드래그 핸들러 ──────────────────────────────
  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!swipeable) return;
      isDragging.current = true;
      isHorizontal.current = null;
      startX.current = clientX;
      startY.current = clientY;
      lastX.current = clientX;
      lastTime.current = Date.now();
      velocity.current = 0;
      prevTranslateX.current = currentTranslateX.current;
    },
    [swipeable],
  );

  const handleDragMove = useCallback(
    (clientX: number) => {
      if (!isDragging.current || !swipeable) return;

      const now = Date.now();
      const dt = now - lastTime.current;
      if (dt > 0) {
        velocity.current = (clientX - lastX.current) / dt;
      }
      lastX.current = clientX;
      lastTime.current = now;

      const diff = clientX - startX.current;
      const tentative = prevTranslateX.current + diff;
      const maxOffset = 0;
      const minOffset = -(totalCards - 1) * stepWidth;

      // iOS rubber band — 끝 카드를 넘어가면 0.4x 저항으로 감속
      let final = tentative;
      if (tentative > maxOffset) {
        final = maxOffset + (tentative - maxOffset) * RUBBER_BAND_RESISTANCE;
      } else if (tentative < minOffset) {
        final = minOffset + (tentative - minOffset) * RUBBER_BAND_RESISTANCE;
      }
      currentTranslateX.current = final;
      setPosition(final);
    },
    [swipeable, totalCards, stepWidth, setPosition],
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current || !swipeable) return;
    isDragging.current = false;

    const movedBy = currentTranslateX.current - prevTranslateX.current;
    const v = velocity.current;
    const dragThresholdPx = cardWidth * DRAG_RATIO_THRESHOLD;
    let nextIndex = currentIndex;

    // 1) 속도 또는 거리 기반 1칸 이동
    if (v < -VELOCITY_THRESHOLD || movedBy < -dragThresholdPx) {
      nextIndex = currentIndex + 1;
    } else if (v > VELOCITY_THRESHOLD || movedBy > dragThresholdPx) {
      nextIndex = currentIndex - 1;
    }

    // 2) 매우 빠른 throw → 2칸 점프
    if (Math.abs(v) > FAST_THROW_THRESHOLD) {
      nextIndex = v < 0 ? currentIndex + 2 : currentIndex - 2;
    }

    snapToIndex(nextIndex);
  }, [currentIndex, swipeable, cardWidth, snapToIndex]);

  // ── Touch / Mouse 이벤트 바인딩 ───────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !swipeable) return;

    const onTouchStart = (e: TouchEvent) =>
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      const dx = Math.abs(cx - startX.current);
      const dy = Math.abs(cy - startY.current);

      // 첫 움직임에서 가로/세로 락 결정
      if (isHorizontal.current === null) {
        if (dx > AXIS_LOCK_PX || dy > AXIS_LOCK_PX) {
          if (dx > dy) {
            isHorizontal.current = true;
          } else {
            // 세로 스크롤 의도 → 캐러셀 드래그 취소
            isHorizontal.current = false;
            isDragging.current = false;
            return;
          }
        } else {
          return;
        }
      }

      if (!isHorizontal.current) return;
      // 이미 스크롤이 시작되어 cancelable=false인 경우 Intervention 경고 방지
      if (e.cancelable) e.preventDefault();
      handleDragMove(cx);
    };

    const onTouchEnd = () => handleDragEnd();
    const onTouchCancel = () => {
      isDragging.current = false;
      snapToIndex(currentIndex);
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientX, e.clientY);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchCancel);
    container.addEventListener('mousedown', onMouseDown);

    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const onMouseUp = () => handleDragEnd();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchCancel);
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleDragStart, handleDragMove, handleDragEnd, swipeable, currentIndex, snapToIndex]);

  // ── 키보드 네비게이션 ─────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!swipeable) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        snapToIndex(currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        snapToIndex(currentIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        snapToIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        snapToIndex(totalCards - 1);
      }
    },
    [currentIndex, totalCards, snapToIndex, swipeable],
  );

  // sr-only 페이지 상태 텍스트 (aria-live 대상)
  const liveStatus = useMemo(() => {
    if (!swipeable || !actions[currentIndex]) return '';
    return `${totalCards}개 카드 중 ${currentIndex + 1}번째 "${actions[currentIndex].label}" 표시 중`;
  }, [actions, currentIndex, totalCards, swipeable]);

  if (actions.length === 0) return null;

  const isChild = variant === 'child';

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={swipeable ? 0 : -1}
      onKeyDown={handleKeyDown}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 rounded-2xl"
    >
      <div
        ref={containerRef}
        className={cn(
          'overflow-hidden px-5',
          swipeable && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <div
          ref={trackRef}
          className="flex will-change-transform select-none touch-pan-y"
          style={{ gap: `${gap}px`, transform: 'translateX(0px)' }}
          aria-live="polite"
        >
          {actions.map((action, idx) => (
            <div
              key={`${action.label}-${action.href}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${idx + 1} / ${totalCards}: ${action.label}`}
              aria-hidden={idx !== currentIndex}
              className="shrink-0"
              style={{ width: `${cardWidth}px` }}
            >
              <CarouselQuickAction {...action} variant={variant} />
            </div>
          ))}
        </div>
      </div>

      {swipeable && (
        <>
          {/* 페이지네이션 도트 (SwipeStatCards/SwipeIndicator 동일 스타일) */}
          <div
            className="flex justify-center items-center gap-1.5 mt-3"
            role="tablist"
            aria-label="카드 탐색"
          >
            {actions.map((action, i) => (
              <button
                key={`${action.label}-dot-${i}`}
                type="button"
                onClick={() => snapToIndex(i)}
                role="tab"
                aria-selected={i === currentIndex}
                aria-label={`${action.label} 카드로 이동`}
                className={cn(
                  'rounded-full transition-all duration-300 ease-out motion-reduce:transition-none',
                  isChild ? 'h-2' : 'h-1.5',
                  i === currentIndex
                    ? cn(isChild ? 'w-6' : 'w-5', 'bg-ice-500 dark:bg-blue-500')
                    : cn(
                        isChild ? 'w-2' : 'w-1.5',
                        'bg-wline dark:bg-rink-500 hover:bg-wtext-4 dark:hover:bg-wbg0',
                      ),
                )}
              />
            ))}
          </div>
          {/* 스크린 리더 전용 상태 알림 (aria-live polite) */}
          <span className="sr-only" role="status" aria-live="polite">
            {liveStatus}
          </span>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// CarouselQuickAction — 캐러셀 내부 카드
// ────────────────────────────────────────────────────────────────
function CarouselQuickAction({
  icon,
  label,
  href,
  iconColor,
  showDot,
  onClick,
  variant,
}: QuickActionItem & { variant: 'default' | 'child' }) {
  const isChild = variant === 'child';
  const cardInner = (
    <div
      className={cn(
        // hover 효과 제거 — active(터치/클릭 시) 피드백만 유지
        'flex flex-col items-center justify-center gap-3 rounded-2xl bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sm active:brightness-95',
        isChild ? 'min-h-[140px] p-6' : 'min-h-[128px] p-5',
      )}
    >
      <div className={cn('flex items-center justify-center', iconColor)}>
        <Icon
          name={icon}
          className={isChild ? 'text-[48px]' : 'text-[40px]'}
          filled
          weight={300}
          size={isChild ? 48 : 40}
          aria-hidden="true"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'font-bold text-wtext-1 dark:text-rink-100',
            isChild ? 'text-[20px]' : 'text-[17px]',
          )}
        >
          {label}
        </span>
        {showDot && (
          <span
            className="w-2 h-2 rounded-full bg-red-500 shrink-0"
            aria-label="새 알림"
          />
        )}
      </div>
    </div>
  );

  // [수정 2026-04-29] onClick 지정 시 button 으로 렌더 (GlobalMenu drawer 등 모달 트리거)
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="block w-full text-left"
      >
        {cardInner}
      </button>
    );
  }
  return (
    <NavLink href={href} aria-label={label} className="block">
      {cardInner}
    </NavLink>
  );
}
