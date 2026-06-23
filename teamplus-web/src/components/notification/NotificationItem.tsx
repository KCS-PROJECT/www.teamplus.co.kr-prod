'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SwipeableItem } from '@/components/ui/SwipeableItem';
import {
  Notification,
  NOTIFICATION_STYLES,
  NotificationType,
} from '@/types/notification';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (notification: Notification) => void;
  enableSwipe?: boolean;
  /** WAI-ARIA feed pattern — 1-based position */
  posInSet?: number;
  /** WAI-ARIA feed pattern — total set size */
  setSize?: number;
}

// [2026-05-19 04n Notice List 디자인 적용]
//   카드 컨테이너(rounded-2xl + line-2 border + soft shadow) + 좌측 일러스트 박스(96×96)
//   + 카테고리 칩 + dot + 시각 + 큰 제목(15px/800) + 본문(12.5px/lineClamp 2)
//   기능 변경 없음 — onRead/onDelete/onClick/enableSwipe 그대로.
const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  schedule: '일정',
  approval: '승인',
  payment: '결제',
  info: '정보',
  system: '시스템',
  class: '수업',
  match: '경기',
  club: '팀',
};

export const NotificationItem = memo(function NotificationItem({
  notification,
  onRead,
  onDelete,
  onClick,
  enableSwipe = true,
  posInSet,
  setSize,
}: NotificationItemProps) {
  const style = NOTIFICATION_STYLES[notification.type];
  const typeLabel = NOTIFICATION_TYPE_LABEL[notification.type] ?? '알림';

  const handleClick = () => {
    if (!notification.isRead && onRead) {
      onRead(notification.id);
    }
    if (onClick) {
      onClick(notification);
    }
  };

  // SR 친화적 종합 라벨: "{제목}, {메시지} — {시각}{미읽음 여부}"
  const ariaLabel = `${notification.title}. ${notification.message}. ${notification.time}${
    !notification.isRead ? ', 미읽음' : ''
  }`;

  const content = (
    <article
      role="article"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      className={cn(
        'group relative flex gap-3 p-3.5 cursor-pointer rounded-2xl',
        notification.isRead
          ? 'bg-wbg dark:bg-rink-900'
          : 'bg-wsurface dark:bg-rink-800',
        'border border-wline-2 dark:border-rink-700',
        'shadow-[0_4px_14px_rgba(20,24,38,0.04)] dark:shadow-none',
        'transition-shadow motion-reduce:transition-none',
        'hover:shadow-sh-2',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500',
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* 좌측 아이콘 박스 — 86×86 일러스트 영역과 동일한 패턴, 알림 도메인은 큰 아이콘 */}
      <div
        className={cn(
          'flex-shrink-0 w-[86px] h-[86px] rounded-xl',
          'flex items-center justify-center',
          style.bgColor,
        )}
        aria-hidden="true"
      >
        <Icon name={style.icon} className={cn('text-[34px]', style.textColor)} aria-hidden="true" />
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-w-0">
        {/* 상단 메타: 타입 칩 · dot · 시각 */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2 py-0.5 rounded-md text-[11px] font-extrabold tracking-tight',
              style.bgColor,
              style.textColor,
            )}
          >
            {typeLabel}
          </span>
          <span aria-hidden="true" className="w-[2px] h-[2px] rounded-full bg-wtext-4 dark:bg-rink-400" />
          <span className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 tabular-nums">
            {notification.time}
          </span>
          {!notification.isRead && (
            <span
              className="ml-auto flex-shrink-0 w-2 h-2 rounded-full bg-flame-500"
              aria-label="미읽음"
              role="status"
            />
          )}
        </div>

        {/* 제목 */}
        <h4
          className={cn(
            'mt-2 text-[15px] tracking-[-0.025em] leading-tight line-clamp-1',
            'text-wtext-1 dark:text-white',
            notification.isRead ? 'font-bold' : 'font-extrabold',
          )}
        >
          {notification.title}
        </h4>

        {/* 본문 (line-clamp 2) */}
        <p
          className={cn(
            'mt-1.5 text-[12.5px] font-medium leading-[1.55] line-clamp-2',
            'text-wtext-3 dark:text-rink-300',
          )}
        >
          {notification.message}
        </p>
      </div>

      {/* [2026-06-19 사용자 직접 지시] 우측 화살표(>) 제거 — 알림 카드는 정보 표시 전용(이동 없음). */}
    </article>
  );

  if (!enableSwipe) {
    return content;
  }

  return (
    <SwipeableItem
      onDelete={onDelete ? () => onDelete(notification.id) : undefined}
      onMarkRead={onRead && !notification.isRead ? () => onRead(notification.id) : undefined}
      isRead={notification.isRead}
    >
      {content}
    </SwipeableItem>
  );
});

export default NotificationItem;
