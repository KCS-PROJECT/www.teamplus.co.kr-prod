'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

/**
 * SolidStatusCard - 큰 상태 카드 (시즌권/결제권/티켓 등)
 *
 * 시안의 그라디언트 카드를 솔리드 컬러로 변환한 버전.
 * - 큰 라벨 + 큰 숫자 + 진도바(선택) + 액션 버튼 + mini 리스트(선택)
 * - 다크모드 완전 지원
 * - 그라디언트/블러/컬러 그림자 사용 금지
 */

export type SolidCardVariant = 'primary' | 'success' | 'warning' | 'error' | 'dark';

export interface SolidStatusCardMiniItem {
  label: string;
  value: string;
}

export interface SolidStatusCardProps {
  /** 작은 상단 라벨 (UPPERCASE 권장) */
  label: string;
  /** 큰 메인 값 */
  value: ReactNode;
  /** 단위 (예: "/ 10회") */
  unit?: string;
  /** 우측 상단 배지 텍스트 */
  badge?: string;
  /** 우측 상단 아이콘 */
  icon?: string;
  /** 진도바 표시 (0~100) */
  progressPercent?: number;
  /** 카드 컬러 변형 */
  variant?: SolidCardVariant;
  /** 액션 버튼 텍스트 */
  actionLabel?: string;
  /** 액션 버튼 아이콘 */
  actionIcon?: string;
  /** 액션 버튼 클릭 */
  onAction?: () => void;
  /** 푸터 좌측 라벨 (예: "유효기간:") */
  footerLeft?: string;
  /** 푸터 우측 값 (예: "2024.12.31") */
  footerRight?: string;
  /** Mini 리스트 (구분선 아래 표시) */
  miniListTitle?: string;
  miniListItems?: SolidStatusCardMiniItem[];
  /** 추가 className */
  className?: string;
}

const VARIANT_STYLES: Record<SolidCardVariant, {
  bg: string;
  text: string;
  subText: string;
  divider: string;
  badgeBg: string;
  iconBg: string;
  progressBg: string;
  progressBar: string;
  actionBg: string;
  actionText: string;
  actionHover: string;
}> = {
  primary: {
    bg: 'bg-ice-500',
    text: 'text-white',
    subText: 'text-blue-100',
    divider: 'bg-blue-200/30',
    badgeBg: 'bg-white/20',
    iconBg: 'bg-white/20',
    progressBg: 'bg-blue-200/30',
    progressBar: 'bg-white',
    actionBg: 'bg-white',
    actionText: 'text-ice-500',
    actionHover: 'hover:bg-blue-50',
  },
  success: {
    bg: 'bg-emerald-600',
    text: 'text-white',
    subText: 'text-emerald-100',
    divider: 'bg-emerald-200/30',
    badgeBg: 'bg-white/20',
    iconBg: 'bg-white/20',
    progressBg: 'bg-emerald-200/30',
    progressBar: 'bg-white',
    actionBg: 'bg-white',
    actionText: 'text-emerald-700',
    actionHover: 'hover:bg-emerald-50',
  },
  warning: {
    bg: 'bg-amber-500',
    text: 'text-white',
    subText: 'text-amber-50',
    divider: 'bg-amber-200/30',
    badgeBg: 'bg-white/20',
    iconBg: 'bg-white/20',
    progressBg: 'bg-amber-200/30',
    progressBar: 'bg-white',
    actionBg: 'bg-white',
    actionText: 'text-amber-700',
    actionHover: 'hover:bg-amber-50',
  },
  error: {
    bg: 'bg-red-600',
    text: 'text-white',
    subText: 'text-red-100',
    divider: 'bg-red-200/30',
    badgeBg: 'bg-white/20',
    iconBg: 'bg-white/20',
    progressBg: 'bg-red-200/30',
    progressBar: 'bg-white',
    actionBg: 'bg-white',
    actionText: 'text-red-700',
    actionHover: 'hover:bg-red-50',
  },
  dark: {
    bg: 'bg-rink-900 dark:bg-puck',
    text: 'text-white',
    subText: 'text-wtext-4',
    divider: 'bg-rink-700',
    badgeBg: 'bg-white/10',
    iconBg: 'bg-white/10',
    progressBg: 'bg-rink-700',
    progressBar: 'bg-white',
    actionBg: 'bg-white',
    actionText: 'text-wtext-1',
    actionHover: 'hover:bg-wline-2',
  },
};

export function SolidStatusCard({
  label,
  value,
  unit,
  badge,
  icon,
  progressPercent,
  variant = 'primary',
  actionLabel,
  actionIcon,
  onAction,
  footerLeft,
  footerRight,
  miniListTitle,
  miniListItems,
  className = '',
}: SolidStatusCardProps) {
  const styles = VARIANT_STYLES[variant];
  const clampedProgress = progressPercent !== undefined
    ? Math.max(0, Math.min(100, progressPercent))
    : null;

  return (
    <div className={cn('rounded-3xl p-6 shadow-md', styles.bg, className)}>
      {/* 헤더: 라벨 + 배지/아이콘 */}
      <div className="flex items-start justify-between mb-4">
        <p className={cn('text-[11px] font-bold uppercase tracking-widest', styles.subText)}>
          {label}
        </p>
        <div className="flex items-center gap-2">
          {badge && (
            <div className={cn('px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider', styles.badgeBg, styles.text)}>
              {badge}
            </div>
          )}
          {icon && (
            <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', styles.iconBg)}>
              <Icon name={icon} className={cn('text-lg', styles.text)} aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {/* 메인 값 */}
      <div className="flex items-baseline gap-2 mb-5">
        <span className={cn('text-4xl font-extrabold tracking-tight tabular-nums leading-none', styles.text)}>
          {value}
        </span>
        {unit && (
          <span className={cn('text-lg font-bold', styles.subText)}>{unit}</span>
        )}
      </div>

      {/* 진도바 */}
      {clampedProgress !== null && (
        <div
          className={cn('w-full h-2 rounded-full overflow-hidden mb-3', styles.progressBg)}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn('h-full rounded-full transition-all duration-1000 ease-out', styles.progressBar)}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
      )}

      {/* 푸터: 좌/우 텍스트 */}
      {(footerLeft || footerRight) && (
        <div className="flex items-center justify-between text-xs mb-4">
          {footerLeft && <span className={styles.subText}>{footerLeft}</span>}
          {footerRight && (
            <span className={cn('font-bold px-2 py-1 rounded', styles.badgeBg, styles.text)}>
              {footerRight}
            </span>
          )}
        </div>
      )}

      {/* 액션 버튼 */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={cn(
            'w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]',
            styles.actionBg,
            styles.actionText,
            styles.actionHover
          )}
          type="button"
        >
          {actionIcon && <Icon name={actionIcon} className="text-base" aria-hidden="true" />}
          <span>{actionLabel}</span>
        </button>
      )}

      {/* Mini 리스트 (구분선 + 항목들) */}
      {miniListItems && miniListItems.length > 0 && (
        <div className={cn('pt-4 mt-4 border-t', styles.divider.replace('bg-', 'border-'))}>
          {miniListTitle && (
            <h4 className={cn('text-[10px] font-bold uppercase tracking-widest mb-2', styles.subText)}>
              {miniListTitle}
            </h4>
          )}
          <ul className="space-y-2">
            {miniListItems.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs">
                <span className={cn('font-medium', styles.text)}>{item.label}</span>
                <span className={cn('font-bold', styles.subText)}>{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
