'use client';

/**
 * TimePicker — 공통 시간 선택 컴포넌트
 *
 * 매치/수업 시작 시간 등 시각 선택의 단일 진입점. (일자 선택 DatePickerModal 과 짝)
 * - 트리거: 좁은 2열 폼에서도 잘리지 않는 24시간 `HH:mm` 표시 → 직접 텍스트 입력 불가
 * - 시트: BottomSheet — 시/분을 분리해 OS 선택기 없이 지정된 간격으로 선택
 * - 값: 'HH:MM' (24시간) 문자열 (빈 문자열이면 미선택)
 *
 * @example
 *   <TimePicker value={time} onChange={setTime} placeholder="시작 시간" />
 */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 'HH:MM' (24h) → '오전/오후 h:MM' 한국어 표기. 페이지 UI 에서 재사용 가능. */
export function formatTimeLabel(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23 || minute < 0 || minute > 59) {
    return time;
  }
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
  /** 부모 모달/바텀시트 안에서 사용할 때 native scrim 중첩 제어를 생략 */
  nested?: boolean;
  /** label 과 연결할 트리거 버튼 ID */
  id?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = MESSAGES.common.timePicker.placeholder,
  sheetTitle = MESSAGES.common.timePicker.title,
  ariaLabel,
  startHour = 6,
  endHour = 23,
  stepMinutes = 30,
  disabled = false,
  showChevron = true,
  className,
  id,
  nested = false,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(startHour);
  const [draftMinute, setDraftMinute] = useState(0);

  const safeStartHour = Math.max(0, Math.min(23, startHour));
  const safeEndHour = Math.max(safeStartHour, Math.min(23, endHour));
  const safeStepMinutes =
    Number.isInteger(stepMinutes) && stepMinutes > 0 && 60 % stepMinutes === 0
      ? stepMinutes
      : 30;

  const hours = useMemo(
    () =>
      Array.from(
        { length: safeEndHour - safeStartHour + 1 },
        (_, index) => safeStartHour + index,
      ),
    [safeEndHour, safeStartHour],
  );

  const minutes = useMemo(
    () =>
      Array.from(
        { length: 60 / safeStepMinutes },
        (_, index) => index * safeStepMinutes,
      ),
    [safeStepMinutes],
  );

  const handleOpen = () => {
    if (disabled) return;

    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    const parsedHour = match ? Number(match[1]) : safeStartHour;
    const parsedMinute = match ? Number(match[2]) : 0;
    const nextHour = Math.max(
      safeStartHour,
      Math.min(safeEndHour, Number.isFinite(parsedHour) ? parsedHour : safeStartHour),
    );
    const nextMinute = Math.min(
      60 - safeStepMinutes,
      Math.max(0, Math.floor(parsedMinute / safeStepMinutes) * safeStepMinutes),
    );

    setDraftHour(nextHour);
    setDraftMinute(nextMinute);
    setIsOpen(true);
  };

  const handleConfirm = () => {
    onChange(`${pad2(draftHour)}:${pad2(draftMinute)}`);
    setIsOpen(false);
  };

  const displayText = value || placeholder;
  const isPlaceholder = !value;

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={ariaLabel ?? sheetTitle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'h-12 w-full min-w-0 rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700',
          'px-3 flex items-center gap-2 text-left transition-colors',
          'motion-reduce:transition-none',
          'hover:border-ice-500 focus-visible:outline-none focus-visible:border-ice-500 focus-visible:ring-2 focus-visible:ring-ice-500',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        <Icon
          name="schedule"
          size={16}
          className="text-wtext-3 dark:text-rink-300 shrink-0"
          aria-hidden="true"
        />
        <span
          className={cn(
            'flex-1 min-w-0 truncate whitespace-nowrap text-card-meta font-num font-semibold tabular-nums',
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
            size={16}
            className="text-wtext-3 dark:text-rink-300 shrink-0"
            aria-hidden="true"
          />
        )}
      </button>

      <BottomSheet
        isOpen={isOpen}
        title={sheetTitle}
        onClose={() => setIsOpen(false)}
        maxHeight="70vh"
        manageNativeScrim={!nested}
        footer={
          <button
            type="button"
            onClick={handleConfirm}
            className="h-12 w-full rounded-w-md bg-ice-500 text-card-body font-bold text-white hover:bg-ice-600 active:bg-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-800"
          >
            {MESSAGES.common.confirm}
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 pb-2">
          <div>
            <p className="mb-2 text-center text-card-meta font-bold text-wtext-3 dark:text-rink-300">
              {MESSAGES.common.timePicker.hour}
            </p>
            <div
              className="hide-scrollbar max-h-64 overflow-y-auto rounded-w-md border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
              role="group"
              aria-label={MESSAGES.common.timePicker.hour}
            >
              {hours.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  aria-pressed={draftHour === hour}
                  onClick={() => setDraftHour(hour)}
                  className={cn(
                    'flex h-11 w-full items-center justify-center rounded-w-md font-num text-card-body font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice-500',
                    draftHour === hour
                      ? 'bg-ice-500 text-white'
                      : 'text-wtext-1 hover:bg-wline-2 dark:text-white dark:hover:bg-rink-700/60',
                  )}
                >
                  {pad2(hour)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-center text-card-meta font-bold text-wtext-3 dark:text-rink-300">
              {MESSAGES.common.timePicker.minute}
            </p>
            <div
              className="rounded-w-md border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
              role="group"
              aria-label={MESSAGES.common.timePicker.minute}
            >
              {minutes.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  aria-pressed={draftMinute === minute}
                  onClick={() => setDraftMinute(minute)}
                  className={cn(
                    'flex h-11 w-full items-center justify-center rounded-w-md font-num text-card-body font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice-500',
                    draftMinute === minute
                      ? 'bg-ice-500 text-white'
                      : 'text-wtext-1 hover:bg-wline-2 dark:text-white dark:hover:bg-rink-700/60',
                  )}
                >
                  {pad2(minute)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

export default TimePicker;
