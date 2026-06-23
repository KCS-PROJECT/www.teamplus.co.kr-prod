'use client';

/**
 * TimePicker — 공통 시간 선택 컴포넌트
 *
 * 매치/수업 시작 시간 등 시각 선택의 단일 진입점. (일자 선택 DatePickerModal 과 짝)
 * - 트리거: 현재 선택 시간(오전/오후 한국어 표기)을 표시하는 버튼 → 직접 텍스트 입력 불가
 * - 시트: BottomSheetSelector — 바닥에서 슬라이드 업, 목록 많으면 내부 스크롤
 * - 값: 'HH:MM' (24시간) 문자열 (빈 문자열이면 미선택)
 *
 * @example
 *   <TimePicker value={time} onChange={setTime} placeholder="시작 시간" />
 */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  BottomSheetSelector,
  type BottomSheetSelectorItem,
} from '@/components/ui/BottomSheetSelector';
import { cn } from '@/lib/utils';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 'HH:MM' (24h) → '오전/오후 h:MM' 한국어 표기. 페이지 UI 에서 재사용 가능. */
export function formatTimeLabel(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${m[2]}`;
}

export interface TimePickerProps {
  /** 현재 선택된 시간 'HH:MM' (24h) — 빈 문자열이면 미선택 */
  value: string;
  /** 선택 변경 콜백 — 'HH:MM' 전달 */
  onChange: (time: string) => void;
  /** 트리거 버튼 placeholder (미선택 시 표시) */
  placeholder?: string;
  /** BottomSheet 헤더 제목 */
  sheetTitle?: string;
  /** 접근성 라벨 */
  ariaLabel?: string;
  /** 옵션 시작 시(0~23, 기본 6) */
  startHour?: number;
  /** 옵션 종료 시(0~23, 기본 23) */
  endHour?: number;
  /** 분 간격(기본 30) */
  stepMinutes?: number;
  /** disabled 상태 */
  disabled?: boolean;
  /** 우측 펼침(∨) 아이콘 표시 여부 (기본 true) */
  showChevron?: boolean;
  /** 추가 className (트리거 버튼) */
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = '시간 선택',
  sheetTitle = '시간을 선택해주세요.',
  ariaLabel,
  startHour = 6,
  endHour = 23,
  stepMinutes = 30,
  disabled = false,
  showChevron = true,
  className,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const items = useMemo<BottomSheetSelectorItem<string>[]>(() => {
    const result: BottomSheetSelectorItem<string>[] = [];
    const step = stepMinutes > 0 ? stepMinutes : 30;
    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += step) {
        const t = `${pad2(h)}:${pad2(m)}`;
        result.push({
          id: t,
          name: formatTimeLabel(t),
          sub: t,
          icon: 'schedule',
          selected: t === value,
        });
      }
    }
    return result;
  }, [startHour, endHour, stepMinutes, value]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  const displayText = value ? formatTimeLabel(value) : placeholder;
  const isPlaceholder = !value;

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        aria-label={ariaLabel ?? sheetTitle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'h-12 w-full rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700',
          'px-4 flex items-center gap-2.5 text-left transition-colors',
          'motion-reduce:transition-none',
          'hover:border-ice-500 focus-visible:outline-none focus-visible:border-ice-500',
          'focus-visible:shadow-[0_0_0_3px_rgb(47_95_255_/_0.1)]',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        <Icon
          name="schedule"
          size={18}
          className="text-wtext-3 dark:text-rink-300 shrink-0"
          aria-hidden="true"
        />
        <span
          className={cn(
            'flex-1 min-w-0 text-card-meta font-semibold tabular-nums truncate',
            isPlaceholder
              ? 'text-wtext-3 dark:text-rink-300'
              : 'text-wtext-1 dark:text-white',
          )}
        >
          {displayText}
        </span>
        {showChevron && (
          <Icon
            name="expand_more"
            size={18}
            className="text-wtext-3 dark:text-rink-300 shrink-0"
            aria-hidden="true"
          />
        )}
      </button>

      <BottomSheetSelector
        isOpen={isOpen}
        title={sheetTitle}
        items={items}
        onSelect={handleSelect}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

export default TimePicker;
