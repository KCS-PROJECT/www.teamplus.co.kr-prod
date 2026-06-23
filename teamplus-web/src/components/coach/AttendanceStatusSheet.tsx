'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { CoachAttendanceStatus } from '@/hooks/useCoachAttendanceManage';
import { useNativeScrim } from '@/hooks/useNativeScrim';

/**
 * AttendanceStatusSheet — 코치/감독 출석 상태 변경 바텀시트 (2026-05-12 3-state).
 *
 * 디자인 결정:
 *   - 학생 행 클릭 → 시트 열림 → 2개 명시적 옵션 (출석/결석)
 *   - 현재 상태 옵션은 disabled + "현재" 배지
 *   - 출석 시 결제권 차감 / 결석 시 출석권 복원 — 옵션 라벨에 명시
 *   - "처리 취소(미확인)" 옵션은 별도 라인으로 분리 (attendanceId 있을 때만)
 *   - DESIGN.md wallet v2 토큰 — mint/flame/wsurface/wline (emerald/red 직접 사용 금지)
 */

type ChangeableStatus = Exclude<CoachAttendanceStatus, 'unchecked'>;

interface AttendanceStatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  memberName: string;
  className: string;
  startHHMM: string;
  currentStatus: CoachAttendanceStatus;
  /**
   * 출석 레코드 ID — 처리 취소(미확인 복귀) 노출 조건.
   * null 이면 이미 미확인 상태이므로 처리 취소 옵션은 숨겨짐.
   */
  attendanceId: string | null;
  /**
   * 마지막 처리 시각 (ISO string) — 헤더 "현재 상태" 줄에 "16:05 처리" 로 표시.
   * 미확인(레코드 없음) 일 때는 null.
   */
  processedAt: string | null;
  isSubmitting: boolean;
  onSelect: (next: ChangeableStatus) => void;
  /** 처리 취소(미확인 복귀) 콜백. */
  onClear: () => void;
}

interface OptionDef {
  value: ChangeableStatus;
  label: string;
  desc: string;
  icon: string;
  cls: string;
}

/*
 * 2026-05-12: 회의록 결정 반영 — 출석(present) / 결석(absent) 2-state.
 * DESIGN.md wallet v2 토큰 적용 — mint-100/mint-500, flame-100/flame-500.
 */
const OPTIONS: OptionDef[] = [
  {
    value: 'present',
    label: '출석',
    desc: '수업 참석 처리 (결제권 1회 차감)',
    icon: 'check_circle',
    cls: 'border-wline bg-wsurface text-wtext-1 hover:border-mint-500 dark:border-rink-700 dark:bg-rink-800 dark:text-white',
  },
  {
    value: 'absent',
    label: '결석',
    desc: '미참석 처리 (결제권 복원)',
    icon: 'cancel',
    cls: 'border-wline bg-wsurface text-wtext-1 hover:border-flame-500 dark:border-rink-700 dark:bg-rink-800 dark:text-white',
  },
];

const OPTION_ICON_CLASS: Record<ChangeableStatus, string> = {
  present: 'text-mint-500',
  absent: 'text-flame-500',
};

const CURRENT_LABEL: Record<CoachAttendanceStatus, string> = {
  present: '출석',
  absent: '결석',
  unchecked: '미확인',
};

// ISO → "HH:MM" 로컬 시각. 잘못된 입력은 null.
function formatProcessedTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AttendanceStatusSheet({
  isOpen,
  onClose,
  memberName,
  className,
  startHHMM,
  currentStatus,
  attendanceId,
  processedAt,
  isSubmitting,
  onSelect,
  onClear,
}: AttendanceStatusSheetProps) {
  // [SPEC_POPUP_FULLSCREEN_DIM] Flutter native status bar dim — Sheet 패턴.
  // 2026-05-16: BottomSheet 류는 `bottom: false` — 시트 카드가 화면 하단까지 차지.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, '#73141826', { bottom: false });

  const processedHHMM = formatProcessedTime(processedAt);
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`${memberName} 출석 처리`}
    >
      <p className="text-card-meta text-wtext-3 dark:text-rink-300">
        {className} · {startHHMM}
      </p>
      <p className="mt-1 mb-4 text-card-body font-semibold text-wtext-2 dark:text-rink-100">
        현재 상태:{' '}
        <span className="text-wtext-1 dark:text-white">
          {CURRENT_LABEL[currentStatus]}
        </span>
        {processedHHMM && (
          <span className="ml-1 text-card-meta font-normal font-num tabular-nums text-wtext-3 dark:text-rink-300">
            · {processedHHMM} 처리
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-2" role="list">
        {OPTIONS.map((opt) => {
          const isCurrent = currentStatus === opt.value;
          const disabled = isCurrent || isSubmitting;
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onSelect(opt.value);
                }}
                disabled={disabled}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`${opt.label}으로 처리 — ${opt.desc}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-w-md border px-4 py-3 text-left transition-colors motion-reduce:transition-none',
                  'min-h-[60px]',
                  opt.cls,
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <Icon
                  name={opt.icon}
                  className={cn('text-xl shrink-0', OPTION_ICON_CLASS[opt.value])}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-card-body font-bold">{opt.label}</p>
                  <p className="text-card-meta opacity-80 mt-0.5">{opt.desc}</p>
                </div>
                {isCurrent && (
                  <span className="shrink-0 text-card-meta font-bold rounded-w-sm bg-wline-2 px-2 py-1 text-wtext-2 dark:bg-rink-700 dark:text-rink-100">
                    현재
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
       * 처리 취소 (미확인 복귀)
       * attendance 레코드가 있을 때만 노출. 학생 도착 전 코치가 실수로 입력한 경우 사용.
       */}
      {attendanceId !== null && (
        <>
          <div className="my-4 flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
            <span className="h-px flex-1 bg-wline dark:bg-rink-700" />
            <span className="shrink-0 px-1">또는</span>
            <span className="h-px flex-1 bg-wline dark:bg-rink-700" />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isSubmitting) onClear();
            }}
            disabled={isSubmitting}
            aria-label="출석 처리 취소 — 미확인 상태로 되돌리기"
            className={cn(
              'flex w-full items-center gap-3 rounded-w-md border border-wline bg-wbg px-4 py-3 text-left text-wtext-2 transition-colors motion-reduce:transition-none',
              'hover:border-wline hover:bg-wline-2',
              'dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'min-h-[60px]',
            )}
          >
            <Icon name="restart_alt" className="text-xl shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-card-body font-bold">처리 취소 (미확인으로 되돌리기)</p>
              <p className="text-card-meta opacity-80 mt-0.5">
                결제권 복원 + 출석 기록 삭제
              </p>
            </div>
          </button>
        </>
      )}
    </BottomSheet>
  );
}

export default AttendanceStatusSheet;
