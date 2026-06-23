'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * SimpleBarChart - 주간/일간 매출 바 차트
 *
 * 7일/요일 기반 바 차트. 오늘 강조 표시.
 *
 * Design Rules:
 * - 솔리드 컬러 (primary opacity 단계 사용)
 * - 그라디언트 금지, 다크모드 지원
 */
export interface BarChartDataPoint {
  label: string;
  value: number;
  isToday?: boolean;
}

export interface SimpleBarChartProps {
  /** 데이터 포인트 배열 */
  data: BarChartDataPoint[];
  /** 차트 높이 (px) */
  height?: number;
  /** 제목 */
  title?: string;
  /** 부제목 */
  subtitle?: string;
  /** 바 색상 (Tailwind class prefix, 예: "bg-ice-500") */
  barColor?: string;
  /** 추가 className */
  className?: string;
}

export const SimpleBarChart = memo(function SimpleBarChart({
  data,
  height = 128,
  title,
  subtitle,
  barColor = 'bg-ice-500',
  className,
}: SimpleBarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 p-4 rounded-lg shadow-sm',
        'border border-wline-2 dark:border-rink-700',
        className,
      )}
    >
      {/* 헤더 */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between mb-6">
          {title && (
            <h4 className="text-sm font-bold text-wtext-1 dark:text-white">{title}</h4>
          )}
          {subtitle && (
            <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
              {subtitle}
            </span>
          )}
        </div>
      )}

      {/* 바 차트 */}
      <div
        className="flex items-end justify-between gap-2"
        style={{ height }}
        role="img"
        aria-label={title || '바 차트'}
      >
        {data.map((d, i) => {
          const heightPercent = (d.value / maxValue) * 100;
          // 오늘이면 최대 opacity, 아니면 점진적 opacity
          const opacity = d.isToday
            ? ''
            : i < data.length - 3
              ? '/10'
              : i < data.length - 2
                ? '/20'
                : '/40';

          return (
            <div key={i} className="flex flex-col items-center flex-1 gap-2">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all duration-300',
                  d.isToday ? barColor : `${barColor}${opacity}`,
                )}
                style={{ height: `${Math.max(heightPercent, 4)}%` }}
                role="presentation"
              />
              <span
                className={cn(
                  'text-card-meta font-medium',
                  d.isToday
                    ? 'font-bold text-ice-500 dark:text-blue-400'
                    : 'text-wtext-3 dark:text-rink-300',
                )}
              >
                {d.isToday ? '오늘' : d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
