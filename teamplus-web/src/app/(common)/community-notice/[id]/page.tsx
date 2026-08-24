'use client';

// 수업/대회 단위 공지 상세 (Phase 1 · unit-notice-stream-design v1.2.3).
//   푸시 알림 linkUrl(`/community-notice/{id}`) 랜딩 — 열람 시 서버가 읽음(TeamPostRead) upsert.
//   감독·코치(canManage): 읽음 N/M 현황(수신자·미읽음 명단 + [1:1 문의]) + 수정/삭제 케밥.
//   댓글: 열람 가능자 전원 작성 · 삭제 버튼은 본인 댓글에만 노출 (백엔드는 관할 moderation 허용).

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
// [Codex R1 H-05] AuthContext 가드 훅 직접 import 금지 — page-safe facade 사용
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import { CommentThread, type CommentData } from '@/components/shared/CommentThread';
import { InfoPopover } from '@/components/shared/InfoPopover';
import { ImageLightbox } from '@/components/shared/ImageLightbox';
import { ActionSheet } from '@/components/director/ActionSheet';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { openDirectChat } from '@/services/chat';
import {
  addUnitNoticeComment,
  deleteUnitNotice,
  deleteUnitNoticeComment,
  fetchUnitNoticeDetail,
  fetchUnitNoticeReadsSummary,
  remindUnreadRecipients,
  updateUnitNoticeComment,
  type UnitNoticeDetail,
  type UnitNoticeReadsRecipient,
  type UnitNoticeReadsSummary,
} from '@/services/community-notice.service';

/**
 * [1:1 문의 잠금 — 2026-08-21 사용자 결정] 1:1 채팅의 사용 시점·채팅 목록 배치가
 * 미결정이라 진입점을 숨긴다. 로직(openDirectChat 등)은 보존 — 결정되면 이 플래그만 복원.
 */
const SHOW_DIRECT_CHAT = false;

/**
 * [댓글 수정 잠금 — 2026-08-24 사용자 결정] 수정은 하단 공용 입력창 재사용 구조라
 * 긴 댓글 목록에서 스크롤 수고가 커 비노출. 본인 삭제 후 재작성으로 대체(카톡 관행).
 * 재개 시 이 플래그 복원 + 수정 진입 시 입력창 자동 스크롤·포커스를 함께 적용할 것.
 */
const SHOW_COMMENT_EDIT = false;

/** XSS 방어 — /notice/[id] 와 동일 정책 */
let dompurifyHookAdded = false;
function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') return dirty;
  if (!dompurifyHookAdded) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (
          !href.startsWith('http://') &&
          !href.startsWith('https://') &&
          !href.startsWith('/')
        ) {
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

/** 작성 시각 "YYYY.MM.DD HH:mm" — 댓글·서비스 공지 상세와 동일 포맷 */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fullName(user: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return (
    `${user.lastName ?? ''}${user.firstName ?? ''}`.trim() ||
    MESSAGES.unitNotice.nameFallback
  );
}

export default function UnitNoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const postId = params?.id ?? '';
  const { toast } = useToast();
  const { navigate, back } = useNavigation();
  const { user } = useSessionAuth();

  const [post, setPost] = useState<UnitNoticeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteConfirm, setIsDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  // [Codex R1 M-02] 본인 댓글 수정 모드 — CommentThread 입력창을 수정에 재사용
  const [editingComment, setEditingComment] = useState<{
    id: string | number;
    content: string;
  } | null>(null);
  // 읽음 현황 (감독·코치 전용, 펼침 시 lazy 로드) — 미읽음 명단만 노출 (서버 계약)
  const [readsOpen, setReadsOpen] = useState(false);
  const [reads, setReads] = useState<UnitNoticeReadsSummary | null>(null);
  const [isReadsLoading, setIsReadsLoading] = useState(false);
  const [chatOpeningId, setChatOpeningId] = useState<string | null>(null);
  const [isReminding, setIsReminding] = useState(false);
  // 개별 재알림 진행 중인 대상 — 행별 중복 탭 방지
  const [remindingUserId, setRemindingUserId] = useState<string | null>(null);
  // 첨부 이미지 전체화면 보기 (탭 → ImageLightbox, 핀치줌 지원)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  usePageReady(!isLoading);

  /**
   * 상세 로드. silent=true 면 풀스크린 로딩 상태를 건드리지 않고 데이터만 교체 —
   * 댓글 등록/삭제 후 갱신에서 사용 (isLoading 을 올리면 페이지 전체가 unmount 되어
   * 전체 리로드처럼 보이는 결함이 있었다).
   */
  const load = useCallback(async (silent = false) => {
    if (!postId) return;
    if (!silent) setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchUnitNoticeDetail(postId);
      if (res.success && res.data) {
        setPost(res.data);
      } else {
        setLoadError(
          res.error?.statusCode === 404
            ? MESSAGES.unitNotice.notFoundOrForbidden
            : (res.error?.message ?? MESSAGES.unitNotice.loadFailed),
        );
      }
    } catch {
      setLoadError(MESSAGES.error.network);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadReads = useCallback(async () => {
    if (!postId) return;
    setIsReadsLoading(true);
    try {
      const res = await fetchUnitNoticeReadsSummary(postId);
      if (res.success && res.data) {
        setReads(res.data);
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    } finally {
      setIsReadsLoading(false);
    }
  }, [postId, toast]);

  const handleToggleReads = useCallback(() => {
    setReadsOpen((prev) => {
      const next = !prev;
      if (next && !reads) void loadReads();
      return next;
    });
  }, [loadReads, reads]);

  // 접힘 상태에서도 헤더에 "읽음 N/M" 이 보이도록 관리자면 현황을 미리 로드한다
  // (기존엔 펼칠 때 lazy 로드라 카운트가 아코디언을 열어야 나타났다)
  useEffect(() => {
    if (post?.canManage && !reads && !isReadsLoading) void loadReads();
  }, [post?.canManage, reads, isReadsLoading, loadReads]);

  // 미읽음자에게 다시 알리기 — 게시글당 24시간 1회 (서버 쿨다운 claim 이 최종 판정).
  // 24시간 내 개별 알림을 받은 사람은 서버가 건너뛰고 skipped 로 알려준다.
  const handleRemind = useCallback(async () => {
    if (!postId || isReminding) return;
    setIsReminding(true);
    try {
      const res = await remindUnreadRecipients(postId);
      if (res.success && res.data) {
        const { reminded, skipped } = res.data;
        toast.success(
          skipped
            ? MESSAGES.unitNotice.remindSuccessWithSkipped(reminded, skipped)
            : MESSAGES.unitNotice.remindSuccess(reminded),
        );
        void loadReads(); // remindAvailableAt 갱신
      } else {
        toast.error(res.error?.message ?? MESSAGES.unitNotice.remindCooldown);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    } finally {
      setIsReminding(false);
    }
  }, [isReminding, loadReads, postId, toast]);

  // 개별 재알림 — 미읽음 명단 행의 [알림] 버튼. (대상자,게시글)당 24시간 1회는 서버 판정.
  const handleRemindOne = useCallback(
    async (targetUserId: string, name: string) => {
      if (!postId || remindingUserId) return;
      setRemindingUserId(targetUserId);
      try {
        const res = await remindUnreadRecipients(postId, targetUserId);
        if (res.success) {
          toast.success(MESSAGES.unitNotice.remindOneSuccess(name));
        } else {
          toast.error(res.error?.message ?? MESSAGES.error.network);
        }
      } catch {
        toast.error(MESSAGES.error.network);
      } finally {
        setRemindingUserId(null);
      }
    },
    [postId, remindingUserId, toast],
  );

  const handleOpenChat = useCallback(
    async (targetUserId: string) => {
      if (chatOpeningId) return;
      setChatOpeningId(targetUserId);
      try {
        const roomId = await openDirectChat(targetUserId);
        if (roomId) {
          navigate(`/chat/${roomId}`);
        } else {
          toast.error(MESSAGES.unitNotice.askDirectFailed);
        }
      } catch {
        toast.error(MESSAGES.unitNotice.askDirectFailed);
      } finally {
        setChatOpeningId(null);
      }
    },
    [chatOpeningId, navigate, toast],
  );

  /**
   * 댓글 제출 — 수정 모드면 update, 아니면 create.
   * 성공 여부를 반환해 CommentThread 가 성공 시에만 입력을 지운다 (M-02 원문 보존).
   */
  const handleSubmitComment = useCallback(
    async (text: string): Promise<boolean> => {
      if (!postId) return false;
      try {
        if (editingComment) {
          const res = await updateUnitNoticeComment(
            String(editingComment.id),
            text,
          );
          if (res.success) {
            toast.success(MESSAGES.unitNotice.commentUpdated);
            setEditingComment(null);
            void load(true); // silent — 댓글만 갱신, 풀스크린 로더 재진입 금지
            return true;
          }
          toast.error(res.error?.message ?? MESSAGES.error.network);
          return false;
        }
        const res = await addUnitNoticeComment(postId, text);
        if (res.success) {
          toast.success(MESSAGES.unitNotice.commentCreated);
          void load(true); // silent
          return true;
        }
        toast.error(res.error?.message ?? MESSAGES.error.network);
        return false;
      } catch {
        toast.error(MESSAGES.error.network);
        return false;
      }
    },
    [editingComment, load, postId, toast],
  );

  const handleDeleteComment = useCallback(async () => {
    if (!deleteCommentId) return;
    try {
      const res = await deleteUnitNoticeComment(deleteCommentId);
      if (res.success) {
        toast.success(MESSAGES.unitNotice.commentDeleted);
        void load(true); // silent — 댓글만 갱신, 풀스크린 로더 재진입 금지
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    } finally {
      setDeleteCommentId(null);
    }
  }, [deleteCommentId, load, toast]);

  const handleDeletePost = useCallback(async () => {
    if (!postId || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await deleteUnitNotice(postId);
      if (res.success) {
        toast.success(MESSAGES.unitNotice.deleted);
        emitRefresh(REFRESH_KEYS.UNIT_NOTICES);
        back();
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirm(false);
    }
  }, [back, isDeleting, postId, toast]);

  if (isLoading) return null;

  // [Phase 2] 팀 축 편입 — 팀/훈련/대회 3축 라벨
  const axisLabel = post?.teamId
    ? MESSAGES.unitNotice.teamChip
    : post?.targetClassId
      ? MESSAGES.unitNotice.classChip
      : MESSAGES.unitNotice.tournamentChip;
  // 수신 대상 설명 — 배지 탭 토스트·aria-label 용 (상시 문장 노출은 반복 소음이라 폐기)
  const audienceDesc = post?.teamId
    ? MESSAGES.unitNotice.sectionSubtitleTeam
    : post?.targetClassId
      ? MESSAGES.unitNotice.sectionSubtitleClass
      : MESSAGES.unitNotice.sectionSubtitleTournament;
  const comments: CommentData[] =
    post?.comments.map((c) => ({
      id: c.id,
      author: fullName(c.author),
      authorId: c.author.id,
      avatarUrl: c.author.avatarUrl ?? undefined,
      content: c.content,
      createdAt: c.createdAt,
    })) ?? [];

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.unitNotice.sectionTitle} forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label={MESSAGES.unitNotice.sectionTitle}
      >
        {loadError || !post ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-16">
            <div className="flex flex-col items-center gap-3">
              <Icon
                name="error_outline"
                className="text-3xl text-it-ink-400 dark:text-it-ink-300"
                aria-hidden="true"
              />
              <p className="text-card-body font-semibold text-it-ink-800 dark:text-white text-center">
                {loadError ?? MESSAGES.unitNotice.loadFailed}
              </p>
              <button
                type="button"
                onClick={() => back()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-w-md bg-it-blue-500 px-4 py-2 text-card-meta font-bold text-white hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                {MESSAGES.notice.backToList}
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* ── 본문 섹션 ─────────────────────────────── */}
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-6">
              {/* 대상 칩 + 배지 + 케밥 */}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {/* 축 라벨+대상 칩 — 탭하면 바로 아래 말풍선으로 수신 대상 설명 (상시 문장은
                      반복 소음이라 온디맨드로 이동 — 2026-08-24 사용자 확정, toast 는 결과 알림
                      용도라 인라인 팝오버 채택). 스크린리더는 aria-label 로 즉시 전달 */}
                  <InfoPopover
                    description={audienceDesc}
                    className="inline-flex min-w-0 items-center gap-x-2"
                  >
                    {/* 축 라벨 — 색 텍스트(훈련=emerald·대회=red), 대상 칩 배경이 경계라 구분점 불필요 */}
                    <span
                      className={`text-[12px] font-bold ${
                        post.teamId
                          ? 'text-it-blue-600 dark:text-it-blue-200'
                          : post.targetClassId
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {axisLabel}
                    </span>
                    <span className="inline-flex min-w-0 items-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/50 px-2 py-0.5 text-[12px] font-bold text-it-blue-600 dark:text-it-blue-200">
                      <span className="truncate">{post.targetName ?? axisLabel}</span>
                    </span>
                  </InfoPopover>
                  {post.isPinned && (
                    <span className="inline-flex items-center gap-0.5 rounded-w-pill bg-it-red-500/10 px-2 py-0.5 text-[12px] font-bold text-it-red-500 dark:text-it-red-300">
                      <Icon name="push_pin" className="text-[12px]" aria-hidden="true" />
                      {MESSAGES.unitNotice.pinnedBadge}
                    </span>
                  )}
                  {post.isScheduled && (
                    <span className="inline-flex items-center rounded-w-pill bg-it-blue-50 px-2 py-0.5 text-[12px] font-bold text-it-blue-600 dark:bg-it-blue-900/50 dark:text-it-blue-200">
                      {MESSAGES.notice.badgeScheduled}
                    </span>
                  )}
                  {post.isExpired && (
                    <span className="inline-flex items-center rounded-w-pill bg-it-red-500/10 px-2 py-0.5 text-[12px] font-bold text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-300">
                      {MESSAGES.notice.badgeExpired}
                    </span>
                  )}
                </div>
                {post.canManage && (
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(true)}
                    aria-label={MESSAGES.notice.manageMenuOpen}
                    className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-w-md text-it-ink-400 dark:text-it-ink-300 hover:bg-it-fill dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                  >
                    <Icon name="more_vert" className="text-xl" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* 제목 */}
              <h1 className="mt-2 text-[19px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white leading-snug">
                {post.title}
              </h1>

              {/* 작성자 · 날짜 · 조회수 */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-it-ink-400 dark:text-it-ink-300">
                <span className="font-semibold">{fullName(post.author)}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.createdAt} className="tabular-nums">
                  {formatDateTime(post.createdAt)}
                </time>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Icon name="visibility" className="text-[13px]" aria-hidden="true" />
                  <span className="font-num tabular-nums">{post.viewCount}</span>
                </span>
              </div>

              {/* 본문 — 짧은 공지도 안정적인 높이를 갖도록 구 상세(/notice/[id])와 동일 min-h */}
              <div
                className="mt-4 min-h-[140px] text-[15px] leading-relaxed text-it-ink-800 dark:text-it-ink-100 whitespace-pre-wrap break-words [&_a]:text-it-blue-500 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
              />

              {/* 첨부 이미지 — 탭 시 전체화면 라이트박스 (핀치줌 지원) */}
              {post.attachments.length > 0 && (
                <div className="mt-4 space-y-3">
                  {post.attachments.map((att, idx) => {
                    const src = resolveImageSrc(att.fileUrl);
                    if (!src) return null;
                    return (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        aria-label={MESSAGES.unitNotice.viewImageLarge}
                        className="block w-full rounded-w-md focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={att.fileName}
                          className="w-full rounded-w-md border border-it-line dark:border-it-blue-900"
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── 읽음 현황 (감독·코치 전용) ─────────────── */}
            {post.canManage && (
              <>
                <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
                <section className="bg-it-surface dark:bg-it-blue-950 px-5 py-4">
                  <button
                    type="button"
                    onClick={handleToggleReads}
                    aria-expanded={readsOpen}
                    className="flex w-full items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded-w-md"
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        name="visibility"
                        className="text-[18px] text-it-blue-500"
                        aria-hidden="true"
                      />
                      <span className="text-[15px] font-bold text-it-ink-800 dark:text-white">
                        {MESSAGES.unitNotice.readSummary}
                      </span>
                      {reads && (
                        <span className="text-[13px] font-extrabold font-num tabular-nums text-it-blue-500">
                          {MESSAGES.unitNotice.readCount(
                            reads.readCount,
                            reads.recipientCount,
                          )}
                        </span>
                      )}
                    </span>
                    <Icon
                      name={readsOpen ? 'expand_less' : 'expand_more'}
                      className="text-xl text-it-ink-400 dark:text-it-ink-300"
                      aria-hidden="true"
                    />
                  </button>

                  {readsOpen && (
                    <div className="mt-3">
                      {isReadsLoading ? (
                        <div className="flex justify-center py-6">
                          <span
                            className="w-5 h-5 border-2 border-it-blue-500/30 border-t-it-blue-500 rounded-w-pill animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        </div>
                      ) : reads && reads.recipientCount > 0 ? (
                        reads.unread.length > 0 ? (
                          <>
                            {/* 미읽음자 명단만 노출 — 읽은 사람 목록·읽은 시각은 서버가 비노출 */}
                            <p className="text-[13px] font-bold text-it-ink-600 dark:text-it-ink-200">
                              {MESSAGES.unitNotice.unreadListTitle(reads.unread.length)}
                            </p>
                            <ul className="mt-1 divide-y divide-it-line dark:divide-it-blue-900">
                              {reads.unread.map((recipient) => (
                                <ReadRecipientRow
                                  key={recipient.userId}
                                  recipient={recipient}
                                  isOpening={chatOpeningId === recipient.userId}
                                  isReminding={remindingUserId === recipient.userId}
                                  onChat={handleOpenChat}
                                  onRemind={handleRemindOne}
                                />
                              ))}
                            </ul>
                            {/* 다시 알리기 — 미읽음자 전원 일괄 재알림 (하루 1회) */}
                            <button
                              type="button"
                              onClick={() => void handleRemind()}
                              disabled={isReminding || !!reads.remindAvailableAt}
                              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-w-md border-[1.5px] border-it-blue-500/40 py-2.5 text-[13.5px] font-bold text-it-blue-600 dark:text-it-blue-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                            >
                              <Icon
                                name="notifications_active"
                                className="text-[15px]"
                                aria-hidden="true"
                              />
                              {reads.remindAvailableAt
                                ? MESSAGES.unitNotice.remindCooldown
                                : MESSAGES.unitNotice.remind}
                            </button>
                            {!reads.remindAvailableAt && (
                              <p className="mt-1.5 text-center text-[12px] text-it-ink-400 dark:text-it-ink-300">
                                {MESSAGES.unitNotice.remindDesc}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="py-4 text-center text-card-meta text-it-ink-400 dark:text-it-ink-300">
                            {MESSAGES.unitNotice.unreadEmpty}
                          </p>
                        )
                      ) : (
                        <p className="py-4 text-center text-card-meta text-it-ink-400 dark:text-it-ink-300">
                          {MESSAGES.unitNotice.recipientsNone}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* ── 댓글 ──────────────────────────────────── */}
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-it-blue-950 px-5 py-5">
              <h2 className="text-[15px] font-bold text-it-ink-800 dark:text-white">
                {MESSAGES.unitNotice.commentsTitle}{' '}
                <span className="font-num tabular-nums text-it-blue-500">
                  {comments.length}
                </span>
              </h2>
              <CommentThread
                className="mt-4"
                comments={comments}
                onSubmit={handleSubmitComment}
                placeholder={MESSAGES.unitNotice.commentPlaceholder}
                currentUserId={user?.id}
                onDelete={(commentId) => setDeleteCommentId(String(commentId))}
                onEdit={
                  SHOW_COMMENT_EDIT
                    ? (commentId, content) =>
                        setEditingComment({ id: commentId, content })
                    : undefined
                }
                editingComment={SHOW_COMMENT_EDIT ? editingComment : null}
                onCancelEdit={() => setEditingComment(null)}
              />
            </section>
          </>
        )}
      </main>

      {/* 케밥 — 수정/삭제 (관할 감독·코치) */}
      <ActionSheet
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title={MESSAGES.notice.manage}
        items={[
          {
            icon: 'edit',
            label: MESSAGES.unitNotice.actionEdit,
            onClick: () => {
              setIsMenuOpen(false);
              navigate(`/community-notice/create?edit=${postId}`);
            },
          },
          {
            icon: 'delete',
            label: MESSAGES.unitNotice.actionDelete,
            danger: true,
            onClick: () => {
              setIsMenuOpen(false);
              setIsDeleteConfirm(true);
            },
          },
        ]}
      />
      <ConfirmSheet
        open={isDeleteConfirm}
        title={MESSAGES.unitNotice.deleteConfirm}
        description={MESSAGES.unitNotice.deleteConfirmDesc}
        confirmLabel={MESSAGES.unitNotice.actionDelete}
        cancelLabel={MESSAGES.unitNotice.actionCancel}
        variant="danger"
        onConfirm={handleDeletePost}
        onCancel={() => {
          if (!isDeleting) setIsDeleteConfirm(false);
        }}
      />
      <ConfirmSheet
        open={!!deleteCommentId}
        title={MESSAGES.unitNotice.commentDeleteConfirm}
        description={MESSAGES.unitNotice.commentDeleteConfirmDesc}
        confirmLabel={MESSAGES.unitNotice.actionDelete}
        cancelLabel={MESSAGES.unitNotice.actionCancel}
        variant="danger"
        onConfirm={handleDeleteComment}
        onCancel={() => setDeleteCommentId(null)}
      />
      {lightboxIndex !== null && post?.attachments[lightboxIndex] && (
        <ImageLightbox
          isOpen
          onClose={() => setLightboxIndex(null)}
          src={post.attachments[lightboxIndex].fileUrl}
          alt={post.attachments[lightboxIndex].fileName}
        />
      )}
    </MobileContainer>
  );
}

/** 미읽음자 행 — 이름·연결 자녀 + [1:1 문의] (읽은 시각은 서버 비노출 계약) */
function ReadRecipientRow({
  recipient,
  isOpening,
  isReminding,
  onChat,
  onRemind,
}: {
  recipient: UnitNoticeReadsRecipient;
  isOpening: boolean;
  isReminding: boolean;
  onChat: (userId: string) => void;
  onRemind: (userId: string, name: string) => void;
}) {
  const name = fullName(recipient);
  const avatarSrc = resolveImageSrc(recipient.avatarUrl ?? undefined);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="shrink-0 w-9 h-9 rounded-w-pill overflow-hidden bg-it-fill dark:bg-it-blue-900/40 flex items-center justify-center">
        {avatarSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={avatarSrc}
            alt={MESSAGES.unitNotice.profileAlt(name)}
            width={36}
            height={36}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon
            name="person"
            className="text-lg text-it-ink-400 dark:text-it-ink-300"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-it-ink-800 dark:text-white truncate">
          {name}
        </p>
        {recipient.childNames.length > 0 && (
          <p className="text-[12px] text-it-ink-400 dark:text-it-ink-300 truncate">
            {recipient.childNames.join(' · ')}
          </p>
        )}
      </div>
      {/* 개별 재알림 — (대상자,게시글)당 하루 1회는 서버 판정 (전체 재알림과 독립) */}
      <button
        type="button"
        onClick={() => onRemind(recipient.userId, name)}
        disabled={isReminding}
        aria-label={MESSAGES.unitNotice.remindOneAria(name)}
        className="shrink-0 inline-flex items-center gap-1 rounded-w-pill border-[1.5px] border-it-blue-500/40 px-3 py-1.5 text-[12.5px] font-bold text-it-blue-600 dark:text-it-blue-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
      >
        <Icon
          name="notifications_active"
          className="text-[13px]"
          aria-hidden="true"
        />
        {MESSAGES.unitNotice.remindOne}
      </button>
      {SHOW_DIRECT_CHAT && (
        <button
          type="button"
          onClick={() => onChat(recipient.userId)}
          disabled={isOpening}
          className="shrink-0 inline-flex items-center gap-1 rounded-w-pill border-[1.5px] border-it-blue-500/40 px-3 py-1.5 text-[12.5px] font-bold text-it-blue-600 dark:text-it-blue-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
        >
          <Icon name="chat_bubble" className="text-[13px]" aria-hidden="true" />
          {MESSAGES.unitNotice.askDirect}
        </button>
      )}
    </li>
  );
}
