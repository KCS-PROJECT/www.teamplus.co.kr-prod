'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { CategoryChipsRow, type CategoryChipItem } from '@/components/shared/CategoryChipsRow';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useDebounce } from '@/hooks/useDebounce';
import { apiRequest } from '@/services/api-client';
import { cn } from '@/lib/utils';

// ─── 탭 타입 ────────────────────────────────────────────
type SearchTab = '전체' | '수업' | '코치' | '팀' | '상품' | '공지';

const SEARCH_TABS: SearchTab[] = ['전체', '수업', '코치', '팀', '상품', '공지'];

// ─── 결과 아이템 타입 ────────────────────────────────────
interface SearchResultItem {
  id: string;
  type: '수업' | '코치' | '팀' | '상품' | '공지';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: 'primary' | 'success' | 'warning' | 'error';
}

// ─── 탭별 아이콘 매핑 ────────────────────────────────────
const TAB_ICONS: Record<SearchTab, string> = {
  전체: 'apps',
  수업: 'sports_hockey',
  코치: 'person',
  팀: 'groups',
  상품: 'shopping_bag',
  공지: 'campaign',
};

// ─── 배지 색상 클래스 (동적 클래스 금지 → 상수 객체) ────
const BADGE_CLASSES: Record<string, string> = {
  primary: 'bg-ice-500 text-white',
  success: 'bg-green-600 text-white',
  warning: 'bg-yellow-500 text-white',
  error: 'bg-red-600 text-white',
};

// ─── 검색 결과 카드 ──────────────────────────────────────
function ResultCard({ item }: { item: SearchResultItem }) {
  const { navigate } = useNavigation();

  const handleClick = () => {
    const routes: Record<string, string> = {
      수업: `/classes/${item.id}`,
      코치: `/coaches/${item.id}`,
      팀: `/team/${item.id}`,
      상품: `/products/${item.id}`,
      공지: `/notice/${item.id}`,
    };
    navigate(routes[item.type] || '/');
  };

  const typeIcons: Record<string, string> = {
    수업: 'sports_hockey',
    코치: 'person',
    팀: 'groups',
    상품: 'shopping_bag',
    공지: 'campaign',
  };

  const typeBgClasses: Record<string, string> = {
    수업: 'bg-ice-50 dark:bg-ice-500/20',
    코치: 'bg-green-50 dark:bg-green-900/20',
    팀: 'bg-purple-50 dark:bg-purple-900/20',
    상품: 'bg-orange-50 dark:bg-orange-900/20',
    공지: 'bg-wbg dark:bg-rink-700',
  };

  const typeIconClasses: Record<string, string> = {
    수업: 'text-ice-600 dark:text-ice-400',
    코치: 'text-green-600 dark:text-green-400',
    팀: 'text-purple-600 dark:text-purple-400',
    상품: 'text-orange-600 dark:text-orange-400',
    공지: 'text-wtext-3 dark:text-rink-300',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-wsurface dark:bg-rink-800 hover:bg-wbg dark:hover:bg-rink-700/50 border-b border-wline-2 dark:border-rink-700 text-left transition-colors motion-reduce:transition-none active:brightness-95"
    >
      {/* 타입 아이콘 */}
      <div className={cn('w-10 h-10 rounded-w-md flex items-center justify-center shrink-0', typeBgClasses[item.type])}>
        <Icon name={typeIcons[item.type]} className={cn('text-w-title', typeIconClasses[item.type])} aria-hidden="true" />
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <p className="text-w-small font-semibold text-wtext-1 dark:text-white truncate">{item.title}</p>
        <p className="text-w-caption text-wtext-3 dark:text-rink-300 truncate mt-0.5">{item.subtitle}</p>
      </div>

      {/* 배지 */}
      {item.badge && (
        <span className={cn('shrink-0 text-w-caption font-bold px-2 py-0.5 rounded-w-pill', BADGE_CLASSES[item.badgeColor ?? 'primary'])}>
          {item.badge}
        </span>
      )}

      <Icon name="chevron_right" className="shrink-0 text-wtext-4 dark:text-rink-400 text-w-title" aria-hidden="true" />
    </button>
  );
}

// ─── 빈 결과 상태 ────────────────────────────────────────
function EmptyResult({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 bg-wbg dark:bg-rink-800 rounded-w-pill flex items-center justify-center mb-4">
        <Icon name="search_off" className="text-3xl text-wtext-4" aria-hidden="true" />
      </div>
      <h3 className="text-w-body-lg font-bold text-wtext-1 dark:text-white mb-1">
        검색 결과가 없습니다
      </h3>
      <p className="text-w-small text-wtext-3 dark:text-rink-300">
        <span className="font-semibold text-ice-500">&quot;{query}&quot;</span>에 대한 결과를 찾지 못했습니다.
      </p>
      <p className="text-w-caption text-wtext-4 dark:text-rink-400 mt-2">
        다른 키워드로 검색해 보세요.
      </p>
    </div>
  );
}

// ─── 섹션 헤더 ───────────────────────────────────────────
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="px-4 py-2.5 bg-wbg dark:bg-puck border-b border-wline-2 dark:border-rink-700">
      <span className="text-w-caption font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
        {title}
      </span>
      <span className="ml-2 text-w-caption font-bold text-ice-500">{count}</span>
    </div>
  );
}

// ─── 메인 검색 결과 페이지 ───────────────────────────────
function SearchResultsContent() {
  const searchParams = useSearchParams();

  const initialQuery = searchParams != null ? (searchParams.get('q') ?? '') : '';
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 400);

  const [activeTab, setActiveTab] = useState<SearchTab>('전체');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [hasSearched, setHasSearched] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  // ─── 검색 실행 ────────────────────────────────────────
  const executeSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      type ClubItem = { id: number; title: string; subtitle: string; coachName: string; memberCount: number };
      type ClassItem = { id: number; title: string; subtitle: string; instructorName: string };
      type CoachItem = { id: number; title: string; clubName: string };
      type NoticeItem = { id: number; title: string; description: string; targetType?: string };
      type SearchApiResponse = {
        query: string;
        total: number;
        results: {
          clubs?: { total: number; items: ClubItem[] };
          classes?: { total: number; items: ClassItem[] };
          coaches?: { total: number; items: CoachItem[] };
          notices?: { total: number; items: NoticeItem[] };
        };
      };

      const res = await apiRequest<SearchApiResponse>({
        method: 'GET',
        url: `/search?q=${encodeURIComponent(q)}&type=all&limit=10`,
        retry: false,
      });

      const combined: SearchResultItem[] = [];

      if (res.success && res.data) {
        const { clubs, classes, coaches, notices } = res.data.results;

        clubs?.items.forEach((club) => {
          combined.push({
            id: String(club.id),
            type: '팀',
            title: club.title,
            subtitle: [club.subtitle, club.coachName ? `${club.coachName} 코치` : ''].filter(Boolean).join(' · '),
            badge: `${club.memberCount}명`,
            badgeColor: 'primary',
          });
        });

        classes?.items.forEach((cls) => {
          combined.push({
            id: String(cls.id),
            type: '수업',
            title: cls.title,
            subtitle: [cls.subtitle, cls.instructorName].filter(Boolean).join(' · '),
          });
        });

        coaches?.items.forEach((coach) => {
          combined.push({
            id: String(coach.id),
            type: '코치',
            title: coach.title,
            subtitle: coach.clubName || '소속 없음',
            badge: '코치',
            badgeColor: 'success',
          });
        });

        notices?.items.forEach((notice) => {
          combined.push({
            id: String(notice.id),
            type: '공지',
            title: notice.title,
            subtitle: notice.description,
            badge: notice.targetType ?? '전체',
            badgeColor: 'warning',
          });
        });
      }

      setResults(combined);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── 디바운스 검색 트리거 (IME 조합 중에는 자동 실행 방지) ─────
  useEffect(() => {
    if (isComposing) return;
    executeSearch(debouncedQuery);
  }, [debouncedQuery, executeSearch, isComposing]);

  // ─── 탭 필터 ──────────────────────────────────────────
  const filteredResults = activeTab === '전체'
    ? results
    : results.filter((r) => r.type === activeTab);

  // ─── 탭별 카운트 ─────────────────────────────────────
  const tabCount = (tab: SearchTab): number => {
    if (tab === '전체') return results.length;
    return results.filter((r) => r.type === tab).length;
  };

  // ─── 결과를 타입별로 그룹화 ───────────────────────────
  const groupedResults = filteredResults.reduce<Record<string, SearchResultItem[]>>((acc, item) => {
    const key = item.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // ─── 입력 핸들러 ──────────────────────────────────────
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [2026-05-26 Track D B5/B12] showAppBar:false 로 Flutter Native AppBar 를 끄므로
          forceNative 가 없으면 Native(WebView)에서 PageAppBar 가 통째로 사라져 상단바(뒤로가기·
          타임라인·알림·메뉴)가 미표시되고, 본문(검색바·카테고리 칩)이 status bar 영역까지
          밀려 올라가 "카테고리 개수 헤더가 안 보이는" 회귀가 발생한다. forceNative 로 App/Web
          동일 AppBar(sticky top-0)를 노출하면 본문이 그 아래로 정상 offset 된다. */}
      <PageAppBar title="검색 결과" forceNative />

      {/* ─── 검색바 + 탭 (sticky) ──────────────────────────────── */}
      <div className="sticky top-14 z-40 bg-wsurface dark:bg-rink-800 border-b border-wline-2 dark:border-rink-700">
        <form onSubmit={handleSearchSubmit} className="px-4 py-3">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-w-title text-wtext-4 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="수업, 코치, 팀, 상품 검색"
              className={cn(
                'w-full h-10 pl-9 pr-8 rounded-w-pill',
                'bg-wbg dark:bg-rink-700',
                'text-w-small text-wtext-1 dark:text-white',
                'placeholder-wtext-4 dark:placeholder-rink-400',
                'focus:outline-none focus:ring-2 focus:ring-ice-500/20',
                'transition-all motion-reduce:transition-none'
              )}
              autoComplete="off"
              aria-label="검색어 입력"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-w-pill bg-wtext-4 flex items-center justify-center"
                aria-label="검색어 지우기"
              >
                <Icon name="close" className="text-[10px] text-white" aria-hidden="true" />
              </button>
            )}
          </div>
        </form>

        {/* ─── 카테고리 칩 — CategoryChipsRow (가로 스크롤 잘림 차단) ─────
            기존 inline 탭 (flex + overflow-x-auto) 의 chip 너비 합이 360dp 초과 시
            오른쪽 마지막 카테고리(공지) 가 가시 영역 밖으로 잘리는 회귀 해결.
            min-w-max + snap-mandatory 패턴으로 chip 합 너비 보장 + touch 친화. */}
        <div className="border-t border-wline-2 dark:border-rink-700">
          <CategoryChipsRow
            ariaLabel="검색 카테고리"
            chips={
              SEARCH_TABS.map<CategoryChipItem>((tab) => ({
                key: tab,
                label: tab,
                count: tabCount(tab),
                icon: TAB_ICONS[tab],
              }))
            }
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as SearchTab)}
            paddingX="px-4"
          />
        </div>
      </div>

      {/* ─── 결과 본문 ─────────────────────────────────
          [BUG FIX 2026-05-19 W3 #7] 카테고리 sticky 영역 끝과 첫 결과 카드 사이 여백 부족 회귀.
            기존: `mt-2` (8px) — 시각적으로 sticky 카테고리 칩 줄과 첫 카드가 붙어 보임.
            변경: main 영역 자체 `pt-3` (12px) + 첫 그룹 카드 `mt-4` (16px) 보강. */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pt-3">
        {isLoading ? null : !hasSearched || !query.trim() ? (
          // 검색어 없음
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 bg-wsurface dark:bg-rink-800 rounded-w-pill flex items-center justify-center mb-4">
              <Icon name="search" className="text-3xl text-wtext-4" aria-hidden="true" />
            </div>
            <p className="text-w-small text-wtext-3 dark:text-rink-300">검색어를 입력해주세요.</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <EmptyResult query={query} />
        ) : activeTab === '전체' ? (
          // 전체 탭: 타입별 그룹화
          <div className="pb-8 space-y-3">
            {Object.entries(groupedResults).map(([type, items]) => (
              <div key={type} className="bg-wsurface dark:bg-rink-800 rounded-w-xl mx-4 overflow-hidden shadow-sh-1">
                <SectionHeader title={type} count={items.length} />
                {items.map((item) => <ResultCard key={item.id} item={item} />)}
              </div>
            ))}
          </div>
        ) : (
          // 개별 탭
          <div className="pb-8 mx-4 bg-wsurface dark:bg-rink-800 rounded-w-xl overflow-hidden shadow-sh-1">
            {filteredResults.map((item) => <ResultCard key={item.id} item={item} />)}
          </div>
        )}

        {/* 결과 카운트 */}
        {hasSearched && !isLoading && filteredResults.length > 0 && (
          <p className="text-center text-w-caption text-wtext-4 dark:text-rink-400 py-4">
            {filteredResults.length}개의 결과
          </p>
        )}
      </main>
    </MobileContainer>
  );
}

export default function SearchResultsPage() {
  return (
    <Suspense fallback={null}>
      <SearchResultsContent />
    </Suspense>
  );
}
