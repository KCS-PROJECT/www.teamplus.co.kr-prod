'use client';

/**
 * AttendanceRing - 출석률/퍼센트 원형 프로그레스 링
 * SVG 기반으로 0~100% 값을 시각화하며, 중앙에 큰 퍼센트 텍스트와
 * 선택적 라벨을 표시합니다. 아동 UI(WCAG AAA) 고려 18px+ 폰트.
 */

import { memo, useId } from 'react';

export type AttendanceRingColor = 'primary' | 'success' | 'warning' | 'error';

export interface AttendanceRingProps {
  /** 퍼센트 (0~100) */
  percentage: number;
  /** 하단 라벨 (예: "최근 출석률") */
  label?: string;
  /** 링 크기 (px, 기본 120) */
  size?: number;
  /** 선 두께 (기본 10) */
  strokeWidth?: number;
  /** 컬러 토큰 */
  color?: AttendanceRingColor;
  /** 퍼센트(%) 기호 표시 여부 (기본 true) */
  showPercentSign?: boolean;
  /** 추가 클래스 */
  className?: string;
}

/** TEAMPLUS 디자인 토큰 기반 컬러 매핑 (AI 그라디언트 금지) */
// SVG stroke 속성은 Tailwind 클래스를 받지 않으므로 hex 가 필요.
// CSS var 사용 시 SSR/Hydration 시점에 미반영될 수 있어 디자인 토큰 hex 직값을 보존.
// (RULE-8 임의 hex 금지의 합법적 예외 — SVG 속성 한정)
const COLOR_MAP: Record<AttendanceRingColor, { stroke: string; text: string; track: string }> = {
  primary: {
    stroke: '#2f5fff', // ice-500 / --ice-primary
    text: 'text-ice-500 dark:text-blue-400',
    track: 'stroke-slate-200 dark:stroke-slate-700',
  },
  success: {
    stroke: '#16A34A', // success-500
    text: 'text-success dark:text-green-400',
    track: 'stroke-slate-200 dark:stroke-slate-700',
  },
  warning: {
    stroke: '#EAB308', // warning-500
    text: 'text-warning dark:text-yellow-400',
    track: 'stroke-slate-200 dark:stroke-slate-700',
  },
  error: {
    stroke: '#DC2626', // error-500
    text: 'text-error dark:text-red-400',
    track: 'stroke-slate-200 dark:stroke-slate-700',
  },
};

export const AttendanceRing = memo(function AttendanceRing({
  percentage,
  label,
  size = 120,
  strokeWidth = 10,
  color = 'primary',
  showPercentSign = true,
  className = '',
}: AttendanceRingProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const tokens = COLOR_MAP[color];
  const titleId = useId();

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center ${className}`}
      style={{ width: size }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-labelledby={titleId}
          className="-rotate-90 transform"
        >
          <title id={titleId}>{`${Math.round(clamped)}% ${label ?? ''}`.trim()}</title>
          {/* Track (배경) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className={tokens.track}
          />
          {/* Progress */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={tokens.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
          />
        </svg>

        {/* 중앙 텍스트 (absolute 오버레이) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-bold tabular-nums ${tokens.text}`}
            style={{ fontSize: Math.max(18, size * 0.22) }}
          >
            {Math.round(clamped)}
            {showPercentSign && <span className="ml-0.5 text-base">%</span>}
          </span>
        </div>
      </div>

      {label && (
        <span className="mt-2 text-center text-[18px] font-medium text-wtext-2 dark:text-rink-100">
          {label}
        </span>
      )}
    </div>
  );
});

export default AttendanceRing;
