'use client';

import { memo } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/utils';

export type StatCardVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'indigo';

export interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon: string;
  /**
   * 배경 워터마크 아이콘 컬러 (Tailwind 텍스트 컬러 클래스)
   * 예: 'text-blue-500', 'text-green-500', 'text-orange-500'
   * default variant에서만 적용됨
   */
  watermarkColor?: string;
  variant?: StatCardVariant;
  trend?: { value: string; isPositive: boolean };
  /**
   * 하단 미니 진행률 바 (0~100)
   * 표시 시 subtitle/trend와 함께 또는 단독 사용 가능
   */
  progress?: { value: number; colorClass?: string };
  href?: string;
  className?: string;
}

/**
 * 통계 정보를 표시하는 카드 컴포넌트
 * UI 표준화 및 Design 7 Principles 적용
 * AI 스타일 금지 (gradient/blur/color shadow 사용하지 않음)
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  unit,
  subtitle,
  icon,
  watermarkColor,
  variant = 'default',
  trend,
  progress,
  href,
  className,
}: StatCardProps) {

  const getVariantStyles = (v: StatCardVariant) => {
    switch (v) {
      case 'primary': return 'bg-ice-500 text-white shadow-md border-transparent';
      case 'success': return 'bg-green-500 text-white shadow-md border-transparent';
      case 'warning': return 'bg-orange-500 text-white shadow-md border-transparent';
      case 'indigo': return 'bg-indigo-600 text-white shadow-md border-transparent';
      case 'danger': return 'bg-red-500 text-white shadow-md border-transparent';
      default: return 'bg-white dark:bg-rink-800 border-wline-2 dark:border-rink-700 shadow-sm';
    }
  };

  const getIconStyles = (v: StatCardVariant) => {
    if (v !== 'default') return 'bg-white/20 text-white';
    return 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300';
  };

  const getProgressColor = () => {
    if (progress?.colorClass) return progress.colorClass;
    if (variant !== 'default') return 'bg-white/70';
    return 'bg-ice-500';
  };

  const clampedProgress = Math.min(Math.max(progress?.value ?? 0, 0), 100);

  const cardContent = (
    <div
      className={cn(
        'relative flex flex-col justify-between rounded-2xl p-5 h-full border transition-all duration-200 ease-out active:scale-[0.98] transform-gpu will-change-transform overflow-hidden',
        getVariantStyles(variant),
        className
      )}
    >
      {/* 배경 워터마크 아이콘 (default variant만) — 카드 내부에 완전히 포함 */}
      {variant === 'default' && watermarkColor && (
        <div
          className="absolute right-3 top-3 pointer-events-none opacity-[0.06] dark:opacity-[0.10]"
          aria-hidden="true"
        >
          <Icon name={icon} className={cn('text-[56px]', watermarkColor)} />
        </div>
      )}

      <div className="relative flex items-start justify-between">
        <span className={cn(
          'text-sm font-medium leading-tight',
          variant === 'default' ? 'text-wtext-3 dark:text-rink-300' : 'opacity-90'
        )}>
          {title}
        </span>
        <div className={cn('p-1.5 rounded-lg transition-colors', getIconStyles(variant))}>
          <Icon name={icon} className="text-xl" />
        </div>
      </div>

      <div className="relative mt-auto pt-3">
        <div className="flex items-baseline gap-1">
          <span className={cn(
            'text-3xl font-extrabold tracking-tight',
            variant === 'default' && 'text-wtext-1 dark:text-white'
          )}>
            <CountUp end={value} duration={1200} />
          </span>
          {unit && (
            <span className={cn(
              'text-lg font-medium',
              variant === 'default' ? 'text-wtext-3 dark:text-rink-300' : 'opacity-80'
            )}>
              {unit}
            </span>
          )}
        </div>

        {/* 하단 보조 영역 — 고정 높이로 카드 크기 통일 */}
        <div className="mt-1.5 min-h-[20px]">
          {subtitle && (
            <p className={cn(
              'text-xs font-medium',
              variant === 'default' ? 'text-wtext-3 dark:text-rink-300' : 'opacity-80'
            )}>
              {subtitle}
            </p>
          )}

          {trend && (
            <div className={cn(
              'flex items-center gap-1 font-bold',
              trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
              variant !== 'default' && 'text-white brightness-125'
            )}>
              <Icon name={trend.isPositive ? 'trending_up' : 'trending_down'} className="text-sm" />
              <span className="text-card-meta uppercase tracking-wider">{trend.value}</span>
            </div>
          )}
        </div>

        {progress && (
          <div className="mt-1.5 w-full h-1 rounded-full bg-wline-2 dark:bg-rink-700 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700 ease-out', getProgressColor())}
              style={{ width: `${clampedProgress}%` }}
              role="progressbar"
              aria-valuenow={clampedProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${title} 진행률`}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <NavLink href={href} className="block h-full group" aria-label={`${title} 상세보기`}>
        {cardContent}
      </NavLink>
    );
  }

  return cardContent;
});
