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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 full-bleed 흰 섹션 + hairline 행 + it-* 토큰. (현재 (common)/notifications 화면만 전달.)
   */
  iceTheme?: boolean;
}

// [2026-05-19 04n Notice List 디자인 적용]
//   섹션 라벨: 좌측 스트라이프(3×14 ice-500) + 14px 800 텍스트 + 우측 카운트 칩
//   카드 간격 10px, 좌우 패딩 20px — 04n 와 정확 일치.
function SectionLabel({
  label,
  count,
  iceTheme = false,
}: {
  label: string;
  count: number;
  iceTheme?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'w-[3px] h-3.5 rounded-[2px]',
            iceTheme ? 'bg-it-blue-500' : 'bg-ice-500',
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            'text-sm font-extrabold tracking-tight',
            iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
          )}
        >
          {label}
        </span>
      </div>
      <span
        className={cn(
          'ml-1 px-1.5 py-px rounded-full',
          'text-[11px] font-extrabold tabular-nums',
          iceTheme
            ? 'bg-it-line dark:bg-it-blue-900 text-it-ink-600 dark:text-rink-300'
            : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-300',
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
  iceTheme = false,
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
            // ICETIMES flat — 그룹별 full-bleed 흰 섹션 + 8px 회색 갭.
            className={cn(
              iceTheme && 'mt-2 first:mt-0 bg-it-surface dark:bg-it-blue-950',
            )}
          >
            <SectionLabel label={group.label} count={group.items.length} iceTheme={iceTheme} />
            <h3 id={`notif-group-${group.label}`} className="sr-only">
              {group.label}
            </h3>
            <div
              className={cn(
                iceTheme
                  ? // 카드 박스 제거 → hairline 행. SwipeableItem 가 각 행을 감싸므로
                    //   item 간 구분은 divide 로 처리(자식 직접 divide 불가 → 행 내부 py + border-t).
                    cn('px-5 flex flex-col divide-y divide-it-line dark:divide-it-blue-900', gi === groups.length - 1 ? 'pb-2' : '')
                  : cn('px-5 flex flex-col gap-2.5', gi === groups.length - 1 ? 'pb-6' : 'pb-2'),
              )}
            >
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
                  iceTheme={iceTheme}
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
          className={cn(
            'w-full py-4 text-sm font-extrabold transition-colors motion-reduce:transition-none focus:outline-none',
            iceTheme
              ? 'text-it-blue-600 dark:text-it-blue-300 hover:bg-it-fill dark:hover:bg-it-blue-900/40 focus-visible:ring-2 focus-visible:ring-it-blue-500'
              : 'text-ice-500 hover:bg-wbg dark:hover:bg-rink-800 focus-visible:ring-2 focus-visible:ring-ice-500',
          )}
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
          <div
            className={cn(
              'w-6 h-6 border-2 border-t-transparent rounded-full animate-spin motion-reduce:animate-none',
              iceTheme ? 'border-it-blue-500' : 'border-ice-500',
            )}
            aria-hidden="true"
          />
          <span className="sr-only">알림을 불러오는 중입니다</span>
        </div>
      )}
    </div>
  );
}

export default NotificationList;
