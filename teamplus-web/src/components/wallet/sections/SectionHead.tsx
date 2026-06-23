'use client';

import { cn } from '@/lib/utils';

/**
 * SectionHead — 월렛 본문 섹션 헤더
 *
 * 좌측 제목 + 우측 액션 (예: "추가 ›", "전체 ›")
 *
 * [2026-05-11 Phase 2] variant='child' 추가 — WCAG AAA 18px+ 폰트, 9 vs 800 굵기.
 *  CHILD 페이지 (4-7세 아동) 에서 헤더 가독성 보강용.
 */
export interface SectionHeadProps {
  title: string;
  action?: string;
  onActionClick?: () => void;
  variant?: 'default' | 'child';
}

export function SectionHead({ title, action, onActionClick, variant = 'default' }: SectionHeadProps) {
  const isChild = variant === 'child';
  return (
    <div className={cn(
      'flex items-center justify-between px-4 sm:px-5',
      isChild ? 'pt-5 sm:pt-6 pb-3' : 'pt-4 sm:pt-[18px] pb-2',
    )}>
      <div
        className={cn(
          'text-wtext-1 dark:text-white tracking-[-0.02em] min-w-0 truncate break-keep',
          isChild
            ? 'font-black text-card-title sm:text-card-section'
            : 'font-extrabold text-[15px] sm:text-[16px]',
        )}
      >
        {title}
      </div>
      {action && (
        <button
          type="button"
          onClick={onActionClick}
          className={cn(
            'bg-transparent border-0 p-0 text-wtext-3 dark:text-rink-300 shrink-0 whitespace-nowrap',
            isChild
              ? 'text-card-body font-bold'
              : 'font-semibold text-[11px] sm:text-[12px]',
          )}
        >
          {action}
        </button>
      )}
    </div>
  );
}
