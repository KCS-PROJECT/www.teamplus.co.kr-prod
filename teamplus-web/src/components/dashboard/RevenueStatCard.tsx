'use client';

import React, { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/utils';

/**
 * RevenueStatCard - 매출 통계 카드 (전체 폭)
 *
 * 아이콘 + 트렌드 배지 + 금액 + 진행률 바.
 * 금일 매출, 월간 매출 등에 사용.
 *
 * Design Rules:
 * - 솔리드 컬러, 그라디언트 금지
 */
export interface RevenueStatCardProps {
  /** 카드 라벨 */
  label: string;
  /** 금액 (원) */
  amount: number;
  /** 트렌드 라벨 (예: "+5.2%") */
  trendLabel?: string;
  /** 긍정적 트렌드 여부 */
  isPositive?: boolean;
  /** 진행률 (0-100, 목표 대비) */
  progress?: number;
  /** 아이콘명 */
  icon?: string;
  /** 아이콘 배경 색상 */
  iconBg?: string;
  /** 아이콘 색상 */
  iconColor?: string;
  /** 추가 className */
  className?: string;
}

export const RevenueStatCard = memo(function RevenueStatCard({
  label,
  amount,
  trendLabel,
  isPositive = true,
  progress,
  icon = 'payments',
  iconBg = 'bg-blue-50 dark:bg-blue-900/20',
  iconColor = 'text-ice-500',
  className,
}: RevenueStatCardProps) {
  const formattedAmount = new Intl.NumberFormat('ko-KR').format(amount);

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 p-4 rounded-lg shadow-sm',
        'border border-wline-2 dark:border-rink-700',
        className,
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div className={cn('p-2 rounded-lg', iconBg)}>
          <Icon name={icon} className={cn('text-2xl', iconColor)} aria-hidden="true" />
        </div>
        {trendLabel && (
          <div
            className={cn(
              'flex items-center text-card-meta font-bold px-2 py-1 rounded-md',
              isPositive
                ? 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
                : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
            )}
          >
            {trendLabel}
            <Icon
              name={isPositive ? 'trending_up' : 'trending_down'}
              className="text-sm ml-0.5"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 uppercase">
        {label}
      </p>
      <div className="flex items-baseline gap-1 mt-1 justify-end">
        <span className="text-2xl font-bold text-wtext-1 dark:text-white">
          <CountUp end={amount} duration={1500} />
        </span>
        <span className="text-sm font-medium text-wtext-3 dark:text-rink-300">원</span>
      </div>

      {progress !== undefined && (
        <div className="mt-4 h-1 bg-wbg dark:bg-rink-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-ice-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
});
