"use client";

import React, { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * SimpleLineChart - SVG 기반 라인 차트
 *
 * 월간 매출 추이 등 시계열 데이터를 시각화.
 * 솔리드 채움 + 라인 + 데이터 포인트 마커.
 *
 * Design Rules:
 * - AI 스타일 금지 (CSS/SVG gradient 사용 금지)
 * - 접근성: role="img", aria-label
 */
export interface LineChartDataPoint {
  label: string;
  value: number;
}

export interface SimpleLineChartProps {
  /** 데이터 포인트 배열 */
  data: LineChartDataPoint[];
  /** 차트 높이 (px) */
  height?: number;
  /** 라인 색상 (Primary #1E3FAE) */
  lineColor?: string;
  /** 채움 색상 (opacity 적용) */
  fillColor?: string;
  /** 제목 */
  title?: string;
  /** 부제목 */
  subtitle?: string;
  /** 추가 className */
  className?: string;
}

export const SimpleLineChart = memo(function SimpleLineChart({
  data,
  height = 128,
  lineColor = "#1E3FAE",
  fillColor = "#1E3FAE",
  title,
  subtitle,
  className,
}: SimpleLineChartProps) {
  // React 훅은 조건부 return 전에 모두 호출 (Rules of Hooks 준수)
  const { points, polygonPoints, computedPoints } = useMemo(() => {
    if (data.length < 2)
      return {
        points: "",
        polygonPoints: "",
        computedPoints: [] as Array<{ x: number; y: number }>,
      };

    const maxValue = Math.max(...data.map((d) => d.value));
    const minValue = Math.min(...data.map((d) => d.value));
    const range = maxValue - minValue || 1;
    const padding = 5;
    const chartHeight = 50;

    const pts = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y =
        padding + ((maxValue - d.value) / range) * (chartHeight - padding * 2);
      return { x, y };
    });

    const linePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const polygon = `0,${chartHeight} ${linePoints} 100,${chartHeight}`;

    return { points: linePoints, polygonPoints: polygon, computedPoints: pts };
  }, [data]);

  // 데이터 부족 시 렌더링하지 않음 (훅은 이미 모두 호출됨)
  if (data.length < 2) return null;

  return (
    <div
      className={cn(
        "bg-white dark:bg-rink-800 rounded-lg shadow-sm",
        "border border-wline-2 dark:border-rink-700 p-4",
        className,
      )}
    >
      {/* 헤더 */}
      {(title || subtitle) && (
        <div className="flex justify-between items-center mb-6">
          {title && (
            <h3 className="font-bold text-sm text-wtext-1 dark:text-white">
              {title}
            </h3>
          )}
          {subtitle && (
            <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
              {subtitle}
            </span>
          )}
        </div>
      )}

      {/* SVG 차트 */}
      <div className="w-full relative" style={{ height }}>
        <svg
          className="w-full h-full overflow-visible"
          viewBox="0 0 100 50"
          preserveAspectRatio="none"
          role="img"
          aria-label={title || "라인 차트"}
        >
          {/* 채움 영역 */}
          <polygon fill={fillColor} fillOpacity={0.08} points={polygonPoints} />

          {/* 라인 */}
          <polyline
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            vectorEffect="non-scaling-stroke"
          />

          {/* 데이터 포인트 마커 (memoized 좌표 재사용) */}
          {computedPoints.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r="1.5"
              className="fill-white dark:fill-slate-800"
              stroke={lineColor}
              strokeWidth="0.5"
            />
          ))}
        </svg>
      </div>

      {/* X축 라벨 */}
      <div className="flex justify-between text-card-meta text-wtext-3 dark:text-rink-300 mt-3">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
});
