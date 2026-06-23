'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { Notification } from '@/types/notification';
import { api } from '@/services/api-client';
import { hybridAuth } from '@/services/hybrid-auth';
import { websocketBridge } from '@/services/websocket-bridge';
import {
  mapBackendNotification,
  normalizeNotificationPayload,
  isNotificationVisible,
  type BackendNotification,
} from '@/lib/notification-mapper';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // ⚡ 서버에서 받은 unread 카운트 (목록 로드 전 배지 즉시 표시용).
  //    notifications 가 비어 있을 때만 사용되며, 목록 도착 후에는 클라이언트 파생값 우선.
  const [serverUnreadCount, setServerUnreadCount] = useState<number | null>(null);

  // 알림 목록 로드
  const loadNotifications = useCallback(async () => {
    // 토큰 없으면 API 호출 건너뜀 (미인증 상태 → 불필요한 401 방지)
    const tokenInfo = await hybridAuth.getToken();
    if (!tokenInfo?.accessToken) {
      // silent fail 추적용 — DevTools 에서 원인 파악 가능하도록 경고만 1회 노출
      console.warn('[NotificationContext] access token 없음 — 알림 fetch 건너뜀');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // 백엔드(notifications.service.ts:184-204)는 순수 배열을 반환.
      // 매퍼가 배열/`{ notifications }`/`{ data }` 3가지 페이로드 형태를 모두 흡수한다.
      const response = await api.get<unknown>('/notifications');
      if (response.success) {
        // [2026-06-19] 상단 벨 미읽음 카운트도 목록과 동일 기준으로 — 숨긴 알림(21일+ · 제외 유형)
        //   제외. (목록 0개인데 벨 빨간점 남던 문제 해소)
        const raw = normalizeNotificationPayload(response.data).filter((b) =>
          isNotificationVisible(b),
        );
        const mapped = raw.map(mapBackendNotification);
        setNotifications(mapped);
      } else {
        console.warn(
          '[NotificationContext] 알림 응답 success=false',
          response.error?.message,
        );
      }
    } catch (err) {
      console.warn('[NotificationContext] 알림 로드 실패', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ⚡ unread 카운트 즉시 fetch — 1.5초 idle 동안 배지가 0 으로 깜빡이던 UX 결함 제거.
  //    경량 endpoint(/notifications/stats/unread) 호출이라 LCP 영향 없음.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      const tokenInfo = await hybridAuth.getToken();
      if (!tokenInfo?.accessToken || cancelled) return;
      try {
        const res = await api.get<{ unreadCount: number }>('/notifications/stats/unread');
        if (!cancelled && res.success && res.data && typeof res.data.unreadCount === 'number') {
          setServerUnreadCount(res.data.unreadCount);
        }
      } catch {
        // 카운트 실패해도 배지는 0 유지 — 목록 도착 시 자동 보정
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 초기 로드 — idle 타이밍에 지연 실행 (초기 렌더 블로킹 방지)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const run = () => { void loadNotifications(); };
    if (w.requestIdleCallback) { w.requestIdleCallback(run, { timeout: 1500 }); return; }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [loadNotifications]);

  // Socket.io notification 이벤트 구독 — 새 알림 수신 시 목록 맨 앞에 추가
  useEffect(() => {
    const unsub = websocketBridge.subscribe(
      'notification',
      (payload: Record<string, unknown>) => {
        // 백엔드 게이트웨이가 보내는 페이로드를 동일한 매퍼로 흡수
        const backendShape: BackendNotification = {
          id:
            (payload.id as string) ||
            `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          notificationType:
            (payload.notificationType as string) ?? (payload.type as string),
          title: (payload.title as string) || '',
          message:
            (payload.message as string) ?? (payload.body as string) ?? '',
          isRead: false,
          createdAt: (payload.createdAt as string) ?? new Date().toISOString(),
          linkUrl: (payload.linkUrl as string) ?? undefined,
        };
        const notification = mapBackendNotification(backendShape);
        // 중복 알림 도착 시 같은 id 가 위로 올라오지 않도록 가드
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notification.id)) return prev;
          return [notification, ...prev];
        });
      },
    );
    return unsub;
  }, []);

  // ⚡ 읽지 않은 알림 수
  //    - 목록이 로드된 후: 클라이언트 파생값(정확)
  //    - 목록 로드 전: 서버 카운트(즉시 표시) — 배지 깜빡임 제거.
  //    - 둘 다 없으면 0.
  const clientUnreadCount = notifications.filter((n) => !n.isRead).length;
  const unreadCount =
    notifications.length > 0
      ? clientUnreadCount
      : (serverUnreadCount ?? 0);

  // 알림 추가 (로컬 state만 업데이트 - WebSocket 수신용)
  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'createdAt'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
      };
      setNotifications((prev) => [newNotification, ...prev]);
    },
    []
  );

  // 읽음 처리
  const markAsRead = useCallback(async (id: string) => {
    // 낙관적 업데이트
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // 실패 시 롤백
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: false } : n))
      );
    }
  }, []);

  // 전체 읽음 처리 (로컬 state 업데이트)
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  // 삭제
  const deleteNotification = useCallback(async (id: string) => {
    // 낙관적 업데이트
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      // 실패해도 UI는 이미 삭제됨 (UX 우선)
    }
  }, []);

  // 전체 삭제 (로컬 state만)
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // 새로고침
  const refresh = useCallback(async () => {
    await loadNotifications();
  }, [loadNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        refresh,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotificationContext must be used within a NotificationProvider'
    );
  }
  return context;
}

export default NotificationContext;
