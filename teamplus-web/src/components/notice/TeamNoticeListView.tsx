'use client';

// 팀 공지 공용 리스트 뷰 — /team-notices(열람)·/director-notices(관리) 공유 코어.
//   화면 정체성(열람 vs 관리)은 props 로 분기:
//     canManage  → 케밥(수정/삭제) 노출       (감독/코치 관리 화면)
//     canWrite   → 작성 FAB 노출              (작성 권한자)
//     showReadState → 미확인(읽음) 점 노출     (회원 열람 화면)
//     activeOnly → 활성 공지만 조회            (열람=활성만 / 관리=비활성 포함)
//   카드 클릭 → /notice/[id] (양쪽 동일). 서비스 공지(/notices, (notice)/list)와는 무관.

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
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';
import { ActionSheet } from '@/components/director/ActionSheet';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';

/** HTML 태그 제거 후 공백 정리 — 카드 내용 미리보기용 */
function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Types ──────────────────────────────────────────
interface NoticeItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isPinned: boolean;
  isRead?: boolean;
}

interface BackendNotice {
  id: string;
  title: string;
  content: string;
  type?: string;
  isPinned?: boolean;
  createdAt: string;
  isRead?: boolean;
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

function toNoticeItem(n: BackendNotice): NoticeItem {
  return {
    id: n.id,
    title: n.title,
    content: n.content ?? '',
    createdAt: n.createdAt,
    isPinned: n.isPinned ?? false,
    isRead: n.isRead,
  };
}

const PAGE_SIZE = 10;

export interface TeamNoticeListViewProps {
  /** AppBar 제목 */
  title: string;
  /** 케밥(수정/삭제) 관리 기능 노출 — 감독/코치 관리 화면 */
  canManage?: boolean;
  /** 작성 FAB 노출 — 작성 권한자 */
  canWrite?: boolean;
  /** 미확인(읽음) 점 노출 — 회원 열람 화면 */
  showReadState?: boolean;
  /** 활성 공지만 조회 (관리 화면은 비활성 포함) */
  activeOnly?: boolean;
}

// ─── Main Component ──────────────────────────────────
export function TeamNoticeListView({
  title,
  canManage = false,
  canWrite = false,
  showReadState = false,
  activeOnly = false,
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

  // 케밥(⋮) 액션시트 / 삭제 확인 상태 (canManage 일 때만 사용)
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
        const params: Record<string, string> = {
          page: String(pageNum),
          limit: String(PAGE_SIZE),
          // 팀 공지 화면은 본인 소속/관리 팀 공지만.
          scope: 'team',
        };
        // 열람 화면은 활성 공지만, 관리 화면은 비활성 포함.
        if (activeOnly) params.isActive = 'true';

        const res = await apiRequest<BackendNoticeListResponse | BackendNotice[]>({
          method: 'GET',
          url: '/notices',
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
    [activeOnly, toast],
  );

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  // 공지 작성/수정 후 즉시 목록 갱신 (notices-create 에서 emitRefresh(NOTICES))
  useRefreshSubscription(REFRESH_KEYS.NOTICES, () => {
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

  if (isLoading) return null;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={title} forceNative />

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
                  onKebab={canManage ? setActionTarget : undefined}
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
                  onClick={() => navigate('/notices-create')}
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
        <FloatingActionButton href="/notices-create" icon="add" label="공지 작성하기" />
      )}

      {/* 케밥(⋮) 액션 시트 + 삭제 확인 (관리 권한자만) */}
      {canManage && (
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
      )}
    </MobileContainer>
  );
}

// ─── Sub Components ──────────────────────────────────
function NoticeCard({
  notice,
  showReadState,
  onKebab,
}: {
  notice: NoticeItem;
  showReadState?: boolean;
  onKebab?: (notice: NoticeItem) => void;
}) {
  const dateStr = new Date(notice.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const preview = stripHtml(notice.content).slice(0, 80);
  const unread = showReadState && notice.isRead === false;

  return (
    <NavLink
      href={`/notice/${notice.id}`}
      className="block bg-wsurface dark:bg-rink-800 rounded-w-md p-4 shadow-sh-1 border border-wline-2 dark:border-rink-700 active:bg-wbg dark:active:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
      aria-label={`${notice.isPinned ? '고정 공지 · ' : ''}${notice.title}${unread ? ' · 미확인' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* 고정 배지 + 날짜 */}
          <div className="mb-1 flex items-center gap-2">
            {notice.isPinned && (
              <span className="inline-flex items-center gap-0.5 rounded-w-pill bg-flame-500/10 px-2 py-0.5 text-card-meta font-bold text-flame-500">
                <Icon name="push_pin" className="text-card-meta" aria-hidden="true" />
                고정
              </span>
            )}
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
