"use client";

import { useMemo } from "react";
import { MESSAGES } from "@/lib/messages";

export interface ParentMonthlyChartProps {
  data: {
    month: string; // "1월", "2월" ...
    rate: number; // 출석률 % (0-100)
  }[];
  title?: string; // 기본값: "월간 출석 추이"
}

/**
 * 학부모 대시보드 — 월간 출석 추이 영역 차트 (순수 SVG)
 * Design 7 Principles 적용 · AI 스타일 금지
 */
export function ParentMonthlyChart({
  data,
  title = "월간 출석 추이",
}: ParentMonthlyChartProps) {
  const padding = { top: 30, right: 20, bottom: 40, left: 20 };
  const chartWidth = 320 - padding.left - padding.right;
  const chartHeight = 200 - padding.top - padding.bottom;

  // 최고점 인덱스
  const maxIndex = useMemo(() => {
    if (!data || data.length < 2) return 0;
    return data.reduce(
      (maxI, d, i, arr) => (d.rate > arr[maxI].rate ? i : maxI),
      0,
    );
  }, [data]);

  // 데이터 부족 시 빈 상태
  if (!data || data.length < 2) {
    return (
      <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-wtext-1 dark:text-white">
            {title}
          </h3>
          <span className="text-card-meta text-wtext-3 dark:text-rink-300">
            {MESSAGES.dashboard.parentDashboard.last6Months}
          </span>
        </div>
        <div className="flex items-center justify-center h-[180px] text-sm text-wtext-3 dark:text-rink-300">
          {MESSAGES.dashboard.parentDashboard.performanceData}
        </div>
      </div>
    );
  }

  // 좌표 계산 (Y축 고정 0~100%)
  const points = data.map((d, i) => ({
    x: padding.left + (i * chartWidth) / (data.length - 1),
    y: padding.top + chartHeight - (d.rate / 100) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x},${padding.top + chartHeight} L ${points[0].x},${padding.top + chartHeight} Z`;

  // Y축 가이드라인 (25%, 50%, 75%, 100%)
  const guideLines = [0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: padding.top + chartHeight - ratio * chartHeight,
    label: `${Math.round(ratio * 100)}%`,
  }));

  const maxRate = data[maxIndex].rate;

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-wtext-1 dark:text-white">
          {title}
        </h3>
        <span className="text-card-meta text-wtext-3 dark:text-rink-300">
          {MESSAGES.dashboard.parentDashboard.last6Months}
        </span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 320 200"
          className="w-full h-auto"
          role="img"
          aria-label={`${title} 차트. 최고 출석률 ${maxRate}%`}
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

          {/* 베이스라인 (0%) */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={320 - padding.right}
            y2={padding.top + chartHeight}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-wtext-3 dark:text-wtext-2"
          />

          {/* Area (영역) — 솔리드 fill-opacity */}
          <path d={areaPath} fill="#1E3FAE" fillOpacity={0.08} />

          {/* Line (선) */}
          <path
            d={linePath}
            stroke="#1E3FAE"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points (점) + X축 라벨 */}
          {points.map((p, i) => (
            <g key={i}>
              {/* 최고점 강조 (큰 도트) */}
              {i === maxIndex ? (
                <>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={6}
                    fill="#1E3FAE"
                    fillOpacity={0.15}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="#1E3FAE"
                    className="dark:fill-blue-400"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={2}
                    fill="white"
                    className="dark:fill-slate-800"
                  />
                </>
              ) : (
                <>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="#1E3FAE"
                    className="dark:fill-blue-400"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={2}
                    fill="white"
                    className="dark:fill-slate-800"
                  />
                </>
              )}

              {/* 최고점 라벨 */}
              {i === maxIndex && (
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  className="text-card-meta font-semibold fill-primary dark:fill-blue-400"
                >
                  {data[i].rate}%
                </text>
              )}

              {/* X축 월 라벨 */}
              <text
                x={p.x}
                y={padding.top + chartHeight + 18}
                textAnchor="middle"
                className="text-card-meta font-medium fill-slate-500 dark:fill-slate-400"
              >
                {data[i].month}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
