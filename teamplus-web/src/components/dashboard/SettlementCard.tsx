'use client';

import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

export interface SettlementCardProps {
  monthlyTotal: number;
  goalRate: number;
  /**
   * 전월 동기 대비 증감률 (%).
   * 양수: 상승, 음수: 하락, 0/undefined: 표시 안 함
   */
  monthOverMonth?: number;
}

/**
 * 정산 현황 카드
 * Design 7 Principles 적용 · AI 스타일 금지 (gradient/blur/color shadow 없음)
 */
export function SettlementCard({ monthlyTotal, goalRate, monthOverMonth }: SettlementCardProps) {
  const clampedRate = Math.min(goalRate, 100);
  const isGoalAchieved = goalRate >= 100;

  const hasComparison = typeof monthOverMonth === 'number' && monthOverMonth !== 0;
  const isPositiveMoM = (monthOverMonth ?? 0) >= 0;

  return (
    <div className="relative bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-5 overflow-hidden">
      {/* 상단: 아이콘 박스 + 목표 달성 뱃지 (HTML 시안: orange 금융 뉘앙스) */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <Icon
              name="account_balance_wallet"
              className="text-xl text-orange-600 dark:text-orange-400"
              aria-hidden="true"
            />
          </div>
          <span className="text-sm font-medium text-wtext-3 dark:text-rink-300">
            {MESSAGES.dashboard.monthlyTotal}
          </span>
        </div>

        {isGoalAchieved && (
          <div
            className="flex items-center gap-0.5 px-2 py-1 rounded-md text-card-meta font-bold bg-blue-50 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400"
            aria-label="월간 목표 달성 완료"
          >
            <span>{MESSAGES.dashboard.adminDashboard.goalAchieved}</span>
            <Icon name="check_circle" className="text-sm" />
          </div>
        )}
      </div>

      {/* 금액 */}
      <div className="flex items-baseline gap-1 mb-4 justify-end">
        <span className="text-3xl font-extrabold text-wtext-1 dark:text-white tracking-tight">
          <CountUp end={monthlyTotal} duration={1200} />
        </span>
        <span className="text-lg font-medium text-wtext-3 dark:text-rink-300">원</span>
      </div>

      {/* 목표 달성률 라벨 + 퍼센트 */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100">
          {MESSAGES.dashboard.adminDashboard.goalAchievement}
        </span>
        <span className="text-card-meta font-bold text-ice-500 dark:text-blue-400">{goalRate}%</span>
      </div>

      {/* 프로그레스 바 (HTML 시안: primary) */}
      <div className="w-full h-2 rounded-full bg-wline-2 dark:bg-rink-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-ice-500 transition-all duration-700 ease-out"
          style={{ width: `${clampedRate}%` }}
          role="progressbar"
          aria-valuenow={clampedRate}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="월간 정산 목표 진행률"
        />
      </div>

      {/* 전월 대비 (HTML 시안: green-600) */}
      {hasComparison && (
        <p className="mt-2 text-card-meta font-medium text-wtext-3 dark:text-rink-300">
          {MESSAGES.dashboard.adminDashboard.comparedToLastMonth}{' '}
          <span
            className={cn(
              'font-bold',
              isPositiveMoM
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-500 dark:text-red-400'
            )}
          >
            {isPositiveMoM ? '+' : ''}
            {monthOverMonth}%
          </span>{' '}
          {isPositiveMoM ? '증가' : '감소'}
        </p>
      )}
    </div>
  );
}
