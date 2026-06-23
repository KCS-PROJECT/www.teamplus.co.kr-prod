'use client';

import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import type { ChildInfo } from '@/hooks/useParentHome';

/**
 * ParentChildSelector — 학부모 대시보드 자녀 프로필 스와이퍼.
 *
 * 설계서 §4.1 ① "자녀 셀렉터" + ② "소속팀 정보" 통합 재설계.
 *
 * 슬라이드 구성
 *  - 자녀 0명: null 반환 (UI 숨김)
 *  - 자녀 1명: 정적 프로필 바 (스와이프 불필요)
 *  - 자녀 2명 이상: 맨 앞 "전체" 슬라이드 + 각 자녀 슬라이드 + 도트 인디케이터
 *
 * "전체" 슬라이드
 *  - selectedChildId === null 상태 표현
 *  - 이모지 👨‍👩‍👧 + 라벨 "우리 아이들 N명 · 공통 팀명"
 *  - 자녀들이 서로 다른 팀 소속일 경우 팀명 생략 ("우리 아이들 N명")
 *  - Hot zone (캘린더/공지/카테고리) 가 전체 자녀 통합 기준으로 동작
 *
 * 규칙
 *  - React 예약 prop 'children' 충돌 회피를 위해 'items' 로 네이밍
 *  - 스와이프 제스처: ChildrenSwipeCards 와 동일 패턴 (touch + mouse drag)
 *  - 포맷: {profileEmoji} {이름} · {clubName} — 수업명은 미니 캘린더 dot 으로 노출
 *  - 탭 동작 없음 (스와이프 + 도트 클릭 전용)
 */

interface ParentChildSelectorProps {
  items: ChildInfo[];
  /** 선택된 자녀 id. null = 전체 슬라이드(다자녀 기본값) */
  selectedChildId: string | null;
  /** 선택 변경 콜백. null 은 "전체" 슬라이드 선택 */
  onSelect: (childId: string | null) => void;
}

/** "전체" 슬라이드를 구분하는 가상 id — 실제 자녀 id 와 충돌 방지를 위한 sentinel */
const ALL_SLIDE_ID = '__all__';

/** 자녀들의 공통 팀명(grade). 서로 다른 팀이면 null */
function extractSharedClubName(items: ChildInfo[]): string | null {
  const names = Array.from(
    new Set(
      items
        .map((c) => c.grade?.trim())
        .filter((v): v is string => Boolean(v && v.length > 0)),
    ),
  );
  if (names.length === 1) return names[0];
  return null;
}

/**
 * 한국 나이(만나이+1) + 출생년도 표기 (2026-04-28).
 * birthDate 가 없으면 null 반환 → UI 측에서 폴백 처리.
 *  · "9세(2018)" 형식
 */
function formatChildAgeLabel(birthDate?: string | null): string | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const birthYear = d.getFullYear();
  const koreanAge = new Date().getFullYear() - birthYear + 1;
  return `${koreanAge}세(${birthYear})`;
}

export function ParentChildSelector({
  items,
  selectedChildId,
  onSelect,
}: ParentChildSelectorProps) {
  const hasAllSlide = items.length > 1;
  const isMulti = hasAllSlide; // 스와이프/도트 필요 여부와 동일
  const sharedClub = useMemo(() => extractSharedClubName(items), [items]);

  // 슬라이드 배열 계산: hasAllSlide 면 맨 앞에 ALL sentinel 추가
  const slideIds = useMemo<string[]>(() => {
    const childIds = items.map((c) => c.id);
    return hasAllSlide ? [ALL_SLIDE_ID, ...childIds] : childIds;
  }, [items, hasAllSlide]);

  // 선택된 슬라이드 인덱스
  const selectedIndex = useMemo(() => {
    if (selectedChildId === null) {
      return hasAllSlide ? 0 : 0; // 1명일 때 null 이 들어오면 idx 0 (그 자녀) 로 폴백
    }
    const idx = slideIds.indexOf(selectedChildId);
    return idx >= 0 ? idx : 0;
  }, [slideIds, selectedChildId, hasAllSlide]);

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // 드래그 상태
  const isDragging = useRef(false);
  const startX = useRef(0);
  const currentTranslate = useRef(0);
  const prevTranslate = useRef(0);
  const containerWidth = useRef(0);

  const setPosition = useCallback((x: number) => {
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translateX(${x}px)`;
    }
  }, []);

  const snapToSlide = useCallback(
    (index: number) => {
      if (!isMulti) return;
      const clamped = Math.max(0, Math.min(index, slideIds.length - 1));
      const targetId = slideIds[clamped];
      onSelect(targetId === ALL_SLIDE_ID ? null : targetId);
      const offset = -clamped * containerWidth.current;
      currentTranslate.current = offset;
      prevTranslate.current = offset;
      if (trackRef.current) {
        trackRef.current.style.transition =
          'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)';
        trackRef.current.style.transform = `translateX(${offset}px)`;
      }
    },
    [isMulti, slideIds, onSelect],
  );

  const handleDragStart = useCallback(
    (clientX: number) => {
      if (!isMulti) return;
      isDragging.current = true;
      startX.current = clientX;
      prevTranslate.current = currentTranslate.current;
    },
    [isMulti],
  );

  const handleDragMove = useCallback(
    (clientX: number) => {
      if (!isDragging.current) return;
      const diff = clientX - startX.current;
      currentTranslate.current = prevTranslate.current + diff;
      setPosition(currentTranslate.current);
    },
    [setPosition],
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const movedBy = currentTranslate.current - prevTranslate.current;
    const threshold = containerWidth.current * 0.25;
    if (movedBy < -threshold) snapToSlide(selectedIndex + 1);
    else if (movedBy > threshold) snapToSlide(selectedIndex - 1);
    else snapToSlide(selectedIndex);
  }, [selectedIndex, snapToSlide]);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 컨테이너 측정 재실행 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  // 컨테이너 크기/선택 상태/화면 폭 변화 시 트랙 위치 동기화
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    containerWidth.current = container.clientWidth;

    if (trackRef.current) {
      const offset = -selectedIndex * containerWidth.current;
      currentTranslate.current = offset;
      prevTranslate.current = offset;
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translateX(${offset}px)`;
    }
  }, [selectedIndex, screenWidth]);

  // 멀티 모드 drag/swipe 제스처 핸들러 등록
  useEffect(() => {
    if (!isMulti) return;
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => handleDragStart(e.touches[0].clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      handleDragMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => handleDragEnd();
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientX);
    };
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const onMouseUp = () => handleDragEnd();

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('mousedown', onMouseDown);
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
  }, [isMulti, handleDragStart, handleDragMove, handleDragEnd]);

  // "전체" 슬라이드 라벨 계산
  const allSlideLabel = useMemo(() => {
    const countText = `우리 아이들 ${items.length}명`;
    if (sharedClub) return `${countText} · ${sharedClub}`;
    return countText;
  }, [items.length, sharedClub]);

  // 키보드 네비게이션 — ArrowLeft/ArrowRight, Home, End 지원 (WCAG 2.1.1 키보드)
  // [hotfix 2026-05-14] hook 호출은 early return 위에서 — react-hooks/rules-of-hooks
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isMulti) return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          snapToSlide(selectedIndex + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          snapToSlide(selectedIndex - 1);
          break;
        case 'Home':
          e.preventDefault();
          snapToSlide(0);
          break;
        case 'End':
          e.preventDefault();
          snapToSlide(slideIds.length - 1);
          break;
      }
    },
    [isMulti, selectedIndex, slideIds.length, snapToSlide],
  );

  if (items.length === 0) return null;

  return (
    <section aria-label="자녀 프로필" className="px-5">
      <div
        ref={containerRef}
        className={cn(
          'overflow-hidden rounded-2xl border border-wline-2 bg-white dark:border-rink-700 dark:bg-rink-800',
          isMulti && 'cursor-grab active:cursor-grabbing select-none',
          isMulti && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
        )}
        role={isMulti ? 'region' : undefined}
        aria-roledescription={isMulti ? 'carousel' : undefined}
        aria-label={isMulti ? `자녀 캐러셀, ${selectedIndex + 1} / ${slideIds.length}` : undefined}
        tabIndex={isMulti ? 0 : undefined}
        onKeyDown={isMulti ? handleKeyDown : undefined}
      >
        <div
          ref={trackRef}
          className="flex will-change-transform"
          style={{ transform: 'translateX(0px)' }}
          aria-live="polite"
        >
          {/* "전체" 슬라이드 — 자녀 2명+ 일 때만 (맨 앞) */}
          {hasAllSlide && (
            <article
              key={ALL_SLIDE_ID}
              className="w-full shrink-0"
              role="group"
              aria-roledescription="slide"
              aria-label={`1 / ${slideIds.length}: ${allSlideLabel}`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xl dark:bg-amber-900/20"
                  aria-hidden="true"
                >
                  👨‍👩‍👧
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm">
                    <span className="font-bold text-wtext-1 dark:text-white">
                      전체 보기
                    </span>
                    <span
                      className="text-wtext-3 dark:text-rink-300"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    <span className="truncate font-medium text-wtext-2 dark:text-rink-100">
                      {allSlideLabel}
                    </span>
                  </p>
                </div>
              </div>
            </article>
          )}

          {/* 각 자녀 슬라이드 */}
          {items.map((child, idx) => {
            const clubLabel = child.grade?.trim();
            // 2026-04-28: "자녀이름 - 나이(출생년도)" 표기. birthDate 없으면 clubLabel 폴백.
            const ageLabel = formatChildAgeLabel(child.birthDate);
            const subLabel = ageLabel ?? clubLabel;
            const slideNo = hasAllSlide ? idx + 2 : idx + 1;
            return (
              <article
                key={child.id}
                className="w-full shrink-0"
                role={isMulti ? 'group' : undefined}
                aria-roledescription={isMulti ? 'slide' : undefined}
                aria-label={
                  isMulti
                    ? `${slideNo} / ${slideIds.length}: ${child.name}${subLabel ? ` - ${subLabel}` : ''}`
                    : `${child.name}${subLabel ? ` - ${subLabel}` : ''}`
                }
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl dark:bg-blue-900/20"
                    aria-hidden="true"
                  >
                    {child.profileEmoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm">
                      <span className="font-bold text-wtext-1 dark:text-white">
                        {child.name}
                      </span>
                      {subLabel && (
                        <>
                          <span
                            className="text-wtext-3 dark:text-rink-300"
                            aria-hidden="true"
                          >
                            -
                          </span>
                          <span className="truncate font-medium text-wtext-2 dark:text-rink-100">
                            {subLabel}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* 도트 인디케이터 — 다자녀(전체 슬라이드 포함) 일 때만 */}
      {isMulti && (
        <div
          className="mt-2 flex justify-center gap-1.5"
          role="tablist"
          aria-label="자녀 선택"
        >
          {slideIds.map((id, i) => {
            const label =
              id === ALL_SLIDE_ID
                ? allSlideLabel
                : items.find((c) => c.id === id)?.name ?? '';
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={i === selectedIndex}
                aria-label={`${label} 선택`}
                onClick={() => snapToSlide(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all motion-reduce:transition-none duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                  i === selectedIndex
                    ? 'w-5 bg-ice-500'
                    : 'w-1.5 bg-wline dark:bg-rink-500 hover:bg-wtext-4 dark:hover:bg-wbg0',
                )}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ParentChildSelector;
