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

// [ICETIMES] 유형 배지 — 2색(blue+ink) 절제. 모든 유형을 it-blue 톤으로 통일하되
//  트로피/날짜/제목 hairline 행 구조에서 유형은 it-blue-50 배경 + it-blue-600 글자로 표기.
const AWARD_TYPE_BADGE_CLASS: Record<string, string> = {
  mvp: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  best_scorer: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  best_goalie: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  most_improved: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  sportsmanship: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  skill: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  attendance: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
  special: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
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
    'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100'
  );
}

// ────────────────────────────────────────────
// 수상 행 (클릭 시 수정 페이지로 이동)
// [ICETIMES flat] 카드 박스 제거 → hairline 행: 트로피 아이콘 박스 + 제목/유형/날짜.
//   부모 흰 섹션(bg-it-surface)이 배경을 담당하고, 각 행은 border-b border-it-line 으로 구분.
// ────────────────────────────────────────────
function AwardListRow({
  award,
  onClick,
  divider,
}: {
  award: PlayerAward;
  onClick: () => void;
  divider: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-5 py-4 transition-colors motion-reduce:transition-none active:bg-it-fill dark:active:bg-rink-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40 ${
        divider ? 'border-b border-it-line dark:border-it-blue-900' : ''
      }`}
      aria-label={`${award.awardName} 수정`}
    >
      {/* 트로피 아이콘 박스 — [시안] 38×38 r10 / it-fill / border 1px it-line */}
      <span className="w-[38px] h-[38px] shrink-0 grid place-items-center rounded-[10px] bg-it-fill dark:bg-rink-900 border border-it-line dark:border-it-blue-900 text-it-blue-500">
        <Icon name={getTypeIcon(award.awardType)} size={18} aria-hidden="true" />
      </span>

      <span className="flex-1 min-w-0">
        {/* 유형 배지 + 첨부 표시 */}
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-w-pill text-[11px] font-bold ${getTypeBadgeClass(award.awardType)}`}
          >
            {getTypeLabel(award.awardType)}
          </span>
          {award.imageUrl && (
            <Icon
              name="image"
              size={13}
              className="text-it-ink-400 dark:text-rink-300"
              aria-label="수상 사진 포함"
            />
          )}
          {award.certificateUrl && (
            <Icon
              name="description"
              size={13}
              className="text-it-ink-400 dark:text-rink-300"
              aria-label="상장 첨부"
            />
          )}
        </span>

        {/* 제목 — [시안] 15.5/700 */}
        <span className="block mt-1.5 text-[15.5px] font-bold text-it-ink-900 dark:text-white tracking-[-0.01em] leading-snug">
          {award.awardName}
        </span>

        {award.description && (
          <span className="block mt-0.5 text-[13px] font-medium text-it-ink-500 dark:text-rink-300 line-clamp-1">
            {award.description}
          </span>
        )}

        {/* 메타 — 날짜/시즌/수여기관/대회 */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-card-meta text-it-ink-500 dark:text-rink-300">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Icon name="calendar_today" size={12} aria-hidden="true" />
            {formatDate(award.awardedAt)}
          </span>
          {award.season && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon name="date_range" size={12} aria-hidden="true" />
              {award.season}
            </span>
          )}
          {award.awardedBy && (
            <span className="inline-flex items-center gap-1">
              <Icon name="person" size={12} aria-hidden="true" />
              {award.awardedBy}
            </span>
          )}
          {award.tournament && (
            <span className="inline-flex items-center gap-1">
              <Icon name="emoji_events" size={12} aria-hidden="true" />
              {award.tournament.tournamentName ?? award.tournament.name ?? ''}
            </span>
          )}
        </span>
      </span>

      {/* chevron */}
      <Icon
        name="chevron_right"
        size={18}
        className="shrink-0 mt-1 text-it-ink-300 dark:text-rink-500"
        aria-hidden="true"
      />
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

      {/* [ICETIMES flat] main = 회색 캔버스 · 콘텐츠는 full-bleed 흰 섹션을 8px 회색 갭으로 쌓는다. */}
      <div className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30">
        {/* 타이틀 — 흰 섹션 */}
        <AnimatedSection delay={0}>
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-6 pb-5">
            <h1 className="text-2xl font-extrabold text-it-ink-900 dark:text-white leading-tight">
              수상 이력<span className="text-it-blue-500">.</span>
            </h1>
            <p className="text-it-ink-500 dark:text-rink-300 text-card-body mt-1">
              자녀의 대회 수상 기록을 관리해보세요.
            </p>
          </section>
        </AnimatedSection>

        {/* 자녀 선택 — 흰 섹션 */}
        {isPageLoading ? null : hasEligibleChildren ? (
          <AnimatedSection delay={100}>
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
              <label
                htmlFor={childSelectId}
                className="block text-card-body font-bold text-it-ink-800 dark:text-rink-100 mb-1.5"
              >
                자녀 선택
              </label>
              <div className="relative">
                <select
                  id={childSelectId}
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  aria-label="수상 이력을 조회할 자녀 선택"
                  className="w-full h-12 pl-11 pr-10 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-it-ink-800 dark:text-white text-card-body font-medium focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none appearance-none"
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
                    className="text-it-ink-400 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon
                    name="expand_more"
                    size={18}
                    className="text-it-ink-400 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </section>
          </AnimatedSection>
        ) : hasAnyChildren ? (
          // 자녀는 있지만 승인된 팀 멤버십이 없는 경우 — 흰 섹션 내 빈 상태
          <AnimatedSection delay={100}>
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 flex flex-col items-center justify-center py-12 px-6">
              <div className="flex items-center justify-center size-14 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15 mb-3">
                <Icon
                  name="group_off"
                  className="text-2xl text-it-blue-500"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-semibold text-it-ink-800 dark:text-rink-100 mb-1 text-center">
                {MESSAGES.awards.needTeamMembership}
              </p>
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300 text-center">
                팀 가입 승인 후에 수상 이력을 등록할 수 있습니다.
              </p>
            </section>
          </AnimatedSection>
        ) : (
          <AnimatedSection delay={100}>
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-3">
              <EmptySection
                icon="person_off"
                message={MESSAGES.dashboard.parentDashboard.noChildData}
              />
            </section>
          </AnimatedSection>
        )}

        {/* 에러 */}
        {awardsError && (
          <div
            className="mx-5 mt-2 flex items-center gap-3 rounded-w-md bg-it-red-500/10 p-3 border-[1.5px] border-it-red-500/30"
            role="alert"
          >
            <Icon
              name="error"
              className="text-it-red-500 text-xl shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-card-body font-medium text-it-red-500">
                {awardsError}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 text-card-body font-semibold text-it-red-500 hover:underline"
            >
              {MESSAGES.dashboard.errorRetry}
            </button>
          </div>
        )}

        {/* 수상 목록 */}
        {hasEligibleChildren && selectedMemberId && (
          <>
            {/* 통계 요약 — 흰 섹션 (hairline 행) */}
            {!isAwardsLoading && awards.length > 0 && (
              <AnimatedSection delay={150}>
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center size-9 rounded-[10px] bg-it-blue-50 dark:bg-it-blue-500/15 border border-it-line dark:border-it-blue-900">
                        <Icon
                          name="emoji_events"
                          size={18}
                          className="text-it-blue-500"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                          총 수상 이력
                        </p>
                        <p className="text-card-title font-bold text-it-ink-900 dark:text-white tabular-nums">
                          {MESSAGES.awards.countLabel(awards.length)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {typeCounts.map(([type, count]) => (
                        <span
                          key={type}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded-w-pill bg-it-fill dark:bg-rink-700 text-card-meta text-it-ink-600 dark:text-rink-100 tabular-nums"
                        >
                          <Icon name={getTypeIcon(type)} size={12} aria-hidden="true" />
                          {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              </AnimatedSection>
            )}

            {/* 행 리스트 — 흰 섹션 내 hairline 행 */}
            {isAwardsLoading ? null : awards.length > 0 ? (
              <AnimatedSection delay={200}>
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
                  {awards.map((award, index) => (
                    <AwardListRow
                      key={award.id}
                      award={award}
                      onClick={() => handleEdit(award.id)}
                      divider={index < awards.length - 1}
                    />
                  ))}
                </section>
              </AnimatedSection>
            ) : (
              <AnimatedSection delay={200}>
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950 flex flex-col items-center justify-center py-16">
                  <div className="flex items-center justify-center size-16 rounded-w-pill bg-it-fill dark:bg-rink-700 mb-4">
                    <Icon
                      name="emoji_events"
                      className="text-3xl text-it-ink-400 dark:text-rink-300"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-card-emphasis font-semibold text-it-ink-800 dark:text-rink-100 mb-1">
                    {MESSAGES.awards.noAwards}
                  </p>
                  <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center px-8">
                    {MESSAGES.awards.addFirst}
                  </p>
                </section>
              </AnimatedSection>
            )}
          </>
        )}
      </div>

      {/* FAB — 등록 페이지로 이동 */}
      {hasEligibleChildren && selectedMemberId && (
        <div className="fixed bottom-[96px] left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
          <button
            type="button"
            onClick={handleCreate}
            className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold text-card-emphasis shadow-sh-blue transition-colors motion-reduce:transition-none active:brightness-95"
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
