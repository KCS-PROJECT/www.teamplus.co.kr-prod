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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 차트 데이터 영역/점 색을 it-blue(#0e5db0)로, 중앙 평균값을 it-blue 강조 +
   *   라벨을 it-ink 톤으로 스왑. **좌표·정규화·SVG 로직은 전부 동결, 색만 변경.**
   *   (skill-report 호출처만 전달)
   */
  iceTheme?: boolean;
}

// it-blue-500 (#0e5db0) 의 데이터 영역 채움(0.30 alpha). RadarChart 가 '0.6'→'1' 치환으로
// 윤곽/점 stroke 를 산출하므로 alpha 표기를 '0.6' 으로 맞춰 동일 산식이 it-blue 를 그대로 쓰게 한다.
const IT_RADAR_COLOR = 'rgba(14, 93, 176, 0.6)';

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
  color,
  className = '',
  iceTheme = false,
}: ScoreRadarProps) {
  // iceTheme=true → it-blue 채움. 미지정 시 기존 기본색(#1E3FAE alpha) 1:1 보존.
  const radarColor = color ?? (iceTheme ? IT_RADAR_COLOR : 'rgba(30, 63, 174, 0.35)');
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
      <RadarChart data={mappedData} size={size} color={radarColor} />

      {hasCenter && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span
            className={
              iceTheme
                ? 'text-3xl font-extrabold font-num tabular-nums text-it-blue-600 dark:text-it-blue-300'
                : 'text-3xl font-bold text-wtext-1 dark:text-white'
            }
          >
            {centerValue}
          </span>
          {centerLabel && (
            <span
              className={
                iceTheme
                  ? 'mt-1 text-sm font-medium text-it-ink-500 dark:text-rink-300'
                  : 'mt-1 text-sm text-wtext-3 dark:text-rink-300'
              }
            >
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default ScoreRadar;
