'use client';

/**
 * ScoreRadar - 기술 평가용 레이더 차트 래퍼
 * 기존 `components/ui/RadarChart`를 래핑하여 0~5 점수 체계와
 * 중앙 평균값 오버레이, 긴 라벨 줄바꿈을 지원합니다.
 */

import { memo } from 'react';
import { RadarChart } from '@/components/ui/RadarChart';

export interface ScoreRadarItem {
  /** 축 라벨 (예: "스케이팅") */
  label: string;
  /** 점수 값 */
  value: number;
  /** 최대값 (기본 5) */
  max?: number;
}

export interface ScoreRadarProps {
  /** 점수 배열 (5축 권장) */
  scores: ScoreRadarItem[];
  /** 중앙에 표시할 값 (예: "4.6") */
  centerValue?: number | string;
  /** 중앙 라벨 (예: "평균 점수") */
  centerLabel?: string;
  /** 차트 크기 (px, 기본 280) */
  size?: number;
  /** 차트 데이터 영역 색상 (rgba 권장) */
  color?: string;
  /** 추가 클래스 */
  className?: string;
}

/**
 * 긴 라벨을 공백 기준으로 줄바꿈 처리.
 * 기존 RadarChart는 단일 줄 `<text>`만 지원하므로 자모 단위 개행 대신
 * 6자 이상인 경우 중앙 공백 또는 앞 절반에서 분절합니다.
 */
function formatAxisLabel(label: string): string {
  if (label.length <= 5) return label;
  // 공백 포함 시 첫 공백 기준 분절 (현재 RadarChart는 단일 text라 축약만 가능)
  const trimmed = label.trim();
  return trimmed.length > 6 ? trimmed.slice(0, 6) : trimmed;
}

export const ScoreRadar = memo(function ScoreRadar({
  scores,
  centerValue,
  centerLabel,
  size = 280,
  color = 'rgba(30, 63, 174, 0.35)', // TEAMPLUS Primary #1E3FAE (alpha)
  className = '',
}: ScoreRadarProps) {
  // 기존 RadarChart 스펙은 value 0~100, fullMark. 0~max 점수를 0~100으로 정규화.
  const mappedData = scores.map((s) => {
    const max = s.max ?? 5;
    const normalizedMax = 100;
    const normalizedValue = Math.max(
      0,
      Math.min(normalizedMax, (s.value / max) * normalizedMax),
    );
    return {
      label: formatAxisLabel(s.label),
      value: normalizedValue,
      fullMark: normalizedMax,
    };
  });

  const hasCenter = centerValue !== undefined && centerValue !== null;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <RadarChart data={mappedData} size={size} color={color} />

      {hasCenter && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-3xl font-bold text-wtext-1 dark:text-white">
            {centerValue}
          </span>
          {centerLabel && (
            <span className="mt-1 text-sm text-wtext-3 dark:text-rink-300">
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default ScoreRadar;
