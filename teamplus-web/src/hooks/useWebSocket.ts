'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketBridge, WebSocketStatus, type WebSocketOptions } from '@/services/websocket-bridge';

/**
 * WebSocket Hook 옵션
 */
export interface UseWebSocketOptions extends WebSocketOptions {
  /** 자동 연결 여부 */
  autoConnect?: boolean;
  /** 특정 이벤트 구독 */
  events?: string[];
  /** 연결 시 콜백 */
  onConnect?: () => void;
  /** 연결 해제 시 콜백 */
  onDisconnect?: () => void;
  /** 에러 시 콜백 */
  onError?: () => void;
}

/**
 * WebSocket 이벤트 메시지
 */
export interface WebSocketMessage {
  eventName: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

/**
 * WebSocket Hook
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     isConnected,
 *     lastMessage,
 *     messages,
 *     connect,
 *     emit,
 *   } = useWebSocket({
 *     autoConnect: true,
 *     events: ['notification', 'attendance_update'],
 *     onConnect: () => devLog('Connected!'),
 *   });
 *
 *   return (
 *     <div>
 *       <p>상태: {isConnected ? '연결됨' : '연결 안됨'}</p>
 *       <p>마지막 메시지: {lastMessage?.eventName}</p>
 *       <button onClick={() => emit('ping', { time: Date.now() })}>
 *         Ping
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = false,
    events = [],
    onConnect,
    onDisconnect,
    onError,
    ...wsOptions
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>(websocketBridge.getStatus());
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const unsubscribeRef = useRef<(() => void)[]>([]);

  // 연결 상태
  const isConnected = status === WebSocketStatus.Connected;
  const isConnecting = status === WebSocketStatus.Connecting;
  const isReconnecting = status === WebSocketStatus.Reconnecting;

  // 연결
  const connect = useCallback(async () => {
    await websocketBridge.connect(wsOptions);
  }, [wsOptions]);

  // 연결 해제
  const disconnect = useCallback(() => {
    websocketBridge.disconnect();
  }, []);

  // 이벤트 전송
  const emit = useCallback((eventName: string, data?: unknown) => {
    websocketBridge.emit(eventName, data);
  }, []);

  // 룸 참여
  const joinRoom = useCallback((roomId: string) => {
    websocketBridge.joinRoom(roomId);
  }, []);

  // 룸 나가기
  const leaveRoom = useCallback((roomId: string) => {
    websocketBridge.leaveRoom(roomId);
  }, []);

  // 메시지 초기화
  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
  }, []);

  // 이벤트 구독 (동적)
  const subscribe = useCallback((eventName: string, callback: (data: Record<string, unknown>) => void) => {
    return websocketBridge.on(eventName, callback);
  }, []);

  // 이벤트 구독 해제
  const unsubscribe = useCallback((eventName: string, callback?: (data: Record<string, unknown>) => void) => {
    websocketBridge.off(eventName, callback);
  }, []);

  // 이벤트 리스너 등록
  useEffect(() => {
    // 상태 변경 리스너
    const unsubscribeStatus = websocketBridge.onStatusChange((newStatus) => {
      setStatus(newStatus);

      if (newStatus === WebSocketStatus.Connected) {
        onConnect?.();
      } else if (newStatus === WebSocketStatus.Disconnected) {
        onDisconnect?.();
      } else if (newStatus === WebSocketStatus.Error) {
        onError?.();
      }
    });

    // 이벤트 리스너 등록
    const eventUnsubscribes: (() => void)[] = [];

    // 특정 이벤트 구독
    if (events.length > 0) {
      events.forEach((eventName) => {
        const unsubscribe = websocketBridge.on(eventName, (data) => {
          const message: WebSocketMessage = {
            eventName,
            data,
            timestamp: new Date(),
          };
          setLastMessage(message);
          setMessages((prev) => [...prev, message].slice(-100)); // 최대 100개 유지
        });
        eventUnsubscribes.push(unsubscribe);
      });
    } else {
      // 모든 이벤트 구독 (와일드카드)
      const unsubscribe = websocketBridge.on('*', (data) => {
        const { eventName, ...eventData } = data;
        const message: WebSocketMessage = {
          eventName: eventName as string,
          data: eventData,
          timestamp: new Date(),
        };
        setLastMessage(message);
        setMessages((prev) => [...prev, message].slice(-100));
      });
      eventUnsubscribes.push(unsubscribe);
    }

    unsubscribeRef.current = [unsubscribeStatus, ...eventUnsubscribes];

    // 자동 연결
    if (autoConnect) {
      connect();
    }

    return () => {
      unsubscribeRef.current.forEach((unsub) => unsub());
    };
  }, [events, autoConnect, connect, onConnect, onDisconnect, onError]);

  return {
    // 상태
    status,
    isConnected,
    isConnecting,
    isReconnecting,

    // 메시지
    messages,
    lastMessage,
    clearMessages,

    // 액션
    connect,
    disconnect,
    emit,
    joinRoom,
    leaveRoom,

    // 동적 구독
    subscribe,
    unsubscribe,
  };
}

export default useWebSocket;
