'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/components/ui/NavLink';
import { apiRequest } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import { cn } from '@/lib/utils';

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

      {/* Search bar — flat 흰 섹션 (본문 스크롤 영역 상단) */}
      <section className="px-5 pt-4 pb-4 bg-it-surface dark:bg-rink-800">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-wtext-4"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full h-12 pl-11 pr-10 rounded-w-md bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
            placeholder={MESSAGES.chat.searchPlaceholder}
            aria-label="대화 검색"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
              aria-label="검색어 삭제"
            >
              <Icon name="close" className="text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      {/* flat 섹션 사이 8px 회색 갭 */}
      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

      {/* Conversation list — flat 흰 섹션 (카드 박스 제거 → hairline 행) */}
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="region"
        aria-label={`${pageTitle} 목록`}
        aria-busy={isLoading}
      >
        {isLoading ? null : filteredConversations.length === 0 ? (
          // 빈 상태 — 1줄 텍스트 본위 (§7.5.3)
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-6 pb-6">
            <div
              role="status"
              className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
            >
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
                <Icon
                  name={searchQuery ? 'search_off' : 'chat_bubble_outline'}
                  className="text-[36px] text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
              </div>
              <p className="text-[15px] font-bold text-it-ink-800 dark:text-white">
                {searchQuery
                  ? MESSAGES.chat.noSearchResults
                  : MESSAGES.chat.noConversations}
              </p>
              <p className="max-w-xs text-[13px] leading-relaxed text-it-ink-500 dark:text-wtext-4">
                {searchQuery
                  ? '다른 이름이나 키워드로 검색해보세요.'
                  : MESSAGES.chat.startConversation}
              </p>
            </div>
          </section>
        ) : (
          <section
            className="bg-it-surface dark:bg-rink-800 px-5 pt-2 pb-7 flex flex-col"
            role="list"
            aria-label={MESSAGES.chat.title}
          >
            {filteredConversations.map((conversation, idx) => {
              const isGroup = /채팅방|반$|팀$|그룹|단체/.test(conversation.name);
              const isEmpty = conversation.lastMessage === MESSAGES.chat.startConversation;
              const hasUnread = (conversation.unreadCount ?? 0) > 0;
              const isLast = idx === filteredConversations.length - 1;
              const avatarSrc = resolveImageSrc(conversation.avatarUrl);

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                  style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                  role="listitem"
                  aria-label={`${conversation.name}님과의 대화 열기${hasUnread ? `, 읽지 않은 메시지 ${conversation.unreadCount}개` : ''}`}
                  className={cn(
                    'w-full flex items-center gap-3.5 py-[14px] text-left transition-colors motion-reduce:transition-none',
                    'active:bg-it-fill dark:active:bg-it-blue-900/30',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40',
                    !isLast && 'border-b border-it-line dark:border-rink-700',
                  )}
                >
                  {/* Avatar + Online dot */}
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-w-pill overflow-hidden flex items-center justify-center',
                        isGroup
                          ? 'bg-it-blue-50 dark:bg-it-blue-900/40'
                          : 'bg-it-fill dark:bg-rink-700',
                      )}
                    >
                      {avatarSrc ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={avatarSrc}
                          alt={`${conversation.name} 프로필 사진`}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span
                          className={cn(
                            'material-symbols-outlined text-2xl',
                            isGroup ? 'text-it-blue-500' : 'text-it-ink-400 dark:text-wtext-4',
                          )}
                          aria-hidden="true"
                        >
                          {isGroup ? 'groups' : 'person'}
                        </span>
                      )}
                    </div>
                    {conversation.isOnline && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-w-pill bg-mint-500 ring-2 ring-it-surface dark:ring-rink-800"
                        aria-label="온라인"
                      />
                    )}
                  </div>

                  {/* Middle: name + preview */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          'truncate text-[15.5px] tracking-[-0.01em] text-it-ink-800 dark:text-white',
                          hasUnread ? 'font-extrabold' : 'font-bold',
                        )}
                      >
                        {conversation.name}
                      </p>
                      {conversation.lastMessageTime ? (
                        <span
                          className={cn(
                            'shrink-0 text-[12px] font-num tabular-nums',
                            hasUnread ? 'text-it-blue-500 font-bold' : 'text-it-ink-400 dark:text-wtext-4',
                          )}
                        >
                          {conversation.lastMessageTime}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p
                        className={cn(
                          'truncate text-[13px]',
                          isEmpty
                            ? 'italic text-it-ink-400 dark:text-wtext-4'
                            : hasUnread
                              ? 'text-it-ink-700 dark:text-wtext-2'
                              : 'text-it-ink-500 dark:text-wtext-4',
                        )}
                      >
                        {conversation.lastMessage}
                      </p>
                      {hasUnread && (
                        <span
                          className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-w-pill bg-it-red-500 text-white text-[11px] font-bold font-num tabular-nums"
                          aria-label={`읽지 않은 메시지 ${conversation.unreadCount}개`}
                        >
                          {(conversation.unreadCount ?? 0) > 99 ? '99+' : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
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
        className="fixed right-5 bottom-[calc(80px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] z-50 flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 text-white shadow-sh-blue hover:bg-it-blue-600 hover:shadow-sh-3 active:brightness-95 transition-all duration-200 ease-ios-spring motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
        aria-label={MESSAGES.chat.composeNew}
      >
        <Icon name="edit_square" className="text-[26px]" aria-hidden="true" />
      </button>
    </MobileContainer>
  );
}
