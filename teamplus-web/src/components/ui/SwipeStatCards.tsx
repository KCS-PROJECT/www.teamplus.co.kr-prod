'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';

export interface StatCardItem {
  icon: string;
  label: string;
  value: number;
  suffix: string;
  iconBg: string;
  iconColor: string;
  alert?: boolean;
  emoji?: string;
  /**
   * 선택적 — 카드 클릭 시 이동할 URL. 지정 시 카드 전체가 링크처럼 작동.
   * (예: TEEN 순위 카드 → '#ranking' 앵커 스크롤)
   */
  href?: string;
  /**
   * 선택적 — 카드 클릭 콜백. href 와 동시에 지정 가능.
   * 스와이프 드래그 중에는 호출되지 않는다 (click 이벤트 suppression).
   */
  onClick?: () => void;
}

interface SwipeStatCardsProps {
  cards: StatCardItem[];
  isAnimated: boolean;
  ariaLabel?: string;
  variant?: 'default' | 'child';
}

export function SwipeStatCards({
  cards,
  isAnimated,
  ariaLabel = '통계 카드',
  variant = 'default',
}: SwipeStatCardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);
  const currentTranslateX = useRef(0);
  const prevTranslateX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);

  const cardWidth = 200;
  const gap = 12;

  // 드래그 여부 추적 — 클릭 이벤트와 스와이프 충돌 방지
  const dragDistance = useRef(0);

  // 카드 클릭 핸들러 — 드래그 직후 우발적 클릭 억제 (8px 이상 이동 시 suppress)
  const handleCardClick = useCallback(
    (card: StatCardItem) => {
      if (dragDistance.current > 8) return;
      if (card.href) {
        if (card.href.startsWith('#')) {
          const target = document.querySelector(card.href);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.location.href = card.href;
        }
      }
      card.onClick?.();
    },
    [],
  );

  const snapToIndex = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, cards.length - 1));
      setCurrentIndex(clampedIndex);
      const offset = -clampedIndex * (cardWidth + gap);
      currentTranslateX.current = offset;
      prevTranslateX.current = offset;
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 250ms cubic-bezier(0.25, 1, 0.5, 1)';
        trackRef.current.style.transform = `translateX(${offset}px)`;
      }
    },
    [cards.length],
  );

  const setPosition = useCallback((x: number) => {
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translateX(${x}px)`;
    }
  }, []);

  const handleDragStart = useCallback((clientX: number, clientY?: number) => {
    isDragging.current = true;
    isHorizontal.current = null;
    startX.current = clientX;
    startY.current = clientY ?? 0;
    lastX.current = clientX;
    lastTime.current = Date.now();
    velocity.current = 0;
    prevTranslateX.current = currentTranslateX.current;
    dragDistance.current = 0; // 드래그 거리 초기화
  }, []);

  const handleDragMove = useCallback(
    (clientX: number) => {
      if (!isDragging.current) return;

      const now = Date.now();
      const dt = now - lastTime.current;
      if (dt > 0) {
        velocity.current = (clientX - lastX.current) / dt;
      }
      lastX.current = clientX;
      lastTime.current = now;

      const diff = clientX - startX.current;
      dragDistance.current = Math.abs(diff);
      currentTranslateX.current = prevTranslateX.current + diff;
      setPosition(currentTranslateX.current);
    },
    [setPosition],
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const movedBy = currentTranslateX.current - prevTranslateX.current;
    const v = velocity.current;
    const threshold = cardWidth * 0.15;

    // 속도 기반 스냅: 빠르게 스와이프하면 작은 이동으로도 다음 카드로
    const velocityThreshold = 0.3;
    let nextIndex = currentIndex;

    if (v < -velocityThreshold || movedBy < -threshold) {
      nextIndex = currentIndex + 1;
    } else if (v > velocityThreshold || movedBy > threshold) {
      nextIndex = currentIndex - 1;
    }

    // 빠른 스와이프 시 2칸 이동 허용
    if (Math.abs(v) > 1.0) {
      const jump = Math.abs(v) > 1.5 ? 2 : 1;
      nextIndex = v < 0 ? currentIndex + jump : currentIndex - jump;
    }

    snapToIndex(nextIndex);
  }, [currentIndex, snapToIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) =>
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const dx = Math.abs(e.touches[0].clientX - startX.current);
      const dy = Math.abs(e.touches[0].clientY - startY.current);
      // 방향 미결정 → 첫 움직임으로 판단
      if (isHorizontal.current === null) {
        if (dx > dy) {
          isHorizontal.current = true;
        } else {
          isHorizontal.current = false;
          isDragging.current = false; // 세로 스크롤 → 드래그 취소
          return;
        }
      }
      if (!isHorizontal.current) return;
      // 이미 스크롤이 시작되어 cancelable=false인 경우 Intervention 경고 방지
      if (e.cancelable) e.preventDefault();
      handleDragMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => handleDragEnd();
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientX);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('mousedown', onMouseDown);

    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const onMouseUp = () => handleDragEnd();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleDragStart, handleDragMove, handleDragEnd]);

  return (
    <div className="relative" role="region" aria-label={ariaLabel}>
      <div ref={containerRef} className="overflow-hidden px-5 cursor-grab active:cursor-grabbing">
        <div
          ref={trackRef}
          className="flex gap-3 will-change-transform select-none"
          style={{ transform: 'translateX(0px)' }}
          aria-live="polite"
        >
          {cards.map((card) =>
            variant === 'child' ? (
              <article
                key={card.label}
                className={`flex-shrink-0 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700 ${(card.href || card.onClick) ? 'cursor-pointer active:brightness-95 transition-colors' : ''}`}
                style={{ width: `${cardWidth}px` }}
                aria-label={`${card.label}: ${card.value}${card.suffix}`}
                role={card.href || card.onClick ? 'button' : undefined}
                tabIndex={card.href || card.onClick ? 0 : undefined}
                onClick={() => handleCardClick(card)}
                onKeyDown={(e) => {
                  if ((card.href || card.onClick) && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleCardClick(card);
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}
                  >
                    <Icon
                      name={card.icon}
                      className={`text-xl ${card.iconColor}`}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="text-base font-bold text-wtext-3 dark:text-rink-300">
                    {card.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-wtext-1 dark:text-white tabular-nums">
                    {isAnimated ? <CountUp end={card.value} duration={1500} /> : 0}
                  </span>
                  <span className="text-lg font-bold text-wtext-3 dark:text-rink-300">
                    {card.suffix}
                  </span>
                  {card.emoji && <span className="text-2xl ml-1">{card.emoji}</span>}
                </div>
              </article>
            ) : (
              <article
                key={card.label}
                className={`flex-shrink-0 bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700 active:brightness-95 transition-colors ${(card.href || card.onClick) ? 'cursor-pointer' : ''}`}
                style={{ width: `${cardWidth}px` }}
                aria-label={`${card.label}: ${card.value}${card.suffix}`}
                role={card.href || card.onClick ? 'button' : undefined}
                tabIndex={card.href || card.onClick ? 0 : undefined}
                onClick={() => handleCardClick(card)}
                onKeyDown={(e) => {
                  if ((card.href || card.onClick) && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleCardClick(card);
                  }
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon
                    name={card.icon}
                    className={`text-[23px] ${card.iconColor}`}
                    aria-hidden="true"
                  />
                  {card.alert && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                      확인 필요
                    </span>
                  )}
                </div>
                <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium mb-1">
                  {card.label}
                </p>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-2xl font-extrabold text-wtext-1 dark:text-white tracking-tight tabular-nums">
                    {isAnimated ? <CountUp end={card.value} duration={1800} /> : 0}
                  </span>
                  <span className="text-sm font-bold text-wtext-3 dark:text-rink-300">
                    {card.suffix}
                  </span>
                </div>
              </article>
            ),
          )}
        </div>
      </div>
      <div className="flex justify-center gap-1.5 mt-3" role="tablist" aria-label="카드 탐색">
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => snapToIndex(i)}
            role="tab"
            aria-selected={i === currentIndex}
            aria-label={`${card.label} 카드로 이동`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === currentIndex
                ? 'w-5 bg-ice-500'
                : 'w-1.5 bg-wline dark:bg-rink-500 hover:bg-wtext-4 dark:hover:bg-wbg0'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
