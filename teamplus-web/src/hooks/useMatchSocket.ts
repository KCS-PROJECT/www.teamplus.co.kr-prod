'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { hybridAuth } from '@/services/hybrid-auth';
import { env } from '@/lib/env';

/**
 * Backend Match Scoreboard Gateway emit payloads
 * Backend `match-scoreboard.gateway.ts` 와 1:1 매핑.
 */
export interface MatchScoreUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  currentPeriod?: number | null;
  lastEvent?: {
    id: string;
    eventType: string;
    periodNumber: number;
    eventTime: string;
    description?: string | null;
  };
}

export interface MatchStatusChange {
  matchId: string;
  status: string;
  currentPeriod?: number | null;
  homeScore?: number;
  awayScore?: number;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
}

export interface UseMatchSocketOptions {
  /** 매치 ID — falsy 면 연결하지 않음 */
  matchId: string | null | undefined;
  /** 활성화 여부. 페이지 비활성/완료된 매치는 false 로 polling 폴백 가능 */
  enabled?: boolean;
  /** 스코어 갱신 콜백 */
  onScoreUpdate?: (payload: MatchScoreUpdate) => void;
  /** 상태 변경 콜백 */
  onStatusChange?: (payload: MatchStatusChange) => void;
}

const NAMESPACE = '/match-scoreboard';

/**
 * Match Scoreboard 실시간 소켓 훅
 *
 * Namespace 별도 socket 인스턴스를 페이지 라이프사이클에 맞춰 관리.
 * `joinMatch` emit → server 가 `match:${matchId}` room 에 join → score/status 이벤트 수신.
 *
 * 연결 실패 / 토큰 부재 / disabled 시에도 페이지는 정상 렌더 (호출 측 polling 폴백 유지).
 */
export function useMatchSocket({
  matchId,
  enabled = true,
  onScoreUpdate,
  onStatusChange,
}: UseMatchSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // 콜백을 ref 로 보관하여 effect 재실행 방지
  const scoreCbRef = useRef(onScoreUpdate);
  const statusCbRef = useRef(onStatusChange);
  useEffect(() => {
    scoreCbRef.current = onScoreUpdate;
  }, [onScoreUpdate]);
  useEffect(() => {
    statusCbRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!enabled || !matchId) {
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;

    (async () => {
      const tokenData = await hybridAuth.getToken();
      const accessToken = tokenData?.accessToken;
      if (!accessToken || cancelled) {
        // 토큰 없음 — polling 폴백에 위임
        return;
      }

      const baseUrl = env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '');
      socket = io(`${baseUrl}${NAMESPACE}`, {
        transports: ['websocket'],
        auth: { token: accessToken },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10_000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        if (cancelled) return;
        setIsConnected(true);
        socket?.emit('joinMatch', { matchId });
      });

      socket.on('disconnect', () => {
        if (cancelled) return;
        setIsConnected(false);
      });

      socket.on('connect_error', () => {
        if (cancelled) return;
        setIsConnected(false);
      });

      socket.on('match:score-update', (payload: MatchScoreUpdate) => {
        if (cancelled) return;
        if (payload?.matchId === matchId) {
          scoreCbRef.current?.(payload);
        }
      });

      socket.on('match:status-change', (payload: MatchStatusChange) => {
        if (cancelled) return;
        if (payload?.matchId === matchId) {
          statusCbRef.current?.(payload);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (socket) {
        try {
          socket.emit('leaveMatch', { matchId });
        } catch {
          // ignore
        }
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [matchId, enabled]);

  return { isConnected };
}

export default useMatchSocket;
