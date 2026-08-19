'use client';

/**
 * ChatRoomView — 채팅방 대화 영역 공용 컴포넌트 (메시지 목록 + 입력창).
 *
 * 페이지/시트 어디에나 임베드 가능하도록 라우터·AppBar·레이아웃에 의존하지 않는다.
 * flex column 컨테이너 안에서 flex-1 로 배치되는 것을 전제로 한다.
 *
 * 담당: 초기 메시지 REST 로드 → `/chat` 소켓 실시간 수신/전송(낙관적 UI + ack 확정)
 *       → 미연결 시 REST 폴백 → 읽음/타이핑. 방 정보(이름·상대)는 호출측 책임.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import {
  MessageBubble,
  ChatInput,
  DateDivider,
  TypingIndicator,
  type Message,
} from '@/components/chat';
import { api, apiRequest } from '@/services/api-client';
import { useChatSocket } from '@/hooks/useChatSocket';
import type { ChatIncomingMessage } from '@/services/chat-socket';
import { MESSAGES } from '@/lib/messages';

interface ChatRoomViewProps {
  roomId: string;
  currentUserId: string;
  /** 소켓 수신 메시지에는 발신자 프로필이 없어 DIRECT 방은 상대 정보로 폴백 표시 */
  fallbackSenderName?: string;
  fallbackSenderAvatar?: string;
  /** 초기 메시지 로드 완료 신호 (usePageReady 연동용) */
  onInitialLoaded?: () => void;
  /** 소켓 연결 상태 변경 통지 (헤더 온라인 표시 등) */
  onConnectionChange?: (connected: boolean) => void;
}

/** 백엔드 GET /chat/rooms/:id/messages 응답 항목 */
interface RestChatMessage {
  id: string;
  content: string;
  type: string;
  isRead: boolean;
  isMine: boolean;
  createdAt: string;
  sender: { id: string; name: string; avatarUrl: string | null };
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** 서버 메시지 타입(TEXT/IMAGE/...) → UI Message 타입 매핑 */
function toUiType(serverType: string): Message['type'] {
  return serverType === 'IMAGE' ? 'image' : 'text';
}

function mapRestMessage(m: RestChatMessage): Message {
  const type = toUiType(m.type);
  return {
    id: m.id,
    senderId: m.sender?.id ?? '',
    content: m.content,
    timestamp: formatMessageTime(m.createdAt),
    isRead: m.isRead,
    type,
    imageUrl: type === 'image' ? m.content : undefined,
    senderName: m.sender?.name,
    senderAvatar: m.sender?.avatarUrl ?? undefined,
  };
}

function mapSocketMessage(m: ChatIncomingMessage): Message {
  const type = toUiType(m.messageType);
  return {
    id: m.id,
    senderId: m.senderId,
    content: m.content,
    timestamp: formatMessageTime(m.createdAt),
    isRead: false,
    type,
    imageUrl: type === 'image' ? m.content : undefined,
  };
}

const TYPING_IDLE_MS = 1500;

/** 채팅 첨부 허용 이미지 MIME — 백엔드 chat MulterModule 허용 목록의 이미지 부분집합과 동기 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** 백엔드 chat MulterModule fileSize 제한과 동기 */
const MAX_IMAGE_MB = 20;

export function ChatRoomView({
  roomId,
  currentUserId,
  fallbackSenderName,
  fallbackSenderAvatar,
  onInitialLoaded,
  onConnectionChange,
}: ChatRoomViewProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);

  const { isConnected, sendMessage, sendTyping, markRead } = useChatSocket({
    roomId,
    onNewMessage: (incoming) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, mapSocketMessage(incoming)];
      });
      setIsOtherTyping(false);
      markRead();
    },
    onMessagesRead: () => {
      // 상대가 읽음 — 내 발신 메시지 읽음 표시 갱신
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === currentUserId && !m.isRead ? { ...m, isRead: true } : m,
        ),
      );
    },
    onUserTyping: (data) => {
      if (data.userId !== currentUserId) {
        setIsOtherTyping(data.isTyping);
      }
    },
  });

  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  // 연결·join 완료 시 읽음 처리
  useEffect(() => {
    if (isConnected) markRead();
  }, [isConnected, markRead]);

  // 이전 메시지 로드 (최신순 응답 → 시간순 반전)
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res = await api.get<{ messages: RestChatMessage[] }>(
          `/chat/rooms/${roomId}/messages`,
        );
        if (!cancelled && res.success && res.data) {
          setMessages((res.data.messages ?? []).map(mapRestMessage).reverse());
        }
      } catch {
        // 로드 실패 시 빈 목록 유지
      } finally {
        if (!cancelled) onInitialLoaded?.();
      }
    };
    loadMessages();
    return () => {
      cancelled = true;
    };
    // onInitialLoaded 는 로드 완료 신호 1회용 — 의존성에서 의도적으로 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOtherTyping]);

  /** 소켓 우선 전송 + 미연결/실패 시 REST 폴백. 성공 시 확정 id 반환. */
  const deliverMessage = useCallback(
    async (content: string, messageType: 'TEXT' | 'IMAGE'): Promise<string | null> => {
      const ack = await sendMessage(content, messageType);
      if (ack.success && ack.messageId) return ack.messageId;

      const rest = await apiRequest<{ data?: { id: string } }>({
        method: 'POST',
        url: `/chat/rooms/${roomId}/messages`,
        data: { content, type: messageType },
        retry: false,
      });
      if (rest.success && rest.data?.data?.id) return rest.data.data.id;
      return null;
    },
    [sendMessage, roomId],
  );

  const handleSend = useCallback(async () => {
    const content = messageText.trim();
    if (!content) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      senderId: currentUserId,
      content,
      timestamp: formatMessageTime(new Date().toISOString()),
      type: 'text',
      isRead: false,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setMessageText('');
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTyping(false);

    const confirmedId = await deliverMessage(content, 'TEXT');
    if (confirmedId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: confirmedId } : m)),
      );
    } else {
      // 전송 실패 — 낙관적 말풍선 롤백 + 입력 복원
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMessageText(content);
      toast.error(MESSAGES.chat.sendFailed);
    }
  }, [messageText, currentUserId, deliverMessage, sendTyping, toast]);

  const handleInputChange = useCallback(
    (value: string) => {
      setMessageText(value);
      sendTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => sendTyping(false), TYPING_IDLE_MS);
    },
    [sendTyping],
  );

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const handleAttachment = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 프론트 선검증 — 서버 400 대신 즉시 안내 (서버 검증은 이중 방어로 유지)
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error(MESSAGES.chat.imageOnly);
        e.target.value = '';
        return;
      }
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        toast.error(MESSAGES.upload.tooLarge(MAX_IMAGE_MB));
        e.target.value = '';
        return;
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', roomId);

        const res = await apiRequest<{ url: string }>({
          method: 'POST',
          url: '/chat/upload',
          data: formData,
          headers: { 'Content-Type': 'multipart/form-data' },
          retry: false,
        });
        if (res.success && res.data?.url) {
          const imageUrl = res.data.url;
          const tempId = `temp-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: tempId,
              senderId: currentUserId,
              content: imageUrl,
              timestamp: formatMessageTime(new Date().toISOString()),
              type: 'image',
              imageUrl,
              isRead: false,
            },
          ]);
          const confirmedId = await deliverMessage(imageUrl, 'IMAGE');
          if (confirmedId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, id: confirmedId } : m)),
            );
          } else {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            toast.error(MESSAGES.chat.sendFailed);
          }
        } else {
          toast.error(MESSAGES.error.general);
        }
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    },
    [roomId, currentUserId, deliverMessage, toast],
  );

  return (
    <>
      {/* 숨겨진 파일 입력 — 이미지 첨부 (accept 는 서버 허용 이미지 목록과 동일하게 제한) */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Chat Messages Area — role="log" + aria-live="polite" 로 SR 새 메시지 알림.
          ⚠️ 말풍선(MessageBubble · bubble.* 토큰)은 SoT 유지 — 배경만 it-canvas 정합. */}
      <main
        className="flex-1 overflow-y-auto scroll-smooth hide-scrollbar bg-it-canvas dark:bg-puck"
        role="log"
        aria-label={MESSAGES.chat.title}
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        <div className="flex flex-col px-4 pt-4 gap-4 pb-4">
          <DateDivider
            date={new Date().toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-it-ink-400 dark:text-wtext-4">
              <Icon name="chat_bubble_outline" className="text-4xl mb-2" />
              <p className="text-card-body">{MESSAGES.chat.startConversation}</p>
            </div>
          )}

          {messages.map((message) => {
            const isMine = message.senderId === currentUserId;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                type={isMine ? 'outgoing' : 'incoming'}
                senderName={!isMine ? message.senderName ?? fallbackSenderName : undefined}
                senderAvatar={!isMine ? message.senderAvatar ?? fallbackSenderAvatar : undefined}
                showAvatar={!isMine}
                showSenderName={!isMine}
              />
            );
          })}

          {isOtherTyping && (
            <TypingIndicator
              senderName={fallbackSenderName}
              senderAvatar={fallbackSenderAvatar}
            />
          )}

          {isUploading && (
            <div className="flex justify-end">
              <div className="bg-it-fill dark:bg-rink-700 rounded-w-md px-4 py-2 text-card-body text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.chat.uploading}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <ChatInput
        value={messageText}
        onChange={handleInputChange}
        onSend={handleSend}
        onAttachment={handleAttachment}
        placeholder={MESSAGES.chat.inputPlaceholder}
      />
    </>
  );
}

export default ChatRoomView;
