'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MatchPositionChip } from './MatchPositionChip';

export type ApplicantStatus = 'pending' | 'approved' | 'rejected';

export interface MatchApplicantRowData {
  id: string;
  name: string;
  position?: string;
  level?: string;
  paymentStatus?: 'paid' | 'pending' | 'refunded' | string;
  status: ApplicantStatus;
  appliedAt: string | Date;
}

interface MatchApplicantRowProps {
  data: MatchApplicantRowData;
  /** 선택 체크박스 표시(일괄 승인 툴바용) */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** 읽기 전용 모드 — 승인/거절 버튼 숨김 */
  readOnly?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  processing?: boolean;
}

/**
 * 매치 신청자 행 — 신청자 관리 페이지에서 사용.
 *
 * pending: 체크박스 + 승인/거절 버튼
 * approved: 승인 체크 아이콘 + 읽기 전용
 * rejected: 회색 + 읽기 전용
 */
export function MatchApplicantRow({
  data,
  selectable = true,
  selected = false,
  onToggleSelect,
  readOnly = false,
  onApprove,
  onReject,
  processing = false,
}: MatchApplicantRowProps) {
  const isPending = data.status === 'pending';
  const isApproved = data.status === 'approved';

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline dark:border-rink-700',
        !isPending && 'opacity-90'
      )}
    >
      <div className="flex items-start gap-3">
        {selectable && isPending && !readOnly && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-pressed={selected}
            aria-label={selected ? '선택 해제' : '선택'}
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors',
              selected
                ? 'bg-ice-500 border-ice-500'
                : 'border-wline dark:border-rink-700 hover:border-ice-500'
            )}
          >
            {selected && <Icon name="check" className="text-white text-sm" />}
          </button>
        )}

        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            isApproved
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : 'bg-wline dark:bg-rink-700'
          )}
        >
          <Icon
            name={isApproved ? 'check_circle' : 'person'}
            filled={isApproved}
            className={cn(
              'text-xl',
              isApproved
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-wtext-3'
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-card-title text-wtext-1 dark:text-white truncate">
              {data.name}
            </span>
            {data.position && <MatchPositionChip position={data.position} size="xs" />}
            {data.level && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100">
                {data.level}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
            <span>{new Date(data.appliedAt).toLocaleDateString('ko-KR')}</span>
            {data.paymentStatus && (
              <span
                className={cn(
                  'font-semibold',
                  data.paymentStatus === 'paid'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {data.paymentStatus === 'paid' ? '결제완료' : '결제대기'}
              </span>
            )}
          </div>
        </div>
      </div>

      {isPending && !readOnly && (
        <div className="flex gap-2 mt-3 ml-8">
          <button
            type="button"
            onClick={onReject}
            disabled={processing}
            className="flex-1 h-10 rounded-lg border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
          >
            거절
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={processing}
            className="flex-1 h-10 rounded-lg bg-ice-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-ice-700 active:brightness-95 transition-colors"
          >
            승인
          </button>
        </div>
      )}
    </div>
  );
}
