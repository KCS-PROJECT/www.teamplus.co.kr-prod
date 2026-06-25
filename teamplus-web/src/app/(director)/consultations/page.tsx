'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useConsultations, useChatMessages } from '@/hooks/useConsultations';
import { ConsultationChatBubble, ConsultationDateDivider } from '@/components/consultation/ConsultationChatBubble';
import { ConsultationListItem } from '@/components/consultation/ConsultationListItem';
import type { Consultation, ChatMessage } from '@/hooks/useConsultations';

// ─── Constants ──────────────────────────────────────

type FilterTab = 'all' | 'unanswered' | 'favorites';

const FILTER_TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: 'all', label: '전체', icon: 'chat' },
  { key: 'unanswered', label: '미답변', icon: 'mark_chat_unread' },
  { key: 'favorites', label: '즐겨찾기', icon: 'star' },
];

// ─── Date Grouping Helper ───────────────────────────

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    if (isToday) return '오늘';

    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}`;
  } catch {
    return dateStr;
  }
}

function groupMessagesByDate(messages: ChatMessage[]): { date: string; messages: ChatMessage[] }[] {
  const groups: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const msgDate = msg.createdAt.split('T')[0] ?? '';
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groups.push({ date: formatDateLabel(msg.createdAt), messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

// ─── Empty State ────────────────────────────────────

function EmptyConsultations() {
  return (
    <div className="px-5 pt-6">
      <div
        role="status"
        className="flex flex-col items-center justify-center gap-2 rounded-w-lg border border-dashed border-it-line-strong bg-it-fill px-6 py-16 text-center dark:border-rink-700 dark:bg-rink-800/50"
      >
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-line dark:bg-rink-700">
          <Icon
            name="forum"
            className="text-4xl text-it-ink-400 dark:text-rink-300"
            aria-hidden="true"
          />
        </div>
        <p className="text-card-title font-bold text-it-ink-800 dark:text-white">
          {MESSAGES.empty('상담 내역')}
        </p>
        <p className="max-w-xs text-card-body leading-relaxed text-it-ink-500 dark:text-rink-300">
          코치와 학부모 간의 상담이 시작되면 여기에 표시됩니다.
        </p>
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div
        role="status"
        className="flex w-full max-w-sm flex-col items-center justify-center gap-2 rounded-w-lg border border-dashed border-it-line-strong bg-it-surface px-6 py-16 text-center dark:border-rink-700 dark:bg-rink-800"
      >
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-line dark:bg-rink-700">
          <Icon
            name="chat_bubble_outline"
            className="text-4xl text-it-ink-400 dark:text-rink-300"
            aria-hidden="true"
          />
        </div>
        <p className="text-card-title font-bold text-it-ink-800 dark:text-white">
          상담을 선택해주세요
        </p>
        <p className="max-w-xs text-card-body leading-relaxed text-it-ink-500 dark:text-rink-300">
          목록에서 상담을 선택하면 대화 내용을 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

// ─── Error State ────────────────────────────────────

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-4 mt-3 p-3 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 border border-it-red-200 dark:border-it-red-700 flex items-center gap-3">
      <Icon name="error_outline" className="text-it-red-500 dark:text-it-red-400 text-xl shrink-0" aria-hidden="true" />
      <p className="flex-1 text-card-body text-it-red-700 dark:text-it-red-300">{message}</p>
      <button
        onClick={onRetry}
        className="text-card-body font-medium text-it-red-600 dark:text-it-red-400 hover:underline shrink-0"
      >
        {MESSAGES.dashboard.errorRetry}
      </button>
    </div>
  );
}

// ─── Main Page Component ────────────────────────────

export default function ConsultationsPage() {
  // Native UI
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const { toast } = useToast();

  // Data hooks
  const {
    consultations,
    isLoading: isListLoading,
    error: listError,
    refresh: refreshList,
  } = useConsultations();

  usePageReady(!isListLoading);

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showList, setShowList] = useState(true); // mobile view toggle

  const selectedConsultation = useMemo(
    () => consultations.find((c) => c.id === selectedId) ?? null,
    [consultations, selectedId]
  );

  const {
    messages,
    isLoading: isChatLoading,
    error: chatError,
    refresh: refreshChat,
    markAsRead,
  } = useChatMessages(selectedConsultation?.chatRoomId ?? null);

  // Filter state
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Chat scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Filtered consultations
  const filteredConsultations = useMemo(() => {
    let filtered = consultations;

    // Tab filter
    if (activeTab === 'unanswered') {
      filtered = filtered.filter((c) => c.unreadCount > 0);
    }
    // 'favorites' would need a separate field - fallback to all for now

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.studentName.toLowerCase().includes(q) ||
          c.parentName.toLowerCase().includes(q) ||
          c.coachName.toLowerCase().includes(q) ||
          (c.className?.toLowerCase().includes(q) ?? false)
      );
    }

    return filtered;
  }, [consultations, activeTab, searchQuery]);

  // Group messages by date
  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  // Select consultation handler
  const handleSelect = useCallback(
    (consultation: Consultation) => {
      setSelectedId(consultation.id);
      setShowList(false); // mobile: switch to chat view
      if (consultation.unreadCount > 0) {
        markAsRead(consultation.id);
      }
    },
    [markAsRead]
  );

  // Back to list handler (mobile)
  const handleBackToList = useCallback(() => {
    setShowList(true);
    setSelectedId(null);
  }, []);

  // PDF export handler
  const handlePdfExport = useCallback(() => {
    toast.info(MESSAGES.attendance2.featureComingSoon('PDF 추출'));
  }, [toast]);

  // ─── Render: List Panel ─────────────────────────────

  const listPanel = (
    <div className="flex flex-col h-full bg-it-surface dark:bg-rink-800">
      {/* Search */}
      <div className="px-5 pt-4 pb-3">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-wtext-4"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="학생, 학부모, 코치 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'h-12 w-full pl-11 pr-10 rounded-w-md',
              'bg-it-fill dark:bg-rink-900',
              'border-[1.5px] border-it-line-strong dark:border-rink-700',
              'text-[15px] font-semibold text-it-ink-800 dark:text-white',
              'placeholder:text-it-ink-400 dark:placeholder:text-wtext-3',
              'outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none',
              'focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500'
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-w-pill text-it-ink-400 hover:bg-it-line hover:text-it-ink-800 dark:hover:bg-rink-700 dark:hover:text-white transition-colors motion-reduce:transition-none"
              aria-label="검색어 삭제"
            >
              <Icon name="close" className="text-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div
        role="tablist"
        aria-label="상담 필터"
        className="flex gap-1.5 overflow-x-auto hide-scrollbar px-5 pb-3"
      >
        {FILTER_TABS.map((tab) => {
          const selected = activeTab === tab.key;
          const unansweredCount =
            tab.key === 'unanswered'
              ? consultations.filter((c) => c.unreadCount > 0).length
              : 0;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-w-pill border-[1.5px] px-3.5 h-9 text-card-body font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                selected
                  ? 'border-it-blue-500 bg-it-blue-500 text-white'
                  : 'border-it-line-strong bg-it-surface text-it-ink-600 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700',
              )}
            >
              <Icon
                name={tab.icon}
                className="text-card-body"
                aria-hidden="true"
              />
              <span>{tab.label}</span>
              {tab.key === 'unanswered' && unansweredCount > 0 && (
                <span
                  className={cn(
                    'ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-w-pill px-1 text-card-meta font-black font-num tabular-nums',
                    selected
                      ? 'bg-white text-it-blue-500'
                      : 'bg-it-red-500 text-white',
                  )}
                  aria-label={`미답변 ${unansweredCount}건`}
                >
                  {unansweredCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider hairline */}
      <div className="h-px bg-it-line dark:bg-rink-700" />

      {/* List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {isListLoading ? null : listError ? (
          <ErrorBanner message={listError} onRetry={() => refreshList()} />
        ) : filteredConsultations.length === 0 ? (
          <EmptyConsultations />
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {filteredConsultations.map((consultation) => (
              <ConsultationListItem
                key={consultation.id}
                consultation={consultation}
                isSelected={consultation.id === selectedId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Render: Chat Panel ─────────────────────────────

  const chatPanel = (
    <div className="flex flex-col h-full bg-it-canvas dark:bg-rink-900">
      {/* Chat header */}
      {selectedConsultation ? (
        <div className="px-4 py-3 bg-it-surface dark:bg-rink-800 border-b border-it-line dark:border-rink-700 flex items-center gap-3">
          {/* Back button (mobile) */}
          <button
            type="button"
            onClick={handleBackToList}
            className="flex items-center justify-center w-10 h-10 rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none md:hidden"
            aria-label="목록으로 돌아가기"
          >
            <Icon
              name="arrow_back_ios_new"
              className="text-card-title text-it-ink-700 dark:text-rink-100"
              aria-hidden="true"
            />
          </button>

          {/* Student info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-card-body font-bold text-it-ink-800 dark:text-white truncate">
                {selectedConsultation.studentName}
              </h2>
              <span
                className={cn(
                  'shrink-0 rounded-w-pill px-2 py-0.5 text-card-meta font-bold',
                  selectedConsultation.status === 'ACTIVE'
                    ? 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500'
                    : 'bg-it-line text-it-ink-500 dark:bg-rink-700 dark:text-rink-300',
                )}
              >
                {selectedConsultation.status === 'ACTIVE'
                  ? '진행중'
                  : selectedConsultation.status === 'ARCHIVED'
                    ? '보관'
                    : '종료'}
              </span>
            </div>
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300 truncate mt-0.5">
              {selectedConsultation.parentName} &middot; {selectedConsultation.coachName}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Realtime sync indicator */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-w-pill bg-mint-500/10 dark:bg-mint-500/15">
              <span className="w-1.5 h-1.5 rounded-w-pill bg-mint-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-card-meta font-medium text-mint-600 dark:text-mint-500">실시간</span>
            </div>

            {/* PDF export */}
            <button
              type="button"
              onClick={handlePdfExport}
              className="flex items-center justify-center w-10 h-10 rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
              aria-label="PDF 추출"
            >
              <Icon
                name="picture_as_pdf"
                className="text-card-title text-it-ink-700 dark:text-rink-100"
                aria-hidden="true"
              />
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={refreshChat}
              className="flex items-center justify-center w-10 h-10 rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
              aria-label="새로고침"
            >
              <Icon
                name="refresh"
                className="text-card-title text-it-ink-700 dark:text-rink-100"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      ) : null}

      {/* Chat messages */}
      <div
        className="flex-1 overflow-y-auto hide-scrollbar"
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label="상담 대화 내역"
      >
        {!selectedConsultation ? (
          <EmptyChat />
        ) : isChatLoading ? null : chatError ? (
          <div className="p-4">
            <ErrorBanner message={chatError} onRetry={refreshChat} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center" role="status">
            <Icon name="chat" className="text-4xl text-it-ink-300 dark:text-rink-500 mb-3" aria-hidden="true" />
            <p className="text-card-body text-it-ink-500 dark:text-rink-300">
              {MESSAGES.empty('대화 내역')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 py-4">
            {groupedMessages.map((group, gi) => (
              <div key={gi}>
                <ConsultationDateDivider date={group.date} />
                <div className="flex flex-col gap-3 mt-2">
                  {group.messages.map((msg) => (
                    <ConsultationChatBubble key={msg.id} message={msg} />
                  ))}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Read-only mode indicator */}
      {selectedConsultation && (
        <div className="px-4 py-3 bg-it-surface dark:bg-rink-800 border-t border-it-line dark:border-rink-700">
          <div className="flex items-center justify-center gap-2 py-2 rounded-w-md bg-it-fill dark:bg-rink-700">
            <Icon name="visibility" className="text-card-title text-it-ink-500 dark:text-rink-300" aria-hidden="true" />
            <span className="text-card-body text-it-ink-500 dark:text-rink-300">
              조회 전용 모드 (메시지 입력 불가)
            </span>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Main Layout ─────────────────────────────────────

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="상담 로그" showBack forceNative />

      <main className="flex-1 flex flex-col overflow-hidden bg-it-canvas dark:bg-puck" role="main" aria-label="감독 상담 로그">
        {/* Mobile layout: toggle between list and chat */}
        <div className="flex-1 flex overflow-hidden md:hidden">
          {showList ? (
            <div className="w-full">{listPanel}</div>
          ) : (
            <div className="w-full">{chatPanel}</div>
          )}
        </div>

        {/* Desktop layout: side-by-side */}
        <div className="flex-1 hidden md:flex overflow-hidden">
          {/* Sidebar: consultation list — 채팅 패널(it-canvas)과 배경 톤차로 구분 */}
          <div className="w-[320px] shrink-0 overflow-hidden">
            {listPanel}
          </div>

          {/* Main: chat view */}
          <div className="flex-1 overflow-hidden">
            {chatPanel}
          </div>
        </div>
      </main>
    </MobileContainer>
  );
}
