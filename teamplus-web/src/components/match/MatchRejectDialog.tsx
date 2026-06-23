'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface MatchRejectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  /** 거절 대상 신청자 이름 목록 (다중 선택 시 N명 표기) */
  applicantNames: string[];
  isSubmitting?: boolean;
}

const REASON_MIN = 10;
const REASON_MAX = 200;

/**
 * 신청자 거절 사유 입력 다이얼로그.
 *
 * HTML 목업 "매치 신청자 관리"의 거절 플로우 반영:
 * - 거절 사유 textarea 10~200자 필수
 * - ESC/배경 클릭으로 닫기 지원
 * - Focus trap (첫 진입 시 textarea 포커스)
 * - 다크모드, AI 스타일 금지 준수
 *
 * 단일 거절: "홍길동 거절"
 * 다중 거절: "3명 거절"
 */
export function MatchRejectDialog({
  isOpen,
  onClose,
  onConfirm,
  applicantNames,
  isSubmitting = false,
}: MatchRejectDialogProps) {
  const [reason, setReason] = useState('');
  const [mounted, setMounted] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — Sheet 패턴.
  //   모바일에서 items-end (BottomSheet) 로 표시되므로 `bottom: false`.
  //   데스크탑(sm:items-center) 은 isNativeApp=false 이므로 native scrim noop.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, undefined, { bottom: false });

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setLocalError(null);
      // 포커스는 마이크로태스크로 넘겨 portal 렌더 뒤에 수행
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  // 배경 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const count = applicantNames.length;
  const title =
    count > 1
      ? MESSAGES.match.applicants.reject.title(count)
      : count === 1
        ? `${applicantNames[0]} 거절`
        : MESSAGES.match.applicants.reject.title(1);

  const trimmed = reason.trim();
  const isValidLength = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  const handleConfirm = async () => {
    if (!isValidLength) {
      setLocalError(MESSAGES.match.applicants.reject.reasonLengthError);
      return;
    }
    setLocalError(null);
    await onConfirm(trimmed);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-rink-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-reject-title"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-rink-800 rounded-t-2xl sm:rounded-2xl border border-wline-2 dark:border-rink-700 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2
            id="match-reject-title"
            className="text-base font-bold text-wtext-1 dark:text-white"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors"
          >
            <Icon name="close" className="text-wtext-3 dark:text-rink-300 text-xl" />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 pb-4 space-y-3">
          {count > 1 && (
            <p className="text-xs text-wtext-3 dark:text-rink-300">
              {applicantNames.slice(0, 3).join(', ')}
              {count > 3 ? ` 외 ${count - 3}명` : ''}을(를) 거절합니다.
            </p>
          )}

          <label className="block">
            <span className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
              {MESSAGES.match.applicants.reject.reasonLabel}
            </span>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={MESSAGES.match.applicants.reject.reasonPlaceholder}
              maxLength={REASON_MAX}
              className="mt-1.5 w-full min-h-[120px] px-3 py-2 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-900 text-sm text-wtext-1 dark:text-white resize-none focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span
                className={cn(
                  'text-wtext-3 dark:text-rink-300',
                  localError && 'text-red-500 dark:text-red-400'
                )}
              >
                {localError ?? `${trimmed.length} / ${REASON_MAX}자 (최소 ${REASON_MIN}자)`}
              </span>
            </div>
          </label>
        </div>

        {/* 하단 액션 */}
        <div className="flex gap-3 px-5 pb-5 pt-2 border-t border-wline-2 dark:border-rink-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-sm font-bold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 transition-colors"
          >
            {MESSAGES.match.applicants.reject.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValidLength || isSubmitting}
            className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Icon name="progress_activity" className="animate-spin text-base" />
                처리 중...
              </>
            ) : (
              MESSAGES.match.applicants.reject.confirm
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
