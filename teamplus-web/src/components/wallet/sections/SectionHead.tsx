'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

/**
 * SectionHead — 월렛 본문 섹션 헤더
 *
 * 좌측 제목 + 우측 액션 (예: "추가 ›", "전체 ›")
 *
 * [2026-05-11 Phase 2] variant='child' 추가 — WCAG AAA 18px+ 폰트, 9 vs 800 굵기.
 *  CHILD 페이지 (4-7세 아동) 에서 헤더 가독성 보강용.
 *
 * [ICETIMES Phase 2b] iceTheme prop 추가 — 제목 좌측 it-blue 악센트 바 + 액션 it-blue.
 *  기본 false = 기존 외형 그대로 (미전달 화면 영향 0). variant 와 직교(동시 사용 가능).
 */
export interface SectionHeadProps {
  title: string;
  action?: string;
  onActionClick?: () => void;
  variant?: 'default' | 'child';
  /** ICETIMES 악센트 스타일 적용. 기본 false. */
  iceTheme?: boolean;
  /** 제목 앞 강조 바 — 시안상 '회원 승인' 등 일부 섹션만. 기본 false(미표시). */
  accent?: boolean;
  /** ICETIMES 시안 — 제목 옆 카운트 숫자(it-blue). iceTheme 경로에서만 표시. */
  count?: number;
}

export function SectionHead({
  title,
  action,
  onActionClick,
  variant = 'default',
  iceTheme = false,
  accent = false,
  count,
}: SectionHeadProps) {
  const isChild = variant === 'child';
  return (
    <div className={cn(
      'flex items-center justify-between px-4 sm:px-5',
      isChild ? 'pt-5 sm:pt-6 pb-3' : 'pt-4 sm:pt-[18px] pb-2',
    )}>
      <div className="flex items-center gap-2 min-w-0">
        {accent && (
          <span
            aria-hidden="true"
            className="h-4 w-1 shrink-0 rounded-sm bg-it-red-500"
          />
        )}
        <div
          className={cn(
            'tracking-[-0.02em] min-w-0 truncate break-keep',
            iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
            isChild
              ? 'font-black text-card-title sm:text-card-section'
              : iceTheme
                ? 'font-extrabold text-[17px]'
                : 'font-extrabold text-[15px] sm:text-[16px]',
          )}
        >
          {title}
        </div>
        {iceTheme && count != null && (
          <span className="shrink-0 text-[15px] font-extrabold tabular-nums text-it-blue-500 dark:text-it-blue-300">
            {count}
          </span>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={onActionClick}
          className={cn(
            'bg-transparent border-0 p-0 shrink-0 whitespace-nowrap',
            iceTheme
              ? 'inline-flex items-center gap-px text-it-ink-500 dark:text-it-ink-300'
              : 'text-wtext-3 dark:text-rink-300',
            isChild
              ? 'text-card-body font-bold'
              : iceTheme
                ? 'font-semibold text-[13px]'
                : 'font-semibold text-[11px] sm:text-[12px]',
          )}
        >
          {action}
          {iceTheme && (
            <Icon
              name="chevron_right"
              size={18}
              className="text-[18px] leading-none text-it-ink-400 dark:text-it-ink-300"
            />
          )}
        </button>
      )}
    </div>
  );
}
