'use client';

// 수업/대회 단위 공지 — 감독·코치 통합 공지함 (embedded 콘텐츠).
//   /director-notices "수업·대회" 탭에 삽입 — 컨테이너·AppBar·탭 바는 부모 페이지 소유.
//   행: 대상 칩(수업/대회 이름) + 상태 배지 + 제목 + 읽음 N/M → 클릭 시 /community-notice/[id].
//   설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md §6

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { usePageReady } from '@/hooks/usePageReady';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';
import { ActionSheet } from '@/components/director/ActionSheet';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
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

export function UnitNoticeManagedList() {
  const { toast } = useToast();
  const { navigate } = useNavigation();
  const [posts, setPosts] = useState<UnitNoticePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<UnitNoticePost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnitNoticePost | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 단위 필터 — 'all' 또는 'class:{id}' / 'tournament:{id}'. 후보는 로드된 목록에서 도출
  // (픽커 API 는 종료 수업을 제외하므로 목록 자체가 필터 후보의 SoT).
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  usePageReady(!isLoading);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchManagedUnitNotices({ limit: 50 });
      if (res.success && res.data) {
        setPosts(res.data);
      } else {
        setPosts([]);
        if (res.error?.message) toast.error(res.error.message);
      }
    } catch {
      setPosts([]);
      toast.error(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshSubscription(REFRESH_KEYS.UNIT_NOTICES, () => {
    void load();
  });

  // 필터 칩 후보 — 로드된 공지의 단위(수업/대회) 중복 제거, 목록 등장 순서 유지
  const unitOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; axis: 'class' | 'tournament'; name: string }
    >();
    for (const post of posts) {
      const axis = post.targetClassId ? 'class' : 'tournament';
      const id = post.targetClassId ?? post.targetTournamentId;
      if (!id) continue;
      const key = `${axis}:${id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          axis,
          name:
            post.targetName ??
            (axis === 'class'
              ? MESSAGES.unitNotice.classChip
              : MESSAGES.unitNotice.tournamentChip),
        });
      }
    }
    return Array.from(map.values());
  }, [posts]);

  // 선택했던 단위의 공지가 전부 삭제돼 후보에서 사라진 경우 — 전체로 폴백 (빈 화면 잠금 방지)
  const selectedUnit =
    unitFilter === 'all'
      ? null
      : (unitOptions.find((u) => u.key === unitFilter) ?? null);

  const filteredPosts = useMemo(() => {
    if (!selectedUnit) return posts;
    return posts.filter((post) =>
      selectedUnit.axis === 'class'
        ? post.targetClassId === selectedUnit.key.slice('class:'.length)
        : post.targetTournamentId ===
          selectedUnit.key.slice('tournament:'.length),
    );
  }, [posts, selectedUnit]);

  const handleDeleteConfirm = useCallback(async () => {
    if (isDeleting || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteUnitNotice(deleteTarget.id);
      if (res.success) {
        setPosts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
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
  }, [deleteTarget, isDeleting, toast]);

  if (isLoading) return null;

  const nowMs = Date.now();

  return (
    <>
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8 relative"
        role="main"
        aria-label={MESSAGES.unitNotice.tabUnit}
      >
        {posts.length > 0 ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7">
            <div className="flex items-end justify-between pb-1">
              <div>
                <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                  {MESSAGES.unitNotice.listTitle}
                </h2>
                <p className="mt-0.5 text-card-meta text-it-ink-400 dark:text-it-ink-300">
                  {MESSAGES.unitNotice.managedSubtitle}
                </p>
              </div>
              <span
                className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500"
                aria-live="polite"
              >
                {filteredPosts.length}
              </span>
            </div>

            {/* 단위 필터 — select 형 트리거 + 바텀시트 (단위 2개 이상일 때만).
                칩 가로 스크롤은 관할 수업이 많아지면 파손 — 시트 목록으로 확장성 확보. */}
            {unitOptions.length >= 2 && (
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                aria-haspopup="dialog"
                aria-label={MESSAGES.unitNotice.filterAria}
                className="mb-2 flex w-full items-center justify-between gap-2 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-900/30 px-3 h-[44px] transition-colors motion-reduce:transition-none hover:border-it-blue-500/40 active:brightness-95"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-bold text-it-ink-800 dark:text-white">
                  {selectedUnit ? (
                    <>
                      <Icon
                        name={selectedUnit.axis === 'class' ? 'school' : 'trophy'}
                        className="text-[14px] shrink-0 text-it-blue-500"
                        aria-hidden="true"
                      />
                      <span className="truncate">{selectedUnit.name}</span>
                    </>
                  ) : (
                    <>
                      <Icon
                        name="filter_list"
                        className="text-[14px] shrink-0 text-it-ink-400 dark:text-it-ink-300"
                        aria-hidden="true"
                      />
                      {MESSAGES.unitNotice.filterAll}
                    </>
                  )}
                </span>
                <Icon
                  name="expand_more"
                  className="text-[18px] shrink-0 text-it-ink-400 dark:text-it-ink-300"
                  aria-hidden="true"
                />
              </button>
            )}

            <div className="flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
              {filteredPosts.map((post) => (
                <UnitNoticeRow
                  key={post.id}
                  post={post}
                  nowMs={nowMs}
                  onKebab={setActionTarget}
                />
              ))}
            </div>
            {filteredPosts.length === 0 && (
              <p className="py-8 text-center text-card-meta text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.emptyUnit}
              </p>
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
                {MESSAGES.unitNotice.emptyManaged}
              </p>
              <p className="text-card-meta text-it-ink-400 dark:text-it-ink-300 text-center">
                {MESSAGES.unitNotice.emptyManagedHint}
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
        title={MESSAGES.unitNotice.filterAria}
      >
        <div className="pb-2">
          <FilterSheetRow
            label={MESSAGES.unitNotice.filterAll}
            active={unitFilter === 'all'}
            onClick={() => {
              setUnitFilter('all');
              setIsFilterSheetOpen(false);
            }}
          />
          {unitOptions.some((u) => u.axis === 'class') && (
            <>
              <p className="mt-2 px-3 pb-1 text-[12px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.targetClassGroup}
              </p>
              {unitOptions
                .filter((u) => u.axis === 'class')
                .map((unit) => (
                  <FilterSheetRow
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
            </>
          )}
          {unitOptions.some((u) => u.axis === 'tournament') && (
            <>
              <p className="mt-2 px-3 pb-1 text-[12px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                {MESSAGES.unitNotice.targetTournamentGroup}
              </p>
              {unitOptions
                .filter((u) => u.axis === 'tournament')
                .map((unit) => (
                  <FilterSheetRow
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
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

/** 필터 바텀시트 선택 행 — 이름 + 선택 체크 */
function FilterSheetRow({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center gap-2.5 rounded-w-md px-3 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-it-blue-900/40 active:brightness-95"
    >
      {icon && (
        <Icon
          name={icon}
          className={`text-[16px] shrink-0 ${active ? 'text-it-blue-500' : 'text-it-ink-400 dark:text-it-ink-300'}`}
          aria-hidden="true"
        />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-[14.5px] ${
          active
            ? 'font-extrabold text-it-blue-600 dark:text-it-blue-300'
            : 'font-semibold text-it-ink-800 dark:text-white'
        }`}
      >
        {label}
      </span>
      {active && (
        <Icon
          name="check"
          className="text-[18px] shrink-0 text-it-blue-500"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function UnitNoticeRow({
  post,
  nowMs,
  onKebab,
}: {
  post: UnitNoticePost;
  nowMs: number;
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
  const axisLabel = post.targetClassId
    ? MESSAGES.unitNotice.classChip
    : MESSAGES.unitNotice.tournamentChip;

  return (
    <NavLink
      href={`/community-notice/${post.id}`}
      className="block py-[14px] active:bg-it-fill dark:active:bg-it-blue-900/30 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40"
      aria-label={`${axisLabel} 공지 · ${post.title}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* 축 배지(훈련=emerald·대회=red — 훈련 목록 배지 체계 재사용) + 대상 칩 + 상태 배지 + 날짜 */}
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`inline-flex items-center rounded-w-pill px-2 py-0.5 text-[12px] font-bold ${getTrainingTypeBadgeClass(post.targetClassId ? 'regular' : 'tournament')}`}
            >
              {axisLabel}
            </span>
            <span className="inline-flex max-w-[60%] items-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/50 px-2 py-0.5 text-[12px] font-bold text-it-blue-600 dark:text-it-blue-200">
              <span className="truncate">{post.targetName ?? axisLabel}</span>
            </span>
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
        {/* 상세 이동 시그니파이어 — 행 전체가 탭 가능함을 명시 (케밥과 분리) */}
        <Icon
          name="chevron_right"
          className="shrink-0 self-center text-[18px] text-it-ink-300 dark:text-it-ink-400"
          aria-hidden="true"
        />
        {/* 케밥(⋮) — managed 목록은 전부 관할이므로 항상 노출 */}
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
