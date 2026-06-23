'use client';

/**
 * TimelineItem - TEAMPLUS Shared Component
 * 출석/수업 내역 타임라인 아이템. 좌측 날짜 컬럼 + 우측 카드 구조.
 * 사용 화면: /attendance, /attendance-history, /parent-calendar 이력, /progress
 */

import { cn } from '@/lib/utils';

export type TimelineStatus = 'attended' | 'absent' | 'upcoming';

export interface TimelineItemProps {
  /** 날짜 객체 */
  date: Date;
  /** 요일 텍스트 (예: "월") */
  dayOfWeek: string;
  /** 수업/이벤트 제목 */
  title: string;
  /** 시간 표시 (예: "17:00 - 18:30") */
  time: string;
  /** 장소 */
  location?: string;
  /** 상태 */
  status: TimelineStatus;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 마지막 아이템 여부 (세로 라인 길이 조정) */
  isLast?: boolean;
  /** 추가 className */
  className?: string;
}

const STATUS_META: Record<
  TimelineStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  attended: {
    label: '출석완료',
    dotClass: 'bg-success',
    badgeClass: 'bg-success/10 text-success',
  },
  absent: {
    label: '결석',
    dotClass: 'bg-error',
    badgeClass: 'bg-error/10 text-error',
  },
  upcoming: {
    label: '예정',
    dotClass: 'bg-ice-500',
    badgeClass: 'bg-ice-500/10 text-ice-500',
  },
};

export function TimelineItem({
  date,
  dayOfWeek,
  title,
  time,
  location,
  status,
  onClick,
  isLast = false,
  className,
}: TimelineItemProps) {
  const meta = STATUS_META[status];
  const dayNum = date.getDate();

  const cardInner = (
    <div
      className={cn(
        'flex-1 rounded-xl p-4',
        'bg-white dark:bg-rink-800',
        'border border-wline-2 dark:border-rink-700',
        onClick && 'hover:border-ice-500/30 active:brightness-95 cursor-pointer',
        'transition-colors duration-150'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[15px] font-bold text-wtext-1 dark:text-white min-w-0 truncate">
          {title}
        </h4>
        <span
          className={cn(
            'shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold',
            meta.badgeClass
          )}
        >
          {meta.label}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs text-wtext-3 dark:text-rink-300">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            schedule
          </span>
          {time}
        </span>
        {location && (
          <span className="inline-flex items-center gap-1 text-xs text-wtext-3 dark:text-rink-300">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              location_on
            </span>
            {location}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn('flex gap-4', className)}>
      {/* Date column */}
      <div className="min-w-[32px] flex flex-col items-center">
        <span className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">
          {dayOfWeek}
        </span>
        <span className="text-lg font-bold text-wtext-1 dark:text-white leading-tight">
          {dayNum}
        </span>
        {/* Status dot + connector */}
        <span
          className={cn('mt-2 w-2.5 h-2.5 rounded-full', meta.dotClass)}
          aria-hidden="true"
        />
        {!isLast && (
          <span
            className="flex-1 w-px bg-wline dark:bg-rink-700 mt-1"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Card */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${dayNum}일 ${title} ${meta.label}`}
          className="flex-1 text-left focus:outline-none focus:ring-2 focus:ring-ice-500/40 rounded-xl"
        >
          {cardInner}
        </button>
      ) : (
        cardInner
      )}
    </div>
  );
}

export default TimelineItem;
