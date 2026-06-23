'use client';

/**
 * StatCard - TEAMPLUS Shared Component
 * 단순 통계 카드 (라벨 + 숫자 + 단위 + 옵션 아이콘).
 * 사용 화면: /parent (크레딧 요약), /coach (오늘 출석률),
 * /admin (승인 대기), /director (팀 통계), /statistics
 */

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export type StatAccentColor = 'primary' | 'success' | 'warning' | 'error';

export interface StatCardProps {
  /** 통계 라벨 (예: "보유 크레딧", "출석률") */
  label: string;
  /** 숫자 값 (문자열 또는 숫자 모두 허용) */
  value: string | number;
  /** 단위 표시 (예: "회", "%", "명") */
  unit?: string;
  /** 선택 아이콘 (ReactNode — material-symbols 또는 svg) */
  icon?: ReactNode;
  /** 강조 색상 (기본: primary) */
  accentColor?: StatAccentColor;
  /** 클릭 핸들러 (있을 경우 카드가 버튼 역할) */
  onClick?: () => void;
  /** 추가 className */
  className?: string;
}

const ACCENT_TEXT: Record<StatAccentColor, string> = {
  primary: 'text-ice-500',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

const ACCENT_BG: Record<StatAccentColor, string> = {
  primary: 'bg-ice-500/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  error: 'bg-error/10',
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  accentColor = 'primary',
  onClick,
  className,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-wtext-3 dark:text-rink-300">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
              ACCENT_BG[accentColor],
              ACCENT_TEXT[accentColor]
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        <span className={cn('text-2xl font-bold tracking-tight', ACCENT_TEXT[accentColor])}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-semibold text-wtext-3 dark:text-rink-300">
            {unit}
          </span>
        )}
      </p>
    </>
  );

  const baseClass = cn(
    'bg-white dark:bg-rink-800',
    'rounded-2xl p-5',
    'border border-wline-2 dark:border-rink-700',
    'transition-colors duration-150',
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} ${value}${unit ?? ''}`}
        className={cn(
          baseClass,
          'text-left w-full',
          'hover:border-ice-500/30 active:brightness-95',
          'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export default StatCard;
