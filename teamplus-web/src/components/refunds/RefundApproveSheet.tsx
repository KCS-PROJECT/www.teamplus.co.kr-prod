'use client';

/**
 * RefundApproveSheet — 환불 승인=실행 이중 확인 시트(비가역)
 *
 * "승인 즉시 PG 환불이 실행되며 되돌릴 수 없습니다" 경고를 강조하고,
 * 확인 버튼은 처리 중 잠금(더블탭 방지)한다. 승인은 사유 입력 없음(거절만 사유 필수).
 * 표시 금액은 실제 실행 금액(서버 산정 requestedAmount) — 이용분 공제로 결제액보다
 * 작으면 "부분 환불" 라벨과 공제 근거를 함께 노출한다(전액 오인 방지).
 */

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

interface RefundApproveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isProcessing: boolean;
  /** 환불 실행 금액(서버 산정 요청액) — 확인 화면 강조. */
  amount: number;
  /** 원 결제 금액 — amount 보다 크면 부분 환불로 표시. */
  paymentAmount: number;
}

export function RefundApproveSheet({
  isOpen,
  onClose,
  onConfirm,
  isProcessing,
  amount,
  paymentAmount,
}: RefundApproveSheetProps) {
  const isPartial = amount < paymentAmount;
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => {
        if (isProcessing) return; // 처리 중 닫기 방지
        onClose();
      }}
      title={MESSAGES.refund.approveSheetTitle}
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
            onClick={() => onConfirm()}
            disabled={isProcessing}
            className="h-12 flex-[1.4] rounded-w-md bg-it-red-500 text-card-title font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-red-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing ? MESSAGES.refund.approveProcessing : MESSAGES.refund.approveConfirm}
          </button>
        </div>
      }
    >
      <div className="mt-1 space-y-4 pb-2">
        {/* 비가역 경고 — red inset */}
        <div className="flex items-start gap-2.5 rounded-w-md border border-it-red-100 bg-it-red-50 p-3.5 dark:border-it-red-500/30 dark:bg-it-red-500/10">
          <Icon
            name="warning"
            className="mt-0.5 shrink-0 text-card-emphasis text-it-red-600 dark:text-it-red-400"
            aria-hidden="true"
          />
          <p className="text-[13px] font-semibold leading-relaxed text-it-red-700 dark:text-it-red-200">
            {MESSAGES.refund.approveSheetBody}
          </p>
        </div>

        {/* 환불 금액 강조 — 실제 실행 금액. 부분 환불이면 공제 근거를 함께 표시. */}
        <div className="rounded-w-md bg-it-fill px-4 py-3.5 dark:bg-it-blue-900/40">
          <div className="flex items-center justify-between">
            <span className="text-card-body font-semibold text-it-ink-500 dark:text-wtext-4">
              {isPartial ? MESSAGES.refund.approveCtaPartial : MESSAGES.refund.approveCta}
            </span>
            <span className="text-[18px] font-extrabold text-it-ink-900 tabular-nums dark:text-white">
              {amount.toLocaleString()}
              <span className="ml-0.5 text-[13px] font-semibold text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.settlement.won}
              </span>
            </span>
          </div>
          {isPartial && (
            <p className="mt-1.5 text-card-meta leading-relaxed text-it-ink-500 tabular-nums dark:text-wtext-4">
              {MESSAGES.refund.approvePartialDeductNote(
                paymentAmount,
                paymentAmount - amount,
              )}
            </p>
          )}
        </div>

      </div>
    </BottomSheet>
  );
}

export default RefundApproveSheet;
