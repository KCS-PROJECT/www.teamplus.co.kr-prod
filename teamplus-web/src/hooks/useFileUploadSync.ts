/**
 * useFileUploadSync — 파일 업로드 실시간 동기화 훅
 *
 * SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20 §5.2 / §9 준수.
 *
 * 책임:
 * - `(refType, refId)` 룸의 file:created / file:updated / file:deleted 이벤트를
 *   수신하여 onFilesChanged 콜백으로 전달.
 * - Socket.io (`/notifications` namespace) + Native postMessage(`window.teamplusNotify`)
 *   두 경로 모두 구독 (websocket-bridge 가 dispatcher 일원화).
 * - Socket 연결 상태(`isConnected`) 를 상태로 노출하여 UI 가 fallback 표시 가능.
 *
 * Graceful degradation:
 * - enabled=false 또는 refType/refId 누락 시 no-op.
 * - WebSocket 미연결 환경에서도 listener 등록은 정상이며, 재연결 시 자동 rejoin.
 *
 * SLA (SPEC §9):
 * - 이벤트 수신 → onFilesChanged 호출: 50ms 내 (websocket-bridge 동기 dispatch).
 * - 메모리 누수 0: useEffect cleanup 에서 unsubscribe 정확.
 *
 * @example
 * ```tsx
 * useFileUploadSync({
 *   refType: 'notice',
 *   refId: noticeId,
 *   enabled: !!noticeId,
 *   onFilesChanged: (event) => {
 *     if (event.type === 'file:created') refetchFiles();
 *   },
 * });
 * ```
 */

'use client';

import { useEffect, useRef, useState } from 'react';

import {
  websocketBridge,
  WebSocketStatus,
  type FileEventCallback,
  type FileEventPayload,
} from '@/services/websocket-bridge';

export type { FileEventPayload, FileEventCallback };

/**
 * useFileUploadSync 옵션
 */
export interface UseFileUploadSyncOptions {
  /** 백엔드 매퍼와 일치하는 카테고리 (예: 'notice', 'gallery', 'award') */
  refType: string;
  /** 대상 엔티티 ID (페이지 params 또는 비동기 로딩된 값) */
  refId: string;
  /** 이벤트 발생 시 호출되는 콜백 (refetch / setState 등) */
  onFilesChanged: (event: FileEventPayload) => void;
  /**
   * 구독 활성화 여부 (기본: true).
   * refId 가 비동기 로딩되는 페이지에서는 `enabled={!!refId}` 패턴 권장.
   */
  enabled?: boolean;
}

/**
 * useFileUploadSync 반환값
 */
export interface UseFileUploadSyncReturn {
  /** Socket.io 연결 상태 — UI 의 실시간 인디케이터 표시에 사용 */
  isConnected: boolean;
}

/**
 * 파일 업로드 실시간 동기화 훅
 */
export function useFileUploadSync(
  options: UseFileUploadSyncOptions,
): UseFileUploadSyncReturn {
  const { refType, refId, onFilesChanged, enabled = true } = options;

  // 초기값은 현재 websocket-bridge 상태에서 동기적으로 읽어
  // 첫 렌더에서도 정확한 isConnected 노출 (Hydration mismatch 없음 — SSR 단계는
  // 'use client' 컴포넌트이므로 client-only).
  const [isConnected, setIsConnected] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return websocketBridge.isConnected();
  });

  /**
   * onFilesChanged 를 ref 로 보존 — 콜백 identity 변경 시에도
   * 구독을 재생성하지 않아 불필요한 unsubscribe/resubscribe 사이클 방지.
   * (props.onFilesChanged 가 inline arrow function 인 경우에도 안전)
   */
  const callbackRef = useRef<UseFileUploadSyncOptions['onFilesChanged']>(onFilesChanged);
  useEffect(() => {
    callbackRef.current = onFilesChanged;
  }, [onFilesChanged]);

  // 파일 이벤트 구독
  useEffect(() => {
    if (!enabled || !refType || !refId) {
      return;
    }

    const handler: FileEventCallback = (event) => {
      // ref dereference → 최신 콜백 호출 (stale closure 방지)
      try {
        callbackRef.current(event);
      } catch {
        // 콜백 내부 에러는 websocket-bridge 가 격리 처리하지만
        // 안전을 위해 hook 레벨에서도 try/catch (다른 구독자 영향 차단).
      }
    };

    const unsubscribe = websocketBridge.subscribeFileEvents(
      refType,
      refId,
      handler,
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, refType, refId]);

  // 연결 상태 추적
  useEffect(() => {
    if (!enabled) {
      // 비활성 상태에서도 현재 상태 1회 동기화
      setIsConnected(websocketBridge.isConnected());
      return;
    }

    // 마운트 시 현재 상태 즉시 동기화
    setIsConnected(websocketBridge.isConnected());

    const unsubscribeStatus = websocketBridge.onStatusChange((status) => {
      setIsConnected(status === WebSocketStatus.Connected);
    });

    return () => {
      unsubscribeStatus();
    };
  }, [enabled]);

  return { isConnected };
}

export default useFileUploadSync;
