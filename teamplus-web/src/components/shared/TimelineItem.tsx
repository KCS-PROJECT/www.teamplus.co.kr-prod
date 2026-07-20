'use client';

/**
 * TimelineItem - TEAMPLUS Shared Component
 * 출석/수업 내역 타임라인 아이템. 좌측 dot+세로선 rail + 우측 카드.
 * 날짜는 상위(페이지)에서 '일' 헤더로 1회 분리 표기하고, 이 컴포넌트는 카드 단위 노드만 담당.
 * 사용 화면: /attendance-history
 */

import { cn } from '@/lib/utils';

export type TimelineStatus = 'attended' | 'absent' | 'upcoming';

export interface TimelineItemProps {
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
  /** 위쪽(이전 같은 날 항목)으로 세로 연결선 */
  connectUp?: boolean;
  /** 아래쪽(다음 같은 날 항목)으로 세로 연결선 */
  connectDown?: boolean;
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
  title,
  time,
  location,
  status,
  onClick,
  connectUp = false,
  connectDown = false,
  className,
}: TimelineItemProps) {
  const meta = STATUS_META[status];

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
    <div className={cn('flex gap-3', className)}>
      {/* Dot + 세로 연결선 rail — 날짜는 상위 헤더에서 표기, 여기선 노드/연결만 */}
      <div className="relative w-3 shrink-0">
        {/* 같은 날 이웃까지 잇는 세로선 (페이지 gap 12px 브릿지) */}
        {connectUp && (
          <span
            className="absolute left-1/2 bottom-1/2 w-px h-[calc(50%_+_1rem)] -translate-x-1/2 bg-wline dark:bg-rink-700"
            aria-hidden="true"
          />
        )}
        {connectDown && (
          <span
            className="absolute left-1/2 top-1/2 w-px h-[calc(50%_+_1rem)] -translate-x-1/2 bg-wline dark:bg-rink-700"
            aria-hidden="true"
          />
        )}
        {/* Status dot — 카드 수직 중앙, 연결선 교차부를 덮어 깔끔하게 */}
        <span
          className={cn(
            'absolute top-1/2 left-1/2 w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2',
            meta.dotClass
          )}
          aria-hidden="true"
        />
      </div>

      {/* Card */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${title} ${meta.label}`}
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
