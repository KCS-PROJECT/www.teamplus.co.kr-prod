'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { SwipeStatCards } from '@/components/ui/SwipeStatCards';
import dynamic from 'next/dynamic';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';
import { HeroTeamLogo } from '@/components/dashboard/HeroTeamLogo';
import { useAuth } from '@/contexts/AuthContext';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });
import { useChildHome } from '@/hooks/useChildHome';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import { useImagesReady } from '@/hooks/useImagesReady';
import { useFontsReady } from '@/hooks/useFontsReady';
import { logEnvironmentInfo } from '@/lib/environment';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import BannerCarousel from '@/components/common/BannerCarousel';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { WalletAppBar } from '@/components/wallet';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/common/PullToRefreshIndicator';
// [2026-05-11 Phase 2] 학부모 패턴 마이그레이션 — ParentMiniCalendar/ParentTodaySchedules
//  를 제거하고 학부모와 동일한 ClassCalendarSection + SelectedDayClassList 사용.
//  본인 1인을 "단일 자녀" 처럼 wrap 해서 학부모 컴포넌트가 그대로 받아들임.
import {
  ClassCalendarSection,
  SelectedDayClassList,
  type CalendarClass,
} from '@/components/dashboard/ClassCalendarSection';
import { SectionHead } from '@/components/wallet';

// ─── Error State ──────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileContainer hasBottomNav>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-16 h-16 rounded-w-pill bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Icon name="error_outline" className="text-3xl text-red-500 dark:text-red-400" aria-hidden="true" />
        </div>
        <div className="text-center">
          <h2 className="text-card-title font-bold text-wtext-1 dark:text-white mb-1">
            {MESSAGES.error.title}
          </h2>
          <p className="text-card-body text-wtext-3 dark:text-rink-300">
            {MESSAGES.error.network}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="mt-2 px-6 py-3 bg-ice-500 hover:bg-ice-700 text-white font-semibold rounded-xl transition-colors motion-reduce:transition-none active:brightness-95"
        >
          다시 시도
        </button>
      </div>
    </MobileContainer>
  );
}

// ─── Main Page ────────────────────────────────────────
interface StudentTeamRef {
  id: string;
  name: string;
}

interface StudentSelection {
  dateKey: string | null;
  classes: CalendarClass[];
}

export default function TeenDashboardPage() {
  // [2026-05-11 Phase 2] 학부모 패턴 마이그레이션 — `/teams/my/list` 로 본인 소속 팀 조회.
  //  (구) `/teams/my/managed` 는 코치/감독 전용 — 학생은 본인 팀 목록을 list 로 가져온다.
  const [teams, setTeams] = useState<StudentTeamRef[]>([]);
  const [managedTeamName, setManagedTeamName] = useState<string>('');
  // [추가 2026-05-25] 소속 팀 로고 — Hero 카드 우측 표시.
  const [managedTeamLogoUrl, setManagedTeamLogoUrl] = useState<string | null>(null);
  // [추가 2026-05-15] 학생 본인의 보호자(학부모) 정보 — Hero 카드에 "학부모: 이름/이메일" 표시.
  const [primaryParent, setPrimaryParent] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        type TeamItem = { id?: string; name?: string; clubName?: string; logoUrl?: string | null };
        const r = await api.get<TeamItem[] | { data?: TeamItem[] }>('/teams/my/list');
        if (cancelled || !r.success || !r.data) return;
        const list: TeamItem[] = Array.isArray(r.data)
          ? r.data
          : ((r.data as { data?: TeamItem[] }).data ?? []);
        const mapped = list
          .filter((t) => !!t.id)
          .map((t) => ({ id: t.id!, name: t.name ?? t.clubName ?? '내 팀' }));
        setTeams(mapped);
        if (mapped[0]?.name) setManagedTeamName(mapped[0].name);
        setManagedTeamLogoUrl(list.find((t) => t.logoUrl)?.logoUrl ?? null);
      } catch {/* fallback */}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        type ParentItem = { name?: string; email?: string; isPrimary?: boolean };
        const r = await api.get<{ parents?: ParentItem[] } | ParentItem[]>('/users/me/parents');
        if (cancelled || !r.success || !r.data) return;
        const list: ParentItem[] = Array.isArray(r.data)
          ? r.data
          : (r.data as { parents?: ParentItem[] }).parents ?? [];
        if (list.length === 0) return;
        const primary = list.find((p) => p.isPrimary) ?? list[0];
        if (primary?.name) setPrimaryParent({ name: primary.name, email: primary.email ?? '' });
      } catch {/* fallback */}
    })();
    return () => { cancelled = true; };
  }, []);
  const { user, isAuthenticated } = useAuth();
  const {
    todayClass: apiTodayClass,
    streakCount: apiStreakCount,
    refresh: refreshHome,
    upcomingSchedules,
    // [2026-05-11] useChildHome.checkInSelf 사용 — optimistic UI 통합 (자체 apiRequest 제거)
    checkInSelf,
    isLoading: isHomeLoading,
  } = useChildHome(isAuthenticated);

  // calendarReady — ClassCalendarSection 첫 fetch + 첫 paint 신호 (v16)
  const [calendarReady, setCalendarReady] = useState(false);

  // v16.3 (2026-05-16): useStableLayout — main wrapper ResizeObserver 기반 layout 안정화 감지.
  // TEEN persona — sub-component (Hero, SwipeStatCards, ClassCalendarSection,
  // RecentNoticesSection 등) mount/paint 완료 보장. PTR mainRef 와 callback ref 로 공유.
  // SoT: SPEC_LOADING_STABLE_PAINT.md §2.1.
  const mainRefForStable = useRef<HTMLElement>(null);
  // [성능 2026-05-28 P0-A] 400→300ms. teen(애니메이션) 보수적 단축.
  const isLayoutStable = useStableLayout(mainRefForStable, { stableMs: 300 });

  // 풀스크린 로더 fast-path (v18, 2026-05-20) — 5중 안전망 합성:
  //   ① !isHomeLoading (useChildHome 도착) ② calendarReady ③ isLayoutStable
  //   ④ 이미지 decode 완료 (BannerCarousel/RecentNoticesSection — SPEC §3.1 v18)
  //   ⑤ Pretendard 폰트 swap 완료
  // SoT: LOADING_TIMING_POLICY.md §11
  const imagesReady = useImagesReady([isHomeLoading, isLayoutStable]);
  const fontsReady = useFontsReady();
  usePageReady(
    !isHomeLoading &&
      calendarReady &&
      isLayoutStable &&
      imagesReady &&
      fontsReady,
  );

  // [2026-05-11 Phase 2] 학부모 패턴 — 캘린더 selection 상태 + 본인 1인을 "단일 자녀"로 wrap.
  const [selection, setSelection] = useState<StudentSelection>({ dateKey: null, classes: [] });
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // ClassCalendarSection 의 enabledClassIds — 본인 등록 수업만 캘린더에 노출.
  //  upcomingSchedules 가 본인 등록 일정 SoT (서버에서 자녀별 필터링 완료).
  const enabledClassIds = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    upcomingSchedules.forEach((u) => { if (u.classId) s.add(u.classId); });
    return s;
  }, [upcomingSchedules]);

  // 학부모와 동일 매핑 — 본인 1인을 단일 자녀로 wrap.
  const scheduleIdToChildIds = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!user?.id) return m;
    upcomingSchedules.forEach((s) => m.set(s.scheduleId, [user.id]));
    return m;
  }, [upcomingSchedules, user?.id]);

  const attendanceMap = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    if (!user?.id) return m;
    upcomingSchedules.forEach((s) => {
      m.set(s.scheduleId, s.attendanceStatus ? { [user.id]: s.attendanceStatus } : {});
    });
    return m;
  }, [upcomingSchedules, user?.id]);

  const childIdToName = useMemo(() => {
    const m = new Map<string, string>();
    if (user?.id) m.set(user.id, user.name ?? '');
    return m;
  }, [user?.id, user?.name]);
  const { unreadCount } = useNotificationCount();
  const { navigate } = useNavigation();

  // v17 anti-flicker (SPEC §2.3): setIsAnimated setTimeout 토글 제거 → 항상 true.
  //   CSS animate-* 는 mount 시 자동 발화하며, refresh 시 재발화는 의도적으로 포기 (깜박임 차단 우선).
  const isAnimated = true; // W4: LCP 최적화 — 항상 활성 (CSS-only)
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Pull-to-Refresh — 공통 훅 + 컴포넌트 (SPEC_PULL_TO_REFRESH).
  const animatedRefresh = useCallback(async () => {
    await refreshHome();
  }, [refreshHome]);

  const {
    mainRef,
    pullDistance,
    isRefreshing,
    PULL_THRESHOLD,
  } = usePullToRefresh(animatedRefresh);

  // 뱃지/랭킹/출석률 상태 — 일부는 set 만 호출되고 read 는 향후 KPI 카드 복구 시 사용 (현재 false 영역).
  const [badgeCount, setBadgeCount] = useState(0);
  const [, setRecentBadges] = useState<{ emoji: string; name: string }[]>([]);
  const [currentRank, setCurrentRank] = useState(0);
  const [, setTotalMembers] = useState(0);
  const [, setTopRankers] = useState<{ rank: number; name: string; score: number }[]>([]);
  const [attendanceRate, setAttendanceRate] = useState(0);

  const openMenu = useCallback(() => {
    logEnvironmentInfo('menu', 'teen');
    setIsMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // v16.3 (2026-05-16): PTR mainRef + useStableLayout mainRefForStable 동시 부착.
  //  callback ref 패턴 — 단일 DOM 노드에 2개 RefObject 안전 동기화.
  const setMainNodeRef = useCallback(
    (node: HTMLElement | null) => {
      (mainRef as React.MutableRefObject<HTMLElement | null>).current = node;
      (mainRefForStable as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    [mainRef],
  );

  // [appbar-team5-#7 · 2026-05-13] showAppBar:false — <WalletAppBar forceNative/> (PageAppBar variant='main' wrapper)
  // 가 Native에서도 강제 렌더되어 Flutter AppBar 와 이중 노출. 다른 메인 페이지 6개(parent/coach/director/child/
  // mypage/teen-dashboard) 모두 showAppBar:false 패턴 사용 — 일관성 회복.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: '학생 홈',
    showBottomNav: true,
    isDataLoaded: true,
    showBackButton: false,
    showMenuButton: true,
    menuButtonPosition: 'right',
    onMenuPress: openMenu,
  });

  // W4: 150ms 딜레이 제거

  // 뱃지, 랭킹, 출석률 API 병렬 호출
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    const fetchStats = async () => {
      const [badgesRes, rankingRes, rateRes] = await Promise.allSettled([
        api.get<{ badgeCount: number; badges: { name: string; iconUrl: string | null; rarity: string }[] }>(
          '/users/me/badges',
          { retry: false },
        ),
        api.get<{ currentRank: number; totalUsers: number; topRankers: { rank: number; userId: string; score: number }[] }>(
          '/users/me/ranking',
          { retry: false },
        ),
        api.get<{ rate: number; attendedCount: number; totalCount: number }>(
          '/users/me/attendance-rate',
          { retry: false },
        ),
      ]);

      if (!isMounted) return;

      if (badgesRes.status === 'fulfilled' && badgesRes.value.success && badgesRes.value.data) {
        const d = badgesRes.value.data;
        setBadgeCount(d.badgeCount ?? 0);
        const rarityEmoji: Record<string, string> = {
          legendary: '🏆', epic: '💜', rare: '💎', uncommon: '⭐', common: '🥇',
        };
        setRecentBadges(
          (d.badges ?? []).slice(0, 3).map((b) => ({
            emoji: rarityEmoji[b.rarity] ?? '🎖️',
            name: b.name,
          }))
        );
      }

      if (rankingRes.status === 'fulfilled' && rankingRes.value.success && rankingRes.value.data) {
        const d = rankingRes.value.data;
        setCurrentRank(d.currentRank);
        setTotalMembers(d.totalUsers);
        setTopRankers(
          (d.topRankers ?? []).map((r) => ({ rank: r.rank, name: `#${r.rank}`, score: r.score }))
        );
      }

      if (rankingRes.status === 'fulfilled' && rateRes.status === 'fulfilled' && rateRes.value.success && rateRes.value.data) {
        setAttendanceRate(rateRes.value.data.rate);
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, [isAuthenticated]);

  /**
   * 학생 본인 출석 체크 — SelectedDayClassList.onCheckIn (scheduleId, childId) 시그니처 호환.
   * JWT 에서 본인 ID 자동 추출이므로 childId 인자는 무시.
   *
   * [2026-05-11] 자체 apiRequest 구현을 useChildHome.checkInSelf wrap 으로 단순화.
   *  → optimistic UI 업데이트가 hook 내부에 통합되어 자동 적용 (출석 즉시 "출석 완료" 칩 전환).
   */
  const selfCheckIn = useCallback(
    async (
      scheduleId: string,
      _childId: string,
    ): Promise<
      | { ok: true; remainingSessions: number; className: string }
      | { ok: false; message: string }
    > => checkInSelf(scheduleId),
    [checkInSelf],
  );

  const handleRetry = useCallback(() => {
    setHasError(false);
  }, []);

  if (hasError) return <ErrorState onRetry={handleRetry} />;

  const now = new Date();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dateString = `${now.getMonth() + 1}월 ${now.getDate()}일 ${dayNames[now.getDay()]}요일`;
  const hour = now.getHours();
  const timeGreeting = hour < 12
    ? MESSAGES.dashboard.greeting.morning
    : hour < 18
      ? MESSAGES.dashboard.greeting.afternoon
      : MESSAGES.dashboard.greeting.evening;

  const nextClass = apiTodayClass
    ? {
        title: apiTodayClass.title,
        coach: apiTodayClass.coach,
        date: apiTodayClass.time,
        location: '',
      }
    : null;

  const streakCount = apiStreakCount;

  return (
    <MobileContainer hasBottomNav>
      {/* ─── Header — 6개 메인 화면 통일 (WalletAppBar / PageAppBar variant='main') ── */}
      <WalletAppBar
        forceNative
        timelineBadge={unreadCount > 0 ? unreadCount : undefined}
        onSearch={() => navigate('/search')}
        onTimeline={() => navigate('/timeline')}
        onMy={() => navigate('/notifications')}
        onMenu={openMenu}
      />

      {/* ─── Main Content ────────────────────────────
          Layout v2 (2026-04-16) — Teen Spacing Rhythm:
          · gap-5 pt-1 pb-30 (admin/director/parent/coach 일관)
          Teen 액센트: indigo — 히어로 + 섹션 리더 bar */}
      {/* Pull-to-Refresh 인디케이터 — AppBar 와 main 사이 flex item */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        threshold={PULL_THRESHOLD}
        ariaLabel="청소년 대시보드 새로고침"
      />
      <main
        ref={setMainNodeRef}
        className="flex-1 min-h-0 flex flex-col gap-5 pt-1 pb-30 overflow-y-auto hide-scrollbar overscroll-y-none"
        style={{ WebkitOverflowScrolling: 'touch' }}
        role="main"
        aria-label="학생 대시보드"
        data-ptr-self="true"
      >
        {/* [재작성 2026-05-15 → 강화 2026-05-16] Hero 카드 — TEEN persona (rink-800 + flame-500 accent).
            STUDENT 배지 + 본인 이름/이메일 + 소속 팀명. flame-500 텍스트 drop-shadow-lg 로 7:1 대비 보장.
            [페르소나 톤 카피 강화] 시간대별 인사 + flame-500 액센트 (열정·도전 톤). */}
        <AnimatedSection delay={0}>
          <section className="px-4 sm:px-5 pt-3">
            <div className="relative overflow-hidden rounded-w-xl bg-rink-800 dark:bg-rink-900 shadow-sh-rink p-5 sm:p-6 text-white">
              <HeroTeamLogo logoUrl={managedTeamLogoUrl} />
              <div className="relative pr-24">
                <div className="flex items-center gap-2">
                  <span className="text-card-meta font-extrabold tracking-[0.08em] text-flame-500 drop-shadow-lg">
                    STUDENT
                  </span>
                  <span className="text-card-meta font-bold text-ice-100/80">
                    · {timeGreeting}
                  </span>
                </div>
                <h1 className="mt-2 text-w-h2 font-extrabold text-white tracking-tight break-keep leading-tight">
                  {user?.name ?? '학생'}
                  <span className="ml-1 text-flame-500 drop-shadow-lg">!</span>
                </h1>
                <p className="mt-1 text-card-meta font-bold text-flame-500 drop-shadow-lg tracking-wide">
                  오늘도 한 번 더 도전해볼까요? 🔥
                </p>
                {user?.email && (
                  <p className="mt-2 text-card-meta text-ice-100/60 font-num truncate tabular-nums">
                    {user.email}
                  </p>
                )}
                {/* [추가 2026-05-15] 학부모 정보 — 본인 정보 직하단 표시. */}
                {primaryParent && (
                  <div className="mt-2 flex items-center gap-1.5 text-card-meta text-ice-100/80">
                    <Icon name="family_restroom" className="text-[14px] text-ice-100/70" aria-hidden="true" />
                    <span className="font-semibold">학부모:</span>
                    <span className="font-bold text-white truncate">{primaryParent.name}</span>
                    {primaryParent.email && (
                      <span className="font-num tabular-nums text-ice-100/60 truncate">
                        · {primaryParent.email}
                      </span>
                    )}
                  </div>
                )}
                {managedTeamName && (
                  <div className="mt-4 pt-3.5 border-t border-flame-500/30 flex items-center gap-2">
                    <Icon name="groups" className="text-[16px] text-flame-500 drop-shadow-lg" aria-hidden="true" />
                    <span className="text-card-meta font-semibold uppercase tracking-wider text-flame-500 drop-shadow-lg">
                      소속 팀
                    </span>
                    <span className="text-card-body font-bold text-white truncate">
                      · {managedTeamName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* [활성화 2026-05-16] 내 현황 (통계 스와이프카드) — TEEN persona 강화 (flame-500 accent).
            streak/attendance/rank/badge 4종 카드 표시. */}
        <AnimatedSection delay={50}>
          <div className="px-5 mb-2 flex items-center justify-between">
            <h2 className="text-card-title font-bold text-wtext-1 dark:text-white flex items-center gap-2">
              내 현황
            </h2>
            {streakCount >= 7 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-w-pill bg-orange-50 dark:bg-orange-900/20 text-card-meta font-bold text-flame-500 dark:text-orange-400 border border-flame-500/30">
                <Icon name="local_fire_department" className="text-card-body" aria-hidden="true" />
                열정 모드
              </span>
            )}
          </div>
          <SwipeStatCards
            cards={[
              { icon: 'local_fire_department', label: '연속 출석', value: streakCount, suffix: '일', iconBg: 'bg-orange-50 dark:bg-orange-900/20', iconColor: 'text-flame-500' },
              { icon: 'trending_up', label: '이번달 출석률', value: attendanceRate, suffix: '%', iconBg: 'bg-blue-50 dark:bg-blue-900/20', iconColor: 'text-ice-500' },
              { icon: 'leaderboard', label: '내 순위', value: currentRank, suffix: '위', iconBg: 'bg-violet-50 dark:bg-violet-900/20', iconColor: 'text-violet-600', href: '#ranking' },
              { icon: 'emoji_events', label: '뱃지 수', value: badgeCount, suffix: '개', iconBg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-600' },
            ]}
            isAnimated={isAnimated}
            ariaLabel="내 현황 통계 카드"
          />
        </AnimatedSection>

        {/* [제거 2026-05-15] 배너/다음수업 카드 섹션 폐기 — 학부모와 동일하게
            Hero 다음 바로 수업 일정이 오도록 순서 정리 (사용자 요청).
            BannerCarousel/다음수업 카드는 학부모 페이지에도 없음. */}

        {/* [2026-05-11 Phase 2] 학부모 패턴 마이그레이션 — 월 캘린더 + 선택일 수업 목록
            ParentMiniCalendar/ParentTodaySchedules → ClassCalendarSection/SelectedDayClassList.
            출석 체크는 selfCheckIn 으로 위임 — POST /attendance/self-check-in. */}
        <AnimatedSection delay={230} className="px-5">
          <SectionHead title="수업 일정" />
          <ClassCalendarSection
            teamIds={teams}
            enabledClassIds={enabledClassIds}
            onSelectionChange={setSelection}
            onReady={setCalendarReady}
          />
        </AnimatedSection>

        {selection.dateKey && (
          <AnimatedSection delay={250} className="px-5">
            <SectionHead
              title={(() => {
                const d = new Date(selection.dateKey);
                return `${d.getMonth() + 1}월 ${d.getDate()}일 수업`;
              })()}
            />
            <SelectedDayClassList
              classes={selection.classes}
              scheduleIdToChildIds={scheduleIdToChildIds}
              attendanceMap={attendanceMap}
              childIdToName={childIdToName}
              selectedChildId={user?.id ?? null}
              todayKey={todayKey}
              onCheckIn={selfCheckIn}
            />
          </AnimatedSection>
        )}

        {/* 공지사항 — [2026-05-11 Phase 2 정정] 학부모 패턴 일치: RecentNoticesSection 사용
            (자체 fetch + SectionHead 통합 + px-4 sm:px-5 내장).  외부 패딩 적용 금지. */}
        <AnimatedSection delay={450}>
          <RecentNoticesSection />
        </AnimatedSection>

        {/* 하단 여백 */}
        <div className="h-4" aria-hidden="true" />
      </main>

      {/* ─── GlobalMenu ────────────────────────── */}
      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
