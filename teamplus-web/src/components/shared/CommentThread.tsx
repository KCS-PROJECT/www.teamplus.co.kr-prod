'use client';

/**
 * CommentThread - TEAMPLUS Shared Component
 * 댓글 스레드 (댓글 목록 + 입력 폼). 아바타·이름·상대시간·본문 표시.
 * 사용 화면: /notice-detail/[id], /event, /club/news, /gallery
 */

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

/** 단일 댓글 데이터 */
export interface CommentData {
  id: string | number;
  /** 작성자 이름 */
  author: string;
  /** 작성자 사용자 ID (UGC 신고 대상 식별 — App Store 1.2). 없으면 신고 버튼 미표시 */
  authorId?: string;
  /** 작성자 아바타 URL */
  avatarUrl?: string;
  /** 댓글 본문 */
  content: string;
  /** 작성 시각 (ISO 8601) */
  createdAt: string;
}

export interface CommentThreadProps {
  /** 댓글 목록 */
  comments: CommentData[];
  /**
   * 댓글 제출 핸들러. Promise 를 반환하면 완료까지 제출을 잠그고,
   * `false` 해석 시(실패) 입력을 지우지 않는다 — 실패 시 원문 보존 (Codex R1 M-02).
   * 기존 동기 void 핸들러도 그대로 동작한다.
   */
  onSubmit: (text: string) => void | boolean | Promise<void | boolean>;
  /** 입력창 placeholder */
  placeholder?: string;
  /** 추가 className */
  className?: string;
  /** 현재 로그인 사용자 ID — 자신의 댓글에는 신고 버튼을 숨기기 위함 */
  currentUserId?: string;
  /** 댓글 신고 클릭 핸들러. 지정 시 타 사용자 댓글에 신고 버튼 노출 (App Store 1.2 UGC) */
  onReportClick?: (
    commentId: string | number,
    authorId: string,
    authorName: string,
  ) => void;
  /** 댓글 삭제 클릭 핸들러. 지정 시 본인 댓글(또는 canModerate)에 삭제 버튼 노출 */
  onDelete?: (commentId: string | number) => void;
  /** 타 사용자 댓글도 삭제 가능한 관리 권한 (서버 moderation 판정과 동일 기준으로 전달) */
  canModerate?: boolean;
  /** 본인 댓글 수정 클릭 핸들러. 지정 시 본인 댓글에 수정 버튼 노출 (Codex R1 M-02) */
  onEdit?: (commentId: string | number, content: string) => void;
  /** 수정 중인 댓글 — 지정 시 입력창에 원문을 채우고 수정 모드 배너를 띄운다 */
  editingComment?: { id: string | number; content: string } | null;
  /** 수정 모드 취소 */
  onCancelEdit?: () => void;
}

/**
 * 절대 시각 "YYYY.MM.DD HH:mm" — 공지 메타와 동일 포맷.
 * [2026-08-24 사용자 확정] 상대 시간("N개월 전")은 오래될수록 시점 정보가 사라지고
 * 렌더 시점마다 표기가 변해 기록성이 약하다 — 공지 댓글은 절대 시각으로 통일.
 * @param dateStr ISO 8601 문자열
 */
function formatCommentTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 댓글 스레드
 *
 * @example
 * ```tsx
 * <CommentThread
 *   comments={comments}
 *   onSubmit={(text) => postComment(text)}
 *   placeholder="댓글을 입력하세요"
 * />
 * ```
 */
export function CommentThread({
  comments,
  onSubmit,
  placeholder = '댓글을 입력하세요',
  className,
  currentUserId,
  onReportClick,
  onDelete,
  canModerate = false,
  onEdit,
  editingComment = null,
  onCancelEdit,
}: CommentThreadProps) {
  const [text, setText] = useState('');
  // [Codex R1 M-02] 제출 잠금 — 진행 중 중복 POST 차단
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 수정 모드 진입 시 입력창에 원문 프리필 (해제 시 비움)
  useEffect(() => {
    setText(editingComment?.content ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingComment?.id]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // [Codex R1 M-02] 성공(false 아님)일 때만 입력을 지운다 — 실패 시 원문 보존
      const result = await onSubmit(trimmed);
      if (result !== false) setText('');
    } finally {
      setIsSubmitting(false);
    }
  }, [text, onSubmit, isSubmitting]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {/* 댓글 목록 */}
      <ul className="flex flex-col gap-4" aria-label="댓글 목록">
        {comments.map((comment) => (
          <li key={comment.id} className="flex items-start gap-3">
            {/* 아바타 */}
            <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-wline-2 dark:bg-rink-700 ring-1 ring-wline dark:ring-rink-700">
              {resolveImageSrc(comment.avatarUrl) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveImageSrc(comment.avatarUrl)}
                  alt={`${comment.author} 프로필`}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-wtext-3 text-lg"
                    aria-hidden="true"
                  >
                    person
                  </span>
                </div>
              )}
            </div>

            {/* 내용 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-wtext-1 dark:text-white truncate">
                  {comment.author}
                </span>
                <time
                  dateTime={comment.createdAt}
                  className="text-[11px] text-wtext-3 dark:text-rink-300 shrink-0"
                >
                  {formatCommentTime(comment.createdAt)}
                </time>
                <span className="ml-auto shrink-0 inline-flex items-center gap-0.5">
                  {/* 수정 — 본인 댓글만 (onEdit 제공 시) */}
                  {onEdit &&
                    currentUserId &&
                    comment.authorId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => onEdit(comment.id, comment.content)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-wtext-3 hover:text-ice-500 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                        aria-label={MESSAGES.unitNotice.commentEditAria}
                        title={MESSAGES.unitNotice.commentEditAria}
                      >
                        <Icon name="edit" className="text-[15px]" aria-hidden="true" />
                      </button>
                    )}
                  {/* UGC 신고 — 타 사용자 댓글에만 노출 (App Store 1.2) */}
                  {currentUserId &&
                    comment.authorId &&
                    comment.authorId !== currentUserId &&
                    onReportClick && (
                      <button
                        type="button"
                        onClick={() =>
                          onReportClick(
                            comment.id,
                            comment.authorId as string,
                            comment.author,
                          )
                        }
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-wtext-3 hover:text-flame-500 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                        aria-label="댓글 신고"
                        title="신고"
                      >
                        <Icon name="flag" className="text-[15px]" aria-hidden="true" />
                      </button>
                    )}
                  {/* 삭제 — 본인 댓글 또는 관리 권한(canModerate) */}
                  {onDelete &&
                    ((currentUserId &&
                      comment.authorId === currentUserId) ||
                      canModerate) && (
                      <button
                        type="button"
                        onClick={() => onDelete(comment.id)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-wtext-3 hover:text-flame-500 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                        aria-label="댓글 삭제"
                        title="삭제"
                      >
                        <Icon name="delete" className="text-[15px]" aria-hidden="true" />
                      </button>
                    )}
                </span>
              </div>
              <p className="mt-1 text-sm text-wtext-2 dark:text-rink-100 whitespace-pre-wrap break-words">
                {comment.content}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* 수정 모드 배너 — 어떤 댓글을 고치는 중인지 명시 + 취소 */}
      {editingComment && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-wbg dark:bg-rink-800 px-3 py-2">
          <Icon name="edit" className="text-[14px] text-ice-500 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-[12.5px] font-semibold text-wtext-2 dark:text-rink-100 truncate">
            {MESSAGES.unitNotice.commentEditing}
          </span>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="shrink-0 text-[12.5px] font-bold text-wtext-3 dark:text-rink-300 underline"
            >
              취소
            </button>
          )}
        </div>
      )}

      {/* 입력 폼 */}
      <div
        className={cn(
          'flex items-end gap-2 pt-4',
          editingComment
            ? 'mt-2'
            : 'mt-4 border-t border-wline-2 dark:border-rink-700'
        )}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          aria-label="댓글 입력"
          className={cn(
            'flex-1 resize-none rounded-lg px-3 py-2.5 text-sm',
            'bg-wbg dark:bg-rink-800',
            'border border-wline dark:border-rink-700',
            'text-wtext-1 dark:text-white',
            'placeholder:text-wtext-3 dark:placeholder:text-wtext-3',
            'focus:outline-none focus:ring-2 focus:ring-ice-500/40 focus:border-ice-500'
          )}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!text.trim() || isSubmitting}
          aria-busy={isSubmitting}
          aria-label="댓글 전송"
          className={cn(
            'shrink-0 h-10 w-10 rounded-lg',
            'flex items-center justify-center',
            'bg-ice-500 text-white',
            'hover:bg-ice-700 active:brightness-95',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
          )}
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            send
          </span>
        </button>
      </div>
    </div>
  );
}

export default CommentThread;
