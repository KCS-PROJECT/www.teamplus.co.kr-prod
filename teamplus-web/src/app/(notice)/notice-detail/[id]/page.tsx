'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { BackHeader } from '@/components/layout/Header';
import { CommentThread, type CommentData } from '@/components/shared/CommentThread';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { usePageReady } from '@/hooks/usePageReady';
import { resolveImageSrc } from '@/lib/image-url';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/services/api-client';
import DOMPurify from 'dompurify';
import { MESSAGES } from '@/lib/messages';
import { safeNavigate } from '@/lib/safe-navigate';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { ReportModal } from '@/components/moderation/ReportModal';

/**
 * 공지/이벤트 상세 페이지 (참고자료 04n · 공지사항 상세 디자인 적용)
 * - Hero gradient 카드 (조회수 chip + 카테고리 + 제목 + 날짜)
 * - SectionLabel 패턴 (스트라이프 + 14px 800)
 * - 본문 카드 / 안내 사항 definition list / 마무리 카드 / 다른 공지 보기
 * - Sticky bottom action bar (1:2 split)
 * - 기존 기능 보존: 댓글, 첨부파일, ConfirmSheet, summary, action/secondary 버튼
 */

interface NoticeDetail {
  id: string;
  category: 'notice' | 'event' | 'urgent';
  title: string;
  content: string;
  date: string;
  viewCount: number;
  isPinned?: boolean;
  imageUrl?: string;
  summary?: {
    period?: string;
    target?: string;
    fee?: string;
  };
  attachments?: {
    name: string;
    url: string;
    type: 'pdf' | 'image' | 'doc';
  }[];
  actionButton?: {
    label: string;
    url: string;
  };
  secondaryButton?: {
    label: string;
    url: string;
  };
  comments?: CommentData[];
}

interface ApiNoticeDetail {
  id: string;
  title: string;
  content?: string;
  priority?: number;
  isActive?: boolean;
  createdAt?: string;
  expiresAt?: string;
  imageUrl?: string;
  category?: string;
  viewCount?: number;
  summary?: {
    period?: string;
    target?: string;
    fee?: string;
  };
  actionButton?: {
    label: string;
    url: string;
  };
  secondaryButton?: {
    label: string;
    url: string;
  };
  attachments?: {
    name: string;
    url: string;
    type: 'pdf' | 'image' | 'doc';
  }[];
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

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') return dirty;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['strong', 'ul', 'li', 'p', 'br', 'em', 'b', 'i', 'span', 'div', 'a', 'h1', 'h2', 'h3', 'h4', 'ol', 'img'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
  });
}

const CATEGORY_LABEL: Record<string, string> = {
  event: '이벤트',
  notice: '공지',
  urgent: '긴급',
};

/* ───────── 섹션 라벨 (좌측 스트라이프 + 14px 800) ───────── */
function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-2.5">
      <div className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="w-[3px] h-3.5 bg-ice-500 rounded-sm" />
        <span className="text-[14px] font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em] inline-flex items-center gap-1.5">
          {children}
        </span>
      </div>
      {action}
    </div>
  );
}

export default function NoticeDetailPage() {
  const { back } = useNavigation();
  const params = useParams();
  const noticeId = params?.id as string;
  const { user } = useSessionAuth();
  const currentUserId = user?.id ?? '';
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  // UGC 댓글 신고 대상 (null 이면 모달 닫힘) — App Store 1.2
  const [reportTargetComment, setReportTargetComment] = useState<{
    commentId: string;
    authorId: string;
    authorName: string;
  } | null>(null);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: '공지 상세',
    showBottomNav: false,
    showBackButton: true,
    onBackPress: () => back(),
  });

  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  usePageReady(!isLoading);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [prevNotice, setPrevNotice] = useState<AdjacentNotice | null>(null);
  const [nextNotice, setNextNotice] = useState<AdjacentNotice | null>(null);

  // 공지 상세 로드
  useEffect(() => {
    if (!noticeId) return;
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const res = await apiRequest<ApiNoticeDetail>({
          method: 'GET',
          url: `/notices/${noticeId}`,
          retry: false,
        });
        if (!mounted) return;
        if (!res.success || !res.data) {
          setNotice(null);
          setNotFound(true);
          return;
        }
        const d = res.data;
        setNotice({
          id: d.id,
          category: (d.category as 'notice' | 'event' | 'urgent') || 'notice',
          title: d.title,
          content: d.content ?? '',
          date: formatDate(d.createdAt),
          viewCount: d.viewCount ?? 0,
          isPinned: (d.priority ?? 0) > 0,
          imageUrl: d.imageUrl,
          summary: d.summary,
          actionButton: d.actionButton,
          secondaryButton: d.secondaryButton,
          attachments: d.attachments,
        });
        setNotFound(false);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [noticeId]);

  // 댓글 로드
  useEffect(() => {
    if (!noticeId) return;
    let mounted = true;
    (async () => {
      const res = await apiRequest<{
        data?: RawComment[];
        comments?: RawComment[];
      }>({
        method: 'GET',
        url: `/notices/${noticeId}/comments`,
        retry: false,
      });
      // 백엔드는 { data: [...] } 형태로 반환(과거 코드의 comments 키와 불일치). 양쪽 지원.
      const rawList = res.data?.data ?? res.data?.comments;
      if (mounted && res.success && rawList) {
        setComments(rawList.map(mapRawComment));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [noticeId]);

  // 이전/다음 글
  useEffect(() => {
    if (!noticeId) return;
    let mounted = true;
    (async () => {
      const res = await apiRequest<
        | { data?: { id: string; title: string }[]; notices?: { id: string; title: string }[] }
        | { id: string; title: string }[]
      >({
        method: 'GET',
        url: '/notices?limit=100&page=1&isActive=true',
        retry: false,
      });
      if (!mounted || !res.success || !res.data) return;
      const list = Array.isArray(res.data)
        ? res.data
        : ((res.data as { notices?: { id: string; title: string }[] }).notices
          ?? (res.data as { data?: { id: string; title: string }[] }).data
          ?? []);
      const idx = list.findIndex((n) => n.id === noticeId);
      if (idx === -1) {
        setPrevNotice(null);
        setNextNotice(null);
        return;
      }
      const next = idx - 1 >= 0 ? list[idx - 1] : null;
      const prev = idx + 1 < list.length ? list[idx + 1] : null;
      setPrevNotice(prev ? { id: prev.id, title: prev.title } : null);
      setNextNotice(next ? { id: next.id, title: next.title } : null);
    })();
    return () => {
      mounted = false;
    };
  }, [noticeId]);

  const handleCommentSubmit = useCallback(async (text: string) => {
    const res = await apiRequest<RawComment>({
      method: 'POST',
      url: `/notices/${noticeId}/comments`,
      data: { content: text },
      retry: false,
    });
    if (res.success && res.data) {
      setComments((prev) => [...prev, mapRawComment(res.data as RawComment)]);
    }
  }, [noticeId]);

  // 댓글 신고 클릭 → 신고 모달 오픈 (App Store 1.2 UGC)
  const handleCommentReport = useCallback(
    (commentId: string | number, authorId: string, authorName: string) => {
      setReportTargetComment({
        commentId: String(commentId),
        authorId,
        authorName,
      });
    },
    [],
  );

  const handleActionConfirm = useCallback(() => {
    setShowConfirmSheet(false);
    if (notice?.actionButton?.url) {
      // [보안 2026-06-07] 백엔드 제공 URL 스킴 검증(javascript:/오픈리다이렉트 방어)
      safeNavigate(notice.actionButton.url);
    }
  }, [notice]);

  const hasBottomActions = !!notice && !!(notice.actionButton || notice.secondaryButton);

  if (isLoading) {
    return null;
  }

  if (notFound || !notice) {
    return (
      <MobileContainer hasBottomNav={false}>
        <BackHeader title="공지 상세" onBack={() => back()} />
        <div className="flex flex-col items-center justify-center flex-1 py-20">
          <div className="w-14 h-14 rounded-2xl bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-wtext-3 dark:text-rink-300 text-center font-medium">
            공지사항을 찾을 수 없습니다.
          </p>
          <NavLink
            href="/notices"
            className="mt-4 text-ice-500 font-medium hover:underline"
          >
            목록으로 돌아가기
          </NavLink>
        </div>
      </MobileContainer>
    );
  }

  const kindLabel = CATEGORY_LABEL[notice.category] ?? '공지';
  const summaryRows: { k: string; v: React.ReactNode }[] = [];
  if (notice.summary?.period) {
    summaryRows.push({
      k: '기간',
      v: <span className="font-extrabold text-wtext-1 dark:text-white tabular-nums">{notice.summary.period}</span>,
    });
  }
  if (notice.summary?.target) {
    summaryRows.push({
      k: '대상',
      v: <span className="font-extrabold text-wtext-1 dark:text-white">{notice.summary.target}</span>,
    });
  }
  if (notice.summary?.fee) {
    summaryRows.push({
      k: '혜택',
      v: (
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md bg-flame-500/10 px-2 py-0.5 text-[11px] font-extrabold text-flame-500">
            {notice.summary.fee}
          </span>
        </span>
      ),
    });
  }
  summaryRows.push({
    k: '결제 방법',
    v: <span className="font-bold text-wtext-4">—</span>,
  });
  summaryRows.push({
    k: '문의',
    v: <span className="font-extrabold text-wtext-1 dark:text-white tabular-nums">1588-0000</span>,
  });

  return (
    <MobileContainer hasBottomNav={false} className="selectable-text">
      <BackHeader title="공지 상세" onBack={() => back()} />

      <main
        className={cn(
          'flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-rink-900',
          hasBottomActions ? 'pb-32' : 'pb-10',
        )}
        role="main"
        aria-label="공지사항 상세"
      >
        {/* [2026-05-18] DESIGN.md SoT — solid ice-500 + sh-blue 토큰 (AI 스타일 제거). */}
        <div className="px-5 pt-3">
          <div className="relative overflow-hidden rounded-[18px] bg-ice-500 px-5 pt-[22px] pb-5 text-white shadow-sh-blue">
            {/* 우상단 조회수 chip */}
            <div className="absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-w-pill border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white tabular-nums">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M1 6s2-3 5-3 5 3 5 3-2 3-5 3-5-3-5-3z"
                  stroke="#fff"
                  strokeWidth="1.3"
                />
                <circle cx="6" cy="6" r="1.6" stroke="#fff" strokeWidth="1.3" />
              </svg>
              {notice.viewCount.toLocaleString()}
            </div>

            <div className="mt-[18px]">
              <span className="inline-block rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-extrabold tracking-[0.02em] text-white">
                {kindLabel}
              </span>
            </div>

            <div className="mt-3 pr-10 text-[20px] font-extrabold leading-[1.35] tracking-[-0.025em]">
              {notice.title}
            </div>

            <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/85 tabular-nums">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" stroke="#fff" strokeWidth="1.3" />
                <path d="M1.5 4.5h9M4 1.5v2M8 1.5v2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {notice.date}
            </div>
          </div>
        </div>

        {/* 히어로 이미지 (있을 때만 노출 — 본문 위에 별도 카드로) */}
        {resolveImageSrc(notice.imageUrl) && (
          <div className="px-5 pt-3">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[14px] border border-wline-2 dark:border-rink-700 bg-wline-2 dark:bg-rink-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(notice.imageUrl)}
                alt={notice.title ?? ''}
                className="absolute inset-0 size-full object-cover"
              />
            </div>
          </div>
        )}

        {/* 본문 카드 */}
        <SectionLabel>본문</SectionLabel>
        <div className="px-5">
          <div className="rounded-[14px] border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 p-[18px] shadow-[0_4px_14px_rgba(20,24,38,0.04)]">
            <div
              className={cn(
                'text-[14px] leading-[1.7] font-medium text-wtext-2 dark:text-wtext-4 whitespace-pre-line',
                '[&_b]:text-ice-600 [&_b]:font-extrabold',
                '[&_strong]:text-ice-600 [&_strong]:font-extrabold',
                '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
                '[&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-3 [&_ul]:space-y-1',
              )}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(notice.content) }}
            />
          </div>
        </div>

        {/* 안내 사항 — definition list */}
        {(summaryRows.length > 0 || notice.summary) && (
          <>
            <SectionLabel>안내 사항</SectionLabel>
            <div className="px-5">
              <div className="rounded-[14px] border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 px-4 py-1.5 shadow-[0_4px_14px_rgba(20,24,38,0.04)]">
                {summaryRows.map((row, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between py-3',
                      i !== summaryRows.length - 1 && 'border-b border-wline-2 dark:border-rink-700',
                    )}
                  >
                    <span className="text-[13px] font-semibold text-wtext-3 dark:text-wtext-4">{row.k}</span>
                    <span className="text-[13px]">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 마무리 카드 */}
        <div className="px-5 pt-5">
          <div className="rounded-[14px] border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 px-[18px] py-4 shadow-[0_4px_14px_rgba(20,24,38,0.04)]">
            <p className="m-0 text-[13.5px] leading-[1.7] font-medium text-wtext-2 dark:text-wtext-4">
              자세한 참여 방법과 유의사항은 아래 버튼 또는 첨부파일을 통해 확인해 주세요. 궁금하신 점은 언제든지 고객센터로 문의해 주세요.
            </p>
            <p className="mt-3 mb-0 text-[13.5px] leading-[1.7] font-extrabold text-wtext-2 dark:text-wtext-4">
              감사합니다.
            </p>
          </div>
        </div>

        {/* 첨부파일 */}
        {notice.attachments && notice.attachments.length > 0 && (
          <>
            <SectionLabel>첨부파일</SectionLabel>
            <div className="px-5 flex flex-col gap-2">
              {notice.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.url}
                  download
                  className="flex items-center gap-3 rounded-[14px] border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 px-4 py-3 shadow-[0_4px_14px_rgba(20,24,38,0.04)] hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none"
                >
                  <Icon name="download" className="text-xl text-wtext-3 dark:text-wtext-4" aria-hidden="true" />
                  <span className="truncate text-[13px] font-medium text-wtext-2 dark:text-wtext-4">{att.name}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {/* 다른 공지 보기 */}
        {(prevNotice || nextNotice) && (
          <>
            <SectionLabel>다른 공지 보기</SectionLabel>
            <div className="px-5">
              <div className="rounded-[14px] border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 px-4 py-1.5 shadow-[0_4px_14px_rgba(20,24,38,0.04)]">
                {nextNotice && (
                  <NavLink
                    href={`/notice/${nextNotice.id}`}
                    className={cn(
                      'flex w-full items-center gap-3 py-3 text-left',
                      prevNotice && 'border-b border-wline-2 dark:border-rink-700',
                    )}
                  >
                    <span className="w-8 shrink-0 text-[11px] font-extrabold tracking-[0.02em] text-ice-600">
                      다음글
                    </span>
                    <span className="flex-1 truncate text-[13px] font-bold tracking-[-0.01em] text-wtext-1 dark:text-white">
                      {nextNotice.title}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M5 3l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-wtext-3 dark:text-wtext-4"
                      />
                    </svg>
                  </NavLink>
                )}
                {prevNotice && (
                  <NavLink
                    href={`/notice/${prevNotice.id}`}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className="w-8 shrink-0 text-[11px] font-extrabold tracking-[0.02em] text-ice-600">
                      이전글
                    </span>
                    <span className="flex-1 truncate text-[13px] font-bold tracking-[-0.01em] text-wtext-1 dark:text-white">
                      {prevNotice.title}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M5 3l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-wtext-3 dark:text-wtext-4"
                      />
                    </svg>
                  </NavLink>
                )}
              </div>
            </div>
          </>
        )}

        {/* 댓글 영역 */}
        <SectionLabel>
          댓글
          {comments.length > 0 && (
            <span className="ml-1 rounded-w-pill bg-wline-2 dark:bg-rink-700 px-1.5 py-px text-[11px] font-extrabold text-wtext-2 dark:text-wtext-4 tabular-nums">
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
            onReportClick={handleCommentReport}
          />
        </div>

        <div className="h-6" />
      </main>

      {/* Sticky bottom action bar — 04e 패턴 (1:2 split)
          [2026-05-18] AI 스타일 (gradient fade) 제거. solid wbg + 상단 border 처리. */}
      {hasBottomActions && (
        <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-5 pb-[max(env(safe-area-inset-bottom,0px),20px)] pt-2.5 bg-wbg dark:bg-rink-900 border-t border-wline dark:border-rink-700">
          <div
            className={cn(
              'grid gap-2.5',
              notice.actionButton && notice.secondaryButton
                ? 'grid-cols-[1fr_2fr]'
                : 'grid-cols-1',
            )}
          >
            {notice.secondaryButton && (
              <NavLink
                href={notice.secondaryButton.url}
                className="inline-flex h-[50px] items-center justify-center gap-1.5 rounded-[14px] border border-wline bg-wsurface dark:bg-rink-800 dark:border-rink-700 text-[14px] font-extrabold tracking-[-0.01em] text-wtext-2 dark:text-wtext-4 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M7 1v8M4 6l3 3 3-3M2 12h10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {notice.secondaryButton.label}
              </NavLink>
            )}
            {notice.actionButton && (
              <button
                type="button"
                onClick={() => setShowConfirmSheet(true)}
                className="inline-flex h-[50px] items-center justify-center gap-1.5 rounded-[14px] bg-ice-500 text-[14px] font-extrabold tracking-[-0.01em] text-white shadow-sh-blue hover:bg-ice-600 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                {notice.actionButton.label}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M5 3h6v6M11 3L5 9"
                    stroke="#fff"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M3 5v6h6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 참가 신청 확인 시트 */}
      {notice?.actionButton && (
        <ConfirmSheet
          open={showConfirmSheet}
          title={`${notice.actionButton.label}하시겠습니까?`}
          description="신청 후 취소는 관리자에게 문의해주세요."
          confirmLabel={notice.actionButton.label}
          cancelLabel="취소"
          variant="primary"
          onConfirm={handleActionConfirm}
          onCancel={() => setShowConfirmSheet(false)}
        />
      )}

      {/* UGC 댓글 신고 모달 (App Store 1.2) */}
      {reportTargetComment && (
        <ReportModal
          reportedId={reportTargetComment.authorId}
          targetType="user"
          targetId={reportTargetComment.commentId}
          targetName={reportTargetComment.authorName}
          onClose={() => setReportTargetComment(null)}
        />
      )}
    </MobileContainer>
  );
}
