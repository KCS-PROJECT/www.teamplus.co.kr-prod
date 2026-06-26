"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ConfirmSheet } from "@/components/shared";
import {
  Avatar,
  MessageBubble,
  ChatInput,
  DateDivider,
  type Message,
} from "@/components/chat";
import { ReportModal } from "@/components/moderation/ReportModal";
import { api, apiRequest } from "@/services/api-client";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useWebSocket } from "@/hooks/useWebSocket";
import { websocketBridge } from "@/services/websocket-bridge";
import { MESSAGES } from "@/lib/messages";
import { usePageReady } from '@/hooks/usePageReady';

interface ChatInfo {
  id: string;
  name: string;
  isOnline: boolean;
  status: string;
  avatar?: string;
  type?: string;
  // UGC 신고·차단 대상 — DIRECT 방의 상대 사용자
  otherUser?: { userId: string; name: string } | null;
  isBlockedUser?: boolean;
}

export default function ChatPage() {
  const { back } = useNavigation();
  const { toast } = useToast();
  const { user } = useSessionAuth();
  const params = useParams();
  const chatId = params?.id as string;
  const currentUserId = user?.id ?? "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  // v18 (2026-05-20, audit §4 C #7): 채팅방 정보 + 메시지 fetch 완료 추적용 플래그.
  // 빈 메시지 배열로 시작하므로 `messages.length > 0` 만으로는 빈 채팅방 판별 불가 → isInitialLoaded.
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // v18 (2026-05-20, audit §4 C #7): chatInfo + 초기 메시지 fetch 모두 완료 후 ready.
  usePageReady(!!chatInfo && isInitialLoaded);

  // 채팅 화면 — 커스텀 ChatHeader 사용 → Flutter 네이티브 AppBar/BottomNav 모두 비활성화.
  //   채팅은 풀스크린 입력 UI 가 필요하므로 BottomNav 도 숨김 (입력창과 충돌 방지).
  //   StatusBar 는 유지 — MobileContainer 가 safe-area-inset-top 처리.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  // WebSocket 연결
  const { isConnected, emit } = useWebSocket({
    autoConnect: true,
    events: ["chat_message", "chat_read"],
    onConnect: () => {
      if (chatId) websocketBridge.joinRoom(chatId);
    },
    onDisconnect: () => {
      if (chatId) websocketBridge.leaveRoom(chatId);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 채팅방 정보 및 이전 메시지 로드
  useEffect(() => {
    if (!chatId) return;
    const loadChatData = async () => {
      try {
        const [roomRes, msgRes] = await Promise.all([
          api.get<ChatInfo>(`/chat/rooms/${chatId}`),
          api.get<{ messages: Message[] }>(`/chat/rooms/${chatId}/messages`),
        ]);
        if (roomRes.success && roomRes.data) setChatInfo(roomRes.data);
        if (msgRes.success && msgRes.data)
          setMessages(msgRes.data.messages ?? []);
      } catch {
        // 로드 실패 시 기본값 유지
      } finally {
        // v18 (2026-05-20): 성공/실패 무관하게 fetch 종료 신호.
        setIsInitialLoaded(true);
      }
    };
    loadChatData();
  }, [chatId]);

  // WebSocket 실시간 메시지 수신
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = websocketBridge.subscribe(
      "chat_message",
      (data: Record<string, unknown>) => {
        if (data.roomId === chatId) {
          const incoming: Message = {
            id: (data.id as string) ?? String(Date.now()),
            senderId: data.senderId as string,
            content: data.content as string,
            timestamp: data.timestamp as string,
            type: (data.type as Message["type"]) ?? "text",
          };
          setMessages((prev) => [...prev, incoming]);
        }
      },
    );
    return unsubscribe;
  }, [isConnected, chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 메시지 전송
  const handleSend = useCallback(() => {
    if (!messageText.trim()) return;

    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      senderId: currentUserId,
      content: messageText,
      timestamp: new Date().toLocaleTimeString("ko-KR", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      type: "text",
      isRead: false,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    const textToSend = messageText;
    setMessageText("");

    emit("chat_message", {
      roomId: chatId,
      content: textToSend,
      type: "text",
    });
  }, [messageText, chatId, emit]);

  // 첨부파일
  const handleAttachment = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("roomId", chatId);

        const res = await apiRequest<{ url: string }>({
          method: "POST",
          url: "/chat/upload",
          data: formData,
          headers: { "Content-Type": "multipart/form-data" },
          retry: false,
        });
        if (res.success && res.data) {
          emit("chat_message", {
            roomId: chatId,
            content: res.data.url,
            type: "image",
          });
        }
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setIsUploading(false);
        e.target.value = "";
      }
    },
    [chatId, emit, toast],
  );

  const handleMore = useCallback(() => {
    setShowMoreMenu(true);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setShowMoreMenu(false);
    setShowLeaveConfirm(true);
  }, []);

  const confirmLeaveRoom = useCallback(async () => {
    setShowLeaveConfirm(false);
    try {
      const response = await api.post(`/chat/rooms/${chatId}/leave`);
      if (response.success) {
        back();
      } else {
        toast.error(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  }, [chatId, back, toast]);

  const handleToggleNotification = async () => {
    try {
      const response = await api.patch(`/chat/rooms/${chatId}/notification`);
      if (response.success) {
        toast.success(MESSAGES.save.success);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
    setShowMoreMenu(false);
  };

  // UGC 안전장치 — 신고·차단 (DIRECT 방의 상대 사용자 대상)
  const otherUser = chatInfo?.otherUser ?? null;

  const handleReport = useCallback(() => {
    setShowMoreMenu(false);
    if (otherUser) setShowReport(true);
  }, [otherUser]);

  const handleBlock = useCallback(() => {
    setShowMoreMenu(false);
    if (otherUser) setShowBlockConfirm(true);
  }, [otherUser]);

  const confirmBlock = useCallback(async () => {
    setShowBlockConfirm(false);
    if (!otherUser) return;
    try {
      const res = await api.post("/users/me/blocks", {
        blockedId: otherUser.userId,
      });
      if (res.success) {
        toast.success(MESSAGES.chat.blockSuccess);
        back();
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  }, [otherUser, toast, back]);

  return (
    <MobileContainer hasBottomNav={false} className="selectable-text">
      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* h-[calc(100dvh-...)] — `(message)/layout.tsx` 가 `<RoleBottomNav />` 를 항상 렌더하므로
          BottomNav(60px) + safe-area-inset-bottom 만큼 컨테이너 높이를 줄여 ChatInput 이 BottomNav
          위에 오지 않도록 보정 (사용자 신고: 상담 메시지 페이지 하단 버튼 위치 낮음 픽스).
          키보드 표시 시 viewport 가 동적으로 축소되어 ChatInput 이 가려지지 않음 (SCREEN_METRICS §5.4) */}
      <div className="flex flex-col h-[calc(100dvh-60px-env(safe-area-inset-bottom,0px))] bg-it-canvas dark:bg-puck">
        {/* [appbar-harness-v3 분류 C → A] ChatHeader → PageAppBar SoT 흡수.
            title=name · subtitle=status · extraActions=[more menu]. 아바타+온라인 인디케이터는
            body 상단 chat-info-strip 으로 분리하여 AppBar 시각 통일성 유지. */}
        <PageAppBar
          title={chatInfo?.name ?? "채팅"}
          subtitle={
            isConnected
              ? chatInfo?.isOnline
                ? MESSAGES.chat.statusOnline
                : MESSAGES.chat.statusOffline
              : MESSAGES.chat.statusConnecting
          }
          extraActions={[
            {
              icon: 'more_vert',
              label: '대화 옵션',
              onClick: handleMore,
            },
          ]}
          // [appbar-harness-v4 정당화] 채팅 상세는 컨텍스트 전용 "대화 옵션(more_vert)" 메뉴를
          //   extraActions 로 이미 노출. 글로벌 ☰ 메뉴까지 함께 두면 두 menu 가 인접하여
          //   사용자가 어느 메뉴가 채팅용인지 혼동 → showMenu={false} 로 의도적 숨김.
          showMenu={false}
          forceNative
        />
        {/* Chat profile strip — 아바타+온라인 상태 (AppBar 영역 밖, body 최상단) */}
        <div className="flex flex-none items-center gap-3 border-b border-it-line bg-it-surface px-4 py-2 dark:border-rink-700 dark:bg-rink-800">
          <Avatar
            src={chatInfo?.avatar}
            name={chatInfo?.name ?? '채팅'}
            size="sm"
            isOnline={isConnected && (chatInfo?.isOnline ?? false)}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-card-body font-bold text-it-ink-800 dark:text-white">
              {chatInfo?.name ?? '채팅'}
            </p>
            <p className="truncate text-card-meta text-it-ink-500 dark:text-wtext-4">
              {isConnected && (chatInfo?.isOnline ?? false)
                ? MESSAGES.chat.statusOnline
                : MESSAGES.chat.statusOffline}
            </p>
          </div>
        </div>

        {/* Chat Messages Area — role="log" + aria-live="polite" 로 SR 새 메시지 알림.
            ⚠️ 말풍선(MessageBubble · bubble.* 토큰)은 SoT 유지 — 배경만 it-canvas 정합. */}
        <main
          className="flex-1 overflow-y-auto scroll-smooth hide-scrollbar bg-it-canvas dark:bg-puck"
          role="log"
          aria-label={`${chatInfo?.name ?? '채팅'} 대화 내용`}
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
        >
          <div className="flex flex-col px-4 pt-4 gap-4 pb-4">
            <DateDivider
              date={new Date().toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
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
                  type={isMine ? "outgoing" : "incoming"}
                  senderName={!isMine ? chatInfo?.name : undefined}
                  senderAvatar={!isMine ? chatInfo?.avatar : undefined}
                  showAvatar={!isMine}
                  showSenderName={!isMine}
                />
              );
            })}

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
          onChange={setMessageText}
          onSend={handleSend}
          onAttachment={handleAttachment}
          placeholder={MESSAGES.chat.inputPlaceholder}
        />
      </div>

      {/* 더보기 메뉴 Bottom Sheet */}
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/30"
          onClick={() => setShowMoreMenu(false)}
        >
          <div
            className="w-full bg-it-surface dark:bg-rink-800 rounded-t-2xl shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-it-line-strong dark:bg-rink-500 rounded-w-pill mx-auto mt-3 mb-4" />
            <button
              onClick={handleToggleNotification}
              className="flex items-center w-full px-6 py-4 text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
            >
              <Icon
                name="notifications"
                className="text-xl text-it-ink-400 dark:text-wtext-4 mr-3"
              />
              <span className="text-card-emphasis font-bold">
                {MESSAGES.chat.notificationLabel}
              </span>
            </button>
            {/* UGC 안전장치 — 신고·차단 (1:1 대화 상대가 있을 때만 노출) */}
            {otherUser && (
              <>
                <button
                  onClick={handleReport}
                  className="flex items-center w-full px-6 py-4 text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                >
                  <Icon
                    name="flag"
                    className="text-xl text-it-ink-400 dark:text-wtext-4 mr-3"
                  />
                  <span className="text-card-emphasis font-bold">
                    {MESSAGES.chat.report}
                  </span>
                </button>
                <button
                  onClick={handleBlock}
                  className="flex items-center w-full px-6 py-4 text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                >
                  <Icon
                    name="block"
                    className="text-xl text-it-ink-400 dark:text-wtext-4 mr-3"
                  />
                  <span className="text-card-emphasis font-bold">
                    {MESSAGES.chat.block}
                  </span>
                </button>
              </>
            )}
            <button
              onClick={handleLeaveRoom}
              className="flex items-center w-full px-6 py-4 text-it-red-500 dark:text-it-red-400 hover:bg-it-red-50 dark:hover:bg-it-red-500/15 transition-colors motion-reduce:transition-none"
            >
              <Icon name="exit_to_app" className="text-xl mr-3" />
              <span className="text-card-emphasis font-bold">
                {MESSAGES.chat.leaveRoom}
              </span>
            </button>
            <div className="pb-6" />
          </div>
        </div>
      )}

      {/* 채팅방 나가기 확인 시트 */}
      <ConfirmSheet
        open={showLeaveConfirm}
        title="대화방 나가기"
        description={MESSAGES.chat.leaveConfirm}
        confirmLabel="나가기"
        cancelLabel="취소"
        variant="danger"
        onConfirm={confirmLeaveRoom}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      {/* UGC 차단 확인 시트 */}
      <ConfirmSheet
        open={showBlockConfirm}
        title={MESSAGES.chat.blockConfirmTitle}
        description={MESSAGES.chat.blockConfirm}
        confirmLabel={MESSAGES.chat.block}
        cancelLabel="취소"
        variant="danger"
        onConfirm={confirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
      />

      {/* UGC 신고 모달 */}
      {showReport && otherUser && (
        <ReportModal
          reportedId={otherUser.userId}
          targetType="user"
          targetName={otherUser.name}
          onClose={() => setShowReport(false)}
        />
      )}
    </MobileContainer>
  );
}
