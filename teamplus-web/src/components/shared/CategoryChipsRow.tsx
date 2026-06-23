'use client';

/**
 * CategoryChipsRow — TEAMPLUS Shared Component
 *
 * Pill 칩 스타일의 카테고리 필터. 가로 스크롤 잘림을 완전히 차단한다.
 *
 * 사용 화면 (Wave 2~3 적용):
 *  - (director/parent) 수업 목록 화면 — '전체/정규수업/오픈클래스/대회'
 *  - (parent) RSVP 응답 — '전체/미응답/참석/거절'
 *  - (common) 검색 결과 — '전체/수업/코치/팀'
 *  - (director) 회원 관리 — '전체/감독·코치/학부모/학생'
 *  - (director) 팀 관리 — 팀 카테고리 vs 하위그룹 카테고리 분리
 *
 * 핵심 패턴 (가로 스크롤 잘림 차단):
 *   외부 .flex.overflow-x-auto + 내부 .flex.min-w-max
 *   → chip 너비 합이 화면을 초과해도 줄바꿈 없이 가로 스크롤
 *
 * 디자인:
 *  - Pill (rounded-full) · 활성 ice-500 + 비활성 wsurface
 *  - Material Symbols 아이콘 옵션 + count badge 옵션
 *  - hide-scrollbar + snap-x snap-mandatory (touch 자연스러움)
 */

import { cn } from '@/lib/utils';

export interface CategoryChipItem {
  /** 고유 키 */
  key: string;
  /** 표시 라벨 */
  label: string;
  /** 옵션 카운트 배지 */
  count?: number;
  /** 옵션 Material Symbols 아이콘 이름 */
  icon?: string;
  /** 옵션 비활성화 */
  disabled?: boolean;
}

export interface CategoryChipsRowProps {
  chips: CategoryChipItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /** 추가 className (외부 컨테이너) */
  className?: string;
  /** aria-label */
  ariaLabel?: string;
  /** 좌우 패딩 토큰 — 페이지 grid 정합 시 'px-0' override 가능 */
  paddingX?: string;
}

export function CategoryChipsRow({
  chips,
  activeKey,
  onChange,
  className,
  ariaLabel = '카테고리 선택',
  paddingX = 'px-5',
}: CategoryChipsRowProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        // 외부: 가로 스크롤 컨테이너 (잘림 차단)
        'w-full overflow-x-auto hide-scrollbar snap-x snap-mandatory',
        // touch 친화 (WebView)
        'touch-pan-x',
        className,
      )}
    >
      {/* 내부: min-w-max 로 chip 합 너비 보장 → 줄바꿈 차단 */}
      <div className={cn('flex min-w-max items-center gap-2 py-2.5', paddingX)}>
        {chips.map((chip) => {
          const isActive = chip.key === activeKey;
          return (
            <button
              key={chip.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={chip.disabled}
              onClick={() => onChange(chip.key)}
              className={cn(
                // 칩 기본
                'snap-start shrink-0 inline-flex items-center gap-1.5',
                'h-9 px-4 rounded-w-pill text-sm font-bold',
                'transition-colors duration-150 motion-reduce:transition-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                // 활성/비활성 색상
                isActive
                  ? 'bg-ice-500 text-white'
                  : 'bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-rink-200 border border-wline dark:border-rink-700 hover:bg-wline-2 dark:hover:bg-rink-700',
              )}
            >
              {chip.icon && (
                <span className="material-symbols-rounded text-[18px] leading-none">
                  {chip.icon}
                </span>
              )}
              <span className="leading-none">{chip.label}</span>
              {typeof chip.count === 'number' && chip.count > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-200',
                  )}
                  aria-label={`${chip.count}건`}
                >
                  {chip.count > 99 ? '99+' : chip.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryChipsRow;
