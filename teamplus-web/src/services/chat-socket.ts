/**
 * Chat Socket Service — `/chat` 네임스페이스 전용 Socket.io 클라이언트.
 *
 * websocket-bridge(알림 `/notifications` 싱글턴)와 의도적으로 분리된 두 번째 연결이다.
 *  - 알림 소켓은 NotificationContext 등 앱 전역 소비자가 공유하므로 네임스페이스를
 *    바꿀 수 없고, 채팅 게이트웨이(chat.gateway.ts)는 이벤트 계약이 완전히 다르다.
 *  - Native(Flutter WebView) 환경에서도 항상 WebView 에서 직접 연결한다 —
 *    Flutter WebSocketService 는 단일 소켓이라 notifications 와 동시 연결이 불가.
 *  - `forceNew: true` 로 알림 소켓의 Manager 와 엔진을 공유하지 않는다. 알림 쪽은
 *    자체 수동 재연결 로직이 Manager 상태를 조작하므로, 공유 시 서로의 생명주기를
 *    간섭한다. 채팅 화면에서만 연결되는 소켓이라 TCP +1 비용은 무시 가능.
 *
 * 서버 계약 (teamplus-backend/src/chat/chat.gateway.ts — SoT):
 *   emit:  join_chat · leave_chat · send_message · typing · read_messages
 *          (핸들러 반환값이 ack 로 전달됨: { success, ... })
 *   recv:  connected · new_message · message_sent · messages_read · user_typing
 *          · unread_count · token:refresh_required · token_expired
 */

import { io, Socket as IOSocket } from 'socket.io-client';
import { hybridAuth } from './hybrid-auth';
import { env } from '@/lib/env';
import { devError, devWarn } from '@/lib/logger';

export type ChatSocketStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/** 서버 브로드캐스트 `new_message` 페이로드 */
export interface ChatIncomingMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: string;
}

export interface ChatSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

type EventCallback = (data: Record<string, unknown>) => void;
type StatusCallback = (status: ChatSocketStatus) => void;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_INTERVAL = 2000;
const ACK_TIMEOUT_MS = 8000;

/** 서버가 클라이언트로 push 하는 이벤트 — onAny 포워딩 허용 목록 */
const SERVER_EVENTS = new Set([
  'connected',
  'new_message',
  'message_sent',
  'messages_read',
  'user_typing',
  'unread_count',
]);

class ChatSocketService {
  private socket: IOSocket | null = null;
  private status: ChatSocketStatus = 'disconnected';
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private statusListeners: Set<StatusCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isRefreshingToken = false;
  /** 재연결 시 자동 rejoin 할 방 목록 */
  private activeRooms: Set<string> = new Set();
  /** 소비자(훅) 레퍼런스 카운트 — 0 이 되면 연결 해제 */
  private consumers = 0;

  private static instance: ChatSocketService;

  static getInstance(): ChatSocketService {
    if (!ChatSocketService.instance) {
      ChatSocketService.instance = new ChatSocketService();
    }
    return ChatSocketService.instance;
  }

  getStatus(): ChatSocketStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  /** 소비자 등록 — 첫 소비자가 연결을 연다. */
  acquire(): void {
    this.consumers += 1;
    if (this.consumers === 1) {
      void this.connect();
    }
  }

  /** 소비자 해제 — 마지막 소비자가 떠나면 연결을 닫는다. */
  release(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers === 0) {
      this.disconnect();
    }
  }

  private async connect(): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') return;
    this.updateStatus('connecting');

    let token = '';
    try {
      const stored = await hybridAuth.getToken();
      token = stored?.accessToken ?? '';
    } catch {
      /* 토큰 없이 연결 시도 → 서버가 token_expired 로 응답 */
    }

    this.createSocket(token);
  }

  private createSocket(token: string): void {
    this.cleanupSocket();

    const baseUrl = env.NEXT_PUBLIC_WS_URL
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://');

    this.socket = io(`${baseUrl}/chat`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false, // 수동 재연결 (attemptReconnect)
      forceNew: true, // 알림 소켓 Manager 와 엔진 비공유
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      this.rejoinActiveRooms();
    });

    this.socket.on('disconnect', (reason: string) => {
      if (reason === 'io client disconnect') {
        this.updateStatus('disconnected');
        return;
      }
      this.updateStatus('disconnected');
      if (this.consumers > 0) {
        this.attemptReconnect();
      }
    });

    this.socket.on('connect_error', (err: Error) => {
      devWarn(`[ChatSocket] connect_error: ${err?.message ?? err}`);
      this.updateStatus('error');
      if (this.consumers > 0) {
        this.attemptReconnect();
      }
    });

    this.socket.on('token:refresh_required', () => {
      void this.refreshTokenAndReconnect();
    });
    this.socket.on('token_expired', () => {
      void this.refreshTokenAndReconnect();
    });

    this.socket.onAny((eventName: string, data: Record<string, unknown>) => {
      if (SERVER_EVENTS.has(eventName)) {
        this.handleEvent(eventName, data ?? {});
      }
    });
  }

  private cleanupSocket(): void {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.activeRooms.clear();
    this.cleanupSocket();
    this.updateStatus('disconnected');
  }

  private async refreshTokenAndReconnect(): Promise<void> {
    if (this.isRefreshingToken) return;
    this.isRefreshingToken = true;
    try {
      const refreshed = await hybridAuth.getToken();
      const newToken = refreshed?.accessToken;
      if (!newToken) {
        devWarn('[ChatSocket] token refresh returned no token');
        this.updateStatus('error');
        return;
      }
      this.createSocket(newToken);
    } catch (e) {
      devError(`[ChatSocket] refreshTokenAndReconnect error: ${e}`);
      this.updateStatus('error');
    } finally {
      this.isRefreshingToken = false;
    }
  }

  /** 지수 백오프 + ±10% 지터 재연결 (websocket-bridge 검증 패턴 이식) */
  private attemptReconnect(): void {
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.updateStatus('error');
      devWarn(
        `[ChatSocket] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached.`,
      );
      return;
    }

    this.reconnectAttempts++;
    this.updateStatus('reconnecting');

    const exponentialDelay = Math.min(
      Math.pow(2, this.reconnectAttempts) * RECONNECT_BASE_INTERVAL,
      60000,
    );
    const delay = Math.round(exponentialDelay * (0.9 + Math.random() * 0.2));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private rejoinActiveRooms(): void {
    for (const roomId of this.activeRooms) {
      this.socket?.emit('join_chat', { roomId });
    }
  }

  // ===== 방 참여 =====

  joinRoom(roomId: string): void {
    if (!roomId) return;
    this.activeRooms.add(roomId);
    if (this.isConnected()) {
      this.socket?.emit('join_chat', { roomId });
    }
    // 미연결이면 connect 후 rejoinActiveRooms 가 처리
  }

  leaveRoom(roomId: string): void {
    if (!roomId) return;
    this.activeRooms.delete(roomId);
    if (this.isConnected()) {
      this.socket?.emit('leave_chat', { roomId });
    }
  }

  // ===== 메시지 =====

  /**
   * 메시지 전송 — 게이트웨이 ack({ success, messageId })를 Promise 로 반환.
   * 미연결이면 success:false 즉시 반환 (호출측이 REST 폴백 판단).
   */
  sendMessage(
    roomId: string,
    content: string,
    messageType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT',
  ): Promise<ChatSendResult> {
    if (!this.isConnected() || !this.socket) {
      return Promise.resolve({ success: false, error: 'not_connected' });
    }
    return new Promise((resolve) => {
      this.socket!
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          'send_message',
          { roomId, content, messageType },
          (timeoutErr: Error | null, ack?: ChatSendResult) => {
            if (timeoutErr) {
              resolve({ success: false, error: 'ack_timeout' });
              return;
            }
            resolve(ack ?? { success: false, error: 'no_ack' });
          },
        );
    });
  }

  sendTyping(roomId: string, isTyping: boolean): void {
    if (!this.isConnected()) return;
    this.socket?.emit('typing', { roomId, isTyping });
  }

  markRead(roomId: string): void {
    if (!this.isConnected()) return;
    this.socket?.emit('read_messages', { roomId });
  }

  // ===== 구독 =====

  on(eventName: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(callback);
    return () => {
      this.eventListeners.get(eventName)?.delete(callback);
    };
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private handleEvent(eventName: string, data: Record<string, unknown>): void {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((cb) => cb(data));
    }
  }

  private updateStatus(newStatus: ChatSocketStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((cb) => cb(newStatus));
    }
  }
}

export const chatSocket = ChatSocketService.getInstance();
