'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

/**
 * ChildLevelProgress - 자녀 학습 레벨 + 진도 + 다음 테스트일 통합 표시
 *
 * 디자인 원칙:
 * - 그라디언트/블러/컬러 그림자 사용 금지
 * - 다크모드 완전 지원
 * - WCAG 2.1 AA 준수 (role="progressbar", aria-*)
 * - 컴팩트(carousel용) / 풀(상세 페이지용) 두 가지 변형
 */

export interface ChildLevelProgressProps {
  /** 현재 레벨 (1~5) */
  currentLevel: number;
  /** 레벨 라벨 (예: "기초", "중급") */
  levelLabel: string;
  /** 다음 레벨까지의 진도율 (0~100) */
  progressPercent: number;
  /** 다음 평가 테스트 예정일 (ISO 문자열 또는 Date) */
  nextTestDate?: string | Date | null;
  /** 다음 레벨 라벨 (선택, 풀 변형에서만 표시) */
  nextLevelLabel?: string | null;
  /** 표시 변형 (compact: 카드 내부, full: 단독 섹션) */
  variant?: 'compact' | 'full';
  /** 진도 바 애니메이션 활성화 */
  isAnimated?: boolean;
  /** 추가 className */
  className?: string;
}

const LEVEL_COLORS: Record<number, { bg: string; text: string; bar: string }> = {
  1: {
    bg: 'bg-wline-2 dark:bg-rink-700',
    text: 'text-wtext-2 dark:text-rink-100',
    bar: 'bg-wtext-4',
  },
  2: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-700 dark:text-cyan-300',
    bar: 'bg-cyan-500',
  },
  3: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-ice-500 dark:text-blue-300',
    bar: 'bg-ice-500',
  },
  4: {
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-600',
  },
  5: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
};

function formatTestDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function getDaysUntil(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const target = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function ChildLevelProgress({
  currentLevel,
  levelLabel,
  progressPercent,
  nextTestDate,
  nextLevelLabel,
  variant = 'compact',
  isAnimated = true,
  className = '',
}: ChildLevelProgressProps) {
  const clampedLevel = Math.max(1, Math.min(5, currentLevel));
  const clampedProgress = Math.max(0, Math.min(100, progressPercent));
  const colors = LEVEL_COLORS[clampedLevel];
  const formattedDate = formatTestDate(nextTestDate);
  const daysUntil = getDaysUntil(nextTestDate);

  // ─── Compact 변형 (자녀 카드 내부) ─────────────────
  if (variant === 'compact') {
    return (
      <div className={cn('w-full', className)} aria-label={`학습 진도: Level ${clampedLevel} ${levelLabel} ${clampedProgress}%`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold', colors.bg, colors.text)}>
            Lv.{clampedLevel} {levelLabel}
          </span>
          <span className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
            {clampedProgress}%
          </span>
        </div>
        <div
          className="relative w-full h-1.5 bg-wline-2 dark:bg-rink-700 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn('h-full rounded-full transition-all duration-1000 ease-out', colors.bar)}
            style={{ width: isAnimated ? `${clampedProgress}%` : '0%' }}
          />
        </div>
        {formattedDate && (
          <p className="text-[10px] text-wtext-3 dark:text-rink-300 mt-1.5 flex items-center gap-1">
            <Icon name="event" className="text-[12px]" aria-hidden="true" />
            다음 테스트: {formattedDate}
            {daysUntil !== null && daysUntil >= 0 && daysUntil <= 14 && (
              <span className="ml-1 font-semibold text-ice-500">D-{daysUntil}</span>
            )}
          </p>
        )}
      </div>
    );
  }

  // ─── Full 변형 (단독 섹션, 상세 페이지용) ─────────
  return (
    <div
      className={cn(
        'w-full bg-white dark:bg-rink-800 rounded-2xl border border-wline dark:border-rink-700 p-5',
        className
      )}
      aria-label={`학습 진도: Level ${clampedLevel} ${levelLabel} ${clampedProgress}%`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
            현재 레벨
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-wtext-1 dark:text-white">
              Lv.{clampedLevel}
            </span>
            <span className={cn('text-base font-bold', colors.text)}>{levelLabel}</span>
          </div>
        </div>
        <span className={cn('inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold', colors.bg, colors.text)}>
          {clampedProgress}%
        </span>
      </div>

      <div
        className="relative w-full h-3 bg-wline-2 dark:bg-rink-700 rounded-full overflow-hidden mb-2"
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-1000 ease-out', colors.bar)}
          style={{ width: isAnimated ? `${clampedProgress}%` : '0%' }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-wtext-3 dark:text-rink-300">
        <span>마스터까지 {Math.max(0, 100 - clampedProgress)}%</span>
        {nextLevelLabel && <span className="font-semibold">다음: {nextLevelLabel}</span>}
      </div>

      {formattedDate && (
        <div className="mt-4 pt-4 border-t border-wline-2 dark:border-rink-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-wtext-2 dark:text-rink-100">
            <Icon name="event" className="text-base text-ice-500" aria-hidden="true" />
            <span className="font-medium">다음 평가일</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-wtext-1 dark:text-white">{formattedDate}</span>
            {daysUntil !== null && daysUntil >= 0 && (
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-md',
                daysUntil <= 7 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                daysUntil <= 14 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100'
              )}>
                D-{daysUntil}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
