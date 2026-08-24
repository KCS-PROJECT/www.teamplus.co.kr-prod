'use client';

// 감독·코치 통합 공지함 (embedded 콘텐츠) — [Phase 2] 팀 축 편입.
//   /director-notices "팀 공지" 탭(axis='team') · "훈련·대회" 탭(axis='unit' 기본)에 삽입 —
//   컨테이너·AppBar·탭 바는 부모 페이지 소유.
//   행: 대상 칩(팀/수업/대회 이름) + 상태 배지 + 제목 + 읽음 N/M → 클릭 시 /community-notice/[id].
//   설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md §6·§7

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { usePageReady } from '@/hooks/usePageReady';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';
import { ActionSheet } from '@/components/director/ActionSheet';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SheetSelectRow } from '@/components/notice/SheetSelectRow';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import {
  deleteUnitNotice,
  fetchManagedUnitNotices,
  type UnitNoticePost,
} from '@/services/community-notice.service';
import { getTrainingTypeBadgeClass } from '@/lib/class-categories';

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

type PostAxis = 'team' | 'class' | 'tournament';

function postAxis(post: UnitNoticePost): PostAxis {
  if (post.teamId) return 'team';
  if (post.targetClassId) return 'class';
  return 'tournament';
}

function axisChipLabel(axis: PostAxis): string {
  if (axis === 'team') return MESSAGES.unitNotice.teamChip;
  if (axis === 'class') return MESSAGES.unitNotice.classChip;
  return MESSAGES.unitNotice.tournamentChip;
}

/**
 * 단위 카탈로그 — 단위 필터 후보와 단위별 상태(게시 중/만료) 존재 여부의 SoT.
 * statusFilter='all' 응답 스냅샷으로만 갱신한다 — 상태 필터를 바꿔 재조회해도
 * 단위 후보가 출렁이지 않고, 선택 단위에 없는 상태 칩을 비활성화할 근거가 된다.
 * complete=false(51건+ 부분 로드)면 미로드분에 만료가 있을 수 있어 판단을 보류한다.
 */
interface UnitCatalog {
  options: { key: string; axis: PostAxis; name: string }[];
  statusByUnit: Record<string, { ongoing: boolean; expired: boolean }>;
  overall: { ongoing: boolean; expired: boolean };
  complete: boolean;
}

function buildUnitCatalog(
  list: UnitNoticePost[],
  totalCount: number,
): UnitCatalog {
  const nowMs = Date.now();
  const options: UnitCatalog['options'] = [];
  const statusByUnit: UnitCatalog['statusByUnit'] = {};
  const overall = { ongoing: false, expired: false };
  for (const post of list) {
    const rowAxis = postAxis(post);
    const id = post.teamId ?? post.targetClassId ?? post.targetTournamentId;
    if (!id) continue;
    const key = `${rowAxis}:${id}`;
    if (!statusByUnit[key]) {
      statusByUnit[key] = { ongoing: false, expired: false };
      options.push({
        key,
        axis: rowAxis,
        name: post.targetName ?? axisChipLabel(rowAxis),
      });
    }
    const slot =
      post.expiresAt && new Date(post.expiresAt).getTime() < nowMs
        ? 'expired'
        : 'ongoing'; // 서버 status 정의와 동일 — ongoing = 미만료(예약 포함)
    statusByUnit[key][slot] = true;
    overall[slot] = true;
  }
  return { options, statusByUnit, overall, complete: list.length >= totalCount };
}

export interface UnitNoticeManagedListProps {
  /**
   * [Phase 2] 탭별 축 스코프 — 'team'=팀 공지 탭 / 'unit'(기본)=훈련·대회 탭.
   * [P2-R1-M01] 'unit' 은 서버 필터(class+tournament) — 팀 공지의 limit 잠식 없음.
   */
  axis?: 'team' | 'unit';
  /**
   * main 진입 모션(slideUp stagger) 억제 — 탭 전환 재마운트가 "페이지 진입"처럼
   * 보이지 않게 한다 (globals.css 의 `main[data-no-enter]` 마커).
   */
  disableEnterMotion?: boolean;
}

// [P2-R2-M01] 페이지 크기 — 초과분은 offset 더보기로 이어 붙인다 (50건 잘림 방지)
const PAGE_SIZE = 50;

export function UnitNoticeManagedList({
  axis = 'unit',
  disableEnterMotion = false,
}: UnitNoticeManagedListProps = {}) {
  const { toast } = useToast();
  const { navigate } = useNavigation();
  const [posts, setPosts] = useState<UnitNoticePost[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [actionTarget, setActionTarget] = useState<UnitNoticePost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnitNoticePost | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 단위 필터 — 'all' 또는 'class:{id}' / 'tournament:{id}'. 후보는 로드된 목록에서 도출
  // (픽커 API 는 종료 수업을 제외하므로 목록 자체가 필터 후보의 SoT).
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  // 상태 필터 — 만료 구분. 페이지네이션과 정합하도록 서버 where 로 거른다
  // (클라 필터는 로드된 페이지에만 적용돼 total·hasMore 가 어긋난다).
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'expired'>(
    'all',
  );
  // 단위 카탈로그 — 'all' 응답 스냅샷 (단위 후보 + 단위별 상태 존재 여부의 SoT)
  const [catalog, setCatalog] = useState<UnitCatalog | null>(null);

  usePageReady(!isLoading);

  // [P2-R1-M02] 탭 전환 중 늦게 도착한 이전 축 응답이 현재 탭을 덮지 않도록
  //   요청 카운터로 최신 요청만 반영한다 (director-notices 의 key 분리와 이중 안전망).
  const loadSeqRef = useRef(0);
  // 최초 로드 완료 여부 — 이후 재조회(상태 필터·refresh)는 화면을 unmount 하지 않고
  //   기존 목록 위에서 데이터만 교체한다 (unmount 시 main 진입 모션이 재생되는 문제).
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setIsLoading(true);
    // [P2-R3-M01] 진행 중이던 더보기 요청은 카운터로 폐기되는데 finally 도 함께
    //   스킵되므로, refresh 가 최신이 되는 이 시점에 로딩 플래그를 명시 해제한다
    //   (미해제 시 더보기 버튼이 스피너로 고착).
    setIsLoadingMore(false);
    try {
      const res = await fetchManagedUnitNotices({
        axis,
        limit: PAGE_SIZE,
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      if (seq !== loadSeqRef.current) return;
      if (res.success && res.data) {
        setPosts(res.data.data);
        setTotal(res.data.total);
        if (statusFilter === 'all') {
          setCatalog(buildUnitCatalog(res.data.data, res.data.total));
        }
      } else {
        setPosts([]);
        setTotal(0);
        if (res.error?.message) toast.error(res.error.message);
      }
    } catch {
      if (seq !== loadSeqRef.current) return;
      setPosts([]);
      setTotal(0);
      toast.error(MESSAGES.error.network);
    } finally {
      if (seq === loadSeqRef.current) {
        hasLoadedRef.current = true;
        setIsLoading(false);
      }
    }
  }, [axis, statusFilter, toast]);

  // [P2-R2-M01] 더보기 — 현재 건수를 offset 으로 다음 페이지를 이어 붙인다.
  //   요청 카운터를 공유해, 진행 중 refresh/탭 전환이 끼어들면 늦은 응답을 폐기한다.
  const loadMore = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setIsLoadingMore(true);
    try {
      const res = await fetchManagedUnitNotices({
        axis,
        limit: PAGE_SIZE,
        offset: posts.length,
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      if (seq !== loadSeqRef.current) return;
      if (res.success && res.data) {
        const page = res.data;
        setPosts((prev) => [...prev, ...page.data]);
        setTotal(page.total);
        if (statusFilter === 'all') {
          setCatalog(buildUnitCatalog([...posts, ...page.data], page.total));
        }
      } else {
        toast.error(res.error?.message ?? MESSAGES.notice.list.loadMoreError);
      }
    } catch {
      if (seq !== loadSeqRef.current) return;
      toast.error(MESSAGES.notice.list.loadMoreError);
    } finally {
      if (seq === loadSeqRef.current) setIsLoadingMore(false);
    }
  }, [axis, posts, statusFilter, toast]);

  const hasMore = posts.length < total;

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshSubscription(REFRESH_KEYS.UNIT_NOTICES, () => {
    void load();
  });

  // 필터 후보 — 'all' 스냅샷 카탈로그 기준 (상태 필터 재조회에도 후보가 출렁이지 않음)
  const unitOptions = catalog?.options ?? [];

  // 선택했던 단위의 공지가 전부 삭제돼 후보에서 사라진 경우 — 전체로 폴백 (빈 화면 잠금 방지)
  const selectedUnit =
    unitFilter === 'all'
      ? null
      : (unitOptions.find((u) => u.key === unitFilter) ?? null);

  // 선택 단위(미선택 시 전체)에 해당 상태의 공지가 존재하는지 — 없으면 상태 칩 비활성.
  // 부분 로드(complete=false)면 미로드분에 있을 수 있어 판단을 보류(활성 유지)한다.
  const isStatusAvailable = useCallback(
    (key: 'ongoing' | 'expired'): boolean => {
      if (!catalog?.complete) return true;
      const src = selectedUnit
        ? catalog.statusByUnit[selectedUnit.key]
        : catalog.overall;
      return src ? src[key] : true;
    },
    [catalog, selectedUnit],
  );

  // 단위 전환으로 현재 상태 필터가 비활성 대상이 되면 전체로 폴백 (빈 화면 잠금 방지)
  useEffect(() => {
    if (statusFilter !== 'all' && !isStatusAvailable(statusFilter)) {
      setStatusFilter('all');
    }
  }, [isStatusAvailable, statusFilter]);

  const filteredPosts = useMemo(() => {
    if (!selectedUnit) return posts;
    const unitId = selectedUnit.key.slice(selectedUnit.axis.length + 1);
    return posts.filter((post) =>
      selectedUnit.axis === 'team'
        ? post.teamId === unitId
        : selectedUnit.axis === 'class'
          ? post.targetClassId === unitId
          : post.targetTournamentId === unitId,
    );
  }, [posts, selectedUnit]);

  const handleDeleteConfirm = useCallback(async () => {
    if (isDeleting || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteUnitNotice(deleteTarget.id);
      if (res.success) {
        const remaining = posts.filter((p) => p.id !== deleteTarget.id);
        setPosts(remaining);
        setTotal((prev) => Math.max(0, prev - 1));
        // 'all' 로드분일 때만 카탈로그 재계산 가능 — 다른 상태 필터 중 삭제는
        // 다음 'all' 재조회까지 스냅샷 유지(스테일 허용)
        if (statusFilter === 'all') {
          setCatalog(buildUnitCatalog(remaining, Math.max(0, total - 1)));
        }
        toast.success(MESSAGES.unitNotice.deleted);
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, isDeleting, posts, statusFilter, toast, total]);

  // 최초 로드만 빈 화면 대기 — 재조회는 기존 목록 유지(+dim)로 unmount 모션을 막는다
  if (isLoading && !hasLoadedRef.current) return null;

  const nowMs = Date.now();

  return (
    <>
      <main
        className={`flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8 relative transition-opacity motion-reduce:transition-none ${
          isLoading ? 'opacity-60 pointer-events-none' : ''
        }`}
        role="main"
        aria-busy={isLoading}
        {...(disableEnterMotion ? { 'data-no-enter': '' } : {})}
        aria-label={
          axis === 'team'
            ? MESSAGES.unitNotice.tabTeam
            : MESSAGES.unitNotice.tabUnit
        }
      >
        {posts.length > 0 || statusFilter !== 'all' ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7">
            <div className="flex items-end justify-between pb-1">
              <div>
                <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                  {MESSAGES.unitNotice.listTitle}
                </h2>
                <p className="mt-0.5 text-card-meta text-it-ink-400 dark:text-it-ink-300">
                  {axis === 'team'
                    ? MESSAGES.unitNotice.managedSubtitleTeam
                    : MESSAGES.unitNotice.managedSubtitle}
                </p>
              </div>
              <span
                className="text-[13.5px] font-bold font-num tabular-nums text-it-blue-500"
                aria-live="polite"
              >
                {MESSAGES.unitNotice.totalCount(
                  selectedUnit ? filteredPosts.length : total,
                )}
              </span>
            </div>

            {/* 필터 줄 — 상태 칩(좌) + 단위 필터 트리거(우, 단위 2개 이상일 때만).
                두 필터를 같은 높이·같은 pill 어휘로 통일해 한 줄에 배치한다
                (칩 나열 vs 풀폭 셀렉트 박스의 이질감 해소 — 사용자 지적 2026-08-21).
                단위 후보가 많아도 트리거+바텀시트 구조라 확장성은 유지된다. */}
            <div className="mb-2 flex items-center gap-2">
              <div
                role="group"
                aria-label={MESSAGES.unitNotice.statusFilterAria}
                className="flex shrink-0 items-center gap-1.5"
              >
                {(
                  [
                    { key: 'all', label: MESSAGES.unitNotice.statusAll },
                    { key: 'ongoing', label: MESSAGES.unitNotice.statusOngoing },
                    { key: 'expired', label: MESSAGES.unitNotice.statusExpired },
                  ] as const
                ).map((opt) => {
                  // 선택 단위에 없는 상태는 비활성 — 숨기면 세그먼트 폭이 출렁여 disabled 로
                  const disabled =
                    opt.key !== 'all' && !isStatusAvailable(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStatusFilter(opt.key)}
                      disabled={disabled}
                      aria-pressed={statusFilter === opt.key}
                      className={`h-9 rounded-w-pill px-3.5 text-[13px] font-bold transition-colors motion-reduce:transition-none active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                        statusFilter === opt.key
                          ? 'bg-it-blue-500 text-white'
                          : 'bg-it-fill dark:bg-it-blue-900/30 text-it-ink-600 dark:text-it-ink-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {unitOptions.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setIsFilterSheetOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={
                    axis === 'team'
                      ? MESSAGES.unitNotice.filterAriaTeam
                      : MESSAGES.unitNotice.filterAria
                  }
                  // flex-1 잔여 폭 고정 — 선택된 이름 길이와 무관하게 버튼 크기가 일정
                  className={`flex h-9 min-w-0 flex-1 items-center justify-between gap-1 rounded-w-pill pl-3 pr-2 text-[13px] font-bold transition-colors motion-reduce:transition-none active:brightness-95 ${
                    selectedUnit
                      ? 'bg-it-blue-500 text-white'
                      : 'bg-it-fill dark:bg-it-blue-900/30 text-it-ink-600 dark:text-it-ink-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/50'
                  }`}
                >
                  {selectedUnit ? (
                    <span className="min-w-0 truncate">{selectedUnit.name}</span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-1">
                      <Icon
                        name="filter_list"
                        className="text-[14px] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {MESSAGES.unitNotice.filterAll}
                      </span>
                    </span>
                  )}
                  <Icon
                    name="expand_more"
                    className="text-[16px] shrink-0"
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>

            <div className="flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
              {filteredPosts.map((post) => (
                <UnitNoticeRow
                  key={post.id}
                  post={post}
                  nowMs={nowMs}
                  listAxis={axis}
                  showTeamName={
                    unitOptions.filter((u) => u.axis === 'team').length >= 2
                  }
                  onKebab={setActionTarget}
                />
              ))}
            </div>
            {filteredPosts.length === 0 && (
              <p className="py-8 text-center text-card-meta text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.emptyUnit}
              </p>
            )}
            {/* [P2-R2-M01] PAGE_SIZE 초과분 더보기 — 서버 offset append (필터와 무관하게 전체 목록 기준) */}
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
                aria-label={MESSAGES.notice.list.loadMoreAriaLabel}
                aria-busy={isLoadingMore}
                className="w-full flex items-center justify-center gap-2 h-12 mt-4 rounded-w-md bg-it-surface dark:bg-it-blue-950 border-[1.5px] border-it-line-strong dark:border-it-blue-900 text-card-body font-semibold text-it-blue-600 dark:text-it-blue-300 hover:bg-it-fill dark:hover:bg-it-blue-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
              >
                {isLoadingMore ? (
                  <>
                    <span
                      className="w-4 h-4 border-2 border-it-blue-500/30 border-t-it-blue-500 rounded-w-pill animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span>{MESSAGES.notice.list.loadingMore}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {MESSAGES.notice.list.loadMore(posts.length, total)}
                    </span>
                    <Icon
                      name="expand_more"
                      className="text-card-title"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            )}
          </section>
        ) : (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/40 flex items-center justify-center">
                <Icon
                  name="campaign"
                  className="text-3xl text-it-blue-500"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-semibold text-it-ink-800 dark:text-white">
                {axis === 'team'
                  ? MESSAGES.unitNotice.emptyManagedTeam
                  : MESSAGES.unitNotice.emptyManaged}
              </p>
              <p className="text-card-meta text-it-ink-400 dark:text-it-ink-300 text-center">
                {axis === 'team'
                  ? MESSAGES.unitNotice.emptyManagedTeamHint
                  : MESSAGES.unitNotice.emptyManagedHint}
              </p>
              <button
                type="button"
                onClick={() => navigate('/community-notice/create')}
                className="mt-2 inline-flex items-center gap-1.5 rounded-w-md bg-it-blue-500 px-4 py-2 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
              >
                <Icon name="edit" className="text-card-emphasis" aria-hidden="true" />
                {MESSAGES.unitNotice.write}
              </button>
            </div>
          </section>
        )}
      </main>

      {posts.length > 0 && (
        <FloatingActionButton
          href="/community-notice/create"
          icon="add"
          label={MESSAGES.unitNotice.write}
        />
      )}

      <ActionSheet
        isOpen={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={MESSAGES.notice.manage}
        items={
          actionTarget
            ? [
                {
                  icon: 'edit',
                  label: MESSAGES.unitNotice.actionEdit,
                  onClick: () => {
                    const id = actionTarget.id;
                    setActionTarget(null);
                    navigate(`/community-notice/create?edit=${id}`);
                  },
                },
                {
                  icon: 'delete',
                  label: MESSAGES.unitNotice.actionDelete,
                  danger: true,
                  onClick: () => {
                    setDeleteTarget(actionTarget);
                    setActionTarget(null);
                  },
                },
              ]
            : []
        }
      />
      <ConfirmSheet
        open={!!deleteTarget}
        title={MESSAGES.unitNotice.deleteConfirm}
        description={MESSAGES.unitNotice.deleteConfirmDesc}
        confirmLabel={MESSAGES.unitNotice.actionDelete}
        cancelLabel={MESSAGES.unitNotice.actionCancel}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />

      {/* 단위 필터 바텀시트 — [전체] + 수업/대회 그룹 목록, 선택 즉시 적용·닫힘 */}
      <BottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title={
          axis === 'team'
            ? MESSAGES.unitNotice.filterAriaTeam
            : MESSAGES.unitNotice.filterAria
        }
      >
        <div className="pb-2">
          <SheetSelectRow
            label={MESSAGES.unitNotice.filterAll}
            active={unitFilter === 'all'}
            onClick={() => {
              setUnitFilter('all');
              setIsFilterSheetOpen(false);
            }}
          />
          {/* '전체'(단독 항목)와 그룹 영역 구분 — 그룹 라벨은 배경 밴드로 비선택 요소임을,
              하위 항목은 들여쓰기로 "누르는 대상"임을 시각 위계로 분리 */}
          <div className="my-2 border-t border-it-line dark:border-it-blue-900" />
          {unitOptions.some((u) => u.axis === 'team') && (
            <>
              <p className="mt-2 rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.targetTeamGroup}
              </p>
              <div className="pl-2">
                {unitOptions
                  .filter((u) => u.axis === 'team')
                  .map((unit) => (
                    <SheetSelectRow
                      key={unit.key}
                      label={unit.name}
                      icon="groups"
                      active={unitFilter === unit.key}
                      onClick={() => {
                        setUnitFilter(unit.key);
                        setIsFilterSheetOpen(false);
                      }}
                    />
                  ))}
              </div>
            </>
          )}
          {unitOptions.some((u) => u.axis === 'class') && (
            <>
              <p className="mt-2 rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.targetClassGroup}
              </p>
              <div className="pl-2">
                {unitOptions
                  .filter((u) => u.axis === 'class')
                  .map((unit) => (
                    <SheetSelectRow
                      key={unit.key}
                      label={unit.name}
                      icon="school"
                      active={unitFilter === unit.key}
                      onClick={() => {
                        setUnitFilter(unit.key);
                        setIsFilterSheetOpen(false);
                      }}
                    />
                  ))}
              </div>
            </>
          )}
          {unitOptions.some((u) => u.axis === 'tournament') && (
            <>
              <p className="mt-2 rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.targetTournamentGroup}
              </p>
              <div className="pl-2">
                {unitOptions
                  .filter((u) => u.axis === 'tournament')
                  .map((unit) => (
                    <SheetSelectRow
                      key={unit.key}
                      label={unit.name}
                      icon="trophy"
                      active={unitFilter === unit.key}
                      onClick={() => {
                        setUnitFilter(unit.key);
                        setIsFilterSheetOpen(false);
                      }}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

function UnitNoticeRow({
  post,
  nowMs,
  listAxis,
  showTeamName,
  onKebab,
}: {
  post: UnitNoticePost;
  nowMs: number;
  listAxis: 'team' | 'unit';
  /** 팀 공지 탭에서 관할 팀이 2개 이상일 때만 팀이름 칩 노출 (1개면 중복 정보) */
  showTeamName: boolean;
  onKebab: (post: UnitNoticePost) => void;
}) {
  const dateStr = new Date(post.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const preview = stripHtml(post.content).slice(0, 80);
  const isScheduled = !!post.startAt && new Date(post.startAt).getTime() > nowMs;
  const isExpired = !!post.expiresAt && new Date(post.expiresAt).getTime() < nowMs;
  const rowAxis = postAxis(post);
  const axisLabel = axisChipLabel(rowAxis);
  // 팀 공지 탭 — 전 행이 팀 공지라 축 배지·(단일 팀이면) 팀이름 칩은 중복 정보.
  // 대신 수신 범위("전체") 배지로 대체한다.
  const isTeamTabRow = listAxis === 'team' && rowAxis === 'team';

  return (
    <NavLink
      href={`/community-notice/${post.id}`}
      className="block py-[14px] active:bg-it-fill dark:active:bg-it-blue-900/30 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40"
      aria-label={`${axisLabel} 공지 · ${post.title}`}
    >
      <div className="flex items-start gap-3">
        {/* 만료 공지 — 콘텐츠만 흐림 처리(비활성 인상). 탭·케밥 기능은 정상 동작하고
            케밥은 dim 대상 밖이라 선명 유지 */}
        <div className={`min-w-0 flex-1 ${isExpired ? 'opacity-55' : ''}`}>
          {/* 축 배지(훈련=emerald·대회=red — 훈련 목록 배지 체계 재사용) + 대상 칩 + 상태 배지 + 날짜.
              팀 공지 탭은 축·팀이름 중복을 걷어내고 수신 범위("전체") 배지로 대체 */}
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {!isTeamTabRow && (
              <span
                className={`inline-flex items-center rounded-w-pill px-2 py-0.5 text-[12px] font-bold ${
                  rowAxis === 'team'
                    ? 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/50 dark:text-it-blue-200'
                    : getTrainingTypeBadgeClass(
                        rowAxis === 'class' ? 'regular' : 'tournament',
                      )
                }`}
              >
                {axisLabel}
              </span>
            )}
            {(!isTeamTabRow || showTeamName) && (
              <span className="inline-flex max-w-[60%] items-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/50 px-2 py-0.5 text-[12px] font-bold text-it-blue-600 dark:text-it-blue-200">
                <span className="truncate">{post.targetName ?? axisLabel}</span>
              </span>
            )}
            {isTeamTabRow && (
              <span className="inline-flex items-center rounded-w-pill bg-it-fill dark:bg-it-blue-900/30 px-2 py-0.5 text-[12px] font-bold text-it-ink-600 dark:text-it-ink-300">
                {MESSAGES.unitNotice.audienceAll}
              </span>
            )}
            {post.isPinned && (
              <span className="inline-flex items-center gap-0.5 rounded-w-pill bg-it-red-500/10 px-2 py-0.5 text-[12px] font-bold text-it-red-500 dark:text-it-red-300">
                <Icon name="push_pin" className="text-[12px]" aria-hidden="true" />
                {MESSAGES.unitNotice.pinnedBadge}
              </span>
            )}
            {isScheduled && (
              <span className="inline-flex items-center rounded-w-pill bg-it-blue-50 px-2 py-0.5 text-[12px] font-bold text-it-blue-600 dark:bg-it-blue-900/50 dark:text-it-blue-200">
                {MESSAGES.notice.badgeScheduled}
              </span>
            )}
            {isExpired && (
              <span className="inline-flex items-center rounded-w-pill bg-it-red-500/10 px-2 py-0.5 text-[12px] font-bold text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-300">
                {MESSAGES.notice.badgeExpired}
              </span>
            )}
            <span className="text-[12px] font-medium text-it-ink-400 dark:text-it-ink-300 tabular-nums">
              {dateStr}
            </span>
          </div>
          {/* 제목 */}
          <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white leading-snug truncate">
            {post.title}
          </h3>
          {/* 내용 미리보기 */}
          {preview && (
            <p className="mt-1 text-[13px] text-it-ink-600 dark:text-it-ink-300 leading-relaxed line-clamp-2">
              {preview}
            </p>
          )}
          {/* 읽음 N/M + 댓글 수 */}
          <div className="mt-1.5 flex items-center gap-3">
            {typeof post.recipientCount === 'number' && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-it-ink-500 dark:text-it-ink-300">
                <Icon name="visibility" className="text-[13px]" aria-hidden="true" />
                <span className="font-num tabular-nums">
                  {MESSAGES.unitNotice.readCount(
                    post.readCount ?? 0,
                    post.recipientCount,
                  )}
                </span>
              </span>
            )}
            {post.commentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-it-ink-500 dark:text-it-ink-300">
                <Icon name="chat_bubble" className="text-[13px]" aria-hidden="true" />
                <span className="font-num tabular-nums">{post.commentCount}</span>
              </span>
            )}
          </div>
        </div>
        {/* 케밥(⋮) — managed 목록은 전부 관할이므로 항상 노출.
            상세 이동 꺾쇠는 케밥과 겹쳐 혼잡해 제거 — 행 press 배경이 탭 가능성을 전달 */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onKebab(post);
          }}
          aria-label={MESSAGES.notice.manageMenuOpen}
          className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-w-md text-it-ink-400 dark:text-it-ink-300 hover:bg-it-fill dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
        >
          <Icon name="more_vert" className="text-xl" aria-hidden="true" />
        </button>
      </div>
    </NavLink>
  );
}
