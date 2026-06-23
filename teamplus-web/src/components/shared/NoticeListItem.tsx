'use client';

/**
 * NoticeListItem - TEAMPLUS Shared Component
 * 공지/이벤트/긴급 목록의 개별 아이템.
 * 태그 칩 + 제목(truncate) + 요약(2줄 clamp) + 상대 날짜 + NEW/PIN 뱃지.
 * 사용 화면: /notice, /notice/list, /director-notices, /notices
 */

import { cn } from '@/lib/utils';

export type NoticeType = 'notice' | 'event' | 'urgent';

export interface NoticeListItemProps {
  /** 공지 유형 (태그 칩 색상 결정) */
  type: NoticeType;
  /** 제목 */
  title: string;
  /** 요약 (2줄 clamp) */
  summary?: string;
  /** 작성일 */
  date: Date;
  /** 신규 뱃지 표시 */
  isNew?: boolean;
  /** 상단 고정 여부 */
  isPinned?: boolean;
  /** 조회수 */
  viewCount?: number;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 className */
  className?: string;
}

const TYPE_META: Record<
  NoticeType,
  { label: string; tone: string }
> = {
  notice: { label: '공지', tone: 'bg-ice-500/10 text-ice-500' },
  event: { label: '이벤트', tone: 'bg-success/10 text-success' },
  urgent: { label: '긴급', tone: 'bg-error/10 text-error' },
};

function formatRelativeKo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (dayDiff === 0) {
    if (diffHour < 1) return `${diffMin}분 전`;
    return `${diffHour}시간 전`;
  }
  if (dayDiff === 1) return '어제';

  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

export function NoticeListItem({
  type,
  title,
  summary,
  date,
  isNew = false,
  isPinned = false,
  viewCount,
  onClick,
  className,
}: NoticeListItemProps) {
  const typeMeta = TYPE_META[type];
  const relativeDate = formatRelativeKo(date);

  const content = (
    <>
      {/* Left: type chip / pinned icon */}
      <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
        {isPinned && (
          <span
            className="material-symbols-outlined text-ice-500 text-[18px]"
            aria-label="상단 고정"
          >
            push_pin
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full',
            'text-[11px] font-semibold whitespace-nowrap',
            typeMeta.tone
          )}
        >
          {typeMeta.label}
        </span>
      </div>

      {/* Middle: title + summary */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <h3 className="flex-1 min-w-0 truncate text-[15px] font-bold text-wtext-1 dark:text-white">
            {title}
          </h3>
          {isNew && (
            <span
              className="shrink-0 inline-flex items-center px-1.5 h-[18px] rounded bg-red-500 text-white text-[10px] font-bold"
              aria-label="새 글"
            >
              NEW
            </span>
          )}
        </div>

        {summary && (
          <p className="mt-1 text-sm text-gray-500 dark:text-rink-300 line-clamp-2">
            {summary}
          </p>
        )}

        {/* Meta row: date + viewCount */}
        <div className="mt-2 flex items-center gap-3 text-xs text-wtext-3 dark:text-rink-300">
          <time dateTime={date.toISOString()}>{relativeDate}</time>
          {typeof viewCount === 'number' && (
            <span className="inline-flex items-center gap-0.5">
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden="true"
              >
                visibility
              </span>
              {viewCount.toLocaleString('ko-KR')}
            </span>
          )}
        </div>
      </div>
    </>
  );

  const baseClass = cn(
    'flex items-start gap-3 p-4',
    'border-b border-gray-100 dark:border-rink-700',
    'bg-white dark:bg-rink-800',
    'transition-colors duration-150',
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${typeMeta.label} ${title}${isNew ? ', 새 글' : ''} 상세 보기`}
        className={cn(
          baseClass,
          'w-full text-left',
          'hover:bg-gray-50 dark:hover:bg-rink-700/60',
          'active:brightness-95',
          'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass} role="article">
      {content}
    </div>
  );
}

export default NoticeListItem;
