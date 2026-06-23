'use client';

import { useMemo } from 'react';

export interface MonthlyRevenueChartProps {
  data: { month: string; revenue: number }[];
}

/**
 * 월간 매출 추이 영역 차트 (순수 SVG)
 * Design 7 Principles 적용 · AI 스타일 금지
 */
export function MonthlyRevenueChart({ data }: MonthlyRevenueChartProps) {
  const padding = { top: 30, right: 20, bottom: 40, left: 20 };
  const chartWidth = 320 - padding.left - padding.right;
  const chartHeight = 200 - padding.top - padding.bottom;

  const maxRevenue = useMemo(() => Math.max(...data.map((d) => d.revenue), 1), [data]);

  const formatAmount = (amount: number): string => {
    if (amount >= 10000) return `${Math.round(amount / 10000)}만`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}천`;
    return amount.toLocaleString();
  };

  /** "2025-12" → "12월", "3월" → "3월" (이미 변환된 경우 그대로) */
  const formatMonth = (month: string): string => {
    if (month.includes('월')) return month;
    const parts = month.split('-');
    if (parts.length === 2) {
      return `${parseInt(parts[1], 10)}월`;
    }
    return month;
  };

  if (!data || data.length < 2) {
    return (
      <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-wtext-1 dark:text-white">월간 매출 추이</h3>
          <span className="text-card-meta text-wtext-3 dark:text-rink-300">최근 6개월</span>
        </div>
        <div className="flex items-center justify-center h-[180px] text-sm text-wtext-3 dark:text-rink-300">
          성과 데이터가 없습니다
        </div>
      </div>
    );
  }

  const points = data.map((d, i) => ({
    x: padding.left + (i * chartWidth) / (data.length - 1),
    y: padding.top + chartHeight - (d.revenue / maxRevenue) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x},${padding.top + chartHeight} L ${points[0].x},${padding.top + chartHeight} Z`;

  // Y축 가이드라인 (4단계)
  const guideLines = [0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: padding.top + chartHeight - ratio * chartHeight,
    label: formatAmount(Math.round(maxRevenue * ratio)),
  }));

  // 최고점 인덱스
  const maxIndex = data.reduce((maxI, d, i, arr) => (d.revenue > arr[maxI].revenue ? i : maxI), 0);

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-wtext-1 dark:text-white">월간 매출 추이</h3>
        <span className="text-card-meta text-wtext-3 dark:text-rink-300">최근 6개월</span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 320 200"
          className="w-full h-auto"
          role="img"
          aria-label={`월간 매출 추이 차트. 최고 매출 ${formatAmount(maxRevenue)}원`}
        >
          {/* Y축 가이드라인 */}
          {guideLines.map((line) => (
            <g key={line.y}>
              <line
                x1={padding.left}
                y1={line.y}
                x2={320 - padding.right}
                y2={line.y}
                stroke="currentColor"
                strokeWidth={0.5}
                strokeDasharray="4 3"
                className="text-wtext-3 dark:text-wtext-2"
              />
              <text
                x={padding.left - 2}
                y={line.y - 4}
                textAnchor="start"
                className="text-card-meta fill-slate-400 dark:fill-slate-500"
              >
                {line.label}
              </text>
            </g>
          ))}

          {/* 베이스라인 */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={320 - padding.right}
            y2={padding.top + chartHeight}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-wtext-3 dark:text-wtext-2"
          />

          {/* Area (영역) */}
          <path d={areaPath} fill="#1E3FAE" fillOpacity={0.08} />

          {/* Line (선) */}
          <path d={linePath} stroke="#1E3FAE" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Points (점) + X축 라벨 */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={4} fill="#1E3FAE" className="dark:fill-blue-400" />
              <circle cx={p.x} cy={p.y} r={2} fill="white" className="dark:fill-slate-800" />

              {/* 최고점 금액 라벨 */}
              {i === maxIndex && (
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  className="text-card-meta font-semibold fill-primary dark:fill-blue-400"
                >
                  {formatAmount(data[i].revenue)}원
                </text>
              )}

              {/* X축 월 라벨 */}
              <text
                x={p.x}
                y={padding.top + chartHeight + 18}
                textAnchor="middle"
                className="text-card-meta font-medium fill-slate-500 dark:fill-slate-400"
              >
                {formatMonth(data[i].month)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
