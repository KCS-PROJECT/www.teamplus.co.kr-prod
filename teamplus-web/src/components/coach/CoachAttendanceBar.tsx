'use client';

import { memo, useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * CoachAttendanceBar - 코치 출석률 시각화 바
 *
 * 사용처: coach 대시보드, coach-members 상세
 * 패턴: 프로그레스 바 + 출석/결석/총원 통계 + 트렌드 표시
 */
export interface CoachAttendanceBarProps {
  /** 출석률 (0-100) */
  rate: number;
  /** 출석 인원 */
  presentCount: number;
  /** 결석 인원 */
  absentCount: number;
  /** 총 인원 */
  totalCount: number;
  /** 전월 대비 변동 (%) */
  trend?: number;
  /** 애니메이션 활성화 여부 */
  animated?: boolean;
  /** 추가 className */
  className?: string;
}

/** 출석률 기반 프로그레스 바 색상 */
function getBarColor(rate: number): string {
  if (rate >= 90) return 'bg-green-500';
  if (rate >= 70) return 'bg-ice-500';
  if (rate >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

/** 출석률 기반 라벨 */
function getRateLabel(rate: number): string {
  if (rate >= 90) return '매우 우수';
  if (rate >= 70) return '우수';
  if (rate >= 50) return '보통';
  return '주의 필요';
}

export const CoachAttendanceBar = memo(function CoachAttendanceBar({
  rate,
  presentCount,
  absentCount,
  totalCount,
  trend,
  animated = true,
  className,
}: CoachAttendanceBarProps) {
  const [isVisible, setIsVisible] = useState(!animated);

  useEffect(() => {
    if (!animated) return;
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, [animated]);

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Icon name="groups" className="text-ice-500 text-base" aria-hidden="true" />
          </div>
          <div>
            <span className="text-sm font-bold text-wtext-1 dark:text-white block leading-tight">
              출석률
            </span>
            <span className="text-[11px] text-wtext-3 dark:text-rink-300">
              {getRateLabel(rate)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-2xl font-extrabold text-wtext-1 dark:text-white tabular-nums">
            {rate}%
          </span>
          {trend !== undefined && trend !== 0 && (
            <span
              className={cn(
                'text-xs font-semibold px-1.5 py-0.5 rounded',
                trend > 0
                  ? 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                  : 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="relative h-3 w-full bg-wline-2 dark:bg-rink-700 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={rate}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`출석률 ${rate}%`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000 ease-out',
            getBarColor(rate)
          )}
          style={{ width: isVisible ? `${rate}%` : '0%' }}
        />
        <div className="absolute inset-0 flex" aria-hidden="true">
          <div className="w-1/4 border-r border-white/30 dark:border-rink-700/30" />
          <div className="w-1/4 border-r border-white/30 dark:border-rink-700/30" />
          <div className="w-1/4 border-r border-white/30 dark:border-rink-700/30" />
          <div className="w-1/4" />
        </div>
      </div>

      {/* Summary */}
      <div className="flex justify-between mt-2">
        <span className="text-xs text-wtext-3 dark:text-rink-300">
          출석 <strong className="text-wtext-2 dark:text-rink-100">{presentCount}</strong>명
        </span>
        <span className="text-xs text-wtext-3 dark:text-rink-300">
          결석 <strong className="text-wtext-2 dark:text-rink-100">{absentCount}</strong>명
        </span>
        <span className="text-xs text-wtext-3 dark:text-rink-300">
          총원 <strong className="text-wtext-2 dark:text-rink-100">{totalCount}</strong>명
        </span>
      </div>
    </div>
  );
});
