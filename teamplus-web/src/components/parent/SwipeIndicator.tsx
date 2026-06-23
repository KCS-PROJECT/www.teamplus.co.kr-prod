'use client';

/**
 * SwipeIndicator - 스와이프 캐러셀 인디케이터 도트
 *
 * 자녀 선택 카드 등 캐러셀 하단의 페이지 인디케이터입니다.
 * 선택된 항목은 넓은 바 형태로, 나머지는 작은 원 형태로 표시합니다.
 */
interface SwipeIndicatorProps {
  /** 전체 항목 수 */
  total: number;
  /** 현재 선택된 인덱스 */
  activeIndex: number;
  /** 인디케이터 클릭 시 해당 인덱스로 이동 */
  onSelect: (index: number) => void;
  /** 각 항목의 접근성 라벨 (index 기반) */
  getLabel?: (index: number) => string;
  /** 접근성 그룹 라벨 */
  groupLabel?: string;
}

export function SwipeIndicator({
  total,
  activeIndex,
  onSelect,
  getLabel,
  groupLabel = '항목 선택',
}: SwipeIndicatorProps) {
  if (total <= 1) return null;

  return (
    <div
      className="flex justify-center gap-1.5 mt-3"
      role="tablist"
      aria-label={groupLabel}
    >
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          role="tab"
          aria-selected={i === activeIndex}
          aria-label={getLabel?.(i) ?? `${i + 1}번째 항목 선택`}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === activeIndex
              ? 'w-5 bg-ice-500'
              : 'w-1.5 bg-wline dark:bg-rink-500 hover:bg-wtext-4 dark:hover:bg-wbg0'
          }`}
        />
      ))}
    </div>
  );
}
