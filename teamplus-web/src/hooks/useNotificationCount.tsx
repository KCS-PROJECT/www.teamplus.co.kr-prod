'use client';

/**
 * useNotificationCount — 미읽음 알림 카운트 셀렉터 훅
 *
 * 이전: 독립 Context + 30초 setInterval 폴링 (GET /notifications/stats/unread)
 * 현재: NotificationContext 셀렉터 — 폴링 제거, Socket.io 실시간 업데이트 활용
 *
 * NotificationContext.tsx 가 Socket.io 'notification' 이벤트를 구독하므로
 * 이 훅은 단순히 해당 Context에서 파생된 값을 읽습니다.
 *
 * 외부 API (unreadCount, hasUnread, isLoading, error, refresh, markAsRead,
 * markAllAsRead, incrementCount) 는 기존과 동일하게 유지합니다.
 * — 6개 호출 컴포넌트 변경 불필요
 */

import { useCallback } from 'react';
import { useNotificationContext } from '@/contexts/NotificationContext';

interface NotificationCountState {
  unreadCount: number;
  hasUnread: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (count?: number) => void;
  markAllAsRead: () => void;
  incrementCount: (amount?: number) => void;
}

/**
 * 미읽음 알림 카운트 접근 훅
 *
 * NotificationContext 를 구독하므로 NotificationProvider 하위에서만 사용 가능합니다.
 * Provider 외부에서 호출 시 기본값(0)을 반환합니다.
 */
export function useNotificationCount(): NotificationCountState {
  let ctx: ReturnType<typeof useNotificationContext> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ctx = useNotificationContext();
  } catch {
    // Provider 밖에서 호출된 경우 — 기본값 반환
  }

  // Context 가 없을 때 no-op 구현
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const noop = useCallback(async () => {}, []);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const noopSync = useCallback(() => {}, []);

  if (!ctx) {
    return {
      unreadCount: 0,
      hasUnread: false,
      isLoading: false,
      error: null,
      refresh: noop,
      markAsRead: noopSync,
      markAllAsRead: noopSync,
      incrementCount: noopSync,
    };
  }

  const { unreadCount, isLoading, refresh, markAllAsRead } = ctx;

  return {
    unreadCount,
    hasUnread: unreadCount > 0,
    isLoading,
    error: null,
    refresh,
    markAsRead: (count = 1) => {
      // NotificationContext 의 markAsRead 는 id 기반 — 카운트 기반 호환 레이어
      // 단순 카운트 차감이므로 Context 자체의 markAllAsRead 로 처리할 수 없음.
      // 실제 개별 읽음 처리는 id 기반이어야 하므로, 카운트 차감 시에는
      // refresh() 호출로 서버 상태를 재동기화합니다.
      void (count > 0 && refresh());
    },
    markAllAsRead,
    // incrementCount 는 Socket.io 이벤트로 자동 처리되므로 no-op
    incrementCount: noopSync,
  };
}

/**
 * 미읽음 알림 존재 여부만 필요할 때 사용하는 간결한 훅
 */
export function useHasUnreadNotifications(): boolean {
  const { hasUnread } = useNotificationCount();
  return hasUnread;
}

export default useNotificationCount;
