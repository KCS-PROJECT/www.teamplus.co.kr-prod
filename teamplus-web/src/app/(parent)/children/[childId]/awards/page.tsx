'use client';

/**
 * Task #26 C-4 — 자녀별 수상 이력 탭 뷰 (PARENT)
 *
 * Backend:
 *   GET /api/v1/awards/player?memberId={memberId}
 *   (필요 시) GET /api/v1/awards/portfolio/:memberId
 *
 * 플로우:
 *   1) childId → children list에서 해당 자녀 → memberId(TeamMember.id) 추출
 *   2) 승인된 memberId 없으면 안내 화면
 *   3) 수상 이력 목록 + 유형 필터 + 시즌 필터
 *   4) FAB: 등록은 `/awards/create?childId=${childId}` 로 이동
 */

import { useCallback, useId, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { AwardItemCard } from '@/components/parent/AwardItemCard';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useChildren } from '@/hooks/useChildren';
import { useAwardsByMember } from '@/hooks/useAwards';
import { AWARD_TYPES } from '@/types/awards';
import { MESSAGES } from '@/lib/messages';

// [Task #8 / 2026-05-14] 수상 카드 SoT 통합 — `@/components/parent/AwardItemCard` 단일 컴포넌트로
//   선수카드 (profile-card) 와 수상 이력 페이지 UI 일관성 확보.
//   기존: 본 파일 내부 AwardListCard + AWARD_TYPE_ICON / AWARD_TYPE_BADGE_CLASS / formatDate 중복.
//   삭제 영향: 동일 유틸이 `@/components/parent/AwardItemCard` 에서 named export 됨.

export default function ChildAwardsPage() {
  const params = useParams<{ childId: string }>();
  const childId = params?.childId ?? '';
  const router = useRouter();
  const { navigate } = useNavigation();

  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const typeFilterId = useId();
  const seasonFilterId = useId();

  const { children, isLoading: isChildrenLoading } = useChildren();
  const child = useMemo(() => children.find((c) => c.id === childId), [children, childId]);
  const memberId = child?.memberId ?? null;

  const [typeFilter, setTypeFilter] = useState<string>('');
  const [seasonFilter, setSeasonFilter] = useState<string>('');

  const { awards, isLoading, errorMessage, refresh } = useAwardsByMember(memberId, {
    awardType: typeFilter || undefined,
    season: seasonFilter || undefined,
  });

  usePageReady(!isChildrenLoading && !isLoading);

  const seasons = useMemo(() => {
    const set = new Set<string>();
    awards.forEach((a) => {
      if (a.season) set.add(a.season);
    });
    // 최신 시즌이 상단에 오도록 내림차순
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [awards]);

  const handleAddNew = useCallback(() => {
    navigate(`/awards/create?childId=${encodeURIComponent(childId)}`);
  }, [navigate, childId]);

  const handleAwardClick = useCallback(
    (id: string) => {
      navigate(`/awards/${id}/edit`);
    },
    [navigate],
  );

  const title = child ? MESSAGES.awards.titleByChild(child.name) : MESSAGES.awards.titleList;

  // 자녀 로딩 중
  if (isChildrenLoading) {
    return null;
  }

  // 자녀 못 찾음
  if (!child) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={MESSAGES.awards.titleList} forceNative />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="flex items-center justify-center size-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 mb-4">
            <Icon
              name="person_off"
              className="text-3xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <p className="text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100 mb-1">
            자녀 정보를 찾을 수 없습니다.
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-6 min-h-[48px] px-5 rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-semibold text-card-body transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
          >
            {MESSAGES.common.goBack}
          </button>
        </div>
      </MobileContainer>
    );
  }

  // 팀 미승인 (memberId 없음)
  if (!memberId) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={title} forceNative />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="flex items-center justify-center size-16 rounded-w-pill bg-amber-100 dark:bg-amber-900/20 mb-4">
            <Icon
              name="info"
              className="text-3xl text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
          </div>
          <p className="text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100 mb-2">
            {MESSAGES.awards.needTeamMembership}
          </p>
          <p className="text-card-body text-wtext-3 dark:text-rink-300">
            자녀가 팀에 가입되고 승인되면 수상 이력을 등록할 수 있습니다.
          </p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={title} forceNative />

      {/* [Task #6 / 2026-05-14] 본문 하단 여백 — BottomNav(60+safe) + FAB(56) + 시각 여유 (Native WebView 마지막 카드 가림 회귀 차단).
          ↑ 5rem → 7rem 확장: 5rem(80px) 은 FAB 높이(56) + gap 만 겨우 덮어 마지막 카드가
          시각적으로 FAB 바로 위에 닿아 답답한 회귀가 발생. 7rem(112px) 로 안전 마진 확보.
          ↑ env(safe-area-inset-bottom) → var(--safe-area-inset-bottom, env(...)) 표준화 —
          Android WebView 의 env() 0px 평가 회귀 (CLAUDE.md MUST FOLLOW · SCREEN_METRICS SoT) 차단. */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 pb-[calc(72px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+7rem)]">
        <AnimatedSection delay={0}>
          <div className="mb-5 mt-2 flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20 ring-4 ring-amber-50/50 dark:ring-amber-900/10">
              <Icon name="military_tech" className="text-[24px] text-amber-500" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold text-wtext-1 dark:text-white leading-tight truncate">
                {child.name}
                <span className="text-ice-500">.</span>
              </h1>
              <p className="text-wtext-3 dark:text-rink-300 text-card-meta mt-0.5 truncate">
                {child.club ? `${child.club} · ` : ''}
                {MESSAGES.awards.countLabel(awards.length)}
              </p>
            </div>
          </div>
        </AnimatedSection>

        {/* 필터 */}
        <AnimatedSection delay={100}>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div>
              <label htmlFor={typeFilterId} className="sr-only">
                수상 유형 필터
              </label>
              <div className="relative">
                <select
                  id={typeFilterId}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="수상 유형 필터"
                  className="w-full h-11 pl-10 pr-8 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none appearance-none"
                >
                  <option value="">전체 유형</option>
                  {AWARD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MESSAGES.awards.typeLabel[t] ?? t}
                    </option>
                  ))}
                </select>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="filter_list"
                    size={16}
                    className="text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="expand_more"
                    size={16}
                    className="text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor={seasonFilterId} className="sr-only">
                시즌 필터
              </label>
              <div className="relative">
                <select
                  id={seasonFilterId}
                  value={seasonFilter}
                  onChange={(e) => setSeasonFilter(e.target.value)}
                  aria-label="시즌 필터"
                  disabled={seasons.length === 0}
                  className="w-full h-11 pl-10 pr-8 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none appearance-none disabled:opacity-60"
                >
                  <option value="">전체 시즌</option>
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="date_range"
                    size={16}
                    className="text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="expand_more"
                    size={16}
                    className="text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* 에러 */}
        {errorMessage && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 p-3 border border-red-100 dark:border-red-900/30">
            <Icon
              name="error"
              className="text-red-500 dark:text-red-400 text-xl shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-card-body font-medium text-red-700 dark:text-red-300">
                {errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 text-card-body font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              {MESSAGES.common.retry}
            </button>
          </div>
        )}

        {/* 리스트 — [Task #8] 공용 AwardItemCard 사용 (mode='page') */}
        <div className="flex flex-col gap-3">
          {isLoading ? null : awards.length > 0 ? (
            awards.map((award, index) => (
              <AnimatedSection key={award.id} delay={150 + index * 60}>
                <AwardItemCard
                  award={award}
                  mode="page"
                  onClick={(a) => handleAwardClick(a.id)}
                />
              </AnimatedSection>
            ))
          ) : (
            <AnimatedSection delay={150}>
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700">
                <div className="flex items-center justify-center size-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 mb-4">
                  <Icon
                    name="emoji_events"
                    className="text-3xl text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100 mb-1">
                  {MESSAGES.awards.noAwards}
                </p>
                <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center px-8">
                  {MESSAGES.awards.addFirst}
                </p>
              </div>
            </AnimatedSection>
          )}
        </div>
      </div>

      {/* [Task #6 / 2026-05-14] FAB 등록 버튼 — globals.css `.bottom-fab-safe` 표준 유틸 사용.
          이전: `bottom-[96px]` 고정 px (safe-area 미반영 → iOS notch / Android gesture nav 영역 침범 회귀).
          이전: `grid grid-cols-1` 불필요한 grid wrapper (단일 자식이라 의미 없음 → 단순 block 컨테이너).
          수정: `.bottom-fab-safe` (globals.css §649) — `60px + var(--safe-area-inset-bottom, env(...)) + 0.75rem` 자동 계산.
          폭: `w-full max-w-md` — MobileContainer(`--mobile-shell-width`, 448px) 와 동일 폭으로 모바일/데스크톱 일관성.
          h-14(56) / text-card-emphasis / font-bold — review·edit·payment 등 다른 페이지와 일관된 표준 사이즈. */}
      <div className="fixed bottom-fab-safe left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
        <button
          type="button"
          onClick={handleAddNew}
          className="w-full flex items-center justify-center gap-2 rounded-2xl h-14 bg-ice-500 hover:bg-ice-700 text-white font-bold text-card-emphasis shadow-md transition-colors motion-reduce:transition-none active:brightness-95"
        >
          <Icon name="add_circle" size={22} aria-hidden="true" />
          <span>수상 이력 등록</span>
        </button>
      </div>
    </MobileContainer>
  );
}
