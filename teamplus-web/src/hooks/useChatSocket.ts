'use client';

/**
 * useChatSocket — `/chat` 네임스페이스 소켓의 방 단위 React 바인딩.
 *
 * chatSocket 싱글턴을 acquire/release 레퍼런스 카운트로 공유한다:
 * 마운트 시 연결(첫 소비자)·roomId join, 언마운트 시 leave·해제(마지막 소비자).
 * 콜백은 ref 로 보관해 소켓 구독을 재등록하지 않고 항상 최신 핸들러를 호출한다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  chatSocket,
  type ChatSocketStatus,
  type ChatIncomingMessage,
  type ChatSendResult,
} from '@/services/chat-socket';

export interface UseChatSocketOptions {
  roomId?: string;
  onNewMessage?: (message: ChatIncomingMessage) => void;
  onMessagesRead?: (data: { roomId: string; readBy: string }) => void;
  onUserTyping?: (data: { roomId: string; userId: string; isTyping: boolean }) => void;
  onUnreadCount?: (data: { roomId: string; count: number }) => void;
}

export function useChatSocket(options: UseChatSocketOptions = {}) {
  const { roomId } = options;
  const [status, setStatus] = useState<ChatSocketStatus>(chatSocket.getStatus());
  const isConnected = status === 'connected';

  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    chatSocket.acquire();

    const unsubStatus = chatSocket.onStatusChange(setStatus);
    const unsubs = [
      chatSocket.on('new_message', (data) => {
        const msg = data as unknown as ChatIncomingMessage;
        if (!callbacksRef.current.roomId || msg.roomId === callbacksRef.current.roomId) {
          callbacksRef.current.onNewMessage?.(msg);
        }
      }),
      chatSocket.on('messages_read', (data) => {
        callbacksRef.current.onMessagesRead?.(
          data as unknown as { roomId: string; readBy: string },
        );
      }),
      chatSocket.on('user_typing', (data) => {
        const payload = data as unknown as {
          roomId: string;
          userId: string;
          isTyping: boolean;
        };
        if (!callbacksRef.current.roomId || payload.roomId === callbacksRef.current.roomId) {
          callbacksRef.current.onUserTyping?.(payload);
        }
      }),
      chatSocket.on('unread_count', (data) => {
        callbacksRef.current.onUnreadCount?.(
          data as unknown as { roomId: string; count: number },
        );
      }),
    ];

    return () => {
      unsubStatus();
      unsubs.forEach((u) => u());
      chatSocket.release();
    };
  }, []);

  // roomId join/leave — 연결 상태와 무관하게 등록 (미연결 시 rejoin 큐로 처리됨)
  useEffect(() => {
    if (!roomId) return;
    chatSocket.joinRoom(roomId);
    return () => {
      chatSocket.leaveRoom(roomId);
    };
  }, [roomId]);

  const sendMessage = useCallback(
    (content: string, messageType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT'): Promise<ChatSendResult> => {
      if (!roomId) return Promise.resolve({ success: false, error: 'no_room' });
      return chatSocket.sendMessage(roomId, content, messageType);
    },
    [roomId],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (roomId) chatSocket.sendTyping(roomId, isTyping);
    },
    [roomId],
  );

  const markRead = useCallback(() => {
    if (roomId) chatSocket.markRead(roomId);
  }, [roomId]);

  return { status, isConnected, sendMessage, sendTyping, markRead };
}

export default useChatSocket;
