'use client';

/**
 * CommentThread - TEAMPLUS Shared Component
 * 댓글 스레드 (댓글 목록 + 입력 폼). 아바타·이름·상대시간·본문 표시.
 * 사용 화면: /notice-detail/[id], /event, /club/news, /gallery
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { Icon } from '@/components/ui/Icon';

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
  /** 댓글 작성 제출 핸들러 */
  onSubmit: (text: string) => void;
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
}

/**
 * 한글 상대 시간을 반환한다.
 * @param dateStr ISO 8601 문자열
 */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - target) / 1000);

  if (diffSec < 60) return '방금 전';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}개월 전`;
  return `${Math.floor(diffMonth / 12)}년 전`;
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
}: CommentThreadProps) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
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
                  {formatRelativeTime(comment.createdAt)}
                </time>
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
                      className="ml-auto shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-wtext-3 hover:text-flame-500 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                      aria-label="댓글 신고"
                      title="신고"
                    >
                      <Icon name="flag" className="text-[15px]" aria-hidden="true" />
                    </button>
                  )}
              </div>
              <p className="mt-1 text-sm text-wtext-2 dark:text-rink-100 whitespace-pre-wrap break-words">
                {comment.content}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* 입력 폼 */}
      <div className="mt-4 flex items-end gap-2 border-t border-wline-2 dark:border-rink-700 pt-4">
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
          onClick={handleSubmit}
          disabled={!text.trim()}
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
