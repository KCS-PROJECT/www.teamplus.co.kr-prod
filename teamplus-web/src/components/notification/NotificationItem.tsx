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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스(rounded/shadow/border) 제거 → hairline 행, unread it-red 배지·it-* 토큰.
   *   (현재 (common)/notifications 화면만 전달.)
   */
  iceTheme?: boolean;
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
  iceTheme = false,
}: NotificationItemProps) {
  const style = NOTIFICATION_STYLES[notification.type];
  const typeLabel = NOTIFICATION_TYPE_LABEL[notification.type] ?? '알림';

  // 이동 가능(actionable) 알림 — data.href 존재 시에만 클릭 이동·화살표 노출.
  //   href 없는 정보성 알림은 읽음 처리만 수행(이동 없음).
  const isActionable = !!notification.data?.href;

  const handleClick = () => {
    if (!notification.isRead && onRead) {
      onRead(notification.id);
    }
    if (onClick) {
      onClick(notification);
    }
  };

  // SR 친화적 종합 라벨: "{제목}, {메시지} — {시각}{미읽음 여부}{이동 가능 여부}"
  const ariaLabel = `${notification.title}. ${notification.message}. ${notification.time}${
    !notification.isRead ? ', 미읽음' : ''
  }${isActionable ? ', 눌러서 이동' : ''}`;

  const content = (
    <article
      role="article"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      className={cn(
        'group relative flex gap-3',
        isActionable ? 'cursor-pointer' : 'cursor-default',
        'focus:outline-none',
        iceTheme
          ? cn(
              // ICETIMES flat — 카드 박스(rounded/shadow/border) 제거. hairline 행 + it-* 토큰.
              'py-3.5 px-1',
              notification.isRead
                ? 'bg-transparent'
                : 'bg-it-blue-50/40 dark:bg-it-blue-900/20',
              'transition-colors motion-reduce:transition-none',
              'active:bg-it-fill dark:active:bg-it-blue-900/30',
              'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40',
            )
          : cn(
              'p-3.5 rounded-2xl',
              notification.isRead
                ? 'bg-wbg dark:bg-rink-900'
                : 'bg-wsurface dark:bg-rink-800',
              'border border-wline-2 dark:border-rink-700',
              'shadow-[0_4px_14px_rgba(20,24,38,0.04)] dark:shadow-none',
              'transition-shadow motion-reduce:transition-none',
              'hover:shadow-sh-2',
              'focus-visible:ring-2 focus-visible:ring-ice-500',
            ),
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
          'flex-shrink-0 flex items-center justify-center',
          iceTheme ? 'w-[72px] h-[72px] rounded-w-md' : 'w-[86px] h-[86px] rounded-xl',
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
          <span
            aria-hidden="true"
            className={cn(
              'w-[2px] h-[2px] rounded-full',
              iceTheme ? 'bg-it-ink-400 dark:bg-rink-400' : 'bg-wtext-4 dark:bg-rink-400',
            )}
          />
          <span
            className={cn(
              'text-[11px] font-bold tabular-nums',
              iceTheme ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            {notification.time}
          </span>
          {!notification.isRead && (
            <span
              className={cn(
                'ml-auto flex-shrink-0 w-2 h-2 rounded-full',
                iceTheme ? 'bg-it-red-500' : 'bg-flame-500',
              )}
              aria-label="미읽음"
              role="status"
            />
          )}
        </div>

        {/* 제목 */}
        <h4
          className={cn(
            'mt-2 text-[15px] tracking-[-0.025em] leading-tight line-clamp-1',
            iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
            notification.isRead ? 'font-bold' : 'font-extrabold',
          )}
        >
          {notification.title}
        </h4>

        {/* 본문 (line-clamp 2) */}
        <p
          className={cn(
            'mt-1.5 text-[12.5px] font-medium leading-[1.55] line-clamp-2',
            iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
          )}
        >
          {notification.message}
        </p>
      </div>

      {/* 우측 화살표(>) — data.href 있는 actionable 알림(예: 가입 승인 요청)만 노출. 이동 가능 어포던스. */}
      {isActionable && (
        <div className="flex-shrink-0 self-center pr-0.5" aria-hidden="true">
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            className={iceTheme ? 'text-it-ink-300 dark:text-rink-400' : 'text-wtext-4 dark:text-rink-400'}
          >
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
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
