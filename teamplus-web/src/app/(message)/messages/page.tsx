'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { ChatListItem } from '@/components/shared/ChatListItem';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/components/ui/NavLink';
import { apiRequest } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

interface Conversation {
  id: string;
  name: string;
  avatarUrl?: string;
  isOnline?: boolean;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount?: number;
}

/** 한글 상대시간 포맷 */
function formatChatTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return MESSAGES.chat.justNow;
  if (diffMin < 60) return MESSAGES.chat.minutesAgo(diffMin);
  if (diffMin < 1440) {
    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (diffMin < 2880) return MESSAGES.chat.yesterday;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

export default function MessageListPage() {
  const { navigate } = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useDefaultUI();

  useEffect(() => {
    const fetchRooms = async () => {
      setIsLoading(true);
      try {
        type ChatRoomItem = {
          roomId: string;
          name: string;
          avatarUrl?: string;
          isOnline?: boolean;
          unreadCount: number;
          lastMessage: string | null;
          lastMessageAt: string | null;
        };
        const res = await apiRequest<ChatRoomItem[]>({
          method: 'GET',
          url: '/chat/rooms',
          retry: false,
        });
        if (res.success && res.data) {
          setConversations(
            res.data.map((room) => ({
              id: room.roomId,
              name: room.name,
              avatarUrl: room.avatarUrl,
              isOnline: room.isOnline,
              lastMessage: room.lastMessage ?? MESSAGES.chat.startConversation,
              lastMessageTime: formatChatTime(room.lastMessageAt),
              unreadCount: room.unreadCount,
            }))
          );
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchRooms();
  }, []);

  const filteredConversations = conversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 진입 경로별 타이틀 — /team-chat 은 감독 팀 채팅 컨텍스트
  const pathname = usePathname();
  const pageTitle = pathname?.startsWith('/team-chat') ? '팀 채팅' : MESSAGES.chat.title;

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title={pageTitle} forceNative />

      {/* Search bar — 본문 스크롤 영역 상단 */}
      <div className="px-5 pt-3 pb-2 bg-wbg dark:bg-puck">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-wtext-3 dark:text-wtext-4"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full min-h-[44px] pl-11 pr-10 py-2.5 rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-4 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500"
            placeholder={MESSAGES.chat.searchPlaceholder}
            aria-label="대화 검색"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
              aria-label="검색어 삭제"
            >
              <Icon name="close" className="text-[18px] text-wtext-3 dark:text-wtext-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <main
        className="flex-1 overflow-y-auto hide-scrollbar pb-30 bg-wbg dark:bg-puck"
        role="region"
        aria-label={`${pageTitle} 목록`}
        aria-busy={isLoading}
      >
        {isLoading ? null : filteredConversations.length === 0 ? (
          // 빈 상태 — 1줄 텍스트 본위 (§7.5.3)
          <div className="px-5 pt-6">
            <div
              role="status"
              className="flex flex-col items-center justify-center gap-2 rounded-w-lg border border-dashed border-wline-2 bg-wsurface px-6 py-16 text-center dark:border-rink-700 dark:bg-rink-800"
            >
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name={searchQuery ? 'search_off' : 'chat_bubble_outline'}
                  className="text-[36px] text-wtext-3 dark:text-wtext-4"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-bold text-wtext-1 dark:text-white">
                {searchQuery
                  ? MESSAGES.chat.noSearchResults
                  : MESSAGES.chat.noConversations}
              </p>
              <p className="max-w-xs text-card-meta leading-relaxed text-wtext-3 dark:text-wtext-4">
                {searchQuery
                  ? '다른 이름이나 키워드로 검색해보세요.'
                  : MESSAGES.chat.startConversation}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="space-y-2 px-5 pt-3"
            role="list"
            aria-label={MESSAGES.chat.title}
          >
            {filteredConversations.map((conversation, idx) => {
              const isGroup = /채팅방|반$|팀$|그룹|단체/.test(conversation.name);
              const isEmpty = conversation.lastMessage === MESSAGES.chat.startConversation;
              return (
                <div
                  key={conversation.id}
                  style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                  className="motion-reduce:animate-none"
                >
                  <ChatListItem
                    avatarUrl={conversation.avatarUrl}
                    name={conversation.name}
                    lastMessage={conversation.lastMessage}
                    time={conversation.lastMessageTime}
                    unreadCount={conversation.unreadCount}
                    online={conversation.isOnline}
                    isGroup={isGroup}
                    isEmpty={isEmpty}
                    onClick={() => navigate(`/chat/${conversation.id}`)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/*
        Floating Action Button — TEAMPLUS 표준 FAB 패턴 (2026-05-15 사용자 요청 위치 수정).
        Issue: 기존 `bottom-[calc(76px+env(safe-area-inset-bottom))]` + `z-30` 패턴은
          1. z-30 — BottomNav(z-40) 뒤로 가려져 미노출/오버랩 회귀
          2. env() 단독 — Android WebView 에서 0px 평가되어 safe-area 미적용
          3. 76px 매직 넘버 — 다른 페이지(children/awards) 표준 80px 와 불일치
        Fix: SCREEN_METRICS SoT (CLAUDE.md) 표준 패턴 적용
          · bottom calc(80px + var(--safe-area-inset-bottom, env(...))) — Bridge 주입 변수 우선 + env() 폴백
          · z-50 — BottomNav z-40 위로 안전 노출
          · 화면 해상도 변경 시 var(--safe-area-inset-bottom) 자동 갱신되어 동적 위치 유지
      */}
      <button
        type="button"
        onClick={() => navigate('/message/new')}
        className="fixed right-5 bottom-[calc(80px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] z-50 flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500 text-white shadow-sh-blue hover:bg-ice-600 hover:shadow-sh-3 active:brightness-95 transition-all duration-200 ease-ios-spring motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
        aria-label={MESSAGES.chat.composeNew}
      >
        <Icon name="edit_square" className="text-[26px]" aria-hidden="true" />
      </button>
    </MobileContainer>
  );
}
