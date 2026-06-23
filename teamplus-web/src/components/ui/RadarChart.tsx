'use client';

import { memo } from 'react';

interface RadarChartProps {
  data: {
    label: string;
    value: number; // 0-100
    fullMark: number;
  }[];
  size?: number;
  color?: string;
}

export const RadarChart = memo(function RadarChart({ 
  data, 
  size = 200, 
  color = 'rgba(16, 185, 129, 0.6)' // emerald-500 equivalent with opacity
}: RadarChartProps) {
  const center = size / 2;
  const radius = (size / 2) * 0.75; // Leave some padding for labels
  const angleSlice = (Math.PI * 2) / data.length;

  // Helper to calculate coordinates
  const getCoordinates = (value: number, index: number, max: number) => {
    const angle = index * angleSlice - Math.PI / 2; // Start from top
    const r = (value / max) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Generate polygon points
  const points = data.map((d, i) => {
    const coords = getCoordinates(d.value, i, d.fullMark);
    return `${coords.x},${coords.y}`;
  }).join(' ');

  // Generate grid levels (20%, 40%, 60%, 80%, 100%)
  const levels = [0.2, 0.4, 0.6, 0.8, 1];

  // WCAG — SVG에 title/desc로 차트 요약 제공 (스크린리더 alternative)
  const ariaSummary = data
    .map((d) => `${d.label} ${Math.round((d.value / d.fullMark) * 100)}%`)
    .join(', ');

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="overflow-visible"
        role="img"
        aria-label={`레이더 차트: ${ariaSummary}`}
      >
        <title>레이더 차트</title>
        <desc>{ariaSummary}</desc>
        {/* Grid Lines (Levels) */}
        {levels.map((level, i) => (
          <polygon
            key={i}
            points={data.map((d, index) => {
              const coords = getCoordinates(d.fullMark * level, index, d.fullMark);
              return `${coords.x},${coords.y}`;
            }).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.1}
            className="text-wtext-3 dark:text-rink-300"
            aria-hidden="true"
          />
        ))}

        {/* Axes Lines */}
        {data.map((d, i) => {
          const end = getCoordinates(d.fullMark, i, d.fullMark);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              strokeOpacity={0.1}
              className="text-wtext-3 dark:text-rink-300"
            />
          );
        })}

        {/* Data Area */}
        <polygon
          points={points}
          fill={color}
          stroke={color.replace('0.6', '1')}
          strokeWidth={2}
          className="drop-shadow-sm transition-all duration-1000 ease-out"
        />

        {/* Data Points (Dots) */}
        {data.map((d, i) => {
          const coords = getCoordinates(d.value, i, d.fullMark);
          return (
            <circle
              key={i}
              cx={coords.x}
              cy={coords.y}
              r={3}
              fill="white"
              stroke={color.replace('0.6', '1')}
              strokeWidth={2}
            />
          );
        })}

        {/* Labels */}
        {data.map((d, i) => {
          const angle = i * angleSlice - Math.PI / 2;
          const labelRadius = radius * 1.25; // Push labels out further
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);
          
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] font-bold fill-slate-500 dark:fill-slate-400 uppercase tracking-wider"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
});
