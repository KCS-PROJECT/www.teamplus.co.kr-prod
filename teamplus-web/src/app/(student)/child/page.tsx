'use client';

import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/ui/Icon';
import { resolveImageSrc } from '@/lib/image-url';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SectionHead } from '@/components/wallet';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNavigation } from '@/components/ui/NavLink';
import { useAuth } from '@/contexts/AuthContext';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });
import { useChildHome } from '@/hooks/useChildHome';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import { useImagesReady } from '@/hooks/useImagesReady';
import { useFontsReady } from '@/hooks/useFontsReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { MESSAGES } from '@/lib/messages';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';
import BannerCarousel from '@/components/common/BannerCarousel';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/common/PullToRefreshIndicator';
import { api } from '@/services/api-client';
// [2026-05-11 Phase 2] 학부모 패턴 마이그레이션 — variant='child' 로 WCAG AAA 시각 강조.
//  72×72dp 출석 버튼, 폰트 18px+, 대비 7:1.  환영 Hero(아이스하키 스틱 애니메이션) 는 유지.
//  useModal/useToast 는 SelectedDayClassList 내부 처리로 페이지에서 불필요.
import {
  ClassCalendarSection,
  SelectedDayClassList,
  type CalendarClass,
} from '@/components/dashboard/ClassCalendarSection';

// ─── WCAG AAA Constants ────────────────────────────────
// 아동(4-7세): 최소 72x72dp 터치 타겟, 7:1 대비율, text-card-title-child+ 텍스트 (18px+)
const CHILD_MIN_TOUCH = 'min-h-[72px] min-w-[72px]';

// ─── 아이스하키 스틱 SVG ──────────────────────────────
// 이모지 🏒 는 플랫폼(iOS/AOS)마다 모양이 달라 일관성 부족 + 정확한 pivot 제어 불가.
// 커스텀 SVG 로 손잡이·블레이드·그립테이프 표현 → 확대/회전 해도 선명 유지.
const HockeyStickSVG = () => (
  <svg
    width="56"
    height="56"
    viewBox="0 0 56 56"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* 손잡이 (나무결 브라운) */}
    <path
      d="M48 8 L14 46 L20 51 L54 13 Z"
      fill="#C19A6B"
      stroke="#8B6F47"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    {/* 그립 테이프 (상단 흰색 줄무늬) */}
    <path d="M44 6 L52 14 L48 17 L40 9 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="0.5" />
    {/* 블레이드 (검정) */}
    <path
      d="M12 44 L26 54 L30 50 L16 40 Z"
      fill="#1F2937"
      stroke="#111827"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    {/* 블레이드 측면 하이라이트 */}
    <path d="M14 42 L25 50" stroke="#4B5563" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

// ─── Error State (WCAG AAA) ────────────────────────────
const ErrorState = memo(function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileContainer hasBottomNav>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <div className="w-20 h-20 rounded-w-pill bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Icon name="error_outline" className="text-5xl text-red-500 dark:text-red-400" filled aria-hidden="true" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-wtext-1 dark:text-white mb-2">
            문제가 생겼어요
          </h2>
          <p className="text-card-title-child font-bold text-wtext-2 dark:text-rink-100">
            {MESSAGES.error.network}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className={`${CHILD_MIN_TOUCH} px-8 bg-ice-500 hover:bg-ice-700 text-white text-card-title-child font-bold rounded-2xl flex items-center justify-center gap-2 active:brightness-95 transition-colors motion-reduce:transition-none`}
          aria-label="다시 시도하기"
        >
          <Icon name="refresh" className="text-2xl" aria-hidden="true" />
          <span>다시 시도하기</span>
        </button>
      </div>
    </MobileContainer>
  );
});

interface StudentTeamRef {
  id: string;
  name: string;
}

interface StudentSelection {
  dateKey: string | null;
  classes: CalendarClass[];
}

// ─── Main Page ────────────────────────────────────────
export default function ChildDashboardPage() {
  // 인증/권한 체크는 (student)/child/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지 — WEB-022)
  const { user, isAuthenticated } = useAuth();
  const {
    error: homeError,
    refresh: refreshHome,
    upcomingSchedules,
    checkInSelf,
    isLoading: isHomeLoading,
  } = useChildHome(isAuthenticated);

  // calendarReady — ClassCalendarSection 첫 fetch + 첫 paint 신호 (v16)
  const [calendarReady, setCalendarReady] = useState(false);

  // v16.3 (2026-05-16): useStableLayout — main wrapper ResizeObserver 기반 layout 안정화 감지.
  // CHILD WCAG AAA — sub-component (AnimatedSection hero, ClassCalendarSection,
  // BannerCarousel, RecentNoticesSection 등) mount/paint 완료 보장. PTR mainRef 와 공유 가능
  // (usePullToRefresh disabled:true 로 PTR 비활성, ref 만 활용). SoT: SPEC §2.1.
  // ※ 실제 ref 결합은 아래 usePullToRefresh 의 mainRef 를 useStableLayout 에 그대로 전달.
  const mainRefForStable = useRef<HTMLElement>(null);
  // [성능 2026-05-28 P0-A] 400→300ms. child(WCAG·pop-in/wiggle 애니메이션) 보수적 단축.
  const isLayoutStable = useStableLayout(mainRefForStable, { stableMs: 300 });

  // 풀스크린 로더 fast-path (v18, 2026-05-20) — 5중 안전망 합성:
  //   ① !isHomeLoading (useChildHome 도착) ② calendarReady ③ isLayoutStable
  //   ④ 이미지 decode 완료 (BannerCarousel/Hero — SPEC §3.1 v18)
  //   ⑤ Pretendard 폰트 swap 완료 (CHILD WCAG AAA 18px+ 폰트 정상 표시 보장)
  // SoT: LOADING_TIMING_POLICY.md §11 (사용자 직접 지시 — 데이터+셋팅 완료 전 hide 절대 금지)
  const imagesReady = useImagesReady([isHomeLoading, isLayoutStable]);
  const fontsReady = useFontsReady();
  usePageReady(
    !isHomeLoading &&
      calendarReady &&
      isLayoutStable &&
      imagesReady &&
      fontsReady,
  );

  // useModal/useToast 는 SelectedDayClassList 내부에서 사용 — 페이지 직접 사용 불필요.

  // [2026-05-11 Phase 2] 학부모 패턴 — `/teams/my/list` 로 본인 소속 팀 + 캘린더 selection.
  const [teams, setTeams] = useState<StudentTeamRef[]>([]);
  // [추가 2026-05-25] 소속 팀 로고 — 환영 Hero 의 팀 칩에 표시.
  const [childTeamLogoUrl, setChildTeamLogoUrl] = useState<string | null>(null);
  // [추가 2026-05-15] 본인의 보호자(학부모) 정보 — 환영 Hero 하단에 "학부모: 이름" 표시.
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
        setChildTeamLogoUrl(list.find((t) => t.logoUrl)?.logoUrl ?? null);
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

  const [selection, setSelection] = useState<StudentSelection>({ dateKey: null, classes: [] });
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // ClassCalendarSection 의 enabledClassIds — 본인 등록 수업만 캘린더에 노출.
  const enabledClassIds = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    upcomingSchedules.forEach((u) => { if (u.classId) s.add(u.classId); });
    return s;
  }, [upcomingSchedules]);

  // 학부모와 동일 매핑 — 본인 1인을 "단일 자녀" 처럼 wrap (SelectedDayClassList 호환).
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

  // self-check-in 어댑터 — SelectedDayClassList.onCheckIn (scheduleId, childId) 시그니처와
  //  호환. CHILD 본인은 JWT 에서 추출되므로 childId 는 무시.
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

  const { unreadCount } = useNotificationCount();
  const { navigate } = useNavigation();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Pull-to-Refresh — 공통 훅 + 컴포넌트 (SPEC_PULL_TO_REFRESH · WCAG AAA size="lg").
  // [2026-05-13 이슈 D1.1] CHILD 홈에서 의도치 않은 PTR 발화 차단.
  //   "위로 스크롤 후 새로고침이 발화" 사용자 보고 다발 — 4-7세 아동은 정밀한 PTR 제스처가
  //   어려워 스크롤 복귀 중 손가락 떨림으로 임계값(80px) 을 넘기는 경우가 빈번. 새로고침은
  //   Native AppBar 의 refresh 버튼 (Flutter shows showRefreshButton) 으로 명시 수행.
  //   refreshHome 콜백은 mainRef 유지 + 향후 옵션 토글 시 즉시 복원 가능하도록 그대로 보존.
  const {
    mainRef,
    pullDistance,
    isRefreshing,
    PULL_THRESHOLD,
  } = usePullToRefresh(refreshHome, { disabled: true });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // v16.3 (2026-05-16): PTR mainRef + useStableLayout mainRefForStable 를 동시에 부착.
  //  callback ref 패턴 — 단일 DOM 노드에 2개 RefObject 를 안전하게 동기화.
  const setMainNodeRef = useCallback(
    (node: HTMLElement | null) => {
      (mainRef as React.MutableRefObject<HTMLElement | null>).current = node;
      (mainRefForStable as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    [mainRef],
  );

  // WalletAppBar 사용 — Flutter 네이티브 AppBar 는 중복 방지 위해 비활성
  //
  // [2026-05-13 이슈 D1.1 보강] pullToRefreshEnabled: false
  //   (hybrid-app-engineer Phase 3-D 신규 옵션). Web 측 usePullToRefresh 는 위에서
  //   disabled:true 적용했지만 Flutter WebView 의 Native PTR (RefreshIndicator) 가
  //   별도 트리거 — 두 레이어 모두 차단해야 4-7세 아동의 의도치 않은 새로고침이 완전 차단됨.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: isAuthenticated,
    showMenuButton: true,
    menuButtonPosition: 'right',
    pullToRefreshEnabled: false,
    onMenuPress: openMenu,
  });

  useEffect(() => {
    setHasError(Boolean(homeError));
  }, [homeError]);

  const handleRetry = useCallback(() => setHasError(false), []);

  // [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
  if (!isAuthenticated) return null;
  if (hasError) return <ErrorState onRetry={handleRetry} />;

  // ── 실제 데이터 ──
  const childName = user?.name ?? '';

  return (
    <MobileContainer hasBottomNav>
      {/* WCAG AAA: variant='main' + toneVariant='kid' — 64px AppBar + 22px font-extrabold 큰 타이틀.
          CHILD 홈은 대시보드(메인) 변형이므로 4-액션 우측 영역 유지(타임라인/알림/메뉴). */}
      <PageAppBar
        variant="main"
        toneVariant="kid"
        forceNative
        timelineBadge={unreadCount > 0 ? unreadCount : null}
        onSearch={() => navigate('/search')}
        onTimeline={() => navigate('/timeline')}
        onMy={() => navigate('/notifications')}
        onMenu={openMenu}
      />

      {/* Pull-to-Refresh 인디케이터 (CHILD — WCAG AAA size="lg") — AppBar 와 main 사이 flex item */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        threshold={PULL_THRESHOLD}
        size="lg"
        ariaLabel="어린이 홈 새로고침"
      />
      {/* Main Content (WCAG AAA — 간격 보수적 유지) */}
      {/* [개선 2026-05-16] 섹션 간격 gap-5 → gap-7 확대 — 어린이 인지 부하 축소, 시각적 호흡 강화. */}
      <main
        ref={setMainNodeRef}
        className="flex-1 min-h-0 flex flex-col gap-7 pt-4 pb-30 overflow-y-auto hide-scrollbar overscroll-y-none"
        style={{ WebkitOverflowScrolling: 'touch' }}
        role="main"
        aria-label="어린이 대시보드"
      >
        {/* 환영 Hero — 아이스하키 앱 정체성: 좌→우 고속 슈팅 루프
            ⚠️ transform 충돌 방지: position·centering 은 wrapper 의 `top + marginTop(음수 offset)` 로 처리,
            애니메이션 요소는 순수 transform 만 담당 (Tailwind `-translate-y-*` 와 충돌하면 WebView 에서 미작동) */}
        <AnimatedSection className="px-5">
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-w-h2 font-black text-wtext-1 dark:text-white leading-tight">
                안녕, {childName}아!
              </h1>
              <p className="text-card-title-child font-bold text-wtext-2 dark:text-rink-100 mt-1">
                오늘도 힘차게 연습해요
              </p>
              {/* [추가 2026-05-25] 소속 팀 로고+팀명 칩 — 어린이 UI WCAG AAA (로고 흰 배경 칩).
                  팀 로고가 등록돼 있을 때만 노출. */}
              {childTeamLogoUrl && (
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-card-title-child font-bold text-wtext-1 ring-1 ring-ice-100 dark:bg-rink-800 dark:text-white dark:ring-rink-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImageSrc(childTeamLogoUrl) || ''}
                      alt=""
                      className="h-6 w-6 object-contain"
                    />
                  </span>
                  <span className="truncate">{teams[0]?.name ?? '내 팀'}</span>
                </div>
              )}
              {/* [추가 2026-05-15] 학부모 정보 — WCAG AAA 어린이 UI 라 18px+ 가독성 유지.
                  [개선 2026-05-16] ice-100 칩으로 시각 강조 — family_restroom 아이콘 주변 둥근 배경. */}
              {primaryParent && (
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-ice-100 px-3 py-1.5 text-card-title-child font-bold text-wtext-1 dark:bg-ice-500/20 dark:text-white">
                  <Icon name="family_restroom" className="text-[20px] text-ice-500 shrink-0" aria-hidden="true" />
                  <span className="truncate">학부모: {primaryParent.name}</span>
                </div>
              )}
            </div>

            {/* 하키 애니메이션 컨테이너 — overflow visible 로 퍽 잔상이 오른쪽으로 160px 날아갈 공간 확보 */}
            <div
              className="relative shrink-0"
              aria-hidden="true"
              style={{ width: 84, height: 64, overflow: 'visible' }}
            >
              {/* SVG 스틱 — 좌측 고정 (plain absolute, no transform-based centering) */}
              <div
                className="absolute motion-reduce:!animate-none motion-reduce:animate-none"
                style={{
                  left: 0,
                  top: 4, /* 수직 중앙 근처 고정 오프셋 — transform 충돌 방지 */
                  animation: 'stick-shoot 3.6s cubic-bezier(0.22, 0.8, 0.3, 1) infinite',
                  transformOrigin: '85% 15%', /* 손잡이 상단(SVG 우측 상단) pivot → 블레이드가 오른쪽 아래 궤적 */
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                }}
                role="img"
                aria-label="아이스하키 스틱"
              >
                <HockeyStickSVG />
              </div>

              {/* 퍽 — 스틱 블레이드 앞 고정 → 임팩트 후 오른쪽으로 고속 슛팅 (160px, 288ms)
                  스틱 blade 끝 좌표에 정확히 정렬 · 속도감을 위해 scaleX stretch 로 motion blur 대체.
                  배경색은 토큰 `bg-rink-900` 사용 (DESIGN.md 다크 슬레이트). */}
              <div
                className="absolute rounded-full bg-rink-900 shadow-sh-2 motion-reduce:!animate-none motion-reduce:animate-none"
                style={{
                  left: 28,
                  top: 43, /* SVG 블레이드 위치 매칭 */
                  width: 12,
                  height: 12,
                  animation: 'puck-shoot 3.6s cubic-bezier(0.55, 0, 0.1, 1) infinite',
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        </AnimatedSection>

        {/* [2026-05-11 Phase 2] 학부모 패턴 마이그레이션 — SectionHead variant='child' 통일.
            큰 "오늘 수업" 카드 + 미니캘린더 + 오늘 일정 (학부모 임시 코드) 모두 제거.
            ClassCalendarSection + SelectedDayClassList(variant='child') 가 WCAG AAA 자동 적용.
            환영 Hero (아이스하키 스틱 + 퍽 슈팅) 는 어린이 친화 UX 핵심 시각 요소 — 유지. */}
        <AnimatedSection delay={100}>
          <SectionHead title="내 수업 일정" variant="child" />
          <div className="px-4 sm:px-5">
            <ClassCalendarSection
              teamIds={teams}
              enabledClassIds={enabledClassIds}
              onSelectionChange={setSelection}
              onReady={setCalendarReady}
            />
          </div>
        </AnimatedSection>

        {selection.dateKey && (
          <AnimatedSection delay={150}>
            <SectionHead
              title={(() => {
                const d = new Date(selection.dateKey);
                return `${d.getMonth() + 1}월 ${d.getDate()}일 수업`;
              })()}
              variant="child"
            />
            <div className="px-4 sm:px-5">
              <SelectedDayClassList
                classes={selection.classes}
                scheduleIdToChildIds={scheduleIdToChildIds}
                attendanceMap={attendanceMap}
                childIdToName={childIdToName}
                selectedChildId={user?.id ?? null}
                todayKey={todayKey}
                onCheckIn={selfCheckIn}
                variant="child"
              />
            </div>
          </AnimatedSection>
        )}

        {/* 배너 — [개선 2026-05-16] variant='child' — autoplay 5000ms + indicator/카운터 18px+ WCAG AAA. */}
        <div className="px-5">
          <BannerCarousel role="CHILD" variant="child" />
        </div>

        {/* 공지사항 — [2026-05-11 Phase 2 정정] 학부모 패턴 일치: RecentNoticesSection 사용
            (자체 fetch + SectionHead 통합 + px-4 sm:px-5 내장).  외부 패딩 적용 금지.
            variant='child' — SectionHead 헤더만 WCAG AAA (18px+) 로 키우고 카드 내부는 동일. */}
        <AnimatedSection delay={300}>
          <RecentNoticesSection variant="child" />
        </AnimatedSection>

        <div className="h-4" aria-hidden="true" />
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
