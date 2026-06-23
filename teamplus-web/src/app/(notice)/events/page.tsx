'use client';

import { useState, useEffect } from 'react';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import { usePageReady } from '@/hooks/usePageReady';

type TabType = 'all' | 'notice' | 'event';

interface NoticeItem {
  id: string;
  type: 'notice' | 'event';
  title: string;
  description?: string;
  date: string;
  isPinned?: boolean;
  isImportant?: boolean;
  isOngoing?: boolean;
  isMemberOnly?: boolean;
  isExpired?: boolean;
  imageUrl?: string;
}


function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button"       onClick={onClick}
      className={cn(
        'flex items-center px-4 py-2 rounded-w-pill text-card-body font-medium transition-all motion-reduce:transition-none whitespace-nowrap',
        active
          ? 'bg-ice-500 text-white shadow-md'
          : 'bg-wline-2 dark:bg-rink-800 text-wtext-3 dark:text-rink-300 border border-wline dark:border-rink-700 hover:bg-wline dark:hover:bg-rink-700'
      )}
    >
      {children}
    </button>
  );
}

function PinnedNoticeCard({ notice }: { notice: NoticeItem }) {
  return (
    <NavLink
      href={`/notice/${notice.id}`}
      className="bg-ice-500/5 dark:bg-ice-500/10 border border-ice-500/10 dark:border-ice-500/20 rounded-xl p-4 flex items-start gap-3 relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none" aria-hidden="true">
        <Icon name="campaign" className="text-6xl text-ice-500" aria-hidden="true" />
      </div>
      <div className="flex-shrink-0 mt-0.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-w-pill bg-ice-500/10 text-ice-500" aria-label="고정 공지">
          <Icon name="push_pin" className="text-card-title" aria-hidden="true" />
        </span>
      </div>
      <div className="flex-1 min-w-0 z-10">
        <div className="flex items-center gap-2 mb-1">
          {notice.isImportant && (
            <span className="text-card-meta font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
              중요
            </span>
          )}
          <span className="text-card-meta text-wtext-3 dark:text-rink-300">{notice.date}</span>
        </div>
        <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white leading-tight mb-1 group-hover:text-ice-500 transition-colors motion-reduce:transition-none">
          {notice.title}
        </h3>
        {notice.description && (
          <p className="text-card-body text-wtext-3 dark:text-rink-300 line-clamp-2 leading-relaxed">
            {notice.description}
          </p>
        )}
      </div>
    </NavLink>
  );
}

function EventCard({ notice, reverse = false }: { notice: NoticeItem; reverse?: boolean }) {
  return (
    <NavLink
      href={`/notice/${notice.id}`}
      className="bg-white dark:bg-rink-800 rounded-xl border border-wline dark:border-rink-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none active:brightness-95 duration-150"
    >
      <div className={cn('flex', reverse && 'flex-row-reverse')}>
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {notice.isOngoing && (
                <>
                  <span className="w-1.5 h-1.5 rounded-w-pill bg-green-500" />
                  <span className="text-card-meta font-medium text-green-600 dark:text-green-400">
                    진행중인 이벤트
                  </span>
                </>
              )}
              {notice.isMemberOnly && (
                <>
                  <span className="w-1.5 h-1.5 rounded-w-pill bg-ice-500" />
                  <span className="text-card-meta font-medium text-ice-500">회원 전용</span>
                </>
              )}
            </div>
            <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white leading-snug mb-2">
              {notice.title}
            </h3>
            {notice.description && (
              <p className="text-card-meta text-wtext-3 dark:text-rink-300">{notice.description}</p>
            )}
          </div>
          <p className="text-card-meta text-wtext-3 mt-3">{notice.date}</p>
        </div>
        {notice.imageUrl && (
          <div className={cn('w-32 h-auto bg-wline-2 dark:bg-rink-700 relative', reverse ? 'w-28' : 'w-32')}>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${notice.imageUrl}')` }}
            />
          </div>
        )}
      </div>
    </NavLink>
  );
}

function SimpleNoticeCard({ notice }: { notice: NoticeItem }) {
  return (
    <NavLink
      href={`/notice/${notice.id}`}
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl border border-wline dark:border-rink-700 p-4 shadow-sm active:bg-wbg dark:active:bg-rink-700 transition-colors motion-reduce:transition-none',
        notice.isExpired && 'opacity-60'
      )}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-card-meta font-medium text-wtext-3 px-1.5 py-0.5 bg-wline-2 dark:bg-rink-700 rounded text-wtext-2 dark:text-rink-100">
              공지
            </span>
            <span className="text-card-meta text-wtext-3">-</span>
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">{notice.date}</span>
          </div>
          <h3
            className={cn(
              'text-card-emphasis font-medium text-wtext-1 dark:text-white mb-1',
              notice.isExpired && 'line-through text-wtext-3 dark:text-rink-300 decoration-slate-400'
            )}
          >
            {notice.title}
          </h3>
        </div>
        {!notice.isExpired && (
          <Icon name="chevron_right" className="text-xl text-wtext-4 dark:text-rink-500" aria-hidden="true" />
        )}
      </div>
    </NavLink>
  );
}

export default function EventsListPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  usePageReady(isLoaded);

  useEffect(() => {
    const load = async () => {
      const res = await api.get<{
        notices?: { id: string; title: string; content?: string; targetType?: string; isPinned?: boolean; isImportant?: boolean; imageUrl?: string; createdAt?: string; publishedAt?: string }[];
        data?: { id: string; title: string; content?: string; targetType?: string; isPinned?: boolean; isImportant?: boolean; imageUrl?: string; createdAt?: string; publishedAt?: string }[];
      }>('/notices?limit=50');
      if (res.success && res.data) {
        const raw = res.data.notices ?? res.data.data ?? [];
        const mapped: NoticeItem[] = raw.map((n) => {
          const type: 'notice' | 'event' = n.targetType === 'event' ? 'event' : 'notice';
          const dateStr = n.publishedAt ?? n.createdAt ?? '';
          const dt = dateStr ? new Date(dateStr) : new Date();
          const date = `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
          return {
            id: n.id,
            type,
            title: n.title,
            description: n.content ? n.content.replace(/<[^>]+>/g, '').slice(0, 80) : undefined,
            date,
            isPinned: n.isPinned,
            isImportant: n.isImportant,
            imageUrl: n.imageUrl,
          };
        });
        setNotices(mapped);
      }
      setIsLoaded(true);
    };
    void load();
  }, []);

  const filteredNotices = notices.filter((notice) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'notice') return notice.type === 'notice';
    if (activeTab === 'event') return notice.type === 'event';
    return true;
  });

  const pinnedNotice = filteredNotices.find((n) => n.isPinned);
  const regularNotices = filteredNotices.filter((n) => !n.isPinned);

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title="공지사항" forceNative />

      {/* Tabs */}
      <div className="flex-none px-4 pb-2 border-b border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900 z-10">
        <div className="flex space-x-2 overflow-x-auto py-2 scrollbar-hide">
          <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
            전체
          </TabButton>
          <TabButton active={activeTab === 'notice'} onClick={() => setActiveTab('notice')}>
            공지
          </TabButton>
          {/* 이벤트 공지가 있을 때만 탭 노출 (이벤트 공지가 없으면 숨김) */}
          {notices.some((n) => n.type === 'event') && (
            <TabButton active={activeTab === 'event'} onClick={() => setActiveTab('event')}>
              이벤트
            </TabButton>
          )}
        </div>
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-30 bg-white dark:bg-rink-900">
        {/* Pinned Important Notice */}
        {pinnedNotice && <PinnedNoticeCard notice={pinnedNotice} />}

        {/* List Divider */}
        <div className="flex items-center gap-4 py-2">
          <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
            최근 소식
          </span>
          <div className="h-px bg-wline dark:border-rink-700 flex-1" />
        </div>

        {/* Regular Notices */}
        {regularNotices.map((notice, index) => {
          if (notice.type === 'event' && notice.imageUrl) {
            return <EventCard key={notice.id} notice={notice} reverse={index % 2 === 1} />;
          }
          return <SimpleNoticeCard key={notice.id} notice={notice} />;
        })}

        {/* End of List Indicator */}
        <div className="pt-6 pb-4 text-center">
          <p className="text-card-meta text-wtext-3 dark:text-rink-500">
            모든 공지사항을 확인했습니다.
          </p>
        </div>
      </div>

    </MobileContainer>
  );
}
