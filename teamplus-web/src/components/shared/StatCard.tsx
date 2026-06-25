'use client';

/**
 * StatCard - TEAMPLUS Shared Component
 * 단순 통계 카드 (라벨 + 숫자 + 단위 + 옵션 아이콘).
 * 사용 화면: /parent (결제권 요약), /coach (오늘 출석률),
 * /admin (승인 대기), /director (팀 통계), /statistics
 */

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export type StatAccentColor = 'primary' | 'success' | 'warning' | 'error';

export interface StatCardProps {
  /** 통계 라벨 (예: "보유 결제권", "출석률") */
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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(광범위 사용 — 회귀 0 엄격).
   *   true 시 카드 박스 → flat(무라운드 hairline), accent 색만 it-* 치환.
   */
  iceTheme?: boolean;
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

// ICETIMES 톤 — primary=it-blue · error=it-red · success=mint · warning=sun. (절제: 2색 우선)
const ACCENT_TEXT_ICE: Record<StatAccentColor, string> = {
  primary: 'text-it-blue-500',
  success: 'text-mint-500',
  warning: 'text-sun-500',
  error: 'text-it-red-500',
};

const ACCENT_BG_ICE: Record<StatAccentColor, string> = {
  primary: 'bg-it-blue-500/10',
  success: 'bg-mint-500/10',
  warning: 'bg-sun-500/10',
  error: 'bg-it-red-500/10',
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  accentColor = 'primary',
  onClick,
  className,
  iceTheme = false,
}: StatCardProps) {
  const accentText = (iceTheme ? ACCENT_TEXT_ICE : ACCENT_TEXT)[accentColor];
  const accentBg = (iceTheme ? ACCENT_BG_ICE : ACCENT_BG)[accentColor];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            'text-sm font-medium',
            iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              'shrink-0 w-9 h-9 flex items-center justify-center',
              iceTheme ? 'rounded-w-md' : 'rounded-lg',
              accentBg,
              accentText
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        <span className={cn('text-2xl font-bold tracking-tight', accentText)}>
          {value}
        </span>
        {unit && (
          <span
            className={cn(
              'text-sm font-semibold',
              iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            {unit}
          </span>
        )}
      </p>
    </>
  );

  const baseClass = iceTheme
    ? cn(
        // ICETIMES flat — 카드 박스(rounded-2xl + border) → hairline 경계만.
        'bg-it-surface dark:bg-it-blue-950',
        'rounded-w-md p-5',
        'border-[1.5px] border-it-line dark:border-rink-700',
        'transition-colors duration-150',
        className,
      )
    : cn(
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
          'text-left w-full active:brightness-95 focus:outline-none',
          iceTheme
            ? 'hover:border-it-blue-500/30 focus:ring-2 focus:ring-it-blue-500/40'
            : 'hover:border-ice-500/30 focus:ring-2 focus:ring-ice-500/40',
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export default StatCard;
