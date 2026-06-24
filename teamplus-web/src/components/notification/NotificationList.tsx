'use client';

import { NotificationItem } from './NotificationItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notification, NotificationGroup } from '@/types/notification';
import { cn } from '@/lib/utils';

interface NotificationListProps {
  groups: NotificationGroup[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** 알림 클릭 시 호출 — actionable(data.href) 알림의 화면 이동에 사용. */
  onItemClick?: (notification: Notification) => void;
  enableSwipe?: boolean;
  emptyVariant?: 'notifications' | 'filter';
  onEmptyAction?: () => void;
}

// [2026-05-19 04n Notice List 디자인 적용]
//   섹션 라벨: 좌측 스트라이프(3×14 ice-500) + 14px 800 텍스트 + 우측 카운트 칩
//   카드 간격 10px, 좌우 패딩 20px — 04n 와 정확 일치.
function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-2.5">
      <div className="flex items-center gap-2">
        <span className="w-[3px] h-3.5 rounded-[2px] bg-ice-500" aria-hidden="true" />
        <span className="text-sm font-extrabold tracking-tight text-wtext-1 dark:text-white">
          {label}
        </span>
      </div>
      <span
        className={cn(
          'ml-1 px-1.5 py-px rounded-full',
          'bg-wline-2 dark:bg-rink-700',
          'text-[11px] font-extrabold tabular-nums',
          'text-wtext-2 dark:text-rink-300',
        )}
        aria-label={`총 ${count}건`}
      >
        {count}
      </span>
    </div>
  );
}

export function NotificationList({
  groups,
  isLoading = false,
  hasMore = false,
  onLoadMore,
  onRead,
  onDelete,
  onItemClick,
  enableSwipe = true,
  emptyVariant = 'notifications',
  onEmptyAction,
}: NotificationListProps) {
  // 알림 클릭 동작 — data.href 있는 actionable 알림(가입 승인 요청 등)만 해당 화면으로 이동,
  //   나머지 정보성 알림은 읽음 처리만 수행(이동 없음). 이동은 onItemClick(상위 페이지)이 결정.

  if (isLoading && groups.length === 0) {
    return null;
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        variant={emptyVariant}
        actionLabel={emptyVariant === 'filter' ? '전체 보기' : undefined}
        onAction={onEmptyAction}
      />
    );
  }

  // 전체 알림 개수 (feed posinset/setsize 계산용)
  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  let runningIndex = 0;

  return (
    <div
      className="flex-1 overflow-y-auto"
      role="feed"
      aria-busy={isLoading}
      aria-label="알림 피드"
    >
      {groups.map((group, gi) => {
        const sectionStart = runningIndex;
        runningIndex += group.items.length;
        return (
          <section
            key={group.label}
            aria-labelledby={`notif-group-${group.label}`}
          >
            <SectionLabel label={group.label} count={group.items.length} />
            <h3 id={`notif-group-${group.label}`} className="sr-only">
              {group.label}
            </h3>
            <div className={cn('px-5 flex flex-col gap-2.5', gi === groups.length - 1 ? 'pb-6' : 'pb-2')}>
              {group.items.map((notification, idx) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={onRead}
                  onDelete={onDelete}
                  onClick={onItemClick}
                  enableSwipe={enableSwipe}
                  posInSet={sectionStart + idx + 1}
                  setSize={totalCount}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* 더 불러오기 */}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          aria-label="이전 알림 더 불러오기"
          className="w-full py-4 text-sm font-extrabold text-ice-500 hover:bg-wbg dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
        >
          더 불러오기
        </button>
      )}

      {/* 로딩 스피너 */}
      {isLoading && groups.length > 0 && (
        <div
          className="flex items-center justify-center py-4"
          role="status"
          aria-live="polite"
          aria-label="알림 불러오는 중"
        >
          <div className="w-6 h-6 border-2 border-ice-500 border-t-transparent rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span className="sr-only">알림을 불러오는 중입니다</span>
        </div>
      )}
    </div>
  );
}

export default NotificationList;
