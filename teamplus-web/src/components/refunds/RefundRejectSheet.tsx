'use client';

/**
 * RefundRejectSheet — 환불 요청 거절 시트(사유 필수)
 *
 * 거절은 재정 변화가 없다. 사유는 필수 입력(빈 값이면 확인 비활성).
 * 확인 버튼은 처리 중 잠금(더블탭 방지).
 */

import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MESSAGES } from '@/lib/messages';

interface RefundRejectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isProcessing: boolean;
}

export function RefundRejectSheet({
  isOpen,
  onClose,
  onConfirm,
  isProcessing,
}: RefundRejectSheetProps) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0 && !isProcessing;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => {
        if (isProcessing) return;
        onClose();
      }}
      title={MESSAGES.refund.rejectSheetTitle}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="h-12 flex-1 rounded-w-md bg-it-fill text-card-title font-semibold text-it-ink-700 transition-colors motion-reduce:transition-none hover:bg-it-line active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-it-blue-900/40 dark:text-it-ink-200 dark:hover:bg-it-blue-900/60"
          >
            {MESSAGES.refund.requestModalCancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!canSubmit}
            className="h-12 flex-1 rounded-w-md bg-it-red-500 text-card-title font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-red-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? MESSAGES.refund.rejectProcessing : MESSAGES.refund.rejectConfirm}
          </button>
        </div>
      }
    >
      <div className="mt-2 pb-2">
        <label
          htmlFor="refund-reject-reason"
          className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300"
        >
          {MESSAGES.refund.rejectReasonLabel}{' '}
          <span className="text-it-red-500 dark:text-it-red-400">*</span>
        </label>
        <textarea
          id="refund-reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={MESSAGES.refund.rejectReasonPlaceholder}
          rows={3}
          maxLength={500}
          disabled={isProcessing}
          className="w-full resize-none rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 py-3 text-card-body text-it-ink-800 transition-colors placeholder:text-it-ink-400 focus:border-it-blue-500 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 motion-reduce:transition-none disabled:opacity-60 dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-it-ink-300"
        />
        {/* 필수 안내 — 항상 자리 예약(min-h)으로 시트 높이 점프 방지, 입력 시 invisible 전환 */}
        <p
          className={`mt-1 min-h-[18px] text-card-meta text-it-red-500 dark:text-it-red-400${reason.trim() ? ' invisible' : ''}`}
        >
          {MESSAGES.refund.rejectReasonRequired}
        </p>
      </div>
    </BottomSheet>
  );
}

export default RefundRejectSheet;
