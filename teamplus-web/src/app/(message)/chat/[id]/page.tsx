"use client";

/**
 * 채팅방 페이지 — ChatRoomView(공용 대화 컴포넌트)를 감싸는 얇은 셸.
 * 페이지 책임: 방 정보(ChatInfo) 로드 · AppBar/프로필 스트립 · 더보기 메뉴
 * (알림 토글·신고·차단·나가기). 메시지 목록/전송/소켓은 ChatRoomView 담당.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ConfirmSheet } from "@/components/shared";
import { ChatRoomView } from "@/components/chat";
import { ReportModal } from "@/components/moderation/ReportModal";
import { api } from "@/services/api-client";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { usePageReady } from "@/hooks/usePageReady";

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

  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  // v18 (2026-05-20, audit §4 C #7): 채팅방 정보 + 초기 메시지 fetch 완료 추적.
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  // v18 (2026-05-20, audit §4 C #7): chatInfo + 초기 메시지 fetch 모두 완료 후 ready.
  usePageReady(!!chatInfo && isInitialLoaded);

  // 채팅 화면 — 커스텀 헤더 사용 → Flutter 네이티브 AppBar/BottomNav 모두 비활성화.
  //   채팅은 풀스크린 입력 UI 가 필요하므로 BottomNav 도 숨김 (입력창과 충돌 방지).
  //   StatusBar 는 유지 — MobileContainer 가 safe-area-inset-top 처리.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  // 채팅방 정보 로드 (메시지 로드는 ChatRoomView 담당)
  useEffect(() => {
    if (!chatId) return;
    const loadRoomInfo = async () => {
      try {
        const res = await api.get<ChatInfo>(`/chat/rooms/${chatId}`);
        if (res.success && res.data) setChatInfo(res.data);
      } catch {
        // 로드 실패 시 기본값 유지
      }
    };
    loadRoomInfo();
  }, [chatId]);

  const handleInitialLoaded = useCallback(() => setIsInitialLoaded(true), []);

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
      {/* h-[calc(100dvh-...)] — `(message)/layout.tsx` 가 `<RoleBottomNav />` 를 항상 렌더하므로
          BottomNav 만큼 컨테이너 높이를 줄여 ChatInput 하단이 nav 에 묻히지 않도록 보정.
          BottomNav 실높이 = 콘텐츠 61px + var(--safe-area-inset-bottom) 내부 패딩(globals.css 가
          max(16px, env) 로 최소 16px 보장) 이므로, 여기서도 같은 구조(62px + var 1회)로 차감해야
          기기 불문 정합. (구 60px+env() 는 env=0 평가로 17px 묻힘 / 80px+var 는 safe-area 이중
          차감으로 19px 붕 뜸 — 양쪽 회귀 모두 이 주석의 산식으로 판정할 것)
          키보드 표시 시 viewport 가 동적으로 축소되어 ChatInput 이 가려지지 않음 (SCREEN_METRICS §5.4) */}
      <div className="flex flex-col h-[calc(100dvh-62px-var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] bg-it-canvas dark:bg-puck">
        {/* [appbar-harness-v3 분류 C → A] ChatHeader → PageAppBar SoT 흡수.
            title=name · subtitle=status · extraActions=[more menu]. 아바타+온라인 인디케이터는
            body 상단 chat-info-strip 으로 분리하여 AppBar 시각 통일성 유지. */}
        <PageAppBar
          title={chatInfo?.name ?? "채팅"}
          // 온라인/오프라인 상시 표기는 비동기 메신저 문법에 맞지 않아 제거 —
          // 소켓 미연결(전송 지연 가능) 상태만 "연결 중" 으로 안내
          subtitle={isSocketConnected ? undefined : MESSAGES.chat.statusConnecting}
          extraActions={[
            {
              icon: "more_vert",
              label: "대화 옵션",
              onClick: handleMore,
            },
          ]}
          // [appbar-harness-v4 정당화] 채팅 상세는 컨텍스트 전용 "대화 옵션(more_vert)" 메뉴를
          //   extraActions 로 이미 노출. 글로벌 ☰ 메뉴까지 함께 두면 두 menu 가 인접하여
          //   사용자가 어느 메뉴가 채팅용인지 혼동 → showMenu={false} 로 의도적 숨김.
          showMenu={false}
          forceNative
        />
        {/* 대화 영역 — 메시지 목록/전송/소켓/읽음/타이핑 전담 공용 컴포넌트
            (이름·온라인 상태는 AppBar title/subtitle 단일 표기 — 중복 스트립 제거) */}
        <ChatRoomView
          roomId={chatId}
          currentUserId={currentUserId}
          fallbackSenderName={chatInfo?.name}
          fallbackSenderAvatar={chatInfo?.avatar}
          onInitialLoaded={handleInitialLoaded}
          onConnectionChange={setIsSocketConnected}
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
