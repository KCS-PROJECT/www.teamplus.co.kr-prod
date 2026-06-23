'use client';

import { useState, useEffect, useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { apiRequest } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  tag: string;
}

interface ApiNotice {
  id: string;
  title: string;
  content?: string;
  createdAt?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function ClubNewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const fetchNews = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<ApiNotice[] | { notices?: ApiNotice[]; data?: ApiNotice[] }>({
        method: 'GET',
        url: '/notices?limit=10&isActive=true',
        retry: false,
      });
      if (res.success && res.data) {
        const raw = Array.isArray(res.data)
          ? res.data
          : (res.data as { notices?: ApiNotice[]; data?: ApiNotice[] }).notices
            ?? (res.data as { notices?: ApiNotice[]; data?: ApiNotice[] }).data
            ?? [];
        setNews((raw as ApiNotice[]).map((n) => ({
          id: n.id,
          title: n.title,
          excerpt: n.content ? n.content.slice(0, 60) + (n.content.length > 60 ? '...' : '') : '',
          date: formatDate(n.createdAt),
          tag: '공지',
        })));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar showBack={false} title="팀 소식" showMenu />
      <main className="flex-1 overflow-y-auto px-5 py-6">
        {isLoading ? null : news.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-w-pill bg-wline-2 dark:bg-rink-800 flex items-center justify-center">
              <Icon name="campaign" className="text-2xl text-wtext-3" />
            </div>
            <p className="text-w-small text-wtext-3 dark:text-rink-300">등록된 소식이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {news.map((item) => (
              <Card key={item.id} hover>
                <NavLink href={`/notice/${item.id}`} className="block space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-w-pill bg-ice-500/10 text-ice-500">
                      {item.tag}
                    </span>
                    <span className="text-w-caption text-wtext-3">{item.date}</span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-w-body-lg font-bold text-wtext-1">{item.title}</h3>
                    {item.excerpt && <p className="text-w-small text-wtext-3">{item.excerpt}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-w-caption text-wtext-3">
                    <Icon name="arrow_forward" className="text-w-body-lg" />
                    자세히 보기
                  </div>
                </NavLink>
              </Card>
            ))}
          </div>
        )}
      </main>
    </MobileContainer>
  );
}
