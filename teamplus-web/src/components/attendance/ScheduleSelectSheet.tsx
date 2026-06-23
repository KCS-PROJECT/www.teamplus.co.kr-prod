'use client';

import { memo } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { useNativeScrim } from '@/hooks/useNativeScrim';

export interface ScheduleItem {
  scheduleId: string;
  className: string;
  startTime: string;
  classId: string;
}

interface ScheduleSelectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: ScheduleItem[];
  selectedScheduleId?: string;
  onSelect: (schedule: ScheduleItem) => void;
}

/**
 * 시작 시각(ISO) 기준으로 '진행 중' / '예정' 상태를 판정.
 * - 종료 시각 데이터가 없어 과거 시각은 모두 '진행 중'으로 표시됨 (현재 데이터 모델 한계).
 */
function getScheduleStatus(startIso: string, now: Date = new Date()): 'ongoing' | 'upcoming' {
  if (!startIso) return 'upcoming';
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 'upcoming';
  return now.getTime() >= start.getTime() ? 'ongoing' : 'upcoming';
}

/** ISO 시각 → "09:00" (KST) */
function formatStartTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
}

export const ScheduleSelectSheet = memo(function ScheduleSelectSheet({
  isOpen,
  onClose,
  schedules,
  selectedScheduleId,
  onSelect,
}: ScheduleSelectSheetProps) {
  // [SPEC_POPUP_FULLSCREEN_DIM] Flutter native status bar dim (Sheet 패턴).
  // 2026-05-16: BottomSheet 류는 `bottom: false` — 시트 카드가 화면 하단까지 차지하므로
  //   하단 native scrim 비활성. SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, '#73141826', { bottom: false });

  const handleSelect = (schedule: ScheduleItem) => {
    onSelect(schedule);
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.attendance.selectClass}
    >
      <ul
        role="radiogroup"
        aria-label={MESSAGES.attendance.selectClass}
        className="flex flex-col gap-2 pt-1"
      >
        {schedules.map((s) => {
          const isSelected = s.scheduleId === selectedScheduleId;
          const status = getScheduleStatus(s.startTime);
          const startLabel = formatStartTime(s.startTime);

          return (
            <li key={s.scheduleId}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelect(s)}
                className={cn(
                  'w-full flex items-center gap-3 min-h-[60px] px-4 py-3 rounded-2xl transition-colors motion-reduce:transition-none active:brightness-95',
                  isSelected
                    ? 'bg-ice-500/10 dark:bg-blue-900/30 border-2 border-ice-500'
                    : 'bg-wbg dark:bg-rink-900/40 border-2 border-transparent hover:bg-wline-2 dark:hover:bg-rink-800',
                )}
              >
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    isSelected
                      ? 'bg-ice-500 text-white'
                      : 'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
                  )}
                >
                  <Icon name="sports_hockey" className="text-xl" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-wtext-1 dark:text-white truncate">
                      {s.className}
                    </span>
                    {startLabel && (
                      <span className="text-sm text-wtext-3 dark:text-rink-300 tabular-nums shrink-0">
                        {startLabel}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-card-meta font-bold px-2 py-0.5 rounded-full',
                        status === 'ongoing'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
                      )}
                    >
                      {status === 'ongoing' && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      )}
                      {status === 'ongoing'
                        ? MESSAGES.attendance.statusOngoing
                        : MESSAGES.attendance.statusUpcoming}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <Icon
                    name="check_circle"
                    className="text-ice-500 text-2xl shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
});

export { getScheduleStatus, formatStartTime };
