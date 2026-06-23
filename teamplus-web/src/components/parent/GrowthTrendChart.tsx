'use client';

import { cn } from '@/lib/utils';

/**
 * GrowthTrendChart - 6개월 성장 트렌드 SVG 라인 차트
 *
 * recharts 의존성 없이 순수 SVG로 렌더링합니다.
 * - 다크모드 완전 지원
 * - 그라디언트/블러/컬러 그림자 사용 금지
 * - WCAG 2.1 AA 준수
 */

export interface TrendDataPoint {
  /** 라벨 (예: "JAN", "1월") */
  label: string;
  /** 값 (0~100) */
  value: number;
}

export interface GrowthTrendChartProps {
  /** 데이터 포인트 배열 (3개 이상 권장) */
  data: TrendDataPoint[];
  /** 차트 제목 */
  title?: string;
  /** 차트 부제 */
  subtitle?: string;
  /** 우측 상단 배지 텍스트 */
  badge?: string;
  /** 추가 className */
  className?: string;
}

const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 160;
const PADDING = 10;
const CHART_WIDTH = VIEWBOX_WIDTH - PADDING * 2;
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING * 2;

export function GrowthTrendChart({
  data,
  title = '성장 추이',
  subtitle,
  badge,
  className = '',
}: GrowthTrendChartProps) {
  const points = data && data.length > 0 ? data : [];
  const hasData = points.length >= 2;

  // 좌표 계산
  const maxValue = Math.max(100, ...points.map((p) => p.value));
  const minValue = Math.min(0, ...points.map((p) => p.value));
  const range = maxValue - minValue || 1;

  const coordinates = points.map((p, idx) => {
    const x = PADDING + (idx / Math.max(1, points.length - 1)) * CHART_WIDTH;
    const y = PADDING + (1 - (p.value - minValue) / range) * CHART_HEIGHT;
    return { x, y, ...p };
  });

  const linePath = coordinates.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline dark:border-rink-700 p-5',
        className
      )}
    >
      {/* 헤더 */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-base font-bold text-wtext-1 dark:text-white">{title}</h3>
          {subtitle && (
            <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">{subtitle}</p>
          )}
        </div>
        {badge && (
          <span className="text-[10px] bg-wline-2 dark:bg-rink-700 px-2 py-1 rounded text-wtext-3 dark:text-rink-100 uppercase font-semibold">
            {badge}
          </span>
        )}
      </div>

      {/* 차트 영역 */}
      {hasData ? (
        <>
          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT + 20}`}
              className="w-full h-44"
              role="img"
              aria-label={`${title} 차트`}
            >
              {/* 격자 라인 */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = PADDING + ratio * CHART_HEIGHT;
                return (
                  <line
                    key={ratio}
                    x1={PADDING}
                    x2={PADDING + CHART_WIDTH}
                    y1={y}
                    y2={y}
                    className="stroke-slate-100 dark:stroke-slate-700"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                  />
                );
              })}

              {/* 라인 */}
              <path
                d={linePath}
                fill="none"
                className="stroke-primary"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 데이터 포인트 */}
              {coordinates.map((c, idx) => (
                <g key={idx}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="4"
                    className="fill-white stroke-primary dark:fill-slate-800"
                    strokeWidth="2"
                  />
                  {/* 마지막 포인트 하이라이트 */}
                  {idx === coordinates.length - 1 && (
                    <text
                      x={c.x}
                      y={c.y - 10}
                      textAnchor="middle"
                      className="fill-primary text-[10px] font-bold"
                    >
                      {c.value}
                    </text>
                  )}
                </g>
              ))}

              {/* X축 라벨 */}
              {coordinates.map((c, idx) => (
                <text
                  key={`label-${idx}`}
                  x={c.x}
                  y={VIEWBOX_HEIGHT + 12}
                  textAnchor="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[9px] font-medium"
                >
                  {c.label}
                </text>
              ))}
            </svg>
          </div>

          {/* 요약 통계 */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-wline-2 dark:border-rink-700">
            <div>
              <p className="text-[10px] text-wtext-3 uppercase font-bold">현재</p>
              <p className="text-lg font-extrabold text-wtext-1 dark:text-white">
                {coordinates[coordinates.length - 1]?.value ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-wtext-3 uppercase font-bold">평균</p>
              <p className="text-lg font-bold text-wtext-2 dark:text-rink-100">
                {Math.round(points.reduce((sum, p) => sum + p.value, 0) / points.length)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-wtext-3 uppercase font-bold">최고</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {Math.max(...points.map((p) => p.value))}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-wtext-3">show_chart</span>
          </div>
          <p className="text-sm text-wtext-3 dark:text-rink-300">데이터가 부족합니다</p>
        </div>
      )}
    </div>
  );
}
