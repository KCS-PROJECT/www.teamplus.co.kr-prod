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
  // 이전/다음글 scope 판정용 — 팀 공지(값) vs 서비스 공지(null)
  targetTeamId?: string | null;
}

interface AdjacentNotice {
  id: string;
  title: string;
}

interface NoticeListItem {
  id: string;
  title: string;
  createdAt?: string;
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

/* ───────── 섹션 라벨 (좌측 스트라이프 + 14px 800) ───────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
      <div className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="w-[3px] h-3.5 bg-it-blue-500 rounded-sm" />
        <span className="text-[14px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em] inline-flex items-center gap-1.5">
          {children}
        </span>
      </div>
    </div>
  );
}

export default function NoticeDetailPage() {
  const params = useParams();
  const noticeId = params?.id as string;
  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  usePageReady(!isLoading);
  const [hasError, setHasError] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [prevNotice, setPrevNotice] = useState<AdjacentNotice | null>(null);
  const [nextNotice, setNextNotice] = useState<AdjacentNotice | null>(null);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const { user } = useSessionAuth();
  const currentUserId = user?.id ?? '';
  const [comments, setComments] = useState<CommentData[]>([]);

  // [2026-06-18] 댓글 밑 공지 수정/삭제 버튼 노출 역할 판정.
  //   [2026-06-19 사용자 직접 지시] 서비스 공지(targetTeamId=null)는 admin(시스템관리자)만,
  //   팀 공지는 감독(DIRECTOR)만 수정/삭제 가능.
  const { navigate, back } = useNavigation();
  const { toast } = useToast();
  const { modal } = useModal();
  const noticeRole = (user?.userType ?? '').toUpperCase();
  const isDirector = noticeRole === 'DIRECTOR';
  const isAdmin = ['ADMIN', 'SYSTEM', 'OPER'].includes(noticeRole);

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
    setHasError(false);
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
      }>(`/notices/${noticeId}`);
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
        });
      } else {
        setHasError(true);
      }
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [noticeId]);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  // 이전글/다음글 — 진입 공지의 종류(팀/서비스)와 동일한 scope 안에서만 계산.
  //   (scope 없이 전체를 가져오면 팀 공지 상세에 서비스 공지가 섞여 노출됨)
  const loadAdjacent = useCallback(async () => {
    if (!noticeId || !notice) return;
    const scope = notice.targetTeamId ? 'team' : 'service';
    try {
      const res = await api.get<
        | { data?: NoticeListItem[]; notices?: NoticeListItem[] }
        | NoticeListItem[]
      >(`/notices?limit=100&page=1&isActive=true&scope=${scope}`);
      if (!res.success || !res.data) return;
      const list: NoticeListItem[] = Array.isArray(res.data)
        ? res.data
        : ((res.data as { notices?: NoticeListItem[] }).notices
          ?? (res.data as { data?: NoticeListItem[] }).data
          ?? []);
      // [2026-06-18] 이전/다음 글은 '등록일시(createdAt)' 기준으로 계산.
      //   목록 API 기본 정렬은 pinned 우선(고정 공지 최상단)이라, 고정된 오래된 공지가 맨 위로 와
      //   더 최신 공지가 '다음글'이 아닌 '이전글'로 잡히고 다음글이 비는 버그가 있었음.
      //   여기서 createdAt 내림차순(최신 우선)으로 재정렬한 뒤 인접 글을 구한다.
      const chrono = [...list].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
      const idx = chrono.findIndex((n) => n.id === noticeId);
      if (idx === -1) {
        setPrevNotice(null);
        setNextNotice(null);
        return;
      }
      // chrono 는 최신순 — idx-1 이 더 최신(다음글), idx+1 이 더 오래됨(이전글).
      const next = idx - 1 >= 0 ? chrono[idx - 1] : null;
      const prev = idx + 1 < chrono.length ? chrono[idx + 1] : null;
      setPrevNotice(prev ? { id: prev.id, title: prev.title } : null);
      setNextNotice(next ? { id: next.id, title: next.title } : null);
    } catch {
      setPrevNotice(null);
      setNextNotice(null);
    }
  }, [noticeId, notice]);

  useEffect(() => {
    void loadAdjacent();
  }, [loadAdjacent]);

  // 댓글 로드 (api 클라이언트 사용 — 파일 일관성)
  const loadComments = useCallback(async () => {
    if (!noticeId) return;
    const res = await api.get<{ data?: RawComment[]; comments?: RawComment[] }>(
      `/notices/${noticeId}/comments`,
    );
    // 백엔드는 { data: [...] } 형태로 반환. 과거 comments 키와의 불일치 양쪽 지원.
    const rawList = res.data?.data ?? res.data?.comments;
    if (res.success && rawList) {
      // 백엔드는 최신순(desc)으로 내려줌 → 화면은 오래된→최신(최신이 아래)으로 표시
      const ordered = [...rawList].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setComments(ordered.map(mapRawComment));
    }
  }, [noticeId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const handleCommentSubmit = useCallback(
    async (text: string) => {
      const res = await api.post<RawComment>(`/notices/${noticeId}/comments`, {
        content: text,
      });
      if (res.success && res.data) {
        setComments((prev) => [...prev, mapRawComment(res.data as RawComment)]);
      }
    },
    [noticeId],
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

  if (hasError || !notice) {
    return (
      <MobileContainer hasBottomNav={false}>
        {header}
        <div className="flex flex-col items-center justify-center flex-1 py-20 bg-it-canvas dark:bg-puck">
          <Icon
            name={hasError ? 'wifi_off' : 'error_outline'}
            className="text-6xl text-it-ink-300 dark:text-rink-500 mb-4"
            aria-hidden="true"
          />
          <p className="text-it-ink-500 dark:text-rink-300 text-center">
            {hasError ? '공지사항을 불러오지 못했습니다.' : '공지사항을 찾을 수 없습니다.'}
          </p>
          {hasError && (
            <button
              onClick={() => void loadNotice()}
              className="mt-4 px-6 h-11 bg-it-blue-500 hover:bg-it-blue-600 text-white font-semibold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95"
            >
              다시 시도
            </button>
          )}
          <NavLink
            href="/notices"
            className="mt-3 text-it-blue-500 font-medium hover:underline text-card-body"
          >
            목록으로 돌아가기
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
            {comments.length > 0 && (
              <span className="ml-1 rounded-w-pill bg-it-line dark:bg-rink-700 px-1.5 py-px text-[11px] font-extrabold text-it-ink-700 dark:text-wtext-4 tabular-nums">
                {comments.length}
              </span>
            )}
          </SectionLabel>
          <div className="px-5 pb-2">
            <CommentThread
              comments={comments}
              onSubmit={handleCommentSubmit}
              placeholder={MESSAGES.placeholders.enterCommentSimple}
              currentUserId={currentUserId}
            />
          </div>
        </section>

        {/* [2026-06-19 사용자 직접 지시] 공지 수정/삭제 — 서비스 공지(targetTeamId=null)는 admin(시스템관리자)만,
            팀 공지는 감독만 노출. (서비스 공지에서 감독에게 보이던 버튼 제거) */}
        {(notice?.targetTeamId ? isDirector : isAdmin) && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-4 grid grid-cols-2 gap-2" aria-label="공지 관리">
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
            <section className="bg-it-surface dark:bg-rink-800 pb-3" aria-label="다른 공지 보기">
              <SectionLabel>다른 공지 보기</SectionLabel>
              <div className="px-5">
                {nextNotice ? (
                  <NavLink
                    href={`/notice/${nextNotice.id}`}
                    className={cn(
                      'flex w-full items-center gap-3 py-3.5 text-left',
                      prevNotice && 'border-b border-it-line dark:border-rink-700',
                    )}
                  >
                    <span className="w-9 shrink-0 text-[11px] font-extrabold tracking-[0.02em] text-it-blue-500">
                      다음글
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
                    <span className="w-9 shrink-0 text-[11px] font-extrabold tracking-[0.02em] text-it-ink-400 dark:text-wtext-4">
                      다음글
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-it-ink-400 dark:text-wtext-4">
                      다음 공지사항이 없습니다.
                    </span>
                  </div>
                )}
                {prevNotice ? (
                  <NavLink
                    href={`/notice/${prevNotice.id}`}
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <span className="w-9 shrink-0 text-[11px] font-extrabold tracking-[0.02em] text-it-blue-500">
                      이전글
                    </span>
                    <span className="flex-1 truncate text-[13.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                      {prevNotice.title}
                    </span>
                    <Icon name="chevron_right" className="shrink-0 text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
                  </NavLink>
                ) : (
                  <div className="flex w-full items-center gap-3 py-3.5">
                    <span className="w-9 shrink-0 text-[11px] font-extrabold tracking-[0.02em] text-it-ink-400 dark:text-wtext-4">
                      이전글
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-it-ink-400 dark:text-wtext-4">
                      이전 공지사항이 없습니다.
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
