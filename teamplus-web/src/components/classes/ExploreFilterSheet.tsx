'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { DAYS_OF_WEEK, type DayOfWeekKo, type TimeSlot } from '@/lib/regions';

/**
 * ExploreFilterSheet — 전국 수업 찾기 상세 필터.
 *
 * 지역은 목록 상단 칩에서 즉시 적용하므로 여기서 제외하고,
 * 나머지(요일·시간대·대상·유형·가격)를 한 번에 고르고 [적용하기]로 확정한다.
 * 시트 내부는 draft 상태로 관리해 취소 시 원래 조건이 유지된다.
 */

export interface ExploreFilters {
  dayOfWeek: DayOfWeekKo[];
  timeSlot?: TimeSlot;
  category?: 'KIDS' | 'JUNIOR' | 'ADULT';
  trainingType?: 'regular' | 'lesson' | 'spot';
  priceMax?: number;
}

export const EMPTY_FILTERS: ExploreFilters = { dayOfWeek: [] };

/**
 * ⚠️ 옵션 배열은 함수로 감싼다 — 모듈 최상위에서 `MESSAGES.*` 를 평가하면 안 된다.
 *   webpack 모듈 초기화 순서에 따라 messages 모듈보다 이 파일이 먼저 실행될 수 있어
 *   `Cannot read properties of undefined` 로 페이지 전체가 죽는다(2026-08-04 실측).
 *   프로젝트의 다른 컴포넌트도 전부 렌더 시점에 MESSAGES 를 읽는다.
 */
const buildTimeSlotOptions = (): ReadonlyArray<{
  value: TimeSlot;
  label: string;
  hint: string;
}> => [
  {
    value: 'morning',
    label: MESSAGES.class.explore.timeSlot.morning,
    hint: MESSAGES.class.explore.timeSlot.morningHint,
  },
  {
    value: 'afternoon',
    label: MESSAGES.class.explore.timeSlot.afternoon,
    hint: MESSAGES.class.explore.timeSlot.afternoonHint,
  },
  {
    value: 'evening',
    label: MESSAGES.class.explore.timeSlot.evening,
    hint: MESSAGES.class.explore.timeSlot.eveningHint,
  },
];

const buildCategoryOptions = (): ReadonlyArray<{
  value: 'KIDS' | 'JUNIOR' | 'ADULT';
  label: string;
}> => [
  { value: 'KIDS', label: MESSAGES.class.explore.category.KIDS },
  { value: 'JUNIOR', label: MESSAGES.class.explore.category.JUNIOR },
  { value: 'ADULT', label: MESSAGES.class.explore.category.ADULT },
];

// 수업 유형은 MESSAGES 참조가 없어 상수로 두어도 안전하다.
const TRAINING_TYPE_OPTIONS: ReadonlyArray<{
  value: 'regular' | 'lesson' | 'spot';
  label: string;
}> = [
  { value: 'regular', label: '정규' },
  { value: 'lesson', label: '레슨' },
  { value: 'spot', label: '1회' },
];

const chipClass = (active: boolean) =>
  cn(
    'inline-flex items-center h-9 px-4 rounded-w-pill text-[14px] font-bold whitespace-nowrap border-[1.5px]',
    'transition-colors motion-reduce:transition-none',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
    active
      ? 'bg-it-blue-500 text-white border-it-blue-500'
      : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-wtext-4 border-it-line-strong dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-700',
  );

const labelClass =
  'text-[14px] font-extrabold text-it-ink-800 dark:text-white mb-2.5';

interface ExploreFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  value: ExploreFilters;
  onApply: (next: ExploreFilters) => void;
}

export function ExploreFilterSheet({
  isOpen,
  onClose,
  value,
  onApply,
}: ExploreFilterSheetProps) {
  const [draft, setDraft] = useState<ExploreFilters>(value);
  const timeSlotOptions = buildTimeSlotOptions();
  const categoryOptions = buildCategoryOptions();

  // 시트를 열 때마다 현재 적용값으로 초기화 — 이전에 취소한 draft 가 남지 않게 한다.
  useEffect(() => {
    if (isOpen) setDraft(value);
  }, [isOpen, value]);

  const toggleDay = (day: DayOfWeekKo) => {
    setDraft((prev) => ({
      ...prev,
      dayOfWeek: prev.dayOfWeek.includes(day)
        ? prev.dayOfWeek.filter((d) => d !== day)
        : [...prev.dayOfWeek, day],
    }));
  };

  const toggleSingle = <K extends keyof ExploreFilters>(
    key: K,
    v: ExploreFilters[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: prev[key] === v ? undefined : v }));
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.class.explore.filterTitle}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="h-12 px-5 rounded-w-md text-[15px] font-bold border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-wtext-4 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            {MESSAGES.class.explore.filterReset}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="flex-1 h-12 rounded-w-md text-[15px] font-bold bg-it-blue-500 text-white transition-colors motion-reduce:transition-none active:brightness-95"
          >
            {MESSAGES.class.explore.filterApply}
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        {/* 요일 */}
        <div>
          <p className={labelClass}>{MESSAGES.class.explore.dayLabel}</p>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={draft.dayOfWeek.includes(day)}
                className={cn(chipClass(draft.dayOfWeek.includes(day)), 'w-11 justify-center px-0')}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* 시간대 */}
        <div>
          <p className={labelClass}>{MESSAGES.class.explore.timeSlotLabel}</p>
          <div className="flex flex-wrap gap-2">
            {timeSlotOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleSingle('timeSlot', opt.value)}
                aria-pressed={draft.timeSlot === opt.value}
                className={chipClass(draft.timeSlot === opt.value)}
              >
                {opt.label}
                <span className="ml-1 text-[12px] font-medium opacity-70">
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 대상 */}
        <div>
          <p className={labelClass}>{MESSAGES.class.explore.categoryLabel}</p>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleSingle('category', opt.value)}
                aria-pressed={draft.category === opt.value}
                className={chipClass(draft.category === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 수업 유형 */}
        <div>
          <p className={labelClass}>{MESSAGES.class.explore.trainingTypeLabel}</p>
          <div className="flex flex-wrap gap-2">
            {TRAINING_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleSingle('trainingType', opt.value)}
                aria-pressed={draft.trainingType === opt.value}
                className={chipClass(draft.trainingType === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 가격 상한 */}
        <div>
          <p className={labelClass}>{MESSAGES.class.explore.priceMaxLabel}</p>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.priceMax ?? ''}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                priceMax: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            placeholder={MESSAGES.class.explore.priceMaxPlaceholder}
            className={cn(
              'w-full h-12 px-4 rounded-w-md text-[15px] font-semibold font-num tabular-nums',
              'bg-it-fill dark:bg-rink-800 text-it-ink-800 dark:text-white',
              'border-[1.5px] border-it-line-strong dark:border-rink-700',
              'placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 placeholder:font-medium',
              'focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500',
              'transition-colors motion-reduce:transition-none',
            )}
            aria-label={MESSAGES.class.explore.priceMaxLabel}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
