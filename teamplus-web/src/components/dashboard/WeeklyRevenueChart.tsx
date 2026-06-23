'use client';

import { useMemo } from 'react';
import { MESSAGES } from '@/lib/messages';

export interface WeeklyRevenueChartProps {
  data: { date: string; revenue: number; label: string }[];
}

/**
 * 주간 매출 추이 막대 그래프 (순수 SVG)
 * Design 7 Principles 적용 · AI 스타일 금지
 */
export function WeeklyRevenueChart({ data }: WeeklyRevenueChartProps) {
  const maxRevenue = useMemo(() => Math.max(...data.map((d) => d.revenue), 1), [data]);

  const formatAmount = (amount: number): string => {
    if (amount >= 10000) return `${Math.round(amount / 10000)}만`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}천`;
    return amount.toLocaleString();
  };

  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-wtext-1 dark:text-white">{MESSAGES.dashboard.weeklyTrend}</h3>
          <span className="text-xs text-wtext-3 dark:text-rink-300">최근 7일</span>
        </div>
        <div className="flex items-center justify-center h-[180px] text-sm text-wtext-3 dark:text-rink-300">
          {MESSAGES.dashboard.noRevenueData}
        </div>
      </div>
    );
  }

  const barWidth = 28;
  const barGap = 16;
  const chartWidth = data.length * (barWidth + barGap) - barGap;
  const chartHeight = 120;
  const labelAreaTop = 20;
  const labelAreaBottom = 24;
  const svgWidth = chartWidth + 20;
  const svgHeight = chartHeight + labelAreaTop + labelAreaBottom;

  /**
   * 과거 → 오늘 방향으로 점진적 컬러 농도 적용.
   * index 0 (가장 오래된 데이터) → 가장 흐림
   * 마지막 index (오늘)          → 가장 진함 (primary #1E3FAE)
   * AI 스타일 금지 — 솔리드 컬러 단계만 사용
   */
  const getBarColor = (index: number, total: number): string => {
    const isLast = index === total - 1;
    if (isLast) return '#1E3FAE'; // primary
    const ratio = total > 1 ? index / (total - 1) : 0;
    // blue-100 → blue-200 → blue-300 → blue-400 → blue-500 순으로 농도 증가
    if (ratio < 0.2) return '#DBEAFE'; // blue-100
    if (ratio < 0.4) return '#BFDBFE'; // blue-200
    if (ratio < 0.6) return '#93C5FD'; // blue-300
    if (ratio < 0.8) return '#60A5FA'; // blue-400
    return '#3B82F6'; // blue-500
  };

  const getBarColorDark = (index: number, total: number): string => {
    const isLast = index === total - 1;
    if (isLast) return '#60A5FA'; // blue-400 (다크모드 primary 보완)
    const ratio = total > 1 ? index / (total - 1) : 0;
    if (ratio < 0.2) return '#1E293B'; // slate-800
    if (ratio < 0.4) return '#334155'; // slate-700
    if (ratio < 0.6) return '#475569'; // slate-600
    if (ratio < 0.8) return '#1E40AF'; // blue-800
    return '#1D4ED8'; // blue-700
  };

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-wtext-1 dark:text-white">{MESSAGES.dashboard.weeklyTrend}</h3>
        <span className="text-xs text-wtext-3 dark:text-rink-300">최근 7일</span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto"
          role="img"
          aria-label={`주간 매출 추이 차트. 최고 매출 ${formatAmount(maxRevenue)}원`}
        >
          {data.map((item, index) => {
            const isLast = index === data.length - 1;
            const barHeight = maxRevenue > 0 ? (item.revenue / maxRevenue) * chartHeight : 0;
            const x = 10 + index * (barWidth + barGap);
            const y = labelAreaTop + (chartHeight - barHeight);
            const lightColor = getBarColor(index, data.length);
            const darkColor = getBarColorDark(index, data.length);

            return (
              <g key={item.date}>
                {/* 막대 - 라이트 모드 */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx={4}
                  fill={lightColor}
                  className="dark:hidden"
                />
                {/* 막대 - 다크 모드 */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx={4}
                  fill={darkColor}
                  className="hidden dark:block"
                />

                {/* 금액 라벨 (막대 위) */}
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className={`text-card-meta font-semibold ${
                    isLast
                      ? 'fill-primary dark:fill-blue-400'
                      : 'fill-slate-400 dark:fill-slate-500'
                  }`}
                >
                  {formatAmount(item.revenue)}
                </text>

                {/* 요일 라벨 (막대 아래) */}
                <text
                  x={x + barWidth / 2}
                  y={labelAreaTop + chartHeight + 16}
                  textAnchor="middle"
                  className={`text-card-meta font-bold ${
                    isLast
                      ? 'fill-primary dark:fill-blue-400 uppercase tracking-wider'
                      : 'fill-slate-400 dark:fill-slate-500'
                  }`}
                >
                  {isLast ? '오늘' : item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
