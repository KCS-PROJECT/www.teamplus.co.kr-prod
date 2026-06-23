'use client';

/**
 * ChatListItem - TEAMPLUS Shared Component
 * 학부모/코치 1:1 상담 목록 개별 아이템.
 * 사용 화면: /message/list, /messages, /team-chat, /chat/[id] 진입 리스트
 */

import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

export interface ChatListItemProps {
  /** 상대방 아바타 이미지 URL (없으면 기본 아이콘) */
  avatarUrl?: string;
  /** 상대방 이름 */
  name: string;
  /** 마지막 메시지 미리보기 */
  lastMessage: string;
  /** 마지막 메시지 시각 (예: "오후 2:14", "어제") */
  time: string;
  /** 읽지 않은 메시지 수 (0 또는 undefined면 비표시) */
  unreadCount?: number;
  /** 현재 온라인 여부 */
  online?: boolean;
  /** 그룹 채팅(수업 채팅방 등) 여부 — 아바타 아이콘을 groups 로 렌더 */
  isGroup?: boolean;
  /** 대화가 아직 비어있는지 여부 — 최근 메시지 텍스트를 연한 italic 으로 표시 */
  isEmpty?: boolean;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 className */
  className?: string;
}

export function ChatListItem({
  avatarUrl,
  name,
  lastMessage,
  time,
  unreadCount = 0,
  online = false,
  isGroup = false,
  isEmpty = false,
  onClick,
  className,
}: ChatListItemProps) {
  const hasUnread = unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name}님과의 대화 열기${hasUnread ? `, 읽지 않은 메시지 ${unreadCount}개` : ''}`}
      className={cn(
        'w-full flex items-center gap-4 p-4 text-left',
        'bg-white dark:bg-rink-800',
        'rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm',
        'hover:bg-wbg dark:hover:bg-rink-700/60',
        'active:brightness-95 transition-colors duration-150 motion-reduce:transition-none',
        'focus:outline-none focus:ring-2 focus:ring-ice-500/40',
        className
      )}
    >
      {/* Avatar + Online dot */}
      <div className="relative shrink-0">
        <div
          className={cn(
            'w-12 h-12 rounded-full overflow-hidden ring-1 flex items-center justify-center',
            isGroup
              ? 'bg-ice-500/10 ring-ice-500/20 dark:bg-ice-500/20 dark:ring-ice-500/30'
              : 'bg-wline-2 ring-wline dark:bg-rink-700 dark:ring-rink-700',
          )}
        >
          {resolveImageSrc(avatarUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(avatarUrl)}
              alt={`${name} 프로필 사진`}
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              className={cn(
                'material-symbols-outlined text-2xl',
                isGroup ? 'text-ice-500 dark:text-blue-300' : 'text-wtext-3 dark:text-rink-300',
              )}
              aria-hidden="true"
            >
              {isGroup ? 'groups' : 'person'}
            </span>
          )}
        </div>
        {online && (
          <span
            className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success ring-2 ring-white dark:ring-rink-800"
            aria-label="온라인"
          />
        )}
      </div>

      {/* Middle: name + preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-[15px] text-wtext-1 dark:text-white',
              hasUnread ? 'font-bold' : 'font-semibold'
            )}
          >
            {name}
          </p>
          {time ? (
            <span
              className={cn(
                'shrink-0 text-xs tabular-nums',
                hasUnread ? 'text-ice-500 font-semibold' : 'text-wtext-3 dark:text-rink-300'
              )}
            >
              {time}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p
            className={cn(
              'truncate text-sm',
              isEmpty
                ? 'italic text-wtext-3 dark:text-rink-300'
                : hasUnread
                  ? 'text-wtext-2 dark:text-rink-100'
                  : 'text-wtext-3 dark:text-rink-300'
            )}
          >
            {lastMessage}
          </p>
          {hasUnread && (
            <span
              className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-ice-500 text-white text-[11px] font-bold"
              aria-label={`읽지 않은 메시지 ${unreadCount}개`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default ChatListItem;
