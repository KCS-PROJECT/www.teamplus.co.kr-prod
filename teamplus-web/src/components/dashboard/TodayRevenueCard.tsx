'use client';

import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

export interface TodayRevenueCardProps {
  todayRevenue: number;
  monthlyGoal: { target: number; current: number; rate: number };
  /**
   * 전일 매출액 (optional). 있을 경우 상단 우측에 전일 대비 변화율 배지 표시.
   */
  previousRevenue?: number;
}

/**
 * 금일 매출액 카드 + 월간 목표 프로그레스 바
 * Design 7 Principles 적용 · AI 스타일 금지 (gradient/blur/color shadow 없음)
 */
export function TodayRevenueCard({ todayRevenue, monthlyGoal, previousRevenue }: TodayRevenueCardProps) {
  const clampedRate = Math.min(monthlyGoal.rate, 100);

  // 전일 대비 변화율 계산
  const hasComparison = typeof previousRevenue === 'number' && previousRevenue > 0;
  const changeRate = hasComparison
    ? Math.round(((todayRevenue - previousRevenue) / previousRevenue) * 1000) / 10
    : 0;
  const isPositive = changeRate >= 0;

  return (
    <div className="relative bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-5 overflow-hidden">
      {/* 상단: 아이콘 박스 + 트렌드 배지 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Icon name="payments" className="text-xl text-ice-500 dark:text-blue-400" aria-hidden="true" />
          </div>
          <span className="text-sm font-medium text-wtext-3 dark:text-rink-300">
            {MESSAGES.dashboard.todayRevenue}
          </span>
        </div>

        {hasComparison && (
          <div
            className={cn(
              'flex items-center gap-0.5 px-2 py-1 rounded-md text-card-meta font-bold',
              isPositive
                ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
            )}
            aria-label={`전일 대비 ${isPositive ? '상승' : '하락'} ${Math.abs(changeRate)}퍼센트`}
          >
            <span>{isPositive ? '+' : ''}{changeRate}%</span>
            <Icon name={isPositive ? 'trending_up' : 'trending_down'} className="text-sm" />
          </div>
        )}
      </div>

      {/* 중앙: 금액 */}
      <div className="flex items-baseline gap-1 mb-4 justify-end">
        <span className="text-3xl font-extrabold text-wtext-1 dark:text-white tracking-tight">
          <CountUp end={todayRevenue} duration={1200} />
        </span>
        <span className="text-lg font-medium text-wtext-3 dark:text-rink-300">원</span>
      </div>

      {/* 프로그레스 바 */}
      <div className="w-full h-2 rounded-full bg-wline-2 dark:bg-rink-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-ice-500 transition-all duration-700 ease-out"
          style={{ width: `${clampedRate}%` }}
          role="progressbar"
          aria-valuenow={clampedRate}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="월간 매출 목표 진행률"
        />
      </div>

      {/* 하단: 달성률 텍스트 */}
      <p className="mt-2 text-xs font-medium text-wtext-3 dark:text-rink-300">
        월간 목표의 <span className="text-ice-500 dark:text-blue-400 font-semibold">{monthlyGoal.rate}%</span>
      </p>
    </div>
  );
}
