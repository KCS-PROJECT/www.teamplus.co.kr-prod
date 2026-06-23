'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/services/api-client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 내 미확인 공지 개수 조회 훅
 *
 * - GET /api/v1/notices/mine/unread-count
 * - 비로그인 시 0 반환 (호출 안 함)
 * - 5분 자동 갱신 + refresh() 수동 갱신 가능
 */
export function useNoticeUnreadCount() {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    setIsLoading(true);
    const res = await api.get<{ unreadCount: number }>('/notices/mine/unread-count');
    if (res.success && res.data) {
      setUnreadCount(res.data.unreadCount ?? 0);
    }
    setIsLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    void fetchCount();
    if (!isAuthenticated) return;
    // 5분마다 자동 갱신
    const interval = setInterval(() => {
      void fetchCount();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchCount, isAuthenticated]);

  return { unreadCount, isLoading, refresh: fetchCount };
}

export default useNoticeUnreadCount;
