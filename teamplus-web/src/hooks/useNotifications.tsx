'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Notification,
  NotificationGroup,
  NotificationCategory,
  NotificationFilter,
} from '@/types/notification';
import { api } from '@/services/api-client';
import {
  mapBackendNotification,
  normalizeNotificationPayload,
  getTypesForCategory,
  aggregateStatsByCategory,
  createEmptyStatsByCategory,
  isNotificationVisible,
  type StatsByCategory,
} from '@/lib/notification-mapper';

// 날짜별 그룹화
const groupNotificationsByDate = (notifications: Notification[]): NotificationGroup[] => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const thisWeek = new Date(today.getTime() - 86400000 * 7);

  const groups: { [key: string]: Notification[] } = {
    '오늘': [],
    '어제': [],
    '이번 주': [],
    '이전': [],
  };

  notifications.forEach((notification) => {
    const createdAt = new Date(notification.createdAt);
    const createdDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());

    if (createdDate >= today) {
      groups['오늘'].push(notification);
    } else if (createdDate >= yesterday) {
      groups['어제'].push(notification);
    } else if (createdDate >= thisWeek) {
      groups['이번 주'].push(notification);
    } else {
      groups['이전'].push(notification);
    }
  });

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({
      label,
      items: [...items].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      isOld: label === '이전',
    }));
};

interface UseNotificationsOptions {
  /** 초기 필터 */
  initialFilter?: NotificationFilter;
}

interface UseNotificationsReturn {
  /** 그룹화된 알림 목록 */
  groups: NotificationGroup[];
  /** 전체 알림 목록 */
  notifications: Notification[];
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 */
  error: string | null;
  /** 읽지 않은 알림 수 (현재 카테고리 전체 — 페이지네이션 무관) */
  unreadCount: number;
  /** 현재 카테고리 전체 알림 수 (페이지네이션 무관) */
  totalCount: number;
  /** 카테고리별 전체/미읽음 통계 (탭 뱃지용) */
  statsByCategory: StatsByCategory;
  /** 더 불러올 데이터 존재 여부 */
  hasMore: boolean;
  /** 현재 필터 */
  filter: NotificationFilter;
  /** 필터 변경 */
  setFilter: (filter: NotificationFilter) => void;
  /** 카테고리 필터 변경 */
  setCategory: (category: NotificationCategory) => void;
  /** 알림 새로고침 */
  refresh: () => Promise<void>;
  /** 더 불러오기 */
  loadMore: () => Promise<void>;
  /** 단일 알림 읽음 처리 */
  markAsRead: (id: string) => Promise<void>;
  /** 전체 읽음 처리 */
  markAllAsRead: () => Promise<void>;
  /** 단일 알림 삭제 */
  deleteNotification: (id: string) => Promise<void>;
  /** 전체 알림 삭제 */
  deleteAll: () => Promise<void>;
  /** 오래된 알림 삭제 (30일 이상) — 서버 응답의 삭제된 개수 반환 */
  deleteOldNotifications: () => Promise<number>;
}

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const { initialFilter = {} } = options;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  // 초기 로딩 시 스켈레톤 대신 LoadingContext의 스피너가 표시되므로 초기값 false
  const [isLoading, setIsLoading] = useState(false);
  const skipRef = useRef(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>(initialFilter);
  const [hasMore, setHasMore] = useState(true);
  const [statsByCategory, setStatsByCategory] = useState<StatsByCategory>(
    createEmptyStatsByCategory,
  );

  // 필터링된 알림 — 카테고리는 서버 사이드 (B1), 읽음 상태만 클라이언트 사이드
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (filter.isRead !== undefined && notification.isRead !== filter.isRead) {
        return false;
      }
      return true;
    });
  }, [notifications, filter.isRead]);

  // 그룹화
  const groups = useMemo(() => {
    return groupNotificationsByDate(filteredNotifications);
  }, [filteredNotifications]);

  // 현재 카테고리 전체 통계 (페이지네이션 무관, 서버 stats 기반)
  const currentCategory = filter.category ?? 'all';
  const totalCount = statsByCategory[currentCategory]?.total ?? 0;
  const unreadCount = statsByCategory[currentCategory]?.unread ?? 0;

  // 데이터 로드
  // 카테고리 필터(B1): filter.category 에 해당하는 notificationType 목록을 서버에 전달.
  // 'all' 또는 미지정 시 types 파라미터 생략(전체 조회).
  // hasMore 판정: 응답 길이 == limit 일 때 더 있음으로 추정.
  const fetchNotifications = useCallback(async (reset = false, showLoading = true) => {
    try {
      if (showLoading && isInitialized) {
        setIsLoading(true);
      }
      setError(null);

      const LIMIT = 50;
      const skip = reset ? 0 : skipRef.current;
      const types = getTypesForCategory(filter.category);

      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('skip', String(skip));
      if (types && types.length > 0) {
        params.set('types', types.join(','));
      }

      const res = await api.get<unknown>(`/notifications?${params.toString()}`);

      if (res.success) {
        const rawAll = normalizeNotificationPayload(res.data);
        // [2026-06-18 사용자 직접 지시] 21일 지난 알림 + 현재 화면에 없는 기능(해외원정·휴면·RSVP·대회) 제외.
        const raw = rawAll.filter((b) => isNotificationVisible(b));
        const mapped: Notification[] = raw.map(mapBackendNotification);

        if (reset) {
          setNotifications(mapped);
          skipRef.current = rawAll.length;
        } else {
          setNotifications((prev) => [...prev, ...mapped]);
          skipRef.current += rawAll.length;
        }
        // skip/ hasMore 는 서버가 돌려준 원본 길이 기준 (필터로 줄어든 길이로 페이지네이션 중복·조기 종료 방지).
        setHasMore(rawAll.length >= LIMIT);
      } else {
        console.warn(
          '[useNotifications] 알림 응답 success=false',
          res.error?.message,
        );
      }
      setIsInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알림을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, filter.category]);

  // 초기 로드 (로딩 상태 표시 안 함 - 페이지 전환 스피너로 충분)
  useEffect(() => {
    fetchNotifications(true, false);
  }, [fetchNotifications]);

  // 카테고리별 통계 fetch — 페이지네이션과 무관한 전체/미읽음 카운트
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{
        byType: Record<string, { total: number; unread: number }>;
      }>('/notifications/stats/by-type');
      if (res.success && res.data) {
        setStatsByCategory(aggregateStatsByCategory(res.data.byType ?? {}));
      }
    } catch (err) {
      console.warn('[useNotifications] stats by-type fetch 실패', err);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // 새로고침 — 목록과 통계 모두 갱신
  const refresh = useCallback(async () => {
    await Promise.all([fetchNotifications(true), fetchStats()]);
  }, [fetchNotifications, fetchStats]);

  // 더 불러오기
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    await fetchNotifications(false);
  }, [hasMore, isLoading, fetchNotifications]);

  // 카테고리 변경 — 같은 카테고리 재클릭은 no-op (불필요한 리셋·재요청 방지)
  // 다른 카테고리 전환 시: 이전 데이터 즉시 초기화 + isLoading=true 로 빈 상태 플래시 차단
  const setCategory = useCallback((category: NotificationCategory) => {
    if (filter.category === category) return;
    setNotifications([]);
    skipRef.current = 0;
    setHasMore(true);
    setIsLoading(true);
    setFilter((prev) => ({ ...prev, category }));
  }, [filter.category]);

  // 읽음 처리 — 서버 영속 (optimistic update)
  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification,
      ),
    );
    const res = await api.patch(`/notifications/${id}/read`);
    if (!res.success) {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, isRead: false } : notification,
        ),
      );
    } else {
      void fetchStats();
    }
  }, [fetchStats]);

  // 전체 읽음 처리 — 서버 영속
  const markAllAsRead = useCallback(async () => {
    const prevState = notifications.map((n) => ({ id: n.id, isRead: n.isRead }));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    const res = await api.patch('/notifications/read-all');
    if (!res.success) {
      setNotifications((prev) =>
        prev.map((n) => {
          const prior = prevState.find((p) => p.id === n.id);
          return prior ? { ...n, isRead: prior.isRead } : n;
        }),
      );
    } else {
      void fetchStats();
    }
  }, [notifications, fetchStats]);

  // 단일 삭제 — 서버 영속
  const deleteNotification = useCallback(async (id: string) => {
    const snapshot = notifications.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const res = await api.delete(`/notifications/${id}`);
    if (!res.success && snapshot) {
      setNotifications((prev) => [snapshot, ...prev]);
    } else if (res.success) {
      void fetchStats();
    }
  }, [notifications, fetchStats]);

  // 전체 삭제 — 서버 영속
  const deleteAll = useCallback(async () => {
    const snapshot = notifications;
    setNotifications([]);
    const res = await api.delete('/notifications/all');
    if (!res.success) {
      setNotifications(snapshot);
    } else {
      void fetchStats();
    }
  }, [notifications, fetchStats]);

  // 오래된 알림 삭제 (기본 30일) — 서버 영속
  const deleteOldNotifications = useCallback(async () => {
    const res = await api.delete<{ deleted: number; days: number }>(
      '/notifications/old?days=30',
    );
    if (res.success) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      setNotifications((prev) =>
        prev.filter((n) => new Date(n.createdAt) >= thirtyDaysAgo),
      );
      void fetchStats();
      return res.data?.deleted ?? 0;
    }
    return 0;
  }, [fetchStats]);

  return {
    groups,
    notifications: filteredNotifications,
    isLoading,
    error,
    unreadCount,
    totalCount,
    statsByCategory,
    hasMore,
    filter,
    setFilter,
    setCategory,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll,
    deleteOldNotifications,
  };
}

export default useNotifications;
