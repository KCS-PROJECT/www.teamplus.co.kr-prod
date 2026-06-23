'use client';

import React, { memo } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/utils';

/**
 * MetricCard - HTML 템플릿 기반 콤팩트 메트릭 카드
 *
 * 2x2 그리드에 사용되는 콤팩트 통계 카드.
 * 워터마크 아이콘 + 라벨 + 값 + 트렌드/진행률/액션 링크.
 *
 * Design Rules:
 * - 솔리드 컬러만 사용 (그라디언트/블러 금지)
 * - WCAG 2.1 AA 대비율 준수
 * - 다크모드 전체 지원
 */
export interface MetricCardProps {
  /** 카드 라벨 (예: "전체 회원") */
  label: string;
  /** 메트릭 값 (예: 156) */
  value: number | string;
  /** 단위 (예: "명", "원", "건") */
  unit?: string;
  /** 워터마크 아이콘명 (Material Symbols) */
  watermarkIcon: string;
  /** 워터마크 아이콘 색상 */
  watermarkColor?: string;
  /** 트렌드 표시 */
  trend?: {
    label: string;
    isPositive: boolean;
  };
  /** 진행률 바 (0-100) */
  progress?: number;
  /** 진행률 바 색상 */
  progressColor?: string;
  /** 액션 링크 텍스트 */
  actionLabel?: string;
  /** 액션 링크 href */
  actionHref?: string;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 값 포맷 (통화 등) */
  formattedValue?: string;
  /** 값 텍스트 색상 */
  valueColor?: string;
  /** 추가 className */
  className?: string;
}

export const MetricCard = memo(function MetricCard({
  label,
  value,
  unit,
  watermarkIcon,
  watermarkColor = 'text-blue-500',
  trend,
  progress,
  progressColor = 'bg-green-500',
  actionLabel,
  actionHref,
  onClick,
  formattedValue,
  valueColor,
  className,
}: MetricCardProps) {
  const card = (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 p-4 rounded-lg shadow-sm',
        'border border-wline-2 dark:border-rink-700',
        'relative overflow-hidden',
        'transition-all duration-200',
        (onClick || actionHref) && 'active:scale-[0.98] cursor-pointer',
        className,
      )}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* 워터마크 아이콘 */}
      <div className="absolute right-0 top-0 p-3 opacity-10" aria-hidden="true">
        <Icon name={watermarkIcon} className={cn('text-4xl', watermarkColor)} />
      </div>

      {/* 라벨 */}
      <p className="text-card-meta font-semibold uppercase tracking-wide">
        {label}
      </p>

      {/* 값 */}
      <div className="flex items-baseline gap-1 mt-1">
        {formattedValue ? (
          <h3 className={cn('text-card-section', valueColor)}>
            {formattedValue}
          </h3>
        ) : (
          <>
            <h3 className={cn('text-card-section', valueColor)}>
              <CountUp end={value} duration={1200} />
            </h3>
            {unit && (
              <span className="text-card-meta font-medium">
                {unit}
              </span>
            )}
          </>
        )}
      </div>

      {/* 트렌드 인디케이터 */}
      {trend && (
        <div
          className={cn(
            'flex items-center gap-1 mt-1 text-card-meta font-bold',
            trend.isPositive ? '!text-green-600 dark:!text-green-400' : '!text-red-600 dark:!text-red-400',
          )}
        >
          <Icon
            name={trend.isPositive ? 'trending_up' : 'trending_down'}
            className="text-xs"
            aria-hidden="true"
          />
          <span>{trend.label}</span>
        </div>
      )}

      {/* 진행률 바 */}
      {progress !== undefined && (
        <div className="w-full bg-wline-2 dark:bg-rink-700 rounded-full h-1 mt-2">
          <div
            className={cn('h-1 rounded-full transition-all duration-500', progressColor)}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* 액션 링크 */}
      {actionLabel && (
        <div className="flex items-center gap-1 mt-1 text-card-meta !text-orange-500 dark:!text-orange-400 font-bold cursor-pointer">
          <span>{actionLabel}</span>
          <Icon name="arrow_forward" className="text-xs" aria-hidden="true" />
        </div>
      )}
    </div>
  );

  if (actionHref) {
    return <NavLink href={actionHref}>{card}</NavLink>;
  }

  return card;
});

/**
 * MetricCardGrid - 2x2 메트릭 카드 그리드 컨테이너
 */
export interface MetricCardGridProps {
  children: React.ReactNode;
  className?: string;
}

export const MetricCardGrid = memo(function MetricCardGrid({
  children,
  className,
}: MetricCardGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} role="group" aria-label="주요 지표">
      {children}
    </div>
  );
});
