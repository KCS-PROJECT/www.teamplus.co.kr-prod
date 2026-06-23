/**
 * WebSocket Bridge Service
 * Flutter WebView와 웹 브라우저 환경에서 WebSocket 통신을 관리
 *
 * 경로 A: Web → Socket.io Server (웹 브라우저) — NestJS WebSocket Gateway 호환
 * 경로 B: Web → Flutter Bridge → Socket.io Server (Native 앱)
 */

import { io, Socket as IOSocket } from 'socket.io-client';
import { isFlutterBridgeAvailable, isNativeApp } from './native-bridge';
import { env } from '@/lib/env';
import { devError, devWarn } from '@/lib/logger';

/**
 * WebSocket 연결 상태
 */
export enum WebSocketStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Error = 'error',
}

/**
 * WebSocket 이벤트 타입
 */
export enum WebSocketEventType {
  Notification = 'notification',
  AttendanceUpdate = 'attendance_update',
  ClassUpdate = 'class_update',
  PaymentStatus = 'payment_status',
  SystemNotice = 'system_notice',
  /**
   * 실시간 매치 스코어/상태 업데이트
   * TODO: Backend notifications.gateway에 match_update emit 추가 필요
   *   - 트리거: updateMatchLiveState(), createMatchEvent(), deleteMatchEvent() 호출 시
   *   - payload: { matchId: string; status: MatchStatus; homeScore: number; awayScore: number; currentPeriod?: number }
   */
  MatchUpdate = 'match_update',
  Custom = 'custom',
}

/**
 * WebSocket 이벤트 데이터
 */
export interface WebSocketEvent {
  type: WebSocketEventType;
  eventName: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

/**
 * 파일 업로드 실시간 이벤트 페이로드
 *
 * SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20 §4.3 준수.
 *
 * - `refType`/`refId` 는 NestJS `NotificationsGateway.broadcastFileEvent` 가
 *   emit 하는 room 키와 1:1 대응한다.
 * - `files` 는 `FileResponseDto[]` 와 호환 (백엔드 매퍼 SoT).
 * - `ts` 는 emit 시각 (Date.now()) 으로, 클라이언트 SLA 측정에 사용.
 */
export interface FileEventPayload {
  type: 'file:created' | 'file:updated' | 'file:deleted';
  refType: string;
  refId: string;
  files: Array<Record<string, unknown>>;
  uploaderId: string;
  ts: number;
}

/**
 * 파일 이벤트 콜백 시그니처
 */
export type FileEventCallback = (event: FileEventPayload) => void;

/**
 * WebSocket 옵션
 */
export interface WebSocketOptions {
  /** WebSocket 서버 URL */
  url?: string;
  /** 네임스페이스 */
  namespace?: string;
  /** 인증 토큰 */
  token?: string;
  /** 자동 재연결 */
  autoReconnect?: boolean;
  /** 최대 재연결 시도 횟수 */
  maxReconnectAttempts?: number;
  /** 재연결 간격 (ms) */
  reconnectInterval?: number;
}

type EventCallback = (data: Record<string, unknown>) => void;
type StatusCallback = (status: WebSocketStatus) => void;

/**
 * 재연결하지 않아야 하는 치명적 disconnect 사유
 * - auth_error: 인증 실패 (토큰 만료/무효)
 * - forbidden: 권한 부족
 * - invalid_token: 유효하지 않은 토큰
 */
const FATAL_DISCONNECT_REASONS = [
  'auth_error',
  'forbidden',
  'invalid_token',
  'unauthorized',
] as const;

/**
 * WebSocket Bridge 클래스
 */
class WebSocketBridgeService {
  private status: WebSocketStatus = WebSocketStatus.Disconnected;
  private socket: IOSocket | null = null;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private statusListeners: Set<StatusCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private options: Required<WebSocketOptions>;

  /**
   * 활성 룸 추적 — disconnect 후 재연결 시 자동 rejoin 보장.
   * SPEC §9 SLA(1초) 준수를 위해 socket reconnect 직후 동기 emit.
   *
   * 채팅 등 일반 룸용 (`join_room` / `leave_room` 이벤트).
   */
  private activeRooms: Set<string> = new Set();

  /**
   * 파일 이벤트 전용 ref-room 추적 — backend `joinRefRoom` 시그니처 호환.
   *
   * - key: `${refType}:${refId}` (clientside roomKey, 빠른 중복 차단용)
   * - value: { refType, refId } — backend payload 형식 그대로 보관
   *
   * SPEC §4.3 / §9: backend `@SubscribeMessage('joinRefRoom')` 는
   * `{ refType, refId }` payload 를 기대하므로 별도 trackset 으로 관리하여
   * 재연결 시에도 정확한 시그니처로 rejoin.
   */
  private fileActiveRefRooms: Map<string, { refType: string; refId: string }> = new Map();

  /**
   * 파일 이벤트 listener 레지스트리.
   *
   * - key: `${refType}:${refId}` (room key)
   * - value: 동일 (refType, refId) 에 대한 callback Set
   *
   * 한 페이지에서 동일 ref 에 다중 컴포넌트 구독이 가능하도록 Set 사용.
   */
  private fileEventListeners: Map<string, Set<FileEventCallback>> = new Map();

  /**
   * 룸별 socket cleanup 함수 (첫 구독자 등록 시 생성, 마지막 구독자 해제 시 실행)
   */
  private fileEventCleanups: Map<string, () => void> = new Map();

  /**
   * window.teamplusNotify 핸들러 등록 여부 (idempotent)
   */
  private nativeNotifyRegistered = false;

  private static instance: WebSocketBridgeService;

  private constructor() {
    // socket.io-client는 http/https URL 사용 (ws:// 형식 자동 변환)
    const rawUrl = env.NEXT_PUBLIC_WS_URL;
    const normalizedUrl = rawUrl
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://');
    this.options = {
      url: normalizedUrl,
      namespace: 'notifications',
      token: '',
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 2000,
    };

    // Native 환경에서 Flutter로부터 WebSocket 이벤트 수신
    if (typeof window !== 'undefined') {
      this.setupNativeBridgeListener();
    }
  }

  /**
   * 싱글톤 인스턴스
   */
  static getInstance(): WebSocketBridgeService {
    if (!WebSocketBridgeService.instance) {
      WebSocketBridgeService.instance = new WebSocketBridgeService();
    }
    return WebSocketBridgeService.instance;
  }

  /**
   * Native Bridge 리스너 설정
   */
  private setupNativeBridgeListener() {
    // Flutter에서 WebSocket 이벤트를 JavaScript로 전달할 때 사용
    (window as unknown as Record<string, unknown>).flutterBridge =
      (window as unknown as Record<string, unknown>).flutterBridge || {};

    const flutterBridge = (window as unknown as Record<string, { onWebSocketEvent?: (json: string) => void; onWebSocketStatusChange?: (status: string) => void }>).flutterBridge;

    // WebSocket 이벤트 수신
    flutterBridge.onWebSocketEvent = (eventJson: string) => {
      try {
        const { eventName, data } = JSON.parse(eventJson);
        this.handleEvent(eventName, data);
      } catch (e) {
        devError('[WebSocketBridge] Failed to parse WebSocket event:', e);
      }
    };

    // 연결 상태 변경 수신
    flutterBridge.onWebSocketStatusChange = (status: string) => {
      const newStatus = status as WebSocketStatus;
      this.updateStatus(newStatus);
    };
  }

  /**
   * 현재 연결 상태
   */
  getStatus(): WebSocketStatus {
    return this.status;
  }

  /**
   * 연결 여부
   */
  isConnected(): boolean {
    return this.status === WebSocketStatus.Connected;
  }

  /**
   * WebSocket 연결
   */
  async connect(options?: Partial<WebSocketOptions>): Promise<void> {
    if (options) {
      this.options = { ...this.options, ...options };
      // 전달된 URL도 ws:// → http:// 변환
      if (this.options.url) {
        this.options.url = this.options.url
          .replace(/^ws:\/\//, 'http://')
          .replace(/^wss:\/\//, 'https://');
      }
    }

    if (this.status === WebSocketStatus.Connecting ||
        this.status === WebSocketStatus.Connected) {
      return;
    }

    this.updateStatus(WebSocketStatus.Connecting);

    if (isNativeApp()) {
      // Native 환경: Flutter를 통해 WebSocket 연결
      await this.connectViaNative();
    } else {
      // 웹 브라우저 환경: Socket.io 직접 연결
      this.connectDirect();
    }
  }

  /**
   * Native 환경에서 Flutter를 통해 연결
   */
  private async connectViaNative(): Promise<void> {
    if (!isFlutterBridgeAvailable()) {
      this.updateStatus(WebSocketStatus.Error);
      throw new Error('Flutter Bridge not available');
    }

    try {
      await (window as unknown as Record<string, { callHandler: (name: string, args: unknown) => Promise<unknown> }>).flutter_inappwebview.callHandler('websocket', {
        action: 'connect',
        namespace: this.options.namespace,
      });
      // 상태 업데이트는 Flutter에서 onWebSocketStatusChange를 통해 전달됨
    } catch (e) {
      devError('[WebSocketBridge] Native WebSocket connect failed:', e);
      this.updateStatus(WebSocketStatus.Error);
    }
  }

  /**
   * 웹 브라우저에서 Socket.io로 직접 연결
   * NestJS WebSocket Gateway (Socket.io 4.x) 와 호환
   *
   * 재진입 안전: 기존 socket 인스턴스가 있으면 먼저 정리한 뒤 새로 생성.
   * 누수된 WebSocket 핸들이 브라우저 동시 연결 한도(≈6/host)를 점유하여
   * `ERR_INSUFFICIENT_RESOURCES` 로 폭주하는 회귀를 방지한다.
   */
  private connectDirect(): void {
    // 기존 socket 정리 — 리스너 제거 + connection close
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch {
        /* ignore cleanup errors */
      }
      this.socket = null;
    }

    const socketUrl = this.options.namespace
      ? `${this.options.url}/${this.options.namespace}`
      : this.options.url;

    this.socket = io(socketUrl, {
      auth: this.options.token ? { token: this.options.token } : {},
      // NestJS WebSocket Gateway는 polling을 지원하지 않으므로 websocket만 사용
      transports: ['websocket'],
      reconnection: false, // 수동 재연결로 제어 (attemptReconnect)
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.updateStatus(WebSocketStatus.Connected);
      // 활성 룸 자동 재참여 — 재연결 후 즉시 emit (SPEC §9 SLA 200ms 유지)
      this.rejoinActiveRooms();
    });

    this.socket.on('disconnect', (reason: string) => {
      // 클라이언트 측 명시적 disconnect는 재연결하지 않음
      if (reason === 'io client disconnect') {
        this.updateStatus(WebSocketStatus.Disconnected);
        return;
      }

      // 인증/권한 관련 치명적 사유는 재연결 대신 에러 상태로 전환
      const isFatal = FATAL_DISCONNECT_REASONS.some((r) => reason.includes(r));
      if (isFatal) {
        devError(`[WebSocketBridge] Fatal disconnect reason: ${reason}`);
        this.updateStatus(WebSocketStatus.Error);
        return;
      }

      this.updateStatus(WebSocketStatus.Disconnected);
      if (this.options.autoReconnect) {
        this.attemptReconnect();
      }
    });

    // connect_error: 서버 미기동/DNS 실패 등 — disconnect 이벤트가 함께 오지
    // 않을 수 있으므로 여기서도 재시도 카운터를 진입시킨다 (max 도달 시 Error 고정).
    this.socket.on('connect_error', (err: Error) => {
      devWarn(`[WebSocketBridge] connect_error: ${err?.message ?? err}`);
      this.updateStatus(WebSocketStatus.Error);
      if (this.options.autoReconnect) {
        this.attemptReconnect();
      }
    });

    // [2026-05-13 Phase D-4] WebSocket 토큰 갱신 흐름.
    //   서버가 토큰 만료 임박/만료 감지 시 emit 하는 이벤트를 처리한다.
    //
    //   - `token:refresh_required`: 만료 5분 이내. hybridAuth.refreshToken() 후
    //     새 토큰으로 socket.auth 갱신 + 재연결. 연결 끊김은 발생하지 않음.
    //   - `token_expired`: 이미 만료/유효하지 않음. 서버가 disconnect 직전 emit.
    //     클라이언트는 갱신 후 재연결 시도.
    this.socket.on('token:refresh_required', () => {
      void this.refreshTokenAndReconnect();
    });
    this.socket.on('token_expired', () => {
      void this.refreshTokenAndReconnect();
    });

    // onAny로 모든 서버 이벤트 수신
    this.socket.onAny((eventName: string, data: Record<string, unknown>) => {
      this.handleEvent(eventName, data);
    });
  }

  /**
   * 서버의 token:refresh_required / token_expired 수신 시 호출.
   *  - hybridAuth.refreshToken() 로 새 access token 발급
   *  - socket.auth.token 갱신 후 disconnect → connect 사이클로 재연결
   *  - 갱신 실패 시 fatal 처리 (Error 상태)
   *
   * 중복 호출 방지를 위해 진행 중 플래그를 사용한다.
   */
  private isRefreshingWsToken = false;
  private async refreshTokenAndReconnect(): Promise<void> {
    if (this.isRefreshingWsToken) return;
    this.isRefreshingWsToken = true;
    try {
      // 동적 import 로 순환 의존성 회피 (api-client → websocket-bridge 가능성).
      const { hybridAuth } = await import('./hybrid-auth');
      const refreshed = await hybridAuth.getToken();
      const newToken = refreshed?.accessToken;
      if (!newToken) {
        devWarn('[WebSocketBridge] Token refresh returned no token');
        this.updateStatus(WebSocketStatus.Error);
        return;
      }
      this.options.token = newToken;
      if (this.socket) {
        // socket.auth 는 객체 mutate 가능
        (this.socket as unknown as { auth: Record<string, unknown> }).auth = {
          token: newToken,
        };
        try {
          this.socket.disconnect();
        } catch {
          /* ignore */
        }
        try {
          this.socket.connect();
        } catch (e) {
          devError(`[WebSocketBridge] reconnect after refresh failed: ${e}`);
        }
      }
    } catch (e) {
      devError(`[WebSocketBridge] refreshTokenAndReconnect error: ${e}`);
      this.updateStatus(WebSocketStatus.Error);
    } finally {
      this.isRefreshingWsToken = false;
    }
  }

  /**
   * 재연결 시도 (지수 백오프 + +-10% 지터)
   *
   * 안전 가드:
   * - 기존 reconnectTimer 가 예약되어 있으면 중복 예약 방지 (Insufficient resources 폭주 차단)
   * - maxReconnectAttempts 도달 시 autoReconnect 도 disable 하여 영구 루프 차단
   */
  private attemptReconnect() {
    // 이미 타이머 걸려있으면 중복 예약 금지
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      // 더 이상 재시도하지 않음 — 호출측에서 명시적으로 connect() 하기 전까지 중단
      this.options.autoReconnect = false;
      this.updateStatus(WebSocketStatus.Error);
      devWarn(
        `[WebSocketBridge] Max reconnect attempts (${this.options.maxReconnectAttempts}) reached. Auto-reconnect disabled.`,
      );
      return;
    }

    this.reconnectAttempts++;
    this.updateStatus(WebSocketStatus.Reconnecting);

    // 지수 백오프: min(2^attempt * baseInterval, 60000)
    const exponentialDelay = Math.min(
      Math.pow(2, this.reconnectAttempts) * this.options.reconnectInterval,
      60000,
    );
    // +-10% 지터로 thundering herd 방지
    const jitter = exponentialDelay * (0.9 + Math.random() * 0.2);
    const delay = Math.round(jitter);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectDirect();
    }, delay);
  }

  /**
   * 이벤트 처리
   */
  private handleEvent(eventName: string, data: Record<string, unknown>) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }

    // 와일드카드 리스너 (모든 이벤트)
    const wildcardListeners = this.eventListeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((callback) => callback({ eventName, ...data }));
    }
  }

  /**
   * 상태 업데이트
   */
  private updateStatus(newStatus: WebSocketStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((callback) => callback(newStatus));
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  on(eventName: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(callback);

    // 구독 해제 함수 반환
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * 이벤트 리스너 등록 (on의 alias)
   */
  subscribe(eventName: string, callback: EventCallback): () => void {
    return this.on(eventName, callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  off(eventName: string, callback?: EventCallback) {
    if (callback) {
      this.eventListeners.get(eventName)?.delete(callback);
    } else {
      this.eventListeners.delete(eventName);
    }
  }

  /**
   * 상태 변경 리스너 등록
   */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  /**
   * 이벤트 전송
   */
  emit(eventName: string, data?: unknown) {
    if (!this.isConnected()) {
      return;
    }

    if (isNativeApp()) {
      // Native 환경: Flutter를 통해 전송
      (window as unknown as Record<string, { callHandler: (name: string, args: unknown) => Promise<unknown> }>).flutter_inappwebview?.callHandler('websocket', {
        action: 'emit',
        eventName,
        data,
      });
    } else if (this.socket) {
      // Socket.io emit
      this.socket.emit(eventName, data);
    }
  }

  /**
   * 룸 참여
   *
   * activeRooms 에 등록하여 재연결 시 자동 rejoin 대상이 되도록 한다.
   * 이미 join 된 룸은 emit 중복이 발생해도 서버에서 idempotent 처리.
   */
  joinRoom(roomId: string) {
    if (!roomId) return;
    this.activeRooms.add(roomId);
    this.emit('join_room', { roomId });
  }

  /**
   * 룸 나가기
   *
   * activeRooms 에서 제거하여 이후 재연결 시 rejoin 대상에서 제외.
   */
  leaveRoom(roomId: string) {
    if (!roomId) return;
    this.activeRooms.delete(roomId);
    this.emit('leave_room', { roomId });
  }

  /**
   * 파일 이벤트 전용 ref-room 참여.
   *
   * Backend `@SubscribeMessage('joinRefRoom')` (notifications.gateway.ts:325) 와
   * 시그니처 정확 매칭 — payload `{ refType, refId }`.
   *
   * SPEC §4.3 room 표준: `${refType.toLowerCase()}:${refId}` 는 server-side 가
   * 결정하므로 client 는 refType/refId 만 전달하면 충분.
   *
   * fileActiveRefRooms 에 등록되어 재연결 시 자동 rejoin 보장.
   */
  joinRefRoom(refType: string, refId: string) {
    if (!refType || !refId) return;
    const roomKey = `${refType}:${refId}`;
    this.fileActiveRefRooms.set(roomKey, { refType, refId });
    this.emit('joinRefRoom', { refType, refId });
  }

  /**
   * 파일 이벤트 전용 ref-room 나가기.
   *
   * Backend `@SubscribeMessage('leaveRefRoom')` 와 시그니처 매칭.
   * fileActiveRefRooms 에서 제거하여 이후 재연결 시 rejoin 대상에서 제외.
   */
  leaveRefRoom(refType: string, refId: string) {
    if (!refType || !refId) return;
    const roomKey = `${refType}:${refId}`;
    this.fileActiveRefRooms.delete(roomKey);
    this.emit('leaveRefRoom', { refType, refId });
  }

  /**
   * 재연결 후 활성 룸 일괄 rejoin.
   *
   * SPEC §9: Gateway → 다른 Client 수신 SLA 200ms.
   * 재연결 직후 즉시 emit 하여 서버 측 room membership 회복을 보장한다.
   *
   * - 일반 룸(`activeRooms`): `join_room` 이벤트 (채팅 등)
   * - 파일 ref-room(`fileActiveRefRooms`): `joinRefRoom` 이벤트 (backend 매칭)
   */
  private rejoinActiveRooms() {
    this.activeRooms.forEach((roomId) => {
      this.emit('join_room', { roomId });
    });
    this.fileActiveRefRooms.forEach(({ refType, refId }) => {
      this.emit('joinRefRoom', { refType, refId });
    });
  }

  /**
   * 파일 업로드 실시간 이벤트 구독.
   *
   * SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20 §4.3 / §5.2 / §9 준수.
   *
   * 동작:
   * 1. `${refType}:${refId}` room 에 join (서버에서 broadcast 대상 결정).
   * 2. Socket.io `file:created` / `file:updated` / `file:deleted` 이벤트를
   *    수신하면 refType + refId 가 일치하는 callback 만 호출 (false dispatch 방지).
   * 3. Native 환경(Flutter WebView) 에서는 `window.teamplusNotify(payload)`
   *    함수 호출도 함께 처리하여 postMessage 경로의 file 이벤트를 분배한다.
   * 4. unsubscribe 함수 반환 — useEffect cleanup 에서 호출 시 정확히
   *    해당 callback 만 제거하고, 마지막 구독자였다면 room leave + listener 정리.
   *
   * 멀티 구독:
   * - 같은 `(refType, refId)` 에 여러 컴포넌트/훅이 구독 가능.
   * - 각각 독립된 unsubscribe 함수를 반환받아 메모리 누수 0 보장.
   *
   * Graceful degradation:
   * - WebSocket 미연결 환경에서도 listener 등록은 정상 수행되며,
   *   재연결 시 자동 rejoin → 이후 이벤트 정상 수신.
   * - Native postMessage 경로는 socket 상태와 무관하게 항상 동작.
   *
   * @param refType - 백엔드 매퍼와 일치하는 카테고리 (예: 'notice', 'gallery', 'award')
   * @param refId   - 대상 엔티티 ID (예: 공지 ID, 앨범 ID, 수상 ID)
   * @param callback - 이벤트 발생 시 호출되는 콜백
   * @returns unsubscribe 함수 (idempotent — 여러 번 호출해도 안전)
   */
  subscribeFileEvents(
    refType: string,
    refId: string,
    callback: FileEventCallback,
  ): () => void {
    if (!refType || !refId) {
      devWarn('[WebSocketBridge] subscribeFileEvents requires refType and refId');
      return () => {
        /* no-op */
      };
    }

    const roomKey = `${refType}:${refId}`;

    // 1) listener 레지스트리에 callback 등록
    if (!this.fileEventListeners.has(roomKey)) {
      this.fileEventListeners.set(roomKey, new Set());
    }
    const listeners = this.fileEventListeners.get(roomKey)!;
    const isFirstSubscriber = listeners.size === 0;
    listeners.add(callback);

    // 2) 첫 구독자라면 socket 이벤트 구독 + room join + native handler 등록
    if (isFirstSubscriber) {
      // Native postMessage 핸들러 1회만 등록 (idempotent)
      this.registerNativeNotifyHandler();

      // Socket.io 'file:*' 이벤트 → roomKey 일치 시 dispatch
      const offCreated = this.on('file:created', (data) =>
        this.handleFileSocketEvent('file:created', refType, refId, data),
      );
      const offUpdated = this.on('file:updated', (data) =>
        this.handleFileSocketEvent('file:updated', refType, refId, data),
      );
      const offDeleted = this.on('file:deleted', (data) =>
        this.handleFileSocketEvent('file:deleted', refType, refId, data),
      );

      // Room join (Socket.io) — backend `@SubscribeMessage('joinRefRoom')` 매칭
      this.joinRefRoom(refType, refId);

      // 마지막 구독자가 떠날 때 실행할 cleanup
      this.fileEventCleanups.set(roomKey, () => {
        offCreated();
        offUpdated();
        offDeleted();
        this.leaveRefRoom(refType, refId);
      });
    }

    // 3) unsubscribe 함수 반환 (idempotent)
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;

      const set = this.fileEventListeners.get(roomKey);
      if (!set) return;
      set.delete(callback);

      // 마지막 구독자 떠남 → socket cleanup + 레지스트리 제거
      if (set.size === 0) {
        this.fileEventListeners.delete(roomKey);
        const cleanup = this.fileEventCleanups.get(roomKey);
        if (cleanup) {
          try {
            cleanup();
          } catch (e) {
            devError('[WebSocketBridge] file event cleanup error:', e);
          }
          this.fileEventCleanups.delete(roomKey);
        }
      }
    };
  }

  /**
   * Socket.io 'file:*' 이벤트 핸들러 — refType/refId 일치 검증 후 dispatch.
   *
   * Socket.io 의 onAny 가 모든 룸의 이벤트를 동일 핸들러로 전달하므로,
   * 구독자가 등록한 `(refType, refId)` 와 정확히 일치하는 페이로드만
   * dispatchFileEvent 로 넘긴다 (false positive 방지).
   */
  private handleFileSocketEvent(
    type: FileEventPayload['type'],
    expectedRefType: string,
    expectedRefId: string,
    raw: Record<string, unknown>,
  ) {
    const payloadRefType = typeof raw?.refType === 'string' ? raw.refType : '';
    const payloadRefId = typeof raw?.refId === 'string' ? raw.refId : '';
    if (payloadRefType !== expectedRefType || payloadRefId !== expectedRefId) {
      return;
    }
    const normalized: FileEventPayload = {
      type,
      refType: payloadRefType,
      refId: payloadRefId,
      files: Array.isArray(raw?.files)
        ? (raw.files as Array<Record<string, unknown>>)
        : [],
      uploaderId: typeof raw?.uploaderId === 'string' ? raw.uploaderId : '',
      ts: typeof raw?.ts === 'number' ? raw.ts : Date.now(),
    };
    this.dispatchFileEvent(normalized);
  }

  /**
   * window.teamplusNotify 핸들러 등록 (idempotent).
   *
   * SPEC §7.2: Native 가 업로드 성공 후 evaluateJavascript 로 호출.
   * - 기존에 등록된 teamplusNotify 가 있으면 chain 호출 (다른 모듈 보존).
   * - file:* 타입 payload 만 file event dispatcher 로 전달.
   * - 그 외 payload 는 무시 (다른 도메인 알림은 별도 시스템에서 처리).
   */
  private registerNativeNotifyHandler() {
    if (this.nativeNotifyRegistered || typeof window === 'undefined') return;
    this.nativeNotifyRegistered = true;

    const w = window as unknown as {
      teamplusNotify?: (payload: unknown) => void;
    };
    const existing =
      typeof w.teamplusNotify === 'function' ? w.teamplusNotify : undefined;

    w.teamplusNotify = (payload: unknown) => {
      // 기존 핸들러 chain 호출 (다른 도메인 알림 보존)
      if (existing) {
        try {
          existing(payload);
        } catch (e) {
          devWarn('[WebSocketBridge] chained teamplusNotify error:', e);
        }
      }

      // payload 정규화 (object 또는 JSON string 허용)
      let parsed: unknown = payload;
      if (typeof payload === 'string') {
        try {
          parsed = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!parsed || typeof parsed !== 'object') return;

      const data = parsed as Partial<FileEventPayload>;
      const type = data.type;
      if (
        type !== 'file:created' &&
        type !== 'file:updated' &&
        type !== 'file:deleted'
      ) {
        return;
      }
      if (!data.refType || !data.refId) return;

      const normalized: FileEventPayload = {
        type,
        refType: data.refType,
        refId: data.refId,
        files: Array.isArray(data.files) ? data.files : [],
        uploaderId: typeof data.uploaderId === 'string' ? data.uploaderId : '',
        ts: typeof data.ts === 'number' ? data.ts : Date.now(),
      };
      this.dispatchFileEvent(normalized);
    };
  }

  /**
   * 정규화된 FileEventPayload 를 해당 룸의 모든 구독자에게 전파.
   *
   * SPEC §9: Client refetch → 화면 갱신 SLA 500ms.
   * 동기 callback 호출로 큐잉 지연 0 (50ms 내 도달 보장).
   */
  private dispatchFileEvent(event: FileEventPayload) {
    const roomKey = `${event.refType}:${event.refId}`;
    const listeners = this.fileEventListeners.get(roomKey);
    if (!listeners || listeners.size === 0) return;
    listeners.forEach((cb) => {
      try {
        cb(event);
      } catch (e) {
        devError('[WebSocketBridge] file event callback error:', e);
      }
    });
  }

  /**
   * 연결 해제
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (isNativeApp()) {
      (window as unknown as Record<string, { callHandler: (name: string, args: unknown) => Promise<unknown> }>).flutter_inappwebview?.callHandler('websocket', {
        action: 'disconnect',
      });
    } else if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.updateStatus(WebSocketStatus.Disconnected);
  }

  /**
   * 정리
   *
   * 파일 이벤트 cleanup 도 일괄 실행하여 메모리 누수 0 보장.
   */
  dispose() {
    this.disconnect();
    this.eventListeners.clear();
    this.statusListeners.clear();
    // 파일 이벤트 cleanup 일괄 실행
    this.fileEventCleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        /* ignore cleanup errors */
      }
    });
    this.fileEventCleanups.clear();
    this.fileEventListeners.clear();
    this.activeRooms.clear();
    this.fileActiveRefRooms.clear();
  }
}

// 싱글톤 인스턴스 export
export const websocketBridge = WebSocketBridgeService.getInstance();

export default websocketBridge;
