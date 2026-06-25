'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { CategoryTabs } from '@/components/notification/CategoryTabs';
import { NotificationList } from '@/components/notification/NotificationList';
import { useNotifications } from '@/hooks/useNotifications';
import { usePageReady } from '@/hooks/usePageReady';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { MESSAGES } from '@/lib/messages';
import { Notification, NotificationCategory } from '@/types/notification';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/hooks/useNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationContext } from '@/contexts/NotificationContext';

export default function NotificationsPage() {
  const { toast } = useToast();
  const { modal } = useModal();
  const [showActions, setShowActions] = useState(false);
  // [2026-06-19] 전체 읽음 시 상단 벨 미읽음 배지도 즉시 동기화 (Context 갱신).
  const { markAllAsRead: ctxMarkAllAsRead } = useNotificationContext();

  // Native 앱에서 BottomNav 표시 (기본 UI 설정)
  useDefaultUI();

  const { navigate } = useNavigation();

  const {
    groups,
    isLoading,
    unreadCount,
    totalCount,
    statsByCategory,
    hasMore,
    filter,
    setCategory,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll,
    deleteOldNotifications,
  } = useNotifications();

  // 풀스크린 로더 fast-path (v11) — 알림 목록 fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [2026-06-18] 역할별 탭 — 감독/코치/오픈클래스감독: 전체/가입/결제/공지, 그 외(학부모 등): 전체/수업/결제/공지.
  const { user } = useAuth();
  const tabCategories: NotificationCategory[] = useMemo(() => {
    const role = user?.userType?.toLowerCase();
    const isManager = role === 'director' || role === 'coach' || role === 'academy_director';
    return isManager
      ? ['all', 'join', 'payment', 'notice']
      : ['all', 'class', 'payment', 'notice'];
  }, [user?.userType]);

  // 카테고리별 미읽음 카운트 — 서버 stats 기반 (페이지네이션·필터 무관)
  const unreadCounts: Partial<Record<NotificationCategory, number>> = {
    all: statsByCategory.all.unread,
    class: statsByCategory.class.unread,
    join: statsByCategory.join.unread,
    payment: statsByCategory.payment.unread,
    notice: statsByCategory.notice.unread,
    system: statsByCategory.system.unread,
  };

  // 카테고리 변경
  const handleCategoryChange = useCallback(
    (category: NotificationCategory) => {
      setCategory(category);
    },
    [setCategory]
  );

  // 필터 초기화
  const handleResetFilter = useCallback(() => {
    setCategory('all');
  }, [setCategory]);

  // 알림 클릭 — actionable(data.href) 알림만 해당 화면으로 이동(가입 승인 요청 → /approval 등).
  //   읽음 처리는 NotificationItem.handleClick 이 onRead → onClick 순으로 선행 수행.
  const handleItemClick = useCallback(
    (notification: Notification) => {
      let href = notification.data?.href;
      if (!href) return;
      // [2026-06-23 통합] 회원 승인 알림(백엔드 linkUrl 정적 "/approval")은 통합 페이지
      //   /director-approvals 로 이동(코치 포함 전 매니저 공용). 다른 진입점과 동일 규칙.
      if (href === '/approval') {
        href = '/director-approvals';
      }
      navigate(href);
    },
    [navigate],
  );

  // [2026-06-19 사용자 직접 지시] 전체 읽음 — 목록(서버) + 상단 벨 배지 동기 처리.
  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0) {
      toast.info(MESSAGES.notifications.noUnreadToMark);
      return;
    }
    await markAllAsRead();
    ctxMarkAllAsRead();
    toast.success(MESSAGES.notifications.markAllReadSuccess);
  }, [unreadCount, markAllAsRead, ctxMarkAllAsRead, toast]);

  // 오래된 알림 삭제
  const handleDeleteOld = useCallback(async () => {
    const count = await deleteOldNotifications();
    if (count > 0) {
      toast.success(`${count}개의 오래된 알림이 삭제되었습니다.`);
    } else {
      toast.info(MESSAGES.notifications.noOldToDelete);
    }
    setShowActions(false);
  }, [deleteOldNotifications, toast]);

  // 전체 삭제
  const handleDeleteAll = useCallback(async () => {
    const confirmed = await modal.confirm({
      title: '전체 삭제',
      message: '모든 알림을 삭제하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
      variant: 'danger',
    });
    if (confirmed) {
      await deleteAll();
    }
    setShowActions(false);
  }, [deleteAll, modal]);

  return (
    <MobileContainer hasBottomNav={true} className="flex flex-col h-full">
      {/* AppBar 불변 — 04n NoticeAppBar 의 디자인 패턴은 PageAppBar default 가 이미 만족 */}
      <PageAppBar title="알림" forceNative />

      <div className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* [ICETIMES flat] 카테고리 탭 — it-fill 세그먼티드 + it-blue active (공유 컴포넌트 iceTheme variant) */}
        <CategoryTabs
          activeCategory={filter.category || 'all'}
          onCategoryChange={handleCategoryChange}
          unreadCounts={unreadCounts}
          categories={tabCategories}
          iceTheme
        />

        {/* [2026-06-19 사용자 직접 지시] 통계 칩(전체/안읽음) + 전체 읽음 버튼 — 모두 동일 크기(h-9) 한 줄 툴바.
            알림이 있으면 항상 노출. 전체 읽음은 미읽음 0개면 비활성. (감독/코치/학부모 공통) */}
        {totalCount > 0 && (
          <div className="px-5 pt-3 flex items-center justify-between gap-2">
            {/* 좌측 — 전체 / 안 읽음 통계 칩 (전체 읽음 배지와 동일 h-9 크기) */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-[13px] font-extrabold text-it-ink-700 dark:text-rink-100">
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-it-ink-500 dark:text-rink-400">
                  <rect x="3" y="4" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth={1.4} />
                  <path d="M3 7h10M6 2.5v2M10 2.5v2" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
                </svg>
                전체
                <span className="tabular-nums text-it-ink-800 dark:text-white">{totalCount}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-[13px] font-extrabold text-it-ink-700 dark:text-rink-100">
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-it-ink-500 dark:text-rink-400">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth={1.4} />
                  <circle cx="8" cy="8" r="2.5" className="fill-it-red-500" />
                </svg>
                안읽음
                <span className="tabular-nums text-it-red-500">{unreadCount}</span>
              </span>
            </div>

            {/* 우측 — 전체 읽음 버튼 */}
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-pill border-[1.5px] text-[13px] font-extrabold tracking-tight transition-colors motion-reduce:transition-none active:brightness-95',
                unreadCount > 0
                  ? 'border-it-blue-500 bg-it-blue-500 text-white hover:bg-it-blue-600'
                  : 'border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-it-ink-400 dark:text-rink-400 cursor-not-allowed',
              )}
              aria-label={MESSAGES.notifications.markAllRead}
            >
              <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8.5l2.5 2.5 4-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 10.5l1 1 4-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {MESSAGES.notifications.markAllRead}
            </button>
          </div>
        )}

        {/* [ICETIMES flat] 알림 목록 — full-bleed 흰 섹션 + hairline 행 (공유 컴포넌트 iceTheme variant) */}
        <NotificationList
          groups={groups}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onRead={markAsRead}
          onDelete={deleteNotification}
          onItemClick={handleItemClick}
          enableSwipe={true}
          emptyVariant={filter.category && filter.category !== 'all' ? 'filter' : 'notifications'}
          onEmptyAction={filter.category !== 'all' ? handleResetFilter : undefined}
          iceTheme
        />

        {/* 새로고침 버튼 영역 — 2026-05-23 제거 (사용자 직접 지시).
            Pull-to-refresh 제스처가 이미 처리하므로 중복. handleRefresh 함수는
            아래 NotificationList 가 내부적으로 사용할 수 있도록 유지. */}

        <div className="h-6" />
      </div>
    </MobileContainer>
  );
}
