'use client';

/**
 * ChildChip — 학부모 자녀 선택 칩 (공용).
 *  학부모 대시보드(parent/page.tsx)와 사이드메뉴(drawer/page.tsx)에서 공유.
 *  단일 자녀 모델 — '전체' 칩 없음. 선택 시 전역 SelectedChildContext 갱신.
 *
 *  DESIGN.md Pattern: pill 칩 (ice-500 활성 / wline-2 비활성), dark: 변형 필수, 솔리드 컬러.
 */

import { cn } from '@/lib/utils';

interface ChildChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

export function ChildChip({ active, label, onClick }: ChildChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      aria-label={`자녀 ${label} 선택`}
      className={cn(
        'group inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-w-pill text-card-body font-semibold whitespace-nowrap shrink-0',
        'transition-colors motion-reduce:transition-none active:brightness-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
        active
          ? 'bg-ice-500 text-white'
          : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-200 hover:bg-wline dark:hover:bg-rink-600',
      )}
    >
      <span className="tracking-tight">{label}</span>
    </button>
  );
}
