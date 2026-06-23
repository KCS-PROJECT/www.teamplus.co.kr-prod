'use client';

/**
 * BirthYearRangeSlider - TEAMPLUS Shared Component
 *
 * 출생연도 범위를 양끝 핸들로 선택하는 슬라이더. (2026-05-21 신규)
 * 등록 폼(수업·대회)의 연령 선택을 U라벨 칩에서 출생연도 슬라이딩으로 통일하기 위함.
 *
 * - native `<input type="range">` 2개를 겹쳐 dual-thumb 를 구현 (키보드 접근성 보존).
 * - 트랙 빈 곳 클릭 점프는 막고(두 input pointer-events:none), thumb 만 조작 가능.
 * - 6개 출생연도 눈금을 트랙 아래 표시, 선택 구간 안의 연도를 강조.
 *
 * 사용 화면: /classes-manage/create·edit (수업 등록), /tournaments/create (대회 등록)
 */

import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface BirthYearRangeSliderProps {
  /** 슬라이더 하한 출생연도 (가장 나이 많은 학년 = 작은 연도) */
  min: number;
  /** 슬라이더 상한 출생연도 (가장 어린 학년 = 큰 연도) */
  max: number;
  /** 현재 선택된 시작(작은) 출생연도 */
  valueFrom: number;
  /** 현재 선택된 끝(큰) 출생연도 */
  valueTo: number;
  /** 범위 변경 핸들러 — 항상 from ≤ to 로 정규화되어 전달된다 */
  onChange: (from: number, to: number) => void;
  disabled?: boolean;
  className?: string;
}

export function BirthYearRangeSlider({
  min,
  max,
  valueFrom,
  valueTo,
  onChange,
  disabled = false,
  className,
}: BirthYearRangeSliderProps) {
  const span = Math.max(1, max - min);
  // 핸들 교차 방지 — from 은 to 이하, to 는 from 이상으로 clamp.
  const from = Math.min(Math.max(valueFrom, min), valueTo);
  const to = Math.max(Math.min(valueTo, max), valueFrom);

  const fromPct = ((from - min) / span) * 100;
  const toPct = ((to - min) / span) * 100;

  const handleFrom = useCallback(
    (raw: number) => {
      const next = Math.min(raw, to);
      if (next !== from) onChange(next, to);
    },
    [from, to, onChange],
  );
  const handleTo = useCallback(
    (raw: number) => {
      const next = Math.max(raw, from);
      if (next !== to) onChange(from, next);
    },
    [from, to, onChange],
  );

  // 6개 눈금 연도 목록.
  const ticks: number[] = [];
  for (let y = min; y <= max; y += 1) ticks.push(y);

  return (
    <div className={cn('tp-byr-slider select-none', disabled && 'opacity-50', className)}>
      {/* 트랙 + 핸들 영역 */}
      <div className="relative h-9">
        {/* 트랙 배경 */}
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-wline-2 dark:bg-rink-700" />
        {/* 선택 구간 하이라이트 */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ice-500"
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />
        {/* from 핸들 — from 이 상한 근처면 z-index 를 올려 to 핸들과 겹쳐도 잡히도록 */}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={from}
          disabled={disabled}
          onChange={(e) => handleFrom(Number(e.target.value))}
          aria-label="시작 출생연도"
          aria-valuetext={`${from}년생`}
          className="tp-byr-range"
          style={{ zIndex: from >= max - (span / 6) ? 5 : 3 }}
        />
        {/* to 핸들 */}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={to}
          disabled={disabled}
          onChange={(e) => handleTo(Number(e.target.value))}
          aria-label="끝 출생연도"
          aria-valuetext={`${to}년생`}
          className="tp-byr-range"
          style={{ zIndex: 4 }}
        />
      </div>

      {/* 눈금 연도 라벨 */}
      <div className="mt-1 flex justify-between">
        {ticks.map((year) => {
          const inRange = year >= from && year <= to;
          return (
            <span
              key={year}
              className={cn(
                'text-[10px] tabular-nums font-num transition-colors motion-reduce:transition-none',
                inRange
                  ? 'font-bold text-ice-500'
                  : 'font-medium text-wtext-3 dark:text-rink-300',
              )}
            >
              {year}
            </span>
          );
        })}
      </div>

      {/* thumb 스타일 — native range 의 트랙은 투명 처리, thumb 만 노출.
          두 input 이 트랙을 가로채지 않도록 pointer-events 는 thumb 에서만 auto. */}
      <style>{`
        .tp-byr-slider .tp-byr-range {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          background: transparent;
          -webkit-appearance: none;
          appearance: none;
          pointer-events: none;
        }
        .tp-byr-slider .tp-byr-range:focus { outline: none; }
        .tp-byr-slider .tp-byr-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          pointer-events: auto;
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: #ffffff;
          border: 3px solid #2f5fff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
          cursor: pointer;
        }
        .tp-byr-slider .tp-byr-range::-moz-range-thumb {
          pointer-events: auto;
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: #ffffff;
          border: 3px solid #2f5fff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
          cursor: pointer;
        }
        .tp-byr-slider .tp-byr-range::-moz-range-track { background: transparent; }
        .tp-byr-slider .tp-byr-range:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 4px rgba(47, 95, 255, 0.25);
        }
        .tp-byr-slider .tp-byr-range:focus-visible::-moz-range-thumb {
          box-shadow: 0 0 0 4px rgba(47, 95, 255, 0.25);
        }
        .tp-byr-slider .tp-byr-range:disabled::-webkit-slider-thumb { cursor: not-allowed; }
        .tp-byr-slider .tp-byr-range:disabled::-moz-range-thumb { cursor: not-allowed; }
      `}</style>
    </div>
  );
}

export default BirthYearRangeSlider;
