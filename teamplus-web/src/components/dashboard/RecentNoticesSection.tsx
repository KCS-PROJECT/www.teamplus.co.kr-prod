'use client';

/**
 * RecentNoticesSection — 대시보드 공지 영역 (공지사항 / 팀공지 2탭)
 *  - 탭 A "공지사항"(scope=service, 전역 서비스 공지) / 탭 B "팀공지"(scope=team, 소속·자녀 경유 팀 공지)
 *  - GET /notices?scope=<service|team>&limit=5 — 활성 탭 lazy 로드 + 탭별 캐시(중복 요청 방지)
 *  - 학부모 자녀 변경 시 팀공지 탭 자동 전환 + 해당 자녀 팀 기준 재조회(초기 establishment/자녀0명 제외)
 *  - 핀고정 우선, 최신순 정렬, 상위 5건 미리보기
 *  - "전체보기" → 활성 탭별 경로(service→serviceViewAllHref, team→viewAllHref)
 *  - iceTheme(ICETIMES flat) / 기본 카드 / variant='child'(WCAG AAA) 3원 스타일
 *  - DESIGN.md Pattern B 카드 (wsurface · sh-1 · ice-500)
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import {
  AnimatedTabIndicator,
  useAnimatedTabIndicator,
} from '@/components/ui/AnimatedTabIndicator';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { useSelectedChild } from '@/contexts/SelectedChildContext';

/** 공지 탭 scope — service(전역 서비스 공지) / team(소속·자녀 경유 팀 공지). */
type NoticeScope = 'service' | 'team';

interface NoticeItem {
  id: string;
  title: string;
  type?: string | null;
  isPinned?: boolean;
  createdAt: string;
}

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiDataWrapper<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

/** 응답 payload → 핀고정 우선 + 최신순 상위 5건. (배열 / `.notices` 폴백 대응) */
function toNoticeList(payload: NoticeItem[] | { notices?: NoticeItem[] } | null): NoticeItem[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { notices?: NoticeItem[] })?.notices)
      ? (payload as { notices: NoticeItem[] }).notices
      : [];
  // 핀고정 우선 + 최신순
  const sorted = [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  // [2026-06-09] 대시보드 공지 노출 3 → 5개.
  return sorted.slice(0, 5);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    : d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  EVENT: { label: '이벤트', cls: 'bg-sun-100 text-rink-800' },
  URGENT: { label: '긴급', cls: 'bg-flame-100 text-flame-500' },
  INFO: { label: '안내', cls: 'bg-ice-50 text-ice-700' },
};

/** 탭 순서 — "팀공지, 공지사항". 키보드 이동/roving tabindex 기준. */
const SCOPES: readonly NoticeScope[] = ['team', 'service'] as const;

interface RecentNoticesSectionProps {
  /**
   * [하위호환·미사용] 과거 단일 헤더 타이틀. 2탭 헤더가 시각적 타이틀을 대체하므로 더 이상 렌더하지 않음.
   *  호출부(parent 등)가 계속 전달해도 무해하도록 prop 은 수용만 하고 무시한다.
   */
  title?: string;
  /**
   * "팀공지" 탭의 "전체보기" 이동 경로. 기본 /team-notices(조회 전용).
   * 작성/수정/삭제 권한 역할(감독·코치·오픈클래스)은 관리 페이지 /director-notices 를 전달.
   */
  viewAllHref?: string;
  /**
   * "공지사항"(service) 탭의 "전체보기" 이동 경로. 기본 /notices(서비스 공지 목록).
   */
  serviceViewAllHref?: string;
  /**
   * [2026-05-11 Phase 2] CHILD 페이지 가독성 보강 — 탭 라벨/터치 영역을 WCAG AAA 로 확대.
   *  카드 내부 행은 동일 (학부모와 일관성 유지 — 사용자 의도: "디자인 그대로, 헤더 글씨만 크게").
   */
  variant?: 'default' | 'child';
  /**
   * 공지 작성 진입 콜백. 전달 시 **팀공지 탭에서만** "공지 작성하기" 버튼 노출.
   *  (서비스 공지는 admin 전용 작성이므로 공지사항 탭에서는 미노출.)
   *  작성 권한 있는 역할(감독/코치)의 대시보드에서만 전달 — 학부모/child 는 미전달.
   */
  onCreateNotice?: () => void;
  /**
   * [ICETIMES Phase 2b] ICETIMES flat 테마. 기본 false = 기존 카드 스타일 그대로.
   *   true 시 카드 shadow 제거 + flat it-surface/it-line, 밑줄형 탭·행 강조 it 톤 적용.
   */
  iceTheme?: boolean;
  /** 초기 활성 탭. 기본 'team'(탭 순서 "팀공지, 공지사항"). */
  defaultTab?: NoticeScope;
}

export function RecentNoticesSection({
  viewAllHref = '/team-notices',
  serviceViewAllHref = '/notices',
  variant = 'default',
  onCreateNotice,
  iceTheme = false,
  defaultTab = 'team',
}: RecentNoticesSectionProps = {}) {
  const { navigate } = useNavigation();
  const { selectedChildId } = useSelectedChild();
  const isChild = variant === 'child';

  // [P3-1] 인스턴스 고유 prefix — 한 페이지에 이 컴포넌트가 2개 이상 렌더돼도 element id/aria 참조 충돌 방지.
  const uid = useId();
  const tabId = useCallback((scope: NoticeScope) => `${uid}-notice-tab-${scope}`, [uid]);
  const panelId = useCallback((scope: NoticeScope) => `${uid}-notice-panel-${scope}`, [uid]);

  const [activeTab, setActiveTab] = useState<NoticeScope>(defaultTab);
  const [data, setData] = useState<Record<NoticeScope, NoticeItem[]>>({ service: [], team: [] });
  const [loading, setLoading] = useState<Record<NoticeScope, boolean>>({ service: false, team: false });
  const [loaded, setLoaded] = useState<Record<NoticeScope, boolean>>({ service: false, team: false });

  // scope별 최신 요청 카운터 — 언마운트/빠른 자녀 연속 변경(E5) 레이스 시 오래된 응답 무시.
  const reqCounters = useRef<Record<NoticeScope, number>>({ service: 0, team: 0 });
  // team 데이터가 어떤 selectedChildId 기준인지(캐시 무효화 키).
  const teamChildKeyRef = useRef<string | null>(null);
  // 자녀 변경 감지용 직전값 — null(자녀0명/establishment)/동일값 전이는 자동전환 제외.
  const prevChildIdRef = useRef<string | null>(null);
  // defaultTab 첫 로드 완료 여부 — 초기(페이지 로더 커버) null vs 지연 로드 스켈레톤 구분.
  const initialLoadDoneRef = useRef(false);

  // 공통 fetch — 활성 scope 데이터 로드(핀고정/최신순/상위5). team 만 childId 전송(service 는 자녀 무관 전역).
  const loadScope = useCallback(
    async (scope: NoticeScope) => {
      const reqId = ++reqCounters.current[scope];
      setLoading((prev) => (prev[scope] ? prev : { ...prev, [scope]: true }));

      let list: NoticeItem[] = [];
      try {
        const res = await api.get<NoticeItem[] | { notices?: NoticeItem[] } | ApiDataWrapper<NoticeItem[] | { notices?: NoticeItem[] }>>(
          '/notices',
          {
            params: {
              limit: 5,
              page: 1,
              isActive: true,
              scope,
              // team 만 선택 자녀 소속 팀 필터(null=자녀0명 시 미전송, 백엔드 폴백). service 는 childId 미전송.
              ...(scope === 'team' && selectedChildId ? { childId: selectedChildId } : {}),
            },
            retry: false,
          },
        );
        const payload = res.success ? unwrap<NoticeItem[] | { notices?: NoticeItem[] }>(res.data) : null;
        list = toNoticeList(payload);
      } catch {
        // retry:false — 실패 시 graceful 빈 목록(빈 상태 카드). service/team 독립.
        list = [];
      }

      // 최신 요청만 반영 — 오래된 응답 폐기(자녀 빠른 변경/언마운트 가드).
      if (reqId !== reqCounters.current[scope]) return;

      if (scope === 'team') teamChildKeyRef.current = selectedChildId;
      setData((prev) => ({ ...prev, [scope]: list }));
      setLoaded((prev) => (prev[scope] ? prev : { ...prev, [scope]: true }));
      setLoading((prev) => ({ ...prev, [scope]: false }));
      if (scope === defaultTab) initialLoadDoneRef.current = true;
    },
    [selectedChildId, defaultTab],
  );

  // 자녀 변경 → 팀공지 탭 자동 전환 + team 캐시 무효화(초기 establishment·null 전이 제외).
  //  · prev==null(자녀0명/최초 establishment) 또는 next==null(로그아웃 등) → 전환 안 함.
  //  · prev·next 모두 실제 자녀이며 상이 → 사용자 자녀 스위칭으로 판단(원문 "자녀 변경 시 팀공지").
  //  · service 캐시는 자녀 무관하므로 유지(재요청 없음 — E6).
  useEffect(() => {
    const prev = prevChildIdRef.current;
    prevChildIdRef.current = selectedChildId;
    if (prev == null || selectedChildId == null || prev === selectedChildId) return;
    setActiveTab('team');
    setData((p) => (p.team.length ? { ...p, team: [] } : p));
    setLoaded((p) => (p.team ? { ...p, team: false } : p));
  }, [selectedChildId]);

  // 활성 탭 lazy 로드 — 최초/전환/자녀변경 후 필요한 scope 만 fetch(캐시 있으면 재요청 0).
  //  team 은 캐시가 다른 자녀 기준이면(teamChildKey 불일치) 재조회.
  useEffect(() => {
    const scope = activeTab;
    const staleTeam = scope === 'team' && teamChildKeyRef.current !== selectedChildId;
    if ((!loaded[scope] || staleTeam) && !loading[scope]) {
      void loadScope(scope);
    }
  }, [activeTab, loaded, loading, selectedChildId, loadScope]);

  // [P3-4] 언마운트 후 setState 억제 — SPEC §3.2.3-5 "cancelled 플래그" 의도.
  //  cleanup 에서 양 scope reqCounter 를 증가시켜 in-flight 응답의 reqId!==counter → setData/setLoading 스킵.
  //  (React 18/19 언마운트 후 setState 는 no-op 이지만, 형식적 부합 + 향후 동작 변화 대비 명시.)
  useEffect(() => {
    const counters = reqCounters.current;
    return () => {
      counters.service += 1;
      counters.team += 1;
    };
  }, []);

  const activeViewAllHref = activeTab === 'service' ? serviceViewAllHref : viewAllHref;

  // 밑줄 슬라이드 인디케이터 — 활성 탭 위치 측정(공용 훅, 외부 의존성 0).
  const { registerTab, containerRef, indicatorStyle, ready } = useAnimatedTabIndicator({
    activeValue: activeTab,
  });

  // 탭 버튼 ref — 인디케이터 등록 + 키보드 포커스 이동(roving tabindex)용. registerTab 은 안정적(hook 내 []).
  const tabRefs = useRef<Record<NoticeScope, HTMLButtonElement | null>>({ service: null, team: null });
  const tabRefCallbacks = useMemo(() => {
    const make = (scope: NoticeScope) => (el: HTMLButtonElement | null) => {
      registerTab(scope)(el);
      tabRefs.current[scope] = el;
    };
    return { service: make('service'), team: make('team') } as Record<NoticeScope, (el: HTMLButtonElement | null) => void>;
  }, [registerTab]);

  const handleTabSelect = useCallback((scope: NoticeScope) => {
    setActiveTab(scope);
  }, []);

  // ←/→ 탭 이동, Home/End 처음/끝(자동 활성화 + 포커스 이동). Enter/Space 는 버튼 기본 동작.
  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const { key } = e;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
      e.preventDefault();
      const current = SCOPES.indexOf(activeTab);
      let next = current;
      if (key === 'ArrowLeft') next = (current - 1 + SCOPES.length) % SCOPES.length;
      else if (key === 'ArrowRight') next = (current + 1) % SCOPES.length;
      else if (key === 'Home') next = 0;
      else next = SCOPES.length - 1;
      const nextScope = SCOPES[next];
      handleTabSelect(nextScope);
      tabRefs.current[nextScope]?.focus();
    },
    [activeTab, handleTabSelect],
  );

  const activeList = data[activeTab];
  const activeLoading = loading[activeTab];
  const isInitialDefaultLoad = !initialLoadDoneRef.current && activeTab === defaultTab;

  // 본문 상태 — initial(페이지 로더 커버, null) / skeleton(지연 로드) / empty / list.
  const bodyState: 'initial' | 'skeleton' | 'empty' | 'list' =
    activeLoading && activeList.length === 0
      ? isInitialDefaultLoad
        ? 'initial'
        : 'skeleton'
      : activeList.length === 0
        ? 'empty'
        : 'list';

  const showCreate = !!onCreateNotice && activeTab === 'team' && (bodyState === 'empty' || bodyState === 'list');

  // [P3-3] 포커스 가능한 자식(공지 행/작성 버튼)이 없을 때만 tabpanel 자체를 포커서블(=키보드 도달) 처리.
  //  list 또는 작성버튼 노출 시엔 이미 포커스 대상이 있으므로 불필요(중복 탭 스톱 방지).
  const panelFocusable = !(bodyState === 'list' || showCreate);

  const Wrapper = iceTheme ? 'section' : 'div';
  return (
    <Wrapper className={cn(iceTheme && 'mt-2 bg-it-surface dark:bg-it-blue-950')}>
      {/* 탭 헤더 — 밑줄형(SegmentedTabs) 2탭 + 우측 전체보기. SectionHead(단일 타이틀)를 대체. */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-[18px]">
        <div className="relative flex items-end justify-between gap-3">
          <div
            ref={containerRef}
            role="tablist"
            aria-label={MESSAGES.dashboard.noticeTabsAria}
            aria-orientation="horizontal"
            className="relative flex items-end gap-5"
          >
            {SCOPES.map((scope) => {
              const active = scope === activeTab;
              return (
                <button
                  key={scope}
                  ref={tabRefCallbacks[scope]}
                  type="button"
                  role="tab"
                  id={tabId(scope)}
                  aria-selected={active}
                  // [P3-2] 활성 탭만 aria-controls 부여 — 단일 패널 렌더(SPEC §5.0 "활성 탭 데이터 기준")에 맞춰
                  //  비활성 탭의 dangling IDREF(미존재 패널 참조) 제거. (aria-controls 는 tabs 패턴상 선택 속성.)
                  aria-controls={active ? panelId(scope) : undefined}
                  tabIndex={active ? 0 : -1}
                  onClick={() => handleTabSelect(scope)}
                  onKeyDown={handleTabKeyDown}
                  className={cn(
                    'relative shrink-0 bg-transparent border-0 p-0 pb-2.5 whitespace-nowrap',
                    'outline-none focus-visible:outline-none transition-colors duration-150 motion-reduce:transition-none',
                    isChild && 'min-h-[48px] px-1 flex items-center',
                    // 라벨 크기 — child 18px+ 강제(WCAG AAA), ice/기본 15px.
                    isChild ? 'text-[18px]' : iceTheme ? 'text-[15px] tracking-[-0.01em]' : 'text-[15px]',
                    // 활성/비활성 색·굵기.
                    active
                      ? isChild
                        ? 'text-wtext-1 dark:text-white font-black'
                        : iceTheme
                          ? 'text-it-ink-800 dark:text-white font-extrabold'
                          : 'text-wtext-1 dark:text-white font-extrabold'
                      : isChild
                        ? // child: 활성/비활성 모두 근검정(7:1↑) — 밑줄 바 + 굵기 차이로만 구분.
                          'text-wtext-1 dark:text-white font-bold'
                        : iceTheme
                          ? 'text-it-ink-400 dark:text-it-ink-300 font-extrabold hover:text-it-blue-500 dark:hover:text-it-blue-300'
                          : 'text-wtext-3 dark:text-rink-300 font-bold hover:text-ice-500',
                  )}
                >
                  {MESSAGES.dashboard.noticeTabs[scope]}
                </button>
              );
            })}
            {/* 슬라이딩 밑줄 — 활성 탭 하단(2px, child 3px). 세로 pipe 아님(RULE-D04 준수). */}
            <AnimatedTabIndicator style={indicatorStyle} ready={ready} className="flex items-end">
              <span
                className={cn(
                  'block w-full rounded-full',
                  isChild ? 'h-[3px]' : 'h-[2px]',
                  iceTheme ? 'bg-it-blue-500' : 'bg-ice-500',
                )}
              />
            </AnimatedTabIndicator>
          </div>

          {/* 전체보기 — 활성 탭별 경로. iceTheme action(꺾쇠 텍스트 제거 + chevron 아이콘) 준용. */}
          <button
            type="button"
            onClick={() => navigate(activeViewAllHref)}
            aria-label={`${MESSAGES.dashboard.noticeTabs[activeTab]} ${MESSAGES.dashboard.viewAll}`}
            className={cn(
              'shrink-0 inline-flex items-center gap-px bg-transparent border-0 p-0 pb-2.5 whitespace-nowrap',
              isChild
                ? 'text-card-body font-bold text-wtext-3 dark:text-rink-300'
                : iceTheme
                  ? 'text-[13px] font-semibold text-it-ink-500 dark:text-it-ink-300'
                  : 'text-[12px] font-semibold text-wtext-3 dark:text-rink-300',
            )}
          >
            {MESSAGES.dashboard.viewAll}
            <Icon
              name="chevron_right"
              className={cn(
                'leading-none',
                isChild ? 'text-[18px]' : 'text-[16px]',
                iceTheme ? 'text-it-ink-400 dark:text-it-ink-300' : 'text-wtext-3 dark:text-rink-300',
              )}
              aria-hidden="true"
            />
          </button>
        </div>
        {/* 밑줄 트랙 baseline(iceTheme flat 전용 hairline). */}
        {iceTheme && <div aria-hidden="true" className="border-b border-it-line dark:border-it-blue-800" />}
      </div>

      {/* 본문 패널 — 활성 탭 데이터 기준. 카드 박스/행 렌더는 기존 로직 재사용. */}
      <div
        role="tabpanel"
        id={panelId(activeTab)}
        aria-labelledby={tabId(activeTab)}
        tabIndex={panelFocusable ? 0 : undefined}
        className={cn(iceTheme ? '' : 'px-4 sm:px-5')}
      >
        <div className={cn(
          iceTheme
            ? ''
            : 'rounded-w-xl border overflow-hidden bg-wsurface dark:bg-rink-800 shadow-sh-1 border-wline dark:border-rink-700',
        )}>
          {bodyState === 'initial' ? null : bodyState === 'skeleton' ? (
            // 지연 로드(두 번째 탭/자녀변경 재fetch) — 인라인 스켈레톤 3행. 페이지 로더는 잡지 않음.
            <ul className={cn(
              'divide-y',
              iceTheme ? 'divide-it-line dark:divide-it-blue-800' : 'divide-wline-2 dark:divide-rink-700',
            )} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="px-5 py-3 flex items-center gap-2.5">
                  <span className={cn(
                    'h-4 w-4 shrink-0 rounded-full animate-pulse motion-reduce:animate-none',
                    iceTheme ? 'bg-it-fill dark:bg-it-blue-900' : 'bg-wline-2 dark:bg-rink-700',
                  )} />
                  <span className={cn(
                    'h-4 min-w-0 flex-1 rounded animate-pulse motion-reduce:animate-none',
                    iceTheme ? 'bg-it-fill dark:bg-it-blue-900' : 'bg-wline-2 dark:bg-rink-700',
                  )} />
                  <span className={cn(
                    'h-3 w-10 shrink-0 rounded animate-pulse motion-reduce:animate-none',
                    iceTheme ? 'bg-it-fill dark:bg-it-blue-900' : 'bg-wline-2 dark:bg-rink-700',
                  )} />
                </li>
              ))}
            </ul>
          ) : bodyState === 'empty' ? (
            <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
              <div className={cn(
                'flex h-11 w-11 items-center justify-center rounded-w-pill',
                iceTheme ? 'bg-it-fill dark:bg-it-blue-900' : 'bg-wline-2 dark:bg-rink-700',
              )}>
                <Icon name="campaign" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
              </div>
              <p className={cn(
                'font-semibold text-wtext-2 dark:text-rink-100',
                isChild ? 'text-card-body' : 'text-card-title',
              )}>
                {MESSAGES.dashboard.noticeEmpty[activeTab]}
              </p>
            </div>
          ) : (
            <ul className={cn(
              'divide-y',
              iceTheme ? 'divide-it-line dark:divide-it-blue-800' : 'divide-wline-2 dark:divide-rink-700',
            )}>
              {activeList.map((n) => {
                const badge = n.type ? TYPE_BADGE[n.type.toUpperCase()] : undefined;
                return (
                  <li key={n.id}>
                    {/* 1줄 레이아웃 — [아이콘][배지][제목 flex-1 truncate][날짜 우측][chevron].
                         날짜를 우측 정렬해 한 줄에 표시(카드 전체가 클릭 영역). */}
                    <button
                      type="button"
                      onClick={() => navigate(`/notice/${n.id}`)}
                      className={cn(
                        'w-full px-5 py-3 flex items-center gap-2.5 text-left transition-colors duration-150 motion-reduce:transition-none',
                        iceTheme ? 'hover:bg-it-fill dark:hover:bg-it-blue-900' : 'hover:bg-wline-2 dark:hover:bg-rink-700',
                      )}
                    >
                      {n.isPinned ? (
                        <Icon
                          name="push_pin"
                          className={cn('text-[16px] shrink-0', iceTheme ? 'text-it-red-500' : 'text-flame-500')}
                          aria-label="고정"
                        />
                      ) : (
                        <Icon
                          name="campaign"
                          className={cn('text-[16px] shrink-0', iceTheme ? 'text-it-blue-500' : 'text-ice-500')}
                          aria-hidden="true"
                        />
                      )}
                      {badge && (
                        <span className={cn('shrink-0 rounded-w-pill px-2 py-0.5 text-card-meta font-extrabold', badge.cls)}>
                          {badge.label}
                        </span>
                      )}
                      {/* 제목 — 시안 ListRow title(15.5px/700/it-ink-800)은 iceTheme=true 유지. false는 기존 그대로. */}
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          iceTheme
                            ? 'text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white'
                            : 'text-card-title font-semibold text-wtext-1 dark:text-white',
                        )}
                      >
                        {n.title}
                      </p>
                      {/* 날짜 — 우측 1줄(기존 formatDate 절대날짜). */}
                      <span
                        className={cn(
                          'shrink-0 font-num tabular-nums',
                          iceTheme
                            ? 'text-[12px] text-it-ink-400 dark:text-it-ink-300'
                            : 'text-card-meta text-wtext-3 dark:text-rink-300',
                        )}
                      >
                        {formatDate(n.createdAt)}
                      </span>
                      <Icon
                        name="chevron_right"
                        className={cn(
                          // [ICETIMES 시안 2026-07-18] 날짜↔chevron 시각 간격 3px — 시안 margin-left:-7px 보정.
                          'shrink-0 text-[18px] -ml-[7px]',
                          iceTheme ? 'text-it-ink-300 dark:text-it-ink-400' : 'text-wtext-4 dark:text-rink-500',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {showCreate &&
            (iceTheme ? (
              /* ICETIMES: 시안 secondary 버튼(outline) — 투명 배경 + it-line-strong 테두리 + blue 텍스트. */
              <div className="px-5 pt-3.5 pb-4">
                <button
                  type="button"
                  onClick={onCreateNotice}
                  className="w-full flex items-center justify-center gap-1.5 rounded-w-lg border-[1.5px] border-it-line-strong dark:border-it-blue-800 bg-transparent px-5 py-3 text-card-body font-bold text-it-blue-500 dark:text-it-blue-300 transition-colors duration-150 motion-reduce:transition-none hover:bg-it-blue-500/5 dark:hover:bg-it-blue-500/10 active:brightness-95"
                  aria-label={MESSAGES.director2.composeNotice}
                >
                  <Icon name="edit" className="text-[18px]" aria-hidden="true" />
                  {MESSAGES.director2.composeNotice}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onCreateNotice}
                className="w-full flex items-center justify-center gap-1.5 border-t border-wline-2 dark:border-rink-700 px-5 py-3.5 text-card-body font-extrabold text-ice-500 hover:bg-ice-500/5 dark:hover:bg-ice-500/10 transition-colors duration-150 motion-reduce:transition-none"
                aria-label={MESSAGES.director2.composeNotice}
              >
                <Icon name="edit" className="text-[18px]" aria-hidden="true" />
                {MESSAGES.director2.composeNotice}
              </button>
            ))}
        </div>
      </div>
    </Wrapper>
  );
}
