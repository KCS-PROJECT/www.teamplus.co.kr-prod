'use client';

import { useState, useEffect, useRef, useCallback, useId, useMemo } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

import { usePageReady } from '@/hooks/usePageReady';
interface Coach {
  id: string;
  name: string;
  title: string;
  avatar?: string;
  badge: {
    label: string;
    color: string;
  };
  tags: string[];
  description: string;
  isFavorite: boolean;
}

interface FilterChip {
  id: string;
  label: string;
}

const filterChips: FilterChip[] = [
  { id: 'all', label: '전체' },
  { id: 'infant', label: '유아 전문' },
  { id: 'skill', label: '스킬 트레이닝' },
  { id: 'goalie', label: '골리 전문' },
  { id: 'elite', label: '엘리트 반' },
];

// ─── 정렬 옵션 ──────────────────────────────────────
type SortKey = 'recommended' | 'name' | 'favorite';

const SORT_OPTIONS: { key: SortKey; label: string; description: string; icon: string }[] = [
  { key: 'recommended', label: '추천순', description: '플랫폼 추천 순서로 정렬', icon: 'recommend' },
  { key: 'name', label: '이름순', description: '가나다 순으로 정렬', icon: 'sort_by_alpha' },
  { key: 'favorite', label: '즐겨찾기 우선', description: '즐겨찾기한 코치를 먼저 표시', icon: 'favorite' },
];

// /admin/coaches 응답 형태 — 백엔드가 firstName 또는 first_name 둘 다 반환 가능
//   (snake_case 호환), 일부 필드는 nested user 객체로 노출됨.
//   @typescript-eslint/no-explicit-any 회피용 명시 인터페이스 (2026-05-08 v2).
interface RawCoachResponse {
  id?: string;
  userId?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  name?: string;
  specialization?: string;
  specialty?: string;
  avatarUrl?: string;
  bio?: string;
  tags?: string[];
  user?: {
    id?: string;
    username?: string;
    avatarUrl?: string;
  };
}

function mapCoach(c: RawCoachResponse): Coach {
  const firstName = c.firstName ?? c.first_name ?? '';
  const lastName = c.lastName ?? c.last_name ?? '';
  const fullName = `${lastName}${firstName}`.trim();
  const name = c.name ?? c.user?.username ?? (fullName || '코치');
  return {
    id: c.user?.id ?? c.userId ?? c.id ?? '',
    name,
    title: c.specialization ?? c.specialty ?? '코치',
    avatar: c.avatarUrl ?? c.user?.avatarUrl,
    badge: { label: 'COACH', color: 'bg-it-blue-500' },
    tags: c.tags ?? [],
    description: c.bio ?? '',
    isFavorite: false,
  };
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const searchId = useId();
  return (
    <div className="relative group">
      <label htmlFor={searchId} className="sr-only">코치 이름 검색</label>
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Icon name="search" className="text-it-ink-400 dark:text-wtext-4 text-[22px]" aria-hidden="true" />
      </div>
      <input
        id={searchId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={MESSAGES.placeholders.searchCoach}
        aria-label="코치 이름 검색"
        autoComplete="off"
        className="block w-full pl-11 pr-4 h-12 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none duration-150 ease-ios"
      />
    </div>
  );
}

function FilterChips({
  chips,
  activeId,
  onSelect,
}: {
  chips: FilterChip[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const hasMoved = useRef(false);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);
  const rafId = useRef<number>(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    cancelAnimationFrame(rafId.current);
    isDragging.current = true;
    hasMoved.current = false;
    startX.current = e.clientX;
    lastX.current = e.clientX;
    lastTime.current = Date.now();
    scrollLeft.current = el.scrollLeft;
    velocity.current = 0;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 3) hasMoved.current = true;

    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (e.clientX - lastX.current) / dt;
    }
    lastX.current = e.clientX;
    lastTime.current = now;

    scrollRef.current.scrollLeft = scrollLeft.current - dx;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = false;
    el.releasePointerCapture(e.pointerId);
    el.style.cursor = 'grab';

    // 관성 스크롤
    let v = -velocity.current * 800;
    const friction = 0.95;
    const animate = () => {
      if (Math.abs(v) < 0.5) return;
      el.scrollLeft += v * 0.016;
      v *= friction;
      rafId.current = requestAnimationFrame(animate);
    };
    rafId.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  const handleChipClick = useCallback((id: string) => {
    if (hasMoved.current) return;
    onSelect(id);
  }, [onSelect]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-2 select-none"
      style={{ cursor: 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {chips.map((chip) => (
        <button type="button"           key={chip.id}
          onClick={() => handleChipClick(chip.id)}
          className={`flex-shrink-0 px-4 h-9 rounded-w-pill text-[14px] font-bold flex items-center whitespace-nowrap transition-colors motion-reduce:transition-none active:scale-95 border-[1.5px] ${
            activeId === chip.id
              ? 'bg-it-blue-500 text-white border-it-blue-500'
              : 'bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100'
          }`}
        >
          {chip.label}
        </button>
      ))}
      <div className="flex-shrink-0 w-3" aria-hidden="true" />
    </div>
  );
}

/* 코치 1행 — flat hairline row (아바타 + 이름/전문 + 태그 + 즐겨찾기). 카드 박스 제거. */
function CoachRow({
  coach,
  isLast,
  onToggleFavorite,
}: {
  coach: Coach;
  isLast: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 py-[13px] min-h-[64px]',
        !isLast && 'border-b border-it-line dark:border-rink-700',
      )}
    >
      <NavLink
        href={`/coaches/${coach.id}`}
        className="flex items-center gap-3 flex-1 min-w-0"
        aria-label={`${coach.name} 코치 상세 보기`}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="size-12 rounded-w-pill bg-it-line dark:bg-rink-700 overflow-hidden flex items-center justify-center">
            {resolveImageSrc(coach.avatar) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolveImageSrc(coach.avatar)}
                alt={`${coach.name} 코치`}
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon name="person" className="text-[26px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-[15.5px] font-bold leading-tight tracking-[-0.01em] truncate text-it-ink-800 dark:text-white">
              {coach.name} 코치
            </h3>
          </div>
          <p className="mt-0.5 text-[13px] font-semibold text-it-blue-500 truncate">{coach.title}</p>
          {coach.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {coach.tags.slice(0, 3).map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center rounded-w-xs border border-it-line-strong dark:border-rink-600 px-1.5 py-0.5 text-card-meta font-bold text-it-ink-600 dark:text-rink-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </NavLink>

      {/* 즐겨찾기 */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={coach.isFavorite ? `${coach.name} 즐겨찾기 해제` : `${coach.name} 즐겨찾기`}
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95 hover:bg-it-line dark:hover:bg-rink-700',
          coach.isFavorite
            ? 'text-it-red-500'
            : 'text-it-ink-400 dark:text-wtext-4 hover:text-it-blue-500 dark:hover:text-it-blue-500',
        )}
      >
        <Icon name="favorite" filled={coach.isFavorite} className="text-[20px]" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function CoachListPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [sortKey, setSortKey] = useState<SortKey>('recommended');
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? '추천순';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // /admin/coaches 응답 — 배열 또는 { data: [...] } 두 형태 모두 지원
        const res = await api.get<RawCoachResponse[] | { data?: RawCoachResponse[] }>(
          '/admin/coaches?limit=100',
        );
        if (res.success && res.data) {
          const raw: RawCoachResponse[] = Array.isArray(res.data)
            ? res.data
            : res.data.data ?? [];
          setCoaches(raw.map(mapCoach));
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const toggleFavorite = (id: string) => {
    setCoaches((prev) =>
      prev.map((coach) =>
        coach.id === id ? { ...coach, isFavorite: !coach.isFavorite } : coach
      )
    );
  };

  const filteredCoaches = useMemo(() => {
    const filtered = coaches.filter((coach) => {
      const matchesSearch = coach.name.toLowerCase().includes(searchQuery.toLowerCase());
      // Filter logic would go here based on activeFilter
      return matchesSearch;
    });

    // 정렬 (원본 불변)
    const sorted = [...filtered];
    if (sortKey === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    } else if (sortKey === 'favorite') {
      sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    }
    // 'recommended'는 API 기본 순서 유지
    return sorted;
  }, [coaches, searchQuery, sortKey]);

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title="코치진 소개" forceNative />

      {/* Main Content (검색·필터·리스트 모두 함께 스크롤) — flat 흰 섹션 + 회색 캔버스 */}
      <main className="flex-1 overflow-y-auto pb-30 bg-it-canvas dark:bg-puck">
        {/* 검색 + 필터 — flat 흰 섹션 (카드 박스 제거) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4" aria-label="코치 검색">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <div className="mt-3.5">
            <FilterChips
              chips={filterChips}
              activeId={activeFilter}
              onSelect={setActiveFilter}
            />
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 코치 목록 — flat 흰 섹션 (헤더 + hairline 구분 행) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7" aria-label="코치 목록">
          {/* 목록 헤더 — SectionHead 위계 통일 */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                코치 목록
              </h2>
              {!isLoading && (
                <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                  {filteredCoaches.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsSortSheetOpen(true)}
              aria-label={`정렬 기준 변경 (현재: ${currentSortLabel})`}
              aria-haspopup="dialog"
              className="flex items-center gap-1 rounded-w-md px-2 py-1 text-[13px] font-semibold text-it-ink-600 dark:text-rink-100 hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
            >
              {currentSortLabel}
              <Icon name="keyboard_arrow_down" className="text-[16px]" aria-hidden="true" />
            </button>
          </div>

          {/* Coach List — hairline rows */}
          {!isLoading && filteredCoaches.length > 0 && (
            <div className="flex flex-col">
              {filteredCoaches.map((coach, idx) => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  isLast={idx === filteredCoaches.length - 1}
                  onToggleFavorite={() => toggleFavorite(coach.id)}
                />
              ))}
            </div>
          )}

          {/* Empty State — 1줄 텍스트 */}
          {!isLoading && filteredCoaches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-card-body font-medium text-it-ink-700 dark:text-wtext-4 text-center">
                {searchQuery.trim()
                  ? `"${searchQuery.trim()}" 검색 결과가 없습니다.`
                  : MESSAGES.empty('코치')}
              </p>
            </div>
          )}
        </section>
      </main>

      {/* 정렬 옵션 BottomSheet */}
      <BottomSheet
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        title="정렬 기준"
      >
        <ul role="radiogroup" aria-label="정렬 기준" className="flex flex-col py-1">
          {SORT_OPTIONS.map((option) => {
            const isSelected = sortKey === option.key;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setSortKey(option.key);
                    setIsSortSheetOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 py-3.5 px-2 rounded-w-md text-left transition-colors motion-reduce:transition-none',
                    'hover:bg-it-fill dark:hover:bg-rink-700/50',
                    isSelected && 'bg-it-blue-50 dark:bg-it-blue-500/10',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-w-md shrink-0',
                      isSelected
                        ? 'bg-it-blue-500/10 text-it-blue-500 dark:bg-it-blue-500/20'
                        : 'bg-it-line dark:bg-rink-700 text-it-ink-400 dark:text-rink-100',
                    )}
                  >
                    <Icon name={option.icon} className="text-[20px]" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-[14px] font-bold',
                        isSelected
                          ? 'text-it-blue-500'
                          : 'text-it-ink-800 dark:text-white',
                      )}
                    >
                      {option.label}
                    </p>
                    <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5">
                      {option.description}
                    </p>
                  </div>
                  {isSelected && (
                    <Icon
                      name="check"
                      className="text-it-blue-500 text-[22px] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </MobileContainer>
  );
}
