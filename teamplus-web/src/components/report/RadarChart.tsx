'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface SkillData {
  skating: number;
  shooting: number;
  passing: number;
  agility: number;
  teamwork: number;
}

interface RadarChartProps {
  data: SkillData;
  isAnimated?: boolean;
  /** ICETIMES 색상 적용. 기본 false = 기존 primary 색 그대로 (미전달 화면 영향 0). 로직·축 계산 동결, 색상만 분기. */
  iceTheme?: boolean;
}

export function RadarChart({ data, isAnimated = true, iceTheme = false }: RadarChartProps) {
  const average = useMemo(() => (
    (data.skating + data.shooting + data.passing + data.agility + data.teamwork) /
    5
  ).toFixed(1), [data]);

  // Calculate coordinates for pentagon (5 points)
  const calculatePoint = (value: number, index: number, animated: boolean): { x: number; y: number } => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2; // Start from top
    const animatedValue = animated ? value : 0;
    const radius = 16 + (animatedValue / 5) * 64; // Min 16, max 80
    return {
      x: 100 + radius * Math.cos(angle),
      y: 100 + radius * Math.sin(angle),
    };
  };

  const values = useMemo(() => [data.skating, data.shooting, data.passing, data.agility, data.teamwork], [data]);
  const points = useMemo(() => values.map((v, i) => calculatePoint(v, i, isAnimated)), [values, isAnimated]);
  const pathD = useMemo(() => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z', [points]);

  // Background web rings (1-5)
  const webRings = useMemo(() => [1, 2, 3, 4, 5].map((level) => {
    const ringPoints = [0, 1, 2, 3, 4].map((i) => {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const radius = 16 + (level / 5) * 64;
      return { x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle) };
    });
    return ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  }), []);

  // Axis endpoints
  const axisPoints = useMemo(() => [0, 1, 2, 3, 4].map((i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    return { x: 100 + 80 * Math.cos(angle), y: 100 + 80 * Math.sin(angle) };
  }), []);

  // Labels positions
  const labelPositions = [
    { x: 100, y: 8, anchor: 'middle', label: '스케이팅' },
    { x: 192, y: 75, anchor: 'start', label: '슈팅' },
    { x: 155, y: 185, anchor: 'middle', label: '패스' },
    { x: 45, y: 185, anchor: 'middle', label: '민첩성' },
    { x: 8, y: 75, anchor: 'end', label: '팀워크' },
  ];

  // 데이터 라벨 매핑 (스크린리더 / 데이터 테이블 대체용)
  const dataRows = useMemo(
    () => [
      { label: '스케이팅', value: data.skating },
      { label: '슈팅', value: data.shooting },
      { label: '패스', value: data.passing },
      { label: '민첩성', value: data.agility },
      { label: '팀워크', value: data.teamwork },
    ],
    [data],
  );

  const titleId = 'radar-chart-title';
  const descId = 'radar-chart-desc';
  const ariaSummary = dataRows
    .map((row) => `${row.label} ${row.value.toFixed(1)}점`)
    .join(', ');

  return (
    <div className="relative w-full aspect-square max-w-[280px] mx-auto">
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <title id={titleId}>능력치 분석 레이더 차트</title>
        <desc id={descId}>
          5점 만점. 평균 {average}점. 항목별 점수: {ariaSummary}.
        </desc>
        {/* Background Webs */}
        <g
          className={cn(
            'fill-transparent',
            iceTheme
              ? 'stroke-it-line dark:stroke-it-ink-700'
              : 'stroke-slate-200 dark:stroke-slate-700',
          )}
          strokeWidth="1"
          aria-hidden="true"
        >
          {webRings.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        {/* Axis Lines */}
        <g
          className={cn(
            iceTheme
              ? 'stroke-it-line dark:stroke-it-ink-700'
              : 'stroke-slate-200 dark:stroke-slate-700',
          )}
          strokeWidth="1"
          aria-hidden="true"
        >
          {axisPoints.map((point, i) => (
            <line key={i} x1="100" y1="100" x2={point.x} y2={point.y} />
          ))}
        </g>

        {/* Data Shape */}
        <path
          d={pathD}
          className={cn(iceTheme ? 'fill-it-blue-500/20 stroke-it-blue-500' : 'fill-primary/20 stroke-primary')}
          strokeWidth="2"
          style={{
            transition: 'all 1s ease-out',
          }}
        />

        {/* Data Points */}
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r="3"
            className={cn(iceTheme ? 'fill-it-blue-500' : 'fill-primary')}
            style={{
              transition: 'all 1s ease-out',
              transitionDelay: `${i * 100}ms`,
              opacity: isAnimated ? 1 : 0,
            }}
          />
        ))}

        {/* Labels */}
        {labelPositions.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor as 'start' | 'middle' | 'end'}
            className={cn(
              'text-card-meta font-bold',
              iceTheme ? 'fill-it-ink-400 dark:fill-it-ink-300' : 'fill-slate-500 dark:fill-slate-400',
            )}
          >
            {label.label}
          </text>
        ))}

        {/* Center Value */}
        <text
          x="100"
          y="102"
          textAnchor="middle"
          dominantBaseline="middle"
          className={cn('text-card-body font-bold', iceTheme ? 'fill-it-blue-500' : 'fill-primary')}
          style={{
            transition: 'opacity 0.5s ease-out',
            transitionDelay: '800ms',
            opacity: isAnimated ? 1 : 0,
          }}
          aria-hidden="true"
        >
          {average}
        </text>
      </svg>

      {/* WCAG 데이터 테이블 alternative — 시각 사용자에게는 보이지 않지만 스크린리더 사용 가능 */}
      <table className="sr-only">
        <caption>능력치 점수 (5점 만점)</caption>
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">점수</th>
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value.toFixed(1)}점</td>
            </tr>
          ))}
          <tr>
            <th scope="row">평균</th>
            <td>{average}점</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
