'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

/**
 * BentoStatCard - 통계 카드 컴포넌트
 *
 * 큰 숫자 + 라벨 + 아이콘 + 변화율 트렌드를 보여주는 통계 카드.
 * Bento Grid 레이아웃에서 사용하기 적합한 정사각형/세로형 카드.
 *
 * 디자인 원칙:
 * - 그라디언트/블러/컬러 그림자 사용 금지
 * - 다크모드 완전 지원
 * - WCAG 2.1 AA 준수
 * - 솔리드 컬러 변형 (5가지: primary/success/warning/error/neutral)
 */

export type BentoStatVariant = 'primary' | 'success' | 'warning' | 'error' | 'neutral';
export type BentoStatTrend = 'up' | 'down' | 'flat';

export interface BentoStatCardProps {
  /** 라벨 (작은 제목, 대문자 권장) */
  label: string;
  /** 큰 숫자 또는 텍스트 */
  value: ReactNode;
  /** 단위 (예: "명", "회", "%") */
  unit?: string;
  /** 아이콘 이름 (Material Symbols) */
  icon?: string;
  /** 컬러 변형 */
  variant?: BentoStatVariant;
  /** 트렌드 (변화 방향) */
  trend?: BentoStatTrend;
  /** 트렌드 변화량 (예: "+12%") */
  trendValue?: string;
  /** 캡션 (작은 보조 텍스트) */
  caption?: string;
  /** 클릭 핸들러 (있으면 버튼처럼 동작) */
  onClick?: () => void;
  /** 강조 표시 (배경을 솔리드 컬러로 채움) */
  highlighted?: boolean;
  /** 추가 className */
  className?: string;
}

const VARIANT_STYLES: Record<BentoStatVariant, {
  iconBg: string;
  iconText: string;
  border: string;
  highlightedBg: string;
  highlightedText: string;
  highlightedSubText: string;
}> = {
  primary: {
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconText: 'text-ice-500 dark:text-blue-300',
    border: 'border-t-primary',
    highlightedBg: 'bg-ice-500',
    highlightedText: 'text-white',
    highlightedSubText: 'text-blue-100',
  },
  success: {
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-t-emerald-500',
    highlightedBg: 'bg-emerald-600',
    highlightedText: 'text-white',
    highlightedSubText: 'text-emerald-100',
  },
  warning: {
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconText: 'text-amber-600 dark:text-amber-400',
    border: 'border-t-amber-500',
    highlightedBg: 'bg-amber-500',
    highlightedText: 'text-white',
    highlightedSubText: 'text-amber-50',
  },
  error: {
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconText: 'text-red-600 dark:text-red-400',
    border: 'border-t-red-500',
    highlightedBg: 'bg-red-600',
    highlightedText: 'text-white',
    highlightedSubText: 'text-red-100',
  },
  neutral: {
    iconBg: 'bg-wline-2 dark:bg-rink-700',
    iconText: 'text-wtext-2 dark:text-rink-100',
    border: 'border-t-slate-400',
    highlightedBg: 'bg-rink-800',
    highlightedText: 'text-white',
    highlightedSubText: 'text-wtext-4',
  },
};

const TREND_ICONS: Record<BentoStatTrend, { icon: string; color: string }> = {
  up: { icon: 'trending_up', color: 'text-emerald-600 dark:text-emerald-400' },
  down: { icon: 'trending_down', color: 'text-red-600 dark:text-red-400' },
  flat: { icon: 'trending_flat', color: 'text-wtext-3 dark:text-rink-300' },
};

export function BentoStatCard({
  label,
  value,
  unit,
  icon,
  variant = 'primary',
  trend,
  trendValue,
  caption,
  onClick,
  highlighted = false,
  className = '',
}: BentoStatCardProps) {
  const styles = VARIANT_STYLES[variant];
  const trendStyle = trend ? TREND_ICONS[trend] : null;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'relative w-full text-left rounded-2xl p-5 transition-all',
        highlighted
          ? cn(styles.highlightedBg, 'shadow-md')
          : 'bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sm',
        onClick && 'hover:shadow-md active:scale-[0.98] cursor-pointer',
        className
      )}
      type={onClick ? 'button' : undefined}
    >
      {/* 헤더: 라벨 + 트렌드 + 아이콘 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-wider truncate',
            highlighted ? styles.highlightedSubText : 'text-wtext-3 dark:text-rink-300'
          )}>
            {label}
          </p>
        </div>
        {icon && !highlighted && (
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-2', styles.iconBg)}>
            <Icon name={icon} className={cn('text-base', styles.iconText)} aria-hidden="true" />
          </div>
        )}
        {icon && highlighted && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-2 bg-white/20">
            <Icon name={icon} className="text-base text-white" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* 메인 값 */}
      <div className="flex items-baseline gap-1.5">
        <span className={cn(
          'text-2xl font-extrabold tabular-nums leading-none',
          highlighted ? styles.highlightedText : 'text-wtext-1 dark:text-white'
        )}>
          {value}
        </span>
        {unit && (
          <span className={cn(
            'text-sm font-semibold',
            highlighted ? styles.highlightedSubText : 'text-wtext-3 dark:text-rink-300'
          )}>
            {unit}
          </span>
        )}
      </div>

      {/* 푸터: 트렌드 + 캡션 */}
      {(trendStyle || caption) && (
        <div className="flex items-center justify-between mt-3">
          {trendStyle && trendValue && (
            <div className={cn(
              'flex items-center gap-1 text-xs font-bold',
              highlighted ? styles.highlightedSubText : trendStyle.color
            )}>
              <Icon name={trendStyle.icon} className="text-sm" aria-hidden="true" />
              <span>{trendValue}</span>
            </div>
          )}
          {caption && (
            <span className={cn(
              'text-[10px]',
              highlighted ? styles.highlightedSubText : 'text-wtext-3 dark:text-rink-300'
            )}>
              {caption}
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}
