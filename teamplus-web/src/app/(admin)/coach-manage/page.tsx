'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';

import { usePageReady } from '@/hooks/usePageReady';
/** 백엔드 CoachProfile 응답 타입 */
interface CoachProfileResponse {
  id: string;
  userId: string;
  clubId: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  club: { id: string; clubName: string } | null;
}

/** UI 표시용 코치 정보 */
interface Coach {
  id: string;
  name: string;
  specialty: string;
  status: 'active' | 'inactive';
  weeklyClasses: number;
  weeklyHours: number;
  image: string;
}

/** 백엔드 응답 → UI Coach 변환 */
function mapToCoach(profile: CoachProfileResponse): Coach {
  const name =
    [profile.user.lastName, profile.user.firstName].filter(Boolean).join('') ||
    profile.user.email;
  return {
    id: profile.id,
    name,
    specialty: profile.club?.clubName ?? '소속 없음',
    status: 'active',
    weeklyClasses: 0,
    weeklyHours: 0,
    image: '',
  };
}

type FilterType = 'all' | 'active' | 'inactive';

const FILTER_LABELS: Record<FilterType, string> = {
  all: '전체',
  active: '활동 중',
  inactive: '휴직',
};

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [filter, setFilter] = useState<FilterType>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadCoaches = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: CoachProfileResponse[]; pagination: unknown }>(
        '/admin/coaches',
      );
      const list = res.data?.data;
      setCoaches(Array.isArray(list) ? list.map(mapToCoach) : []);
    } catch {
      setCoaches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoaches();
  }, [loadCoaches]);

  // [추가 2026-05-15 T07↔T02] 코치 등록/수정/삭제 후 자동 갱신.
  //   T02 협업: backend 가 ['admin', 'coaches'] 키로 invalidate 신호를 보낼 수 있고,
  //   director 화면 mutation 도 'coaches' 와 ['admin', 'coaches'] 양쪽 발화. 둘 다 prefix 매칭으로 수신.
  useRefreshSubscription(REFRESH_KEYS.COACHES, () => {
    void loadCoaches();
  });
  useRefreshSubscription(['admin', 'coaches'], () => {
    void loadCoaches();
  });

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpenId) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('click', handleClickOutside);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [menuOpenId]);

  const toggleMenu = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId((prev) => (prev === id ? null : id));
  }, []);

  const { totalCoaches, totalClasses, activeCoaches, inactiveCoaches, filteredCoaches } =
    useMemo(() => {
      const total = coaches.length;
      const classes = coaches.reduce((sum, c) => sum + (c.weeklyClasses ?? 0), 0);
      const active = coaches.filter((c) => c.status === 'active');
      const inactive = coaches.filter((c) => c.status === 'inactive');
      const filtered =
        filter === 'all' ? coaches : filter === 'active' ? active : inactive;
      return {
        totalCoaches: total,
        totalClasses: classes,
        activeCoaches: active,
        inactiveCoaches: inactive,
        filteredCoaches: filtered,
      };
    }, [coaches, filter]);

  const getCardIcon = (index: number) => {
    const icons = ['calendar_month', 'schedule', 'block', 'workspace_premium', 'bolt'];
    const iconBg = [
      'bg-ice-500/10 text-ice-500 dark:bg-ice-500/20',
      'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
      'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-100',
      'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300',
      'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
    ];
    return {
      icon: icons[index % icons.length],
      color: iconBg[index % iconBg.length],
    };
  };

  return (
    <MobileContainer hasBottomNav>
      <div className="relative mx-auto flex h-full min-h-screen-safe w-full max-w-md flex-col overflow-hidden bg-wbg dark:bg-rink-900">
        {/* AppBar */}
        <PageAppBar title="코치 관리" className="z-30" />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-32">
          {/* Hero 섹션 */}
          <section className="px-5 pt-6 pb-2">
            <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
              Coach Roster
            </p>
            <h2 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
              코치 관리
            </h2>
            <p className="mt-2 text-card-body font-medium text-wtext-3 dark:text-rink-300">
              활동 코치 현황과 수업 배정을 한눈에 확인하세요.
            </p>
          </section>

          {/* Summary Widget — 다크 카드, 대담한 숫자 */}
          <section aria-label="코치 요약" className="px-5 pt-5">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-rink-900 dark:bg-rink-800 p-5 text-white shadow-sm">
              <div className="flex-1">
                <p className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 mb-1">
                  총 등록 코치
                </p>
                <p className="text-3xl font-black tabular-nums">
                  {totalCoaches}
                  <span className="ml-1 text-card-emphasis font-bold text-wtext-3">명</span>
                </p>
              </div>
              <div className="h-12 w-px bg-rink-700" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 mb-1">
                  배정된 수업
                </p>
                <p className="text-3xl font-black tabular-nums">
                  {totalClasses}
                  <span className="ml-1 text-card-emphasis font-bold text-wtext-3">개</span>
                </p>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-w-pill bg-white/10">
                <Icon name="groups" className="text-white text-[22px]" aria-hidden="true" />
              </div>
            </div>
            {/* 활동/휴직 요약 */}
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-3">
                <dt className="flex items-center gap-1.5 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                  <span className="size-2 rounded-w-pill bg-green-500" aria-hidden="true" />
                  활동 중
                </dt>
                <dd className="mt-0.5 text-xl font-black text-wtext-1 dark:text-white tabular-nums">
                  {activeCoaches.length}
                </dd>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-3">
                <dt className="flex items-center gap-1.5 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                  <span className="size-2 rounded-w-pill bg-wtext-4" aria-hidden="true" />
                  휴직
                </dt>
                <dd className="mt-0.5 text-xl font-black text-wtext-1 dark:text-white tabular-nums">
                  {inactiveCoaches.length}
                </dd>
              </div>
            </dl>
          </section>

          {/* Filter Chips */}
          <div
            className="sticky top-14 z-20 flex w-full gap-2 overflow-x-auto hide-scrollbar bg-wbg dark:bg-rink-900 px-5 py-4"
            role="tablist"
            aria-label="코치 필터"
          >
            {(['all', 'active', 'inactive'] as FilterType[]).map((key) => {
              const isActive = filter === key;
              const dotColor =
                key === 'active'
                  ? 'bg-green-500'
                  : key === 'inactive'
                  ? 'bg-wtext-4'
                  : '';
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilter(key)}
                  className={`group inline-flex min-h-[44px] shrink-0 items-center gap-x-2 rounded-w-pill px-4 text-card-body font-bold transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900 ${
                    isActive
                      ? 'bg-rink-900 dark:bg-ice-500 text-white shadow-sm'
                      : 'bg-white dark:bg-rink-800 border border-gray-200 dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500/60'
                  }`}
                >
                  {dotColor && <span className={`size-2 rounded-w-pill ${dotColor}`} aria-hidden="true" />}
                  {FILTER_LABELS[key]}
                </button>
              );
            })}
            <button
              type="button"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-x-1 rounded-w-pill bg-white dark:bg-rink-800 border border-gray-200 dark:border-rink-700 px-4 text-card-body font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:border-ice-500 hover:text-ice-500 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              aria-label="필터 더보기"
            >
              <Icon name="filter_list" className="text-[18px]" aria-hidden="true" />
              필터
            </button>
          </div>

          {/* List Title */}
          <div className="px-5 pb-2 pt-1 flex items-end justify-between">
            <h3 className="text-xl font-bold text-wtext-1 dark:text-white tracking-tight">
              코치 목록
            </h3>
            <span className="text-card-meta font-bold text-ice-500">최근 등록순</span>
          </div>

          {/* Coach List */}
          <div className="flex flex-col gap-3 px-5 mt-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-wtext-3">
                <span className="text-card-body font-semibold">{MESSAGES.common.loading}</span>
              </div>
            ) : filteredCoaches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center">
                <Icon
                  name="person_off"
                  className="text-[32px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                <p className="mt-3 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
                  {MESSAGES.empty('코치')}
                </p>
                <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                  신규 코치를 등록해보세요.
                </p>
              </div>
            ) : null}
            {filteredCoaches.map((coach, index) => {
              const iconInfo = getCardIcon(index);
              const isInactive = coach.status === 'inactive';

              return (
                <article
                  key={coach.id}
                  className={`group relative flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm transition-shadow motion-reduce:transition-none hover:shadow-md active:brightness-95 ${
                    isInactive ? 'opacity-90' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div
                        className={`relative size-14 shrink-0 overflow-hidden rounded-w-pill bg-wline-2 dark:bg-rink-700 ring-2 ring-white dark:ring-rink-800 shadow-sm ${
                          isInactive ? 'grayscale' : ''
                        }`}
                      >
                        {coach.image ? (
                          <div
                            className="w-full h-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${coach.image})` }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-wtext-3">
                            <Icon name="person" className="text-[28px]" aria-hidden="true" />
                          </div>
                        )}
                        <div
                          className={`absolute bottom-0 right-0 size-3 rounded-w-pill ring-2 ring-white dark:ring-rink-800 ${
                            coach.status === 'active' ? 'bg-green-500' : 'bg-wtext-4'
                          }`}
                          aria-label={coach.status === 'active' ? '활동 중' : '휴직'}
                        />
                      </div>
                      <div className="flex flex-col justify-center">
                        <h4 className="text-card-title font-bold text-wtext-1 dark:text-white leading-tight">
                          {coach.name}
                        </h4>
                        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                          <p className="text-card-body font-semibold text-wtext-3 dark:text-rink-300">
                            {coach.specialty}
                          </p>
                          {isInactive && (
                            <span className="inline-flex items-center rounded-md bg-wline-2 dark:bg-rink-700 px-1.5 py-0.5 text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                              휴직
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      className="relative"
                      ref={menuOpenId === coach.id ? menuRef : undefined}
                    >
                      <button
                        type="button"
                        onClick={(e) => toggleMenu(coach.id, e)}
                        className="flex items-center justify-center size-11 rounded-w-pill text-wtext-3 hover:text-ice-500 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                        aria-label={`${coach.name} 관리 메뉴`}
                        aria-expanded={menuOpenId === coach.id}
                      >
                        <Icon name="more_vert" aria-hidden="true" />
                      </button>
                      {menuOpenId === coach.id && (
                        <div
                          className="absolute right-0 top-12 z-30 w-44 rounded-xl bg-white dark:bg-rink-800 shadow-lg border border-gray-200 dark:border-rink-700 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setMenuOpenId(null)}
                            className="flex w-full min-h-[44px] items-center gap-2 px-4 py-2.5 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 motion-reduce:transition-none focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700"
                          >
                            <Icon name="person" className="text-[18px] text-wtext-3" aria-hidden="true" />
                            <span>프로필 보기</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setMenuOpenId(null)}
                            className="flex w-full min-h-[44px] items-center gap-2 px-4 py-2.5 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 motion-reduce:transition-none focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700"
                          >
                            <Icon name="calendar_month" className="text-[18px] text-wtext-3" aria-hidden="true" />
                            <span>수업 배정</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setMenuOpenId(null)}
                            className="flex w-full min-h-[44px] items-center gap-2 px-4 py-2.5 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 motion-reduce:transition-none focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700"
                          >
                            <Icon name="edit" className="text-[18px] text-wtext-3" aria-hidden="true" />
                            <span>정보 수정</span>
                          </button>
                          <div
                            className="my-1 border-t border-wline-2 dark:border-rink-700"
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setMenuOpenId(null)}
                            className="flex w-full min-h-[44px] items-center gap-2 px-4 py-2.5 text-card-body font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 motion-reduce:transition-none focus:outline-none focus-visible:bg-red-50 dark:focus-visible:bg-red-900/20"
                          >
                            <Icon name="person_remove" className="text-[18px]" aria-hidden="true" />
                            <span>코치 해제</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`mt-1 flex items-center gap-3 rounded-xl p-3 ${
                      isInactive
                        ? 'bg-wbg dark:bg-rink-700/40 border border-dashed border-wline dark:border-rink-700'
                        : 'bg-wbg dark:bg-rink-700/40'
                    }`}
                  >
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconInfo.color}`}>
                      <Icon name={iconInfo.icon} className="text-[20px]" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
                        {isInactive ? '배정 현황' : '이번 주 배정'}
                      </span>
                      {isInactive ? (
                        <span className="text-card-body font-semibold text-wtext-3 dark:text-rink-300">
                          배정된 수업 없음
                        </span>
                      ) : (
                        <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
                          {coach.weeklyClasses}개 수업
                          <span className="ml-1 font-medium text-wtext-3">
                            · {coach.weeklyHours}시간
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        {/* Bottom Action Bar */}
        <div className="absolute bottom-0 z-40 w-full bg-white dark:bg-rink-800 border-t border-gray-200 dark:border-rink-700 px-5 py-4 pb-safe-4">
          <button
            type="button"
            className="inline-flex w-full min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-ice-500 text-white text-card-emphasis font-bold shadow-sm hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          >
            <Icon name="person_add" className="text-[18px]" aria-hidden="true" />
            신규 코치 등록
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}
