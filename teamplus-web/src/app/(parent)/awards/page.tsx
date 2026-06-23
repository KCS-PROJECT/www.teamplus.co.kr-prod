'use client';

/**
 * Task #26 C-4 — 수상 이력 목록 (PARENT)
 *
 * 역할: 자녀 선택 → 수상 이력 조회 → 등록/수정 페이지로 이동
 *
 * 주요 변경 (2026-04-18 — Task #42 의존성 반영):
 *   - Child.memberId(TeamMember.id)를 직접 사용 (기존 clubId 버그 수정)
 *   - AwardFormModal / DeleteConfirmModal 제거 → 전용 페이지로 라우팅
 *   - /awards/create, /awards/[id]/edit 로 navigation
 *   - DELETE는 백엔드에서 ADMIN/DIRECTOR만 허용 → UI 미노출
 */

import { useId, useMemo, useState, useEffect } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { EmptySection } from '@/components/parent/EmptySection';
import { useChildren } from '@/hooks/useChildren';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useAwardsByMember } from '@/hooks/useAwards';
import { MESSAGES } from '@/lib/messages';
import type { PlayerAward } from '@/types/awards';

// ────────────────────────────────────────────
// 유형별 아이콘/배지
// ────────────────────────────────────────────
const AWARD_TYPE_ICON: Record<string, string> = {
  mvp: 'star',
  best_scorer: 'scoreboard',
  best_goalie: 'sports_hockey',
  most_improved: 'trending_up',
  sportsmanship: 'handshake',
  skill: 'workspace_premium',
  attendance: 'event_available',
  special: 'military_tech',
};

const AWARD_TYPE_BADGE_CLASS: Record<string, string> = {
  mvp: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  best_scorer: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400',
  best_goalie: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  most_improved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  sportsmanship: 'bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400',
  skill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  attendance: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  special: 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function getTypeIcon(type: string): string {
  return AWARD_TYPE_ICON[type] ?? 'emoji_events';
}

function getTypeLabel(type: string): string {
  return MESSAGES.awards.typeLabel[type] ?? type;
}

function getTypeBadgeClass(type: string): string {
  return (
    AWARD_TYPE_BADGE_CLASS[type] ??
    'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100'
  );
}

// ────────────────────────────────────────────
// 수상 카드 (클릭 시 수정 페이지로 이동)
// ────────────────────────────────────────────
function AwardListCard({
  award,
  onClick,
}: {
  award: PlayerAward;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden hover:border-ice-500/30 dark:hover:border-ice-500/40 hover:shadow-md transition-all motion-reduce:transition-none active:brightness-95"
      aria-label={`${award.awardName} 수정`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-w-pill text-card-meta font-semibold ${getTypeBadgeClass(award.awardType)}`}
          >
            <Icon name={getTypeIcon(award.awardType)} size={14} aria-hidden="true" />
            {getTypeLabel(award.awardType)}
          </span>
          <div className="flex items-center gap-1">
            {award.imageUrl && (
              <span
                className="inline-flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300"
                aria-label="수상 사진 포함"
              >
                <Icon name="image" size={13} aria-hidden="true" />
              </span>
            )}
            {award.certificateUrl && (
              <span
                className="inline-flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300"
                aria-label="상장 첨부"
              >
                <Icon name="description" size={13} aria-hidden="true" />
              </span>
            )}
            <Icon
              name="chevron_right"
              size={18}
              className="text-wtext-4 dark:text-rink-500"
              aria-hidden="true"
            />
          </div>
        </div>

        <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-1 leading-snug">
          {award.awardName}
        </h3>

        {award.description && (
          <p className="text-card-body text-wtext-3 dark:text-rink-300 mb-3 line-clamp-2">
            {award.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-card-meta text-wtext-3 dark:text-rink-300">
          <span className="flex items-center gap-1 tabular-nums">
            <Icon name="calendar_today" size={13} aria-hidden="true" />
            {formatDate(award.awardedAt)}
          </span>
          {award.season && (
            <span className="flex items-center gap-1 tabular-nums">
              <Icon name="date_range" size={13} aria-hidden="true" />
              {award.season}
            </span>
          )}
          {award.awardedBy && (
            <span className="flex items-center gap-1">
              <Icon name="person" size={13} aria-hidden="true" />
              {award.awardedBy}
            </span>
          )}
          {award.tournament && (
            <span className="flex items-center gap-1">
              <Icon name="emoji_events" size={13} aria-hidden="true" />
              {award.tournament.tournamentName ?? award.tournament.name ?? ''}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────
// 메인 페이지
// ────────────────────────────────────────────
export default function ParentAwardsPage() {
  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });
  const { navigate } = useNavigation();
  const childSelectId = useId();

  const { children: childrenList, isLoading: isChildrenLoading } = useChildren();

  // memberId가 있는(팀 가입 승인) 자녀만 필터
  const eligibleChildren = useMemo(
    () => childrenList.filter((c) => !!c.memberId),
    [childrenList],
  );

  const [selectedChildId, setSelectedChildId] = useState<string>('');

  useEffect(() => {
    if (!selectedChildId && eligibleChildren.length > 0) {
      setSelectedChildId(eligibleChildren[0].id);
    }
  }, [eligibleChildren, selectedChildId]);

  const selectedChild = useMemo(
    () => eligibleChildren.find((c) => c.id === selectedChildId),
    [eligibleChildren, selectedChildId],
  );

  const selectedMemberId = selectedChild?.memberId ?? null;

  const {
    awards,
    isLoading: isAwardsLoading,
    errorMessage: awardsError,
    refresh,
  } = useAwardsByMember(selectedMemberId);

  // 유형별 카운트 (상위 3개만 노출)
  const typeCounts = useMemo(() => {
    const counts = awards.reduce<Record<string, number>>((acc, a) => {
      acc[a.awardType] = (acc[a.awardType] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
  }, [awards]);

  const handleCreate = () => {
    const query = selectedChildId ? `?childId=${selectedChildId}` : '';
    navigate(`/awards/create${query}`);
  };

  const handleEdit = (id: string) => {
    navigate(`/awards/${id}/edit`);
  };

  const isPageLoading = isChildrenLoading;
  const hasEligibleChildren = eligibleChildren.length > 0;
  const hasAnyChildren = childrenList.length > 0;

  usePageReady(!isPageLoading);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="수상 이력" />

      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 pb-30">
        <AnimatedSection delay={0}>
          <div className="mb-5 mt-2">
            <h1 className="text-2xl font-extrabold text-wtext-1 dark:text-white leading-tight">
              수상 이력<span className="text-ice-500">.</span>
            </h1>
            <p className="text-wtext-3 dark:text-rink-300 text-card-body mt-1">
              자녀의 대회 수상 기록을 관리해보세요.
            </p>
          </div>
        </AnimatedSection>

        {/* 자녀 선택 */}
        {isPageLoading ? null : hasEligibleChildren ? (
          <AnimatedSection delay={100}>
            <div className="mb-5">
              <label
                htmlFor={childSelectId}
                className="block text-card-body font-medium text-wtext-2 dark:text-rink-100 mb-1.5"
              >
                자녀 선택
              </label>
              <div className="relative">
                <select
                  id={childSelectId}
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  aria-label="수상 이력을 조회할 자녀 선택"
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body font-medium focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none appearance-none"
                >
                  {eligibleChildren.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                      {child.club ? ` · ${child.club}` : ''}
                    </option>
                  ))}
                </select>
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="person"
                    size={18}
                    className="text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="expand_more"
                    size={18}
                    className="text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </AnimatedSection>
        ) : hasAnyChildren ? (
          // 자녀는 있지만 승인된 팀 멤버십이 없는 경우
          <AnimatedSection delay={100}>
            <div className="mb-5 flex flex-col items-center justify-center rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 py-12 px-6">
              <div className="flex items-center justify-center size-14 rounded-w-pill bg-amber-50 dark:bg-amber-900/20 mb-3">
                <Icon
                  name="group_off"
                  className="text-2xl text-amber-500 dark:text-amber-400"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1 text-center">
                {MESSAGES.awards.needTeamMembership}
              </p>
              <p className="text-card-meta text-wtext-3 dark:text-rink-300 text-center">
                팀 가입 승인 후에 수상 이력을 등록할 수 있습니다.
              </p>
            </div>
          </AnimatedSection>
        ) : (
          <AnimatedSection delay={100}>
            <EmptySection
              icon="person_off"
              message={MESSAGES.dashboard.parentDashboard.noChildData}
              className="mb-5"
            />
          </AnimatedSection>
        )}

        {/* 에러 */}
        {awardsError && (
          <div
            className="mb-4 flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 p-3 border border-red-100 dark:border-red-900/30"
            role="alert"
          >
            <Icon
              name="error"
              className="text-red-500 dark:text-red-400 text-xl shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-card-body font-medium text-red-700 dark:text-red-300">
                {awardsError}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 text-card-body font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              {MESSAGES.dashboard.errorRetry}
            </button>
          </div>
        )}

        {/* 수상 목록 */}
        {hasEligibleChildren && selectedMemberId && (
          <>
            {/* 통계 요약 */}
            {!isAwardsLoading && awards.length > 0 && (
              <AnimatedSection delay={150}>
                <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 shadow-sm p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center size-9 rounded-w-pill bg-amber-50 dark:bg-amber-900/20">
                        <Icon
                          name="emoji_events"
                          size={18}
                          className="text-amber-500"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                          총 수상 이력
                        </p>
                        <p className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums">
                          {MESSAGES.awards.countLabel(awards.length)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {typeCounts.map(([type, count]) => (
                        <span
                          key={type}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded-w-pill bg-wline-2 dark:bg-rink-700 text-card-meta text-wtext-2 dark:text-rink-100 tabular-nums"
                        >
                          <Icon name={getTypeIcon(type)} size={12} aria-hidden="true" />
                          {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            )}

            {/* 카드 리스트 */}
            <div className="flex flex-col gap-3">
              {isAwardsLoading ? null : awards.length > 0 ? (
                awards.map((award, index) => (
                  <AnimatedSection key={award.id} delay={200 + index * 80}>
                    <AwardListCard
                      award={award}
                      onClick={() => handleEdit(award.id)}
                    />
                  </AnimatedSection>
                ))
              ) : (
                <AnimatedSection delay={200}>
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
          </>
        )}
      </div>

      {/* FAB — 등록 페이지로 이동 */}
      {hasEligibleChildren && selectedMemberId && (
        <div className="fixed bottom-[96px] left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
          <button
            type="button"
            onClick={handleCreate}
            className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-2xl bg-ice-500 hover:bg-ice-700 text-white font-bold text-card-emphasis shadow-md transition-colors motion-reduce:transition-none active:brightness-95"
            aria-label="수상 이력 등록하기"
          >
            <Icon name="add_circle" size={22} aria-hidden="true" />
            <span>수상 이력 등록하기</span>
          </button>
        </div>
      )}
    </MobileContainer>
  );
}
