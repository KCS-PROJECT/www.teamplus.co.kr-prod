'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { CommentThread, type CommentData } from '@/components/shared/CommentThread';
import { MESSAGES } from '@/lib/messages';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import { useNotificationContext } from '@/contexts/NotificationContext';

import { usePageReady } from '@/hooks/usePageReady';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

/**
 * XSS 방어를 위한 HTML 정화 함수
 */
let dompurifyHookAdded = false;
function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    return dirty;
  }

  if (!dompurifyHookAdded) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/')) {
          node.removeAttribute('href');
        }
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    dompurifyHookAdded = true;
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['strong', 'ul', 'li', 'p', 'br', 'em', 'b', 'i', 'span', 'div', 'a'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}

interface NoticeDetail {
  id: string;
  category: 'notice' | 'event';
  title: string;
  content: string;
  date: string;
  viewCount: number;
  isPinned?: boolean;
  targetTeamId?: string | null;
  /**
   * [Phase 5 · AC 5-1] 관리(수정/삭제) 버튼 단일 기준 — 서버가 공지별로 계산.
   * 프론트 역할 추정(DIRECTOR|COACH vs ADMIN — Phase 2 과도기)은 이 필드로 대체됐다:
   * 역할 문자열로는 "타 팀 코치" 를 구분할 수 없어 버튼이 보였다가 API 에서 거부되던 간극 해소.
   */
  canManage?: boolean;
}

interface AdjacentNotice {
  id: string;
  title: string;
}

/** 백엔드 /notices/{id}/comments 원시 응답 (목록 data[] · 생성 응답 공통 형태) */
interface RawComment {
  id: string;
  content: string;
  userId?: string;
  userName?: string;
  createdAt: string;
  user?: { id: string; firstName?: string; lastName?: string };
}

/** 댓글 목록 페이지 응답 (백엔드 getComments 계약) */
interface RawCommentPage {
  data?: RawComment[];
  comments?: RawComment[];
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

/** 한 페이지 수신 개수 — 백엔드 기본값(10)은 잘림이 보이지 않는 문제가 있어 명시 전송 */
const COMMENTS_PAGE_SIZE = 30;

/** 원시 댓글 → CommentData 매핑 (작성자명/ID 정규화). 백엔드는 userName/userId 를 내려주고
 *  CommentThread 는 author/authorId 를 기대하므로 여기서 통일한다. */
function mapRawComment(c: RawComment): CommentData {
  const name =
    c.userName ??
    (c.user ? `${c.user.lastName ?? ''}${c.user.firstName ?? ''}`.trim() : '');
  return {
    id: c.id,
    author: name || '알 수 없음',
    authorId: c.userId ?? c.user?.id,
    content: c.content,
    createdAt: c.createdAt,
  };
}

/* ───────── 섹션 라벨 (14px 800) ─────────
   [Phase 5 · AC 5-6] 좌측 3px 세로 스트라이프 제거 — RULE-D04(pipe-like 세로 구분선 금지)
   전역 규칙 준수. 위계는 굵기·크기·여백으로만 표현한다. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
      <span className="text-[14px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em] inline-flex items-center gap-1.5">
        {children}
      </span>
    </div>
  );
}

export default function NoticeDetailPage() {
  const params = useParams();
  const noticeId = params?.id as string;
  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  usePageReady(!isLoading);
  // 'denied' = 404/403 (백엔드가 타 팀 공지를 404 로 감춤 — 재시도해도 결과 동일)
  // 'load'   = 네트워크·5xx 등 일시적 실패 (재시도 의미 있음)
  const [errorKind, setErrorKind] = useState<'denied' | 'load' | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [prevNotice, setPrevNotice] = useState<AdjacentNotice | null>(null);
  const [nextNotice, setNextNotice] = useState<AdjacentNotice | null>(null);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const { user } = useSessionAuth();
  const currentUserId = user?.id ?? '';
  const [comments, setComments] = useState<CommentData[]>([]);
  // 서버 기준 전체 댓글 수 — 더보기 버튼 노출 판정. 작성/삭제 시 로컬에서 함께 보정한다.
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentPage, setCommentPage] = useState(1);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);

  const { navigate, replace, back } = useNavigation();
  const { toast } = useToast();
  // [2026-07-20 읽음 동기화] 공지 열람(GET /notices/:id)이 백엔드에서 대응 알림함
  //   행까지 읽음 처리하므로, 벨 미읽음·앱 아이콘 배지를 즉시 재조회로 반영한다.
  const { refresh: refreshBellNotifications } = useNotificationContext();
  const { modal } = useModal();

  const handleEditNotice = useCallback(() => {
    navigate(`/notices-create?edit=${noticeId}`);
  }, [navigate, noticeId]);

  const handleDeleteNotice = useCallback(async () => {
    const confirmed = await modal.confirm({
      title: MESSAGES.notice.deleteConfirm,
      message: MESSAGES.notice.deleteConfirmDesc,
      confirmText: '삭제하기',
      cancelText: '취소',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await api.delete(`/notices/${noticeId}`);
      if (res.success) {
        toast.success(MESSAGES.notice.deleted);
        emitRefresh(REFRESH_KEYS.NOTICES);
        emitRefresh(['notices', 'admin']);
        back();
      } else {
        toast.error(MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  }, [modal, noticeId, toast, back]);

  const loadNotice = useCallback(async () => {
    if (!noticeId) return;
    setIsLoading(true);
    setErrorKind(null);
    try {
      const res = await api.get<{
        id: string;
        title: string;
        content: string;
        targetType?: string;
        viewCount?: number;
        isPinned?: boolean;
        createdAt: string;
        targetTeamId?: string | null;
        canManage?: boolean;
        /** [Phase 2] 이관 팀 공지 마커 — TeamPost 상세로 안내 */
        migrated?: boolean;
        redirectTo?: string;
      }>(`/notices/${noticeId}`);
      if (res.success && res.data?.migrated && res.data.redirectTo) {
        // [Phase 2] 팀 공지는 TeamPost 로 이관 — 구 링크(기발송 알림·검색 결과)를
        // 새 상세로 교체 이동 (뒤로가기에 죽은 중간 화면이 남지 않게 replace).
        replace(res.data.redirectTo);
        return;
      }
      if (res.success && res.data) {
        const d = res.data;
        const dt = new Date(d.createdAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        const formattedDate =
          `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())} ` +
          `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
        setNotice({
          id: d.id,
          category: d.targetType === 'event' ? 'event' : 'notice',
          title: d.title,
          content: d.content,
          date: formattedDate,
          viewCount: d.viewCount ?? 0,
          isPinned: d.isPinned,
          targetTeamId: d.targetTeamId ?? null,
          canManage: d.canManage === true,
        });
        // 열람 = 읽음(백엔드 NoticeRead + 알림함 동기화 완료) → 벨/앱 배지 갱신
        void refreshBellNotifications();
      } else {
        const status = res.error?.statusCode;
        setErrorKind(status === 404 || status === 403 ? 'denied' : 'load');
      }
    } catch {
      setErrorKind('load');
    } finally {
      setIsLoading(false);
    }
  }, [noticeId, refreshBellNotifications, replace]);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  // 이전글/다음글 — 전용 API (Phase 5 · AC 5-3~4 · F-14).
  //   기존 limit=100 목록 수신 후 클라이언트 계산은 101번째부터 부정확했고, 진입 공지의
  //   종류(팀/서비스) 풀·게시기간·정렬(createdAt DESC, id DESC 동률 포함)을 서버가 단일 계산한다.
  const loadAdjacent = useCallback(async () => {
    if (!noticeId) return;
    try {
      const res = await api.get<{
        next: AdjacentNotice | null;
        previous: AdjacentNotice | null;
      }>(`/notices/${noticeId}/adjacent`);
      if (!res.success || !res.data) {
        setPrevNotice(null);
        setNextNotice(null);
        return;
      }
      setNextNotice(res.data.next);
      setPrevNotice(res.data.previous);
    } catch {
      setPrevNotice(null);
      setNextNotice(null);
    }
  }, [noticeId]);

  useEffect(() => {
    void loadAdjacent();
  }, [loadAdjacent]);

  // 댓글 로드 (api 클라이언트 사용 — 파일 일관성)
  const loadComments = useCallback(async () => {
    if (!noticeId) return;
    const res = await api.get<RawCommentPage>(
      `/notices/${noticeId}/comments?page=1&limit=${COMMENTS_PAGE_SIZE}`,
    );
    // 백엔드는 { data: [...] } 형태로 반환. 과거 comments 키와의 불일치 양쪽 지원.
    const rawList = res.data?.data ?? res.data?.comments;
    if (res.success && rawList) {
      // 백엔드는 최신순(desc)으로 내려줌 → 화면은 오래된→최신(최신이 아래)으로 표시
      const ordered = [...rawList].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setComments(ordered.map(mapRawComment));
      setCommentPage(1);
      setCommentTotal(res.data?.pagination?.total ?? rawList.length);
    }
  }, [noticeId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  // 이전 댓글 더보기 — 다음 페이지(desc 기준 = 더 오래된 묶음)를 받아 목록 위쪽에 병합.
  // offset 기반이라 로드 사이에 새 댓글이 달리면 경계가 밀려 중복 수신될 수 있어 id 로 걸러낸다.
  const handleLoadMoreComments = useCallback(async () => {
    if (!noticeId || isLoadingMoreComments) return;
    setIsLoadingMoreComments(true);
    try {
      const nextPage = commentPage + 1;
      const res = await api.get<RawCommentPage>(
        `/notices/${noticeId}/comments?page=${nextPage}&limit=${COMMENTS_PAGE_SIZE}`,
      );
      const rawList = res.data?.data ?? res.data?.comments;
      if (res.success && rawList) {
        const ordered = [...rawList].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setComments((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const fresh = ordered
            .map(mapRawComment)
            .filter((c) => !existingIds.has(c.id));
          return [...fresh, ...prev];
        });
        setCommentPage(nextPage);
        if (res.data?.pagination) setCommentTotal(res.data.pagination.total);
      }
    } finally {
      setIsLoadingMoreComments(false);
    }
  }, [noticeId, commentPage, isLoadingMoreComments]);

  const handleCommentSubmit = useCallback(
    async (text: string) => {
      const res = await api.post<RawComment>(`/notices/${noticeId}/comments`, {
        content: text,
      });
      if (res.success && res.data) {
        setComments((prev) => [...prev, mapRawComment(res.data as RawComment)]);
        setCommentTotal((prev) => prev + 1);
      }
    },
    [noticeId],
  );

  const handleCommentDelete = useCallback(
    async (commentId: string | number) => {
      const confirmed = await modal.confirm({
        title: MESSAGES.notice.commentDeleteConfirm,
        message: MESSAGES.notice.commentDeleteConfirmDesc,
        confirmText: '삭제하기',
        cancelText: '취소',
        variant: 'danger',
      });
      if (!confirmed) return;
      try {
        const res = await api.delete(`/notices/comments/${commentId}`);
        if (res.success) {
          toast.success(MESSAGES.notice.commentDeleted);
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          setCommentTotal((prev) => Math.max(0, prev - 1));
        } else {
          toast.error(MESSAGES.error.general);
        }
      } catch {
        toast.error(MESSAGES.error.general);
      }
    },
    [modal, toast],
  );

  const header = <PageAppBar title="공지 상세" forceNative />;

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        {header}
        <div className="flex-1 flex items-center justify-center bg-it-canvas dark:bg-puck">
          <div className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  if (errorKind || !notice) {
    // 일시적 실패만 재시도를 제공한다. 404/403(=열람 권한 없음·부재)은 재시도해도 동일하므로
    // 목록 복귀만 안내한다.
    const isTransient = errorKind === 'load';
    return (
      <MobileContainer hasBottomNav={false}>
        {header}
        <div className="flex flex-col items-center justify-center flex-1 py-20 bg-it-canvas dark:bg-puck">
          <Icon
            name={isTransient ? 'wifi_off' : 'error_outline'}
            className="text-6xl text-it-ink-300 dark:text-rink-500 mb-4"
            aria-hidden="true"
          />
          <p className="text-it-ink-500 dark:text-rink-300 text-center px-8">
            {isTransient
              ? MESSAGES.notice.loadFailed
              : MESSAGES.notice.notFoundOrForbidden}
          </p>
          {isTransient && (
            <button
              onClick={() => void loadNotice()}
              className="mt-4 px-6 h-11 bg-it-blue-500 hover:bg-it-blue-600 text-white font-semibold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {MESSAGES.notice.loadRetry}
            </button>
          )}
          <NavLink
            href="/notices"
            className="mt-3 text-it-blue-500 font-medium hover:underline text-card-body"
          >
            {MESSAGES.notice.backToList}
          </NavLink>
        </div>
      </MobileContainer>
    );
  }

  const kindLabel = notice.category === 'event' ? '이벤트' : '공지';

  return (
    <MobileContainer hasBottomNav={false} className="selectable-text">
      {header}

      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck pb-10"
        role="main"
        aria-label="공지사항 상세"
      >
        {/* Hero — full-bleed navy 밴드 (ICETIMES flat · 카드 박스 제거). */}
        <div className="relative bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-4 pb-5 text-white">
          {/* 우상단 조회수 chip */}
          <div className="absolute top-4 right-5 inline-flex items-center gap-1.5 rounded-w-pill border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white tabular-nums">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 6s2-3 5-3 5 3 5 3-2 3-5 3-5-3-5-3z" stroke="#fff" strokeWidth="1.3" />
              <circle cx="6" cy="6" r="1.6" stroke="#fff" strokeWidth="1.3" />
            </svg>
            {notice.viewCount.toLocaleString()}
          </div>

          <div>
            <span className="inline-block rounded-w-xs bg-white/20 px-2.5 py-1 text-[11px] font-extrabold tracking-[0.02em] text-white">
              {kindLabel}
            </span>
          </div>

          <h1 className="mt-2.5 pr-10 text-[20px] font-extrabold leading-[1.3] tracking-[-0.025em]">
            {notice.title}
          </h1>

          <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-white/85 tabular-nums">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="9" height="8" rx="1" stroke="#fff" strokeWidth="1.3" />
              <path d="M1.5 4.5h9M4 1.5v2M8 1.5v2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {notice.date}
          </div>
        </div>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 본문 — flat 흰 섹션 (카드 박스 제거, 내용이 짧아도 최소 높이 확보) */}
        <section className="bg-it-surface dark:bg-rink-800 pb-5" aria-label="공지 본문">
          <SectionLabel>본문</SectionLabel>
          <div className="px-5">
            <div
              className={cn(
                'min-h-[140px] text-[14.5px] leading-[1.7] font-medium text-it-ink-700 dark:text-wtext-4 whitespace-pre-line',
                '[&_b]:text-it-blue-600 [&_b]:font-extrabold',
                '[&_strong]:text-it-blue-600 [&_strong]:font-extrabold',
                '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
                '[&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-3 [&_ul]:space-y-1',
              )}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(notice.content) }}
            />
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 댓글 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 pb-3" aria-label="댓글">
          <SectionLabel>
            댓글
            <span className="ml-1 rounded-w-pill bg-it-line dark:bg-rink-700 px-1.5 py-px text-[11px] font-extrabold text-it-ink-700 dark:text-wtext-4 tabular-nums">
              {commentTotal}
            </span>
          </SectionLabel>
          <div className="px-5 pb-2">
            {commentTotal > comments.length && (
              <button
                type="button"
                onClick={() => void handleLoadMoreComments()}
                disabled={isLoadingMoreComments}
                className="mb-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-w-md border border-it-line dark:border-rink-700 bg-it-fill dark:bg-rink-700/40 text-[13px] font-bold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-line/60 dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-it-blue-500/40"
              >
                <Icon name="expand_less" className="text-[18px]" aria-hidden="true" />
                {MESSAGES.notice.commentLoadMore(commentTotal - comments.length)}
              </button>
            )}
            <CommentThread
              comments={comments}
              onSubmit={handleCommentSubmit}
              placeholder={MESSAGES.placeholders.enterCommentSimple}
              currentUserId={currentUserId}
              onDelete={handleCommentDelete}
            />
          </div>
        </section>

        {/* 공지 수정/삭제 — 서버 계산 canManage 단일 기준 (AC 5-1 · Phase 2 역할 추정 과도기 종료). */}
        {notice?.canManage && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-4 grid grid-cols-2 gap-2" aria-label={MESSAGES.notice.manage}>
              <button
                type="button"
                onClick={handleEditNotice}
                className="h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-body font-bold text-it-ink-700 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-it-blue-500/40 inline-flex items-center justify-center gap-1.5"
              >
                <Icon name="edit" className="text-[18px]" aria-hidden="true" />
                수정하기
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteNotice()}
                className="h-12 rounded-w-md border-[1.5px] border-it-red-500 text-card-body font-bold text-it-red-500 transition-colors motion-reduce:transition-none hover:bg-it-red-50 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-it-red-500/40 inline-flex items-center justify-center gap-1.5 dark:hover:bg-it-red-500/10"
              >
                <Icon name="delete" className="text-[18px]" aria-hidden="true" />
                삭제하기
              </button>
            </section>
          </>
        )}

        {/* 다른 공지 보기 — flat 흰 섹션 (hairline 행) */}
        {(prevNotice || nextNotice) && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section
              className="bg-it-surface dark:bg-rink-800 pb-3"
              aria-label={MESSAGES.notice.adjacentTitle}
            >
              <SectionLabel>{MESSAGES.notice.adjacentTitle}</SectionLabel>
              <div className="px-5">
                {nextNotice ? (
                  // 인접 이동은 push 가 아닌 **historyMode="replace"** — push 로 이동하면 방문 공지가
                  // 히스토리에 층층이 쌓여, 헤더 뒤로가기가 목록이 아니라 지나온 공지들을 되짚는다.
                  // replace 는 [진입점, 현재 상세] 두 층만 유지해 한 번에 복귀한다.
                  // [R3-01] 실제 <a href> 링크로 유지 — 새 탭/링크 복사/스크린 리더 link 역할 보존,
                  // 일반 좌클릭만 replace 위임(수정키·비주 클릭은 네이티브 동작).
                  <NavLink
                    href={`/notice/${nextNotice.id}`}
                    historyMode="replace"
                    className={cn(
                      'flex w-full items-center gap-3 py-3.5 text-left',
                      prevNotice && 'border-b border-it-line dark:border-rink-700',
                    )}
                  >
                    <span className="w-10 shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.02em] text-it-blue-500">
                      {MESSAGES.notice.adjacentNext}
                    </span>
                    <span className="flex-1 truncate text-[13.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                      {nextNotice.title}
                    </span>
                    <Icon name="chevron_right" className="shrink-0 text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
                  </NavLink>
                ) : (
                  <div
                    className={cn(
                      'flex w-full items-center gap-3 py-3.5',
                      prevNotice && 'border-b border-it-line dark:border-rink-700',
                    )}
                  >
                    <span className="w-10 shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.02em] text-it-ink-400 dark:text-wtext-4">
                      {MESSAGES.notice.adjacentNext}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-it-ink-400 dark:text-wtext-4">
                      {MESSAGES.notice.adjacentNextEmpty}
                    </span>
                  </div>
                )}
                {prevNotice ? (
                  <NavLink
                    href={`/notice/${prevNotice.id}`}
                    historyMode="replace"
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <span className="w-10 shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.02em] text-it-blue-500">
                      {MESSAGES.notice.adjacentPrev}
                    </span>
                    <span className="flex-1 truncate text-[13.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                      {prevNotice.title}
                    </span>
                    <Icon name="chevron_right" className="shrink-0 text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
                  </NavLink>
                ) : (
                  <div className="flex w-full items-center gap-3 py-3.5">
                    <span className="w-10 shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.02em] text-it-ink-400 dark:text-wtext-4">
                      {MESSAGES.notice.adjacentPrev}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-it-ink-400 dark:text-wtext-4">
                      {MESSAGES.notice.adjacentPrevEmpty}
                    </span>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        <div className="h-6" />
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
