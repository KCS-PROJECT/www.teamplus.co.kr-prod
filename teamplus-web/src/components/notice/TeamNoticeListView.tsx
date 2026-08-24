'use client';

// 팀 공지 공용 리스트 뷰 — /team-notices(열람) 코어.
//   [Phase 2] audience 소스를 TeamPost 통합 feed(/community/posts/feed)로 전환 —
//   팀+훈련+대회 공지를 출처 칩과 함께 보여주고, 카드 클릭 → /community-notice/[id].
//   (기존 SystemNotice scope=team 은 서버가 빈 목록을 반환 — 이관 완료)
//   manage 모드(구 /director-notices 탭 A)는 UnitNoticeManagedList(axis='team')로 대체되어
//   호출처가 없다 — 이관 원본 열람용 레거시 경로로만 잔존 (정리는 Phase 3).
//     canWrite   → 작성 FAB 노출 (작성 권한자)
//     showReadState → 미확인(읽음) 점 노출 (회원 열람 화면)

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { apiRequest } from '@/services/api-client';
import {
  fetchUnitNoticeFeed,
  type UnitNoticePost,
} from '@/services/community-notice.service';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';
import { ActionSheet } from '@/components/director/ActionSheet';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';

/** HTML 태그 제거 후 공백 정리 — 카드 내용 미리보기용 */
function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** [Phase 2] feed 출처 축 라벨 — 팀/훈련/대회 (targetName 부재 시 폴백) */
function axisChipLabel(axis: 'team' | 'class' | 'tournament'): string {
  if (axis === 'team') return MESSAGES.unitNotice.teamChip;
  if (axis === 'class') return MESSAGES.unitNotice.classChip;
  return MESSAGES.unitNotice.tournamentChip;
}

/**
 * 대상 칩 라벨 — 행 문법: 팀 `[팀이름][전체]` · 훈련/대회 `[훈련|대회 배지][단위 이름][자녀 이름]`.
 * 팀은 전원 수신이라 "전체", 훈련/대회는 **이 공지를 보게 만든 참가 자녀 이름**을 보여
 * 어느 자녀의 공지인지 알 수 있게 한다 (자녀 매칭 없으면 — 감독 관할 열람 등 — 생략).
 */
function audienceChipLabel(notice: NoticeItem): string | null {
  if (notice.axis === 'team') return MESSAGES.unitNotice.audienceAll;
  const names = notice.audienceChildNames ?? [];
  return names.length > 0 ? names.join('·') : null;
}

// ─── Types ──────────────────────────────────────────
interface NoticeItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isPinned: boolean;
  isRead?: boolean;
  /** manage 모드 상태 배지용 — audience 응답에는 없을 수 있어 optional. */
  isPublished?: boolean;
  startAt?: string | null;
  expiresAt?: string | null;
  /** [Phase 5 · AC 5-1] 케밥(수정/삭제) 노출 단일 기준 — 서버가 공지별 계산. */
  canManage?: boolean;
  /** [Phase 2] feed 항목 — 출처 축(팀/훈련/대회)과 대상 이름. 있으면 상세는 /community-notice. */
  axis?: 'team' | 'class' | 'tournament';
  targetName?: string | null;
  /** 이 공지를 보게 만든 참가 자녀 이름 — 대상 칩 ("어느 자녀의 공지인지") */
  audienceChildNames?: string[];
}

interface BackendNotice {
  id: string;
  title: string;
  content: string;
  type?: string;
  isPinned?: boolean;
  createdAt: string;
  isRead?: boolean;
  isPublished?: boolean;
  startAt?: string | null;
  expiresAt?: string | null;
  canManage?: boolean;
}

interface BackendNoticeListResponse {
  data: BackendNotice[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** [Phase 2] feed(UnitNoticePost) → 카드 아이템 — 출처 축·읽음 포함 */
function feedToNoticeItem(p: UnitNoticePost): NoticeItem {
  return {
    id: p.id,
    title: p.title,
    content: p.content ?? '',
    createdAt: p.createdAt,
    isPinned: p.isPinned,
    isRead: p.isReadByMe,
    startAt: p.startAt,
    expiresAt: p.expiresAt,
    axis: p.teamId ? 'team' : p.targetClassId ? 'class' : 'tournament',
    targetName: p.targetName ?? null,
    audienceChildNames: p.audienceChildNames ?? [],
  };
}

function toNoticeItem(n: BackendNotice): NoticeItem {
  return {
    id: n.id,
    title: n.title,
    content: n.content ?? '',
    createdAt: n.createdAt,
    isPinned: n.isPinned ?? false,
    isRead: n.isRead,
    isPublished: n.isPublished,
    startAt: n.startAt,
    expiresAt: n.expiresAt,
    canManage: n.canManage,
  };
}

/**
 * 관리 목록 상태 배지 — 각 조건은 **독립**이라 복수 배지가 동시에 붙을 수 있다.
 * (예: 미게시+만료) 판정은 호출자가 넘긴 **동일 now 스냅샷**(nowMs)으로만 한다 —
 * 행마다 Date.now() 를 다시 읽으면 렌더 중 시각이 갈라져 경계 공지의 배지가 불일치한다.
 */
function computeStatusBadges(
  notice: NoticeItem,
  nowMs: number,
): Array<{ key: 'unpublished' | 'scheduled' | 'expired'; label: string }> {
  const badges: Array<{ key: 'unpublished' | 'scheduled' | 'expired'; label: string }> = [];
  if (notice.isPublished === false) {
    badges.push({ key: 'unpublished', label: MESSAGES.notice.badgeUnpublished });
  }
  if (notice.startAt && new Date(notice.startAt).getTime() > nowMs) {
    badges.push({ key: 'scheduled', label: MESSAGES.notice.badgeScheduled });
  }
  if (notice.expiresAt && new Date(notice.expiresAt).getTime() < nowMs) {
    badges.push({ key: 'expired', label: MESSAGES.notice.badgeExpired });
  }
  return badges;
}

const PAGE_SIZE = 10;

export interface TeamNoticeListViewProps {
  /** AppBar 제목 */
  title: string;
  /** 관리 화면 카피(부제목·빈 상태 문구) 전용 — 케밥/시트 노출은 행별 서버 canManage 가 결정 (AC 5-1) */
  canManage?: boolean;
  /** 작성 FAB 노출 — 작성 권한자 */
  canWrite?: boolean;
  /** 미확인(읽음) 점 노출 — 회원 열람 화면 */
  showReadState?: boolean;
  /**
   * 데이터 계약 (Phase 3 · AC 3-3 — boolean `activeOnly` 대체).
   *   audience(기본) → `GET /notices?scope=team&isActive=true` — 게시 중 공지만 (게시기간 서버 적용)
   *   manage        → `GET /notices/admin/list?scope=team` — 관리 팀의 미게시·예약·만료 포함 + 상태 배지
   */
  mode?: 'audience' | 'manage';
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → full-bleed 흰 섹션 + hairline 행, it-* 토큰 적용.
   *   (현재 /director-notices 관리 화면만 전달. /team-notices 열람은 미적용.)
   */
  iceTheme?: boolean;
  /**
   * 탭 페이지 삽입용 — true 면 MobileContainer/PageAppBar/useNativeUI 를 생략하고
   * 콘텐츠(목록·FAB·시트)만 렌더한다. 부모 페이지가 컨테이너·AppBar·탭 바를 소유.
   * (/director-notices 2탭 재편 — 기본 false = 기존 단독 화면 1:1 보존)
   */
  embedded?: boolean;
}

// ─── Main Component ──────────────────────────────────
export function TeamNoticeListView({
  title,
  canManage = false,
  canWrite = false,
  showReadState = false,
  mode = 'audience',
  iceTheme = false,
  embedded = false,
}: TeamNoticeListViewProps) {
  const { toast } = useToast();
  const { navigate } = useNavigation();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 페이지네이션 상태 (Load More 방식)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 케밥(⋮) 액션시트 / 삭제 확인 상태 — canManage=true 행의 케밥으로만 열림
  const [actionTarget, setActionTarget] = useState<NoticeItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoticeItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: title,
    showBottomNav: true,
    showBackButton: true,
  });

  /**
   * 공지 목록 로드 (scope=team 고정)
   * - append=false: 1페이지부터 다시 (초기 로드 / 작성·수정 후 새로고침)
   * - append=true : 다음 페이지를 기존 목록에 이어붙임 (더보기)
   */
  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      try {
        // [Phase 2] audience = TeamPost 통합 feed (팀+훈련+대회 · 게시 중만).
        //   [P2-R1-M01] offset 페이지네이션 + total 계약 — 50건 상한 잘림 없음.
        if (mode === 'audience') {
          const feedRes = await fetchUnitNoticeFeed({
            limit: PAGE_SIZE,
            offset: (pageNum - 1) * PAGE_SIZE,
          });
          if (feedRes.success && feedRes.data) {
            const mapped = feedRes.data.data.map(feedToNoticeItem);
            setNotices((prev) => (append ? [...prev, ...mapped] : mapped));
            setTotalCount(feedRes.data.total);
            setHasMore(pageNum * PAGE_SIZE < feedRes.data.total);
            setPage(pageNum);
          } else {
            if (!append) {
              setNotices([]);
              setHasMore(false);
              setTotalCount(0);
              setPage(1);
            }
            if (feedRes.error?.message) toast.error(feedRes.error.message);
            else if (append) toast.error(MESSAGES.notice.list.loadMoreError);
          }
          return;
        }

        // manage = 관리 목록 API — 이관 원본(SystemNotice) 열람용 레거시 (호출처 0 · Phase 3 정리).
        const params: Record<string, string> = {
          page: String(pageNum),
          limit: String(PAGE_SIZE),
          scope: 'team',
        };

        const res = await apiRequest<BackendNoticeListResponse | BackendNotice[]>({
          method: 'GET',
          url: '/notices/admin/list',
          params,
        });

        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : res.data.data;
          const pagination = Array.isArray(res.data) ? undefined : res.data.pagination;
          const mapped = list.map(toNoticeItem);

          setNotices((prev) => (append ? [...prev, ...mapped] : mapped));

          const total = pagination?.total ?? (append ? undefined : mapped.length);
          if (typeof total === 'number') setTotalCount(total);

          const more = pagination
            ? pagination.page < pagination.totalPages
            : mapped.length === PAGE_SIZE;
          setHasMore(more);
          setPage(pageNum);
        } else if (!append) {
          setNotices([]);
          setHasMore(false);
          setTotalCount(0);
          setPage(1);
          if (res.error?.message) toast.error(res.error.message);
        } else {
          toast.error(MESSAGES.notice.list.loadMoreError);
        }
      } catch {
        if (!append) {
          setNotices([]);
          setHasMore(false);
          setTotalCount(0);
          setPage(1);
          toast.error(MESSAGES.error.network);
        } else {
          toast.error(MESSAGES.notice.list.loadMoreError);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [mode, toast],
  );

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  // 공지 작성/수정 후 즉시 목록 갱신 (notices-create 에서 emitRefresh(NOTICES))
  useRefreshSubscription(REFRESH_KEYS.NOTICES, () => {
    void fetchPage(1, false);
  });
  // [Phase 2] 새 작성 경로(community-notice/create)의 저장 후 갱신
  useRefreshSubscription(REFRESH_KEYS.UNIT_NOTICES, () => {
    void fetchPage(1, false);
  });

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    void fetchPage(page + 1, true);
  }, [fetchPage, hasMore, isLoadingMore, page]);

  // 케밥 → 수정하기: 작성/수정 단일 페이지로 이동 (edit 모드)
  const handleEdit = useCallback(
    (id: string) => {
      setActionTarget(null);
      navigate(`/notices-create?edit=${id}`);
    },
    [navigate],
  );

  // 케밥 → 삭제 확인 후 실제 삭제 (본인 관리 팀 공지만 — 백엔드 권한 검증)
  const handleDeleteConfirm = useCallback(async () => {
    if (isDeleting || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await apiRequest({
        method: 'DELETE',
        url: `/notices/${deleteTarget.id}`,
      });
      if (res.success) {
        setNotices((prev) => prev.filter((n) => n.id !== deleteTarget.id));
        setTotalCount((c) => Math.max(0, c - 1));
        toast.success(MESSAGES.notice.deleted);
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

  // 고정 공지 상단 정렬 (Hero 카드 대신 '고정' 배지 + 상단 정렬)
  const sorted = [...notices].sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned),
  );

  // [AC 3-2] 상태 배지 판정용 now 스냅샷 — 렌더당 1회만 읽어 전체 행이 동일 시각으로 판정.
  const nowMs = Date.now();
  const badgesFor = (notice: NoticeItem) =>
    mode === 'manage' ? computeStatusBadges(notice, nowMs) : undefined;

  if (isLoading) return null;

  // ICETIMES flat — 카드 박스 제거. full-bleed 흰 섹션 + hairline 행, it-* 토큰.
  if (iceTheme) {
    const iceContent = (
      <>
        <main
          className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8 relative"
          role="main"
          aria-label={title}
        >
          {sorted.length > 0 ? (
            // 공지 목록 — full-bleed 흰 섹션 + hairline 구분 행
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7">
              <div className="flex items-end justify-between pb-1">
                <div>
                  <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                    공지 목록
                  </h2>
                  <p className="mt-0.5 text-card-meta text-it-ink-400 dark:text-it-ink-300">
                    {canManage
                      ? '우리 팀에 등록된 공지사항이에요'
                      : '우리 팀 공지사항을 확인해보세요'}
                  </p>
                </div>
                {totalCount > 0 && (
                  <span
                    className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500"
                    aria-live="polite"
                  >
                    {totalCount}
                  </span>
                )}
              </div>

              <div className="flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
                {sorted.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    notice={notice}
                    showReadState={showReadState}
                    statusBadges={badgesFor(notice)}
                    onKebab={notice.canManage ? setActionTarget : undefined}
                    iceTheme
                  />
                ))}
              </div>

              {/* 더보기 버튼 / 모두 로드 안내 */}
              {hasMore ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
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
                        {MESSAGES.notice.list.loadMore(notices.length, totalCount)}
                      </span>
                      <Icon name="expand_more" className="text-card-title" aria-hidden="true" />
                    </>
                  )}
                </button>
              ) : (
                totalCount > PAGE_SIZE && (
                  <p
                    className="text-center text-card-meta text-it-ink-400 dark:text-it-ink-300 py-3"
                    role="status"
                    aria-live="polite"
                  >
                    {MESSAGES.notice.list.allLoaded}
                  </p>
                )
              )}
            </section>
          ) : (
            // 빈 상태 — full-bleed 흰 섹션
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
                  {MESSAGES.empty('공지')}
                </p>
                <p className="text-card-meta text-it-ink-400 dark:text-it-ink-300 text-center">
                  {canWrite
                    ? '첫 번째 공지를 작성해 회원들에게 알려보세요'
                    : '등록된 공지가 올라오면 이곳에서 알려드릴게요'}
                </p>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        mode === 'audience'
                          ? '/community-notice/create'
                          : '/notices-create',
                      )
                    }
                    className="mt-2 inline-flex items-center gap-1.5 rounded-w-md bg-it-blue-500 px-4 py-2 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
                  >
                    <Icon name="edit" className="text-card-emphasis" aria-hidden="true" />
                    공지 작성하기
                  </button>
                )}
              </div>
            </section>
          )}
        </main>

        {/* FAB — 우하단 플로팅 작성 버튼 (작성 권한자만) */}
        {canWrite && notices.length > 0 && (
          <FloatingActionButton
          href={mode === 'audience' ? '/community-notice/create' : '/notices-create'}
          icon="add"
          label={MESSAGES.unitNotice.write}
        />
        )}

        {/* 케밥(⋮) 액션 시트 + 삭제 확인 — [P5-R1-01] 화면 prop 이 아닌 **행별 서버 canManage** 로만
            열린다(케밥 자체가 canManage=true 행에만 렌더). 시트를 화면 prop 으로 재차 gate 하면
            audience 화면에서 관리 가능 행의 케밥을 눌러도 시트가 열리지 않는 불일치가 생긴다. */}
        <>
            <ActionSheet
              isOpen={!!actionTarget}
              onClose={() => setActionTarget(null)}
              title={MESSAGES.notice.manage}
              items={
                actionTarget
                  ? [
                      {
                        icon: 'edit',
                        label: '수정하기',
                        onClick: () => handleEdit(actionTarget.id),
                      },
                      {
                        icon: 'delete',
                        label: '삭제하기',
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
              title={MESSAGES.notice.deleteConfirm}
              description={MESSAGES.notice.deleteConfirmDesc}
              confirmLabel="삭제하기"
              cancelLabel="취소"
              variant="danger"
              onConfirm={handleDeleteConfirm}
              onCancel={() => {
                if (!isDeleting) setDeleteTarget(null);
              }}
            />
          </>
      </>
    );

    if (embedded) return iceContent;
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={title} forceNative />
        {iceContent}
      </MobileContainer>
    );
  }

  const legacyContent = (
    <>
      <main className="flex-1 overflow-y-auto hide-scrollbar" role="main" aria-label={title}>
        <div className="px-5 py-5 pb-30 space-y-4 relative">
          {/* 섹션 헤더 */}
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
                공지 목록
              </h2>
              <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-wtext-4">
                {canManage
                  ? '우리 팀에 등록된 공지사항이에요'
                  : '우리 팀 공지사항을 확인해보세요'}
              </p>
            </div>
            {totalCount > 0 && (
              <span
                className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4 tabular-nums"
                aria-live="polite"
              >
                총 {totalCount}건
              </span>
            )}
          </div>

          {sorted.length > 0 ? (
            <div className="space-y-3">
              {sorted.map((notice) => (
                <NoticeCard
                  key={notice.id}
                  notice={notice}
                  showReadState={showReadState}
                  statusBadges={badgesFor(notice)}
                  onKebab={notice.canManage ? setActionTarget : undefined}
                />
              ))}

              {/* 더보기 버튼 / 모두 로드 안내 */}
              {hasMore ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  aria-label={MESSAGES.notice.list.loadMoreAriaLabel}
                  aria-busy={isLoadingMore}
                  className="w-full flex items-center justify-center gap-2 h-12 mt-1 rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 text-card-body font-semibold text-ice-500 dark:text-ice-500 hover:border-ice-500/50 hover:bg-ice-50/50 dark:hover:bg-rink-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-puck disabled:opacity-60 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
                >
                  {isLoadingMore ? (
                    <>
                      <span
                        className="w-4 h-4 border-2 border-ice-500/30 border-t-primary rounded-w-pill animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      <span>{MESSAGES.notice.list.loadingMore}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {MESSAGES.notice.list.loadMore(notices.length, totalCount)}
                      </span>
                      <Icon name="expand_more" className="text-card-title" aria-hidden="true" />
                    </>
                  )}
                </button>
              ) : (
                totalCount > PAGE_SIZE && (
                  <p
                    className="text-center text-card-meta text-wtext-3 dark:text-wtext-4 py-3"
                    role="status"
                    aria-live="polite"
                  >
                    {MESSAGES.notice.list.allLoaded}
                  </p>
                )
              )}
            </div>
          ) : (
            <div className="bg-wsurface dark:bg-rink-800 rounded-w-lg p-10 border border-dashed border-wline-2 dark:border-rink-700 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-w-pill bg-ice-50 dark:bg-ice-500/15 flex items-center justify-center">
                <Icon
                  name="campaign"
                  className="text-3xl text-ice-500 dark:text-ice-500"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-semibold text-wtext-1 dark:text-white">
                {MESSAGES.empty('공지')}
              </p>
              <p className="text-card-meta text-wtext-3 dark:text-wtext-4">
                {canWrite
                  ? '첫 번째 공지를 작성해 회원들에게 알려보세요'
                  : '등록된 공지가 올라오면 이곳에서 알려드릴게요'}
              </p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      mode === 'audience'
                        ? '/community-notice/create'
                        : '/notices-create',
                    )
                  }
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ice-500 px-4 py-2 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:bg-ice-600 active:brightness-95"
                >
                  <Icon name="edit" className="text-card-emphasis" aria-hidden="true" />
                  공지 작성하기
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* FAB — 우하단 플로팅 작성 버튼 (작성 권한자만) */}
      {canWrite && notices.length > 0 && (
        <FloatingActionButton
          href={mode === 'audience' ? '/community-notice/create' : '/notices-create'}
          icon="add"
          label={MESSAGES.unitNotice.write}
        />
      )}

      {/* 케밥(⋮) 액션 시트 + 삭제 확인 — [P5-R1-01] 행별 서버 canManage 로만 열림 (위 iceTheme 분기 주석 참조) */}
      <>
          <ActionSheet
            isOpen={!!actionTarget}
            onClose={() => setActionTarget(null)}
            title={MESSAGES.notice.manage}
            items={
              actionTarget
                ? [
                    {
                      icon: 'edit',
                      label: '수정하기',
                      onClick: () => handleEdit(actionTarget.id),
                    },
                    {
                      icon: 'delete',
                      label: '삭제하기',
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
            title={MESSAGES.notice.deleteConfirm}
            description={MESSAGES.notice.deleteConfirmDesc}
            confirmLabel="삭제하기"
            cancelLabel="취소"
            variant="danger"
            onConfirm={handleDeleteConfirm}
            onCancel={() => {
              if (!isDeleting) setDeleteTarget(null);
            }}
          />
        </>
    </>
  );

  if (embedded) return legacyContent;
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={title} forceNative />
      {legacyContent}
    </MobileContainer>
  );
}

// ─── Sub Components ──────────────────────────────────
/** 상태 배지 색 — 미게시=중성 회색 · 예약=파랑 · 만료=빨강 (라이트/다크 각각 4.5:1 이상 유지). */
const BADGE_TONE: Record<
  'unpublished' | 'scheduled' | 'expired',
  { ice: string; legacy: string }
> = {
  unpublished: {
    ice: 'bg-it-ink-100 text-it-ink-600 dark:bg-it-ink-700/60 dark:text-it-ink-100',
    legacy: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  },
  scheduled: {
    ice: 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/50 dark:text-it-blue-200',
    legacy: 'bg-ice-50 text-ice-600 dark:bg-ice-500/20 dark:text-ice-300',
  },
  expired: {
    ice: 'bg-it-red-500/10 text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-300',
    // flame 스케일은 100/500/600/700 만 정의됨 — 다크 텍스트는 flame-100 사용 (300 미존재)
    legacy: 'bg-flame-500/10 text-flame-600 dark:bg-flame-500/15 dark:text-flame-100',
  },
};

function NoticeCard({
  notice,
  showReadState,
  statusBadges,
  onKebab,
  iceTheme = false,
}: {
  notice: NoticeItem;
  showReadState?: boolean;
  statusBadges?: Array<{ key: 'unpublished' | 'scheduled' | 'expired'; label: string }>;
  onKebab?: (notice: NoticeItem) => void;
  iceTheme?: boolean;
}) {
  const dateStr = new Date(notice.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const preview = stripHtml(notice.content).slice(0, 80);
  const unread = showReadState && notice.isRead === false;

  // ICETIMES flat — 카드 박스(bg/rounded/shadow/border) 제거. 부모 divide-it-line hairline 행.
  if (iceTheme) {
    return (
      <NavLink
        href={
        notice.axis ? `/community-notice/${notice.id}` : `/notice/${notice.id}`
      }
        className="block py-[14px] active:bg-it-fill dark:active:bg-it-blue-900/30 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40"
        aria-label={`${notice.isPinned ? '고정 공지 · ' : ''}${notice.title}${unread ? ' · 미확인' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* [Phase 2] 출처 — 팀 [팀이름][전체] · 훈련/대회 축 텍스트 라벨+[단위 이름][자녀 이름]
                (축은 색 텍스트 — 칩 배경이 경계라 구분점 불필요, 플랫 톤 유지) */}
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {notice.axis && notice.axis !== 'team' && (
                <span
                  className={`text-[12px] font-bold ${
                    notice.axis === 'class'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {axisChipLabel(notice.axis)}
                </span>
              )}
              {notice.axis && (
                <span className="inline-flex max-w-[55%] items-center gap-1 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/50 px-2 py-0.5 text-[12px] font-bold text-it-blue-600 dark:text-it-blue-200">
                  {notice.axis === 'team' && (
                    <Icon
                      name="groups"
                      className="text-[12px] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">
                    {notice.targetName ?? axisChipLabel(notice.axis)}
                  </span>
                </span>
              )}
              {notice.axis && audienceChipLabel(notice) && (
                <span className="inline-flex max-w-[40%] items-center rounded-w-pill bg-it-fill dark:bg-it-blue-900/30 px-2 py-0.5 text-[12px] font-bold text-it-ink-600 dark:text-it-ink-300">
                  <span className="truncate">{audienceChipLabel(notice)}</span>
                </span>
              )}
              {notice.isPinned && (
                <span className="inline-flex items-center gap-0.5 rounded-w-pill bg-it-red-500/10 px-2 py-0.5 text-[12px] font-bold text-it-red-500 dark:text-it-red-300">
                  <Icon name="push_pin" className="text-[12px]" aria-hidden="true" />
                  고정
                </span>
              )}
              {statusBadges?.map((b) => (
                <span
                  key={b.key}
                  className={`inline-flex items-center rounded-w-pill px-2 py-0.5 text-[12px] font-bold ${BADGE_TONE[b.key].ice}`}
                >
                  {b.label}
                </span>
              ))}
              {unread && (
                <span
                  className="inline-block h-2 w-2 rounded-w-pill bg-it-red-500"
                  aria-label="미확인 공지"
                />
              )}
              <span className="text-[12px] font-medium text-it-ink-400 dark:text-it-ink-300 tabular-nums">
                {dateStr}
              </span>
            </div>
            {/* 제목 */}
            <h3
              className={`text-[15.5px] ${unread ? 'font-extrabold' : 'font-bold'} tracking-[-0.01em] text-it-ink-800 dark:text-white leading-snug truncate`}
            >
              {notice.title}
            </h3>
            {/* 내용 미리보기 */}
            {preview && (
              <p className="mt-1 text-[13px] text-it-ink-600 dark:text-it-ink-300 leading-relaxed line-clamp-2">
                {preview}
              </p>
            )}
          </div>
          {/* 케밥(⋮) — 수정/삭제 메뉴 (관리 권한자만 · 카드 상세 이동과 분리) */}
          {onKebab && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onKebab(notice);
              }}
              aria-label={MESSAGES.notice.manageMenuOpen}
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-w-md text-it-ink-400 dark:text-it-ink-300 hover:bg-it-fill dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
            >
              <Icon name="more_vert" className="text-xl" aria-hidden="true" />
            </button>
          )}
        </div>
      </NavLink>
    );
  }

  return (
    <NavLink
      href={
        notice.axis ? `/community-notice/${notice.id}` : `/notice/${notice.id}`
      }
      className="block bg-wsurface dark:bg-rink-800 rounded-w-md p-4 shadow-sh-1 border border-wline-2 dark:border-rink-700 active:bg-wbg dark:active:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
      aria-label={`${notice.isPinned ? '고정 공지 · ' : ''}${notice.title}${unread ? ' · 미확인' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* [Phase 2] 출처 — 팀 [팀이름][전체] · 훈련/대회 축 텍스트 라벨+[단위 이름][자녀 이름] */}
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {notice.axis && notice.axis !== 'team' && (
              <span
                className={`text-card-meta font-bold ${
                  notice.axis === 'class'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {axisChipLabel(notice.axis)}
              </span>
            )}
            {notice.axis && (
              <span className="inline-flex max-w-[55%] items-center gap-1 rounded-w-pill bg-ice-50 dark:bg-ice-500/20 px-2 py-0.5 text-card-meta font-bold text-ice-600 dark:text-ice-300">
                {notice.axis === 'team' && (
                  <Icon
                    name="groups"
                    className="text-card-meta shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">
                  {notice.targetName ?? axisChipLabel(notice.axis)}
                </span>
              </span>
            )}
            {notice.axis && audienceChipLabel(notice) && (
              <span className="inline-flex max-w-[40%] items-center rounded-w-pill bg-wbg dark:bg-rink-700 px-2 py-0.5 text-card-meta font-bold text-wtext-2 dark:text-wtext-3">
                <span className="truncate">{audienceChipLabel(notice)}</span>
              </span>
            )}
            {notice.isPinned && (
              <span className="inline-flex items-center gap-0.5 rounded-w-pill bg-flame-500/10 px-2 py-0.5 text-card-meta font-bold text-flame-500">
                <Icon name="push_pin" className="text-card-meta" aria-hidden="true" />
                고정
              </span>
            )}
            {statusBadges?.map((b) => (
              <span
                key={b.key}
                className={`inline-flex items-center rounded-w-pill px-2 py-0.5 text-card-meta font-bold ${BADGE_TONE[b.key].legacy}`}
              >
                {b.label}
              </span>
            ))}
            {unread && (
              <span
                className="inline-block h-2 w-2 rounded-w-pill bg-flame-500"
                aria-label="미확인 공지"
              />
            )}
            <span className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4 tabular-nums">
              {dateStr}
            </span>
          </div>
          {/* 제목 */}
          <h3
            className={`text-card-title ${unread ? 'font-extrabold' : 'font-bold'} text-wtext-1 dark:text-white leading-snug truncate`}
          >
            {notice.title}
          </h3>
          {/* 내용 미리보기 */}
          {preview && (
            <p className="mt-1 text-card-meta text-wtext-2 dark:text-wtext-4 leading-relaxed line-clamp-2">
              {preview}
            </p>
          )}
        </div>
        {/* 케밥(⋮) — 수정/삭제 메뉴 (관리 권한자만 · 카드 상세 이동과 분리) */}
        {onKebab && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onKebab(notice);
            }}
            aria-label={MESSAGES.notice.manageMenuOpen}
            className="-mr-2 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-wtext-3 dark:text-rink-300 hover:bg-wbg dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
          >
            <Icon name="more_vert" className="text-xl" aria-hidden="true" />
          </button>
        )}
      </div>
    </NavLink>
  );
}
