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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 빈 값 픽커가 처음 열리는 기준 시 — 업무 시작 시각(9시) 앵커로 스크롤 최소화 */
const DEFAULT_OPEN_HOUR = 9;

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

/** 'HH:MM' 파싱 — 형식·범위가 어긋나면 null. */
function parseTime(time: string | undefined): { hour: number; minute: number } | null {
  if (!time) return null;
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * 'HH:MM' + n분 → 'HH:MM'. 종료 시각 하한(minTime) 계산용.
 *
 * 같은 날을 벗어나면(23:50 + 10분) '23:59' 를 돌려준다 — 선택 가능한 슬롯이 없다는 뜻이라
 * 픽커가 전 항목을 비활성으로 렌더한다. 자정을 넘기는 일정은 정책상 두지 않는다.
 */
export function addMinutes(time: string, minutes: number): string | null {
  const parsed = parseTime(time);
  if (!parsed) return null;
  const total = parsed.hour * 60 + parsed.minute + minutes;
  if (total >= 24 * 60) return '23:59';
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/**
 * 'HH:MM' 의 다음 정시 → 'HH:00'. 종료 시각 기본값 계산용 (09:30 → '10:00', 09:00 → '10:00').
 * 다음 정시가 같은 날을 벗어나면(23시대) null — 호출부는 minTime 폴백에 맡긴다.
 */
export function nextFullHour(time: string): string | null {
  const parsed = parseTime(time);
  if (!parsed) return null;
  if (parsed.hour >= 23) return null;
  return `${pad2(parsed.hour + 1)}:00`;
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
  /** 빈 값일 때 처음 열리는 기준 시(0~23) — 바텀시트가 이 시각에 중앙 정렬로 열림. 미지정 시 9시(범위 밖이면 startHour~endHour 로 클램프). */
  defaultHour?: number;
  /** 분 간격(기본 30) */
  stepMinutes?: number;
  /** disabled 상태 */
  disabled?: boolean;
  /**
   * 선택 가능한 하한 시각 'HH:MM'(이 값 포함) — 이보다 이른 시·분은 비활성으로 렌더된다.
   * 값이 비어 있을 때 시트가 열리는 기준도 이 시각이 된다(defaultHour 보다 우선).
   * 종료 시각을 시작 시각에 종속시킬 때 `addMinutes(startTime, step)` 로 계산해 넘긴다.
   */
  minTime?: string;
  /**
   * 값이 비어 있을 때 열림 기준 시각 'HH:mm' — minTime·defaultHour 보다 우선한다.
   * 하한(minTime) 미만이면 기존 보정 로직이 선택 가능한 첫 조합으로 끌어올린다.
   * 종료 시각을 "시작의 다음 정시"에서 열 때 `nextFullHour(startTime)` 로 계산해 넘긴다.
   */
  defaultTime?: string;
  /**
   * disabled 상태에서 트리거를 눌렀을 때 호출. 지정하면 native disabled 대신
   * aria-disabled 로 렌더돼 탭을 받을 수 있다 — 좁은 2열 폼에서는 placeholder 에 사유를
   * 적으면 truncate 로 잘리므로, 사유는 호출부가 toast 로 알린다.
   */
  onDisabledClick?: () => void;
  /** 우측 펼침(∨) 아이콘 표시 여부 (기본 true) */
  showChevron?: boolean;
  /** 추가 className (트리거 버튼) */
  className?: string;
  /** 부모 모달/바텀시트 안에서 사용할 때 native scrim 중첩 제어를 생략 */
  nested?: boolean;
  /**
   * 렌더 형태 — 'sheet'(기본): BottomSheet 로 열림 / 'inline': 트리거 아래로 시·분
   * 목록을 직접 펼침. 바텀시트 안처럼 시트를 중첩할 수 없는 컨텍스트 전용
   * (VenuePicker 의 검색형 인라인과 같은 접근). inline 에서는 sheetTitle·nested 가
   * 쓰이지 않으며, 탭 즉시 onChange 로 커밋되고 분 탭 시 패널이 접힌다(선택 완료).
   */
  variant?: 'sheet' | 'inline';
  /** inline 목록 노출 행 수(기본 3.5) — 세로가 빡빡한 시트(90vh 달력)는 3 으로 축소. */
  inlineRows?: number;
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
  defaultHour,
  stepMinutes = 30,
  disabled = false,
  minTime,
  defaultTime,
  onDisabledClick,
  showChevron = true,
  className,
  id,
  nested = false,
  variant = 'sheet',
  inlineRows = 3.5,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(defaultHour ?? DEFAULT_OPEN_HOUR);
  const [draftMinute, setDraftMinute] = useState(0);
  const hourListRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);

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

  const minParsed = useMemo(() => parseTime(minTime), [minTime]);
  const minTotal = minParsed ? minParsed.hour * 60 + minParsed.minute : null;

  /** 하한 미만 여부 — 시·분 버튼 비활성과 확인 버튼 가드가 공유하는 판정. */
  const isBelowMin = (hour: number, minute: number) =>
    minTotal !== null && hour * 60 + minute < minTotal;

  /** 열림 기준 시각 — 현재 값(스텝 정규화) → 하한 → defaultHour 순. 시트·인라인 공용. */
  const resolveInitial = () => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    // 값이 없으면 defaultTime(다음 정시 등) → 하한 → defaultHour 순으로 연다.
    const fallback = parseTime(defaultTime) ??
      minParsed ?? {
        hour: defaultHour ?? DEFAULT_OPEN_HOUR,
        minute: 0,
      };
    const parsedHour = match ? Number(match[1]) : fallback.hour;
    const parsedMinute = match ? Number(match[2]) : fallback.minute;
    let nextHour = Math.max(
      safeStartHour,
      Math.min(safeEndHour, Number.isFinite(parsedHour) ? parsedHour : safeStartHour),
    );
    let nextMinute = Math.min(
      60 - safeStepMinutes,
      Math.max(0, Math.floor(parsedMinute / safeStepMinutes) * safeStepMinutes),
    );

    // 스텝 내림 등으로 하한 미만에서 열리면 선택 가능한 첫 조합으로 끌어올린다.
    if (minParsed && minTotal !== null && nextHour * 60 + nextMinute < minTotal) {
      const sameHourSlot = minutes.find((m) => minParsed.hour * 60 + m >= minTotal);
      if (sameHourSlot !== undefined) {
        nextHour = Math.max(safeStartHour, Math.min(safeEndHour, minParsed.hour));
        nextMinute = sameHourSlot;
      } else {
        nextHour = Math.min(safeEndHour, minParsed.hour + 1);
        nextMinute = minutes[0] ?? 0;
      }
    }

    return { hour: nextHour, minute: nextMinute };
  };

  const handleOpen = () => {
    if (disabled) {
      onDisabledClick?.();
      return;
    }

    if (variant === 'inline') {
      // 인라인은 draft 없이 토글만 — 값 반영은 탭 즉시 커밋(onChange)으로 이뤄진다.
      setIsOpen((prev) => !prev);
      return;
    }

    const { hour, minute } = resolveInitial();
    setDraftHour(hour);
    setDraftMinute(minute);
    setIsOpen(true);
  };

  /** 시 선택 — 하한 시를 고르면 분이 하한 미만으로 남지 않게 함께 끌어올린다. */
  const handleSelectHour = (hour: number) => {
    setDraftHour(hour);
    if (minTotal !== null && hour * 60 + draftMinute < minTotal) {
      const nextSlot = minutes.find((m) => hour * 60 + m >= minTotal);
      if (nextSlot !== undefined) setDraftMinute(nextSlot);
    }
  };

  const handleConfirm = () => {
    onChange(`${pad2(draftHour)}:${pad2(draftMinute)}`);
    setIsOpen(false);
  };

  // ── 인라인 변형 — 탭 즉시 커밋 (draft·확인 버튼 없음) ──
  //   시 탭: 현재 분 유지(하한 미만이면 끌어올림) 후 커밋, 패널 유지(분 고르러).
  //   분 탭: 커밋 후 패널 접힘 — "분까지 골랐다 = 선택 완료" 로 간주해
  //   같은 폼의 픽커가 한 번에 하나만 열려 있게 하는 장치이기도 하다.
  const committed = parseTime(value);
  const inlineBase = variant === 'inline' && isOpen ? resolveInitial() : null;
  const inlineActiveHour = committed?.hour ?? inlineBase?.hour ?? safeStartHour;
  const inlineListHeight = Math.round(inlineRows * 44) + 8; // 행 44px(h-11) + p-1 상하

  const handleInlineHour = (hour: number) => {
    let minute = committed?.minute ?? inlineBase?.minute ?? 0;
    minute = Math.min(
      60 - safeStepMinutes,
      Math.max(0, Math.floor(minute / safeStepMinutes) * safeStepMinutes),
    );
    if (minTotal !== null && hour * 60 + minute < minTotal) {
      const slot = minutes.find((m) => hour * 60 + m >= minTotal);
      if (slot !== undefined) minute = slot;
    }
    onChange(`${pad2(hour)}:${pad2(minute)}`);
  };

  const handleInlineMinute = (minute: number) => {
    const hour = committed?.hour ?? inlineBase?.hour ?? safeStartHour;
    onChange(`${pad2(hour)}:${pad2(minute)}`);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    let frameId = 0;
    let attempts = 0;
    const positionSelectedHour = () => {
      const list = hourListRef.current;
      const selectedHour = selectedHourRef.current;

      if (!list || !selectedHour) {
        attempts += 1;
        if (attempts < 5) frameId = requestAnimationFrame(positionSelectedHour);
        return;
      }

      const listRect = list.getBoundingClientRect();
      const selectedRect = selectedHour.getBoundingClientRect();
      const centeredScrollTop =
        list.scrollTop +
        selectedRect.top -
        listRect.top -
        (list.clientHeight - selectedRect.height) / 2;

      list.scrollTop = Math.max(0, centeredScrollTop);
    };

    frameId = requestAnimationFrame(positionSelectedHour);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen]);

  const displayText = value || placeholder;
  const isPlaceholder = !value;

  const triggerButton = (
      <button
        id={id}
        type="button"
        onClick={handleOpen}
        // onDisabledClick 이 있으면 native disabled 대신 aria-disabled — 탭을 받아 사유를 알린다.
        disabled={disabled && !onDisabledClick}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel ?? sheetTitle}
        aria-haspopup={variant === 'inline' ? undefined : 'dialog'}
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
            className={cn(
              'text-wtext-3 dark:text-rink-300 shrink-0',
              variant === 'inline' &&
                'transition-transform motion-reduce:transition-none',
              variant === 'inline' && isOpen && 'rotate-180',
            )}
            aria-hidden="true"
          />
        )}
      </button>
  );

  if (variant === 'inline') {
    return (
      <div className="w-full min-w-0">
        {triggerButton}
        {isOpen && (
          <div
            role="group"
            aria-label={ariaLabel ?? sheetTitle}
            className="mt-2 grid grid-cols-2 gap-2"
          >
            <div>
              <p className="mb-1.5 text-center text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                {MESSAGES.common.timePicker.hour}
              </p>
              <div
                ref={hourListRef}
                // overscroll contain — 목록 끝에서 시트 본문으로 스크롤 전파를 차단.
                style={{ height: inlineListHeight, overscrollBehaviorY: 'contain' }}
                className="hide-scrollbar overflow-y-auto rounded-w-md border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
                role="group"
                aria-label={MESSAGES.common.timePicker.hour}
              >
                {hours.map((hour) => {
                  const hourDisabled = isBelowMin(hour, 59);
                  const isSel = committed?.hour === hour;
                  return (
                    <button
                      key={hour}
                      ref={inlineActiveHour === hour ? selectedHourRef : undefined}
                      type="button"
                      aria-pressed={isSel}
                      disabled={hourDisabled}
                      onClick={() => handleInlineHour(hour)}
                      className={cn(
                        'flex h-11 w-full items-center justify-center rounded-w-md font-num text-card-body font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice-500',
                        hourDisabled
                          ? 'cursor-not-allowed text-wtext-1 opacity-40 dark:text-white'
                          : isSel
                            ? 'bg-ice-500 text-white'
                            : 'text-wtext-1 hover:bg-wline-2 dark:text-white dark:hover:bg-rink-700/60',
                      )}
                    >
                      {pad2(hour)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-center text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                {MESSAGES.common.timePicker.minute}
              </p>
              <div
                style={{ height: inlineListHeight, overscrollBehaviorY: 'contain' }}
                className="hide-scrollbar overflow-y-auto rounded-w-md border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
                role="group"
                aria-label={MESSAGES.common.timePicker.minute}
              >
                {minutes.map((minute) => {
                  const minuteDisabled = isBelowMin(inlineActiveHour, minute);
                  const isSel = !minuteDisabled && committed?.minute === minute;
                  return (
                    <button
                      key={minute}
                      type="button"
                      aria-pressed={isSel}
                      disabled={minuteDisabled}
                      onClick={() => handleInlineMinute(minute)}
                      className={cn(
                        'flex h-11 w-full items-center justify-center rounded-w-md font-num text-card-body font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice-500',
                        minuteDisabled
                          ? 'cursor-not-allowed text-wtext-1 opacity-40 dark:text-white'
                          : isSel
                            ? 'bg-ice-500 text-white'
                            : 'text-wtext-1 hover:bg-wline-2 dark:text-white dark:hover:bg-rink-700/60',
                      )}
                    >
                      {pad2(minute)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {triggerButton}

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
            disabled={isBelowMin(draftHour, draftMinute)}
            className="h-12 w-full rounded-w-md bg-ice-500 text-card-body font-bold text-white hover:bg-ice-600 active:bg-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-rink-800"
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
              ref={hourListRef}
              // h-[17rem] = 항목 6개(44px) + p-1 상하(8px). 분 컬럼과 높이를 맞추는 기준.
              className="hide-scrollbar h-[17rem] overflow-y-auto rounded-w-md border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
              role="group"
              aria-label={MESSAGES.common.timePicker.hour}
            >
              {hours.map((hour) => {
                // 그 시의 마지막 분(59)까지 하한 미만이면 시 전체가 선택 불가.
                const hourDisabled = isBelowMin(hour, 59);
                return (
                  <button
                    key={hour}
                    ref={draftHour === hour ? selectedHourRef : undefined}
                    type="button"
                    aria-pressed={draftHour === hour}
                    disabled={hourDisabled}
                    onClick={() => handleSelectHour(hour)}
                    className={cn(
                      'flex h-11 w-full items-center justify-center rounded-w-md font-num text-card-body font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice-500',
                      hourDisabled
                        ? 'cursor-not-allowed text-wtext-1 opacity-40 dark:text-white'
                        : draftHour === hour
                          ? 'bg-ice-500 text-white'
                          : 'text-wtext-1 hover:bg-wline-2 dark:text-white dark:hover:bg-rink-700/60',
                    )}
                  >
                    {pad2(hour)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-center text-card-meta font-bold text-wtext-3 dark:text-rink-300">
              {MESSAGES.common.timePicker.minute}
            </p>
            <div
              // max-h — stepMinutes 가 커서 항목이 적으면 그만큼만 차지한다(하단 여백 제거).
              className="hide-scrollbar max-h-[17rem] overflow-y-auto rounded-w-md border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
              role="group"
              aria-label={MESSAGES.common.timePicker.minute}
            >
              {minutes.map((minute) => {
                // 하한과 같은 시를 고른 동안에만 그 이전 분이 잠긴다.
                const minuteDisabled = isBelowMin(draftHour, minute);
                return (
                  <button
                    key={minute}
                    type="button"
                    aria-pressed={draftMinute === minute}
                    disabled={minuteDisabled}
                    onClick={() => setDraftMinute(minute)}
                    className={cn(
                      'flex h-11 w-full items-center justify-center rounded-w-md font-num text-card-body font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice-500',
                      minuteDisabled
                        ? 'cursor-not-allowed text-wtext-1 opacity-40 dark:text-white'
                        : draftMinute === minute
                          ? 'bg-ice-500 text-white'
                          : 'text-wtext-1 hover:bg-wline-2 dark:text-white dark:hover:bg-rink-700/60',
                    )}
                  >
                    {pad2(minute)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

export default TimePicker;
