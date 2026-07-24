'use client';

/**
 * RefundReconcileSheet — KG 미확정(PG 결과 미확정) 정산 처리 시트(ADMIN 전용)
 *
 * PG 실제 취소 여부를 관리자가 확인해 결과(2택)를 선택하고 확인 메모(필수)를 남긴다.
 * outcome: CONFIRMED_CANCELLED(취소 확인) | CONFIRMED_NOT_CANCELLED(미취소 확인).
 * 확인 버튼은 처리 중 잠금(더블탭 방지). RefundApproveSheet 패턴 재사용.
 */

import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { RefundReconcileOutcome } from '@/services/payment';

interface RefundReconcileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (outcome: RefundReconcileOutcome, memo: string) => void;
  isProcessing: boolean;
}

const OUTCOMES: { value: RefundReconcileOutcome; label: string; icon: string }[] = [
  { value: 'CONFIRMED_CANCELLED', label: MESSAGES.refund.reconcileCancelled, icon: 'check_circle' },
  { value: 'CONFIRMED_NOT_CANCELLED', label: MESSAGES.refund.reconcileNotCancelled, icon: 'cancel' },
];

export function RefundReconcileSheet({
  isOpen,
  onClose,
  onConfirm,
  isProcessing,
}: RefundReconcileSheetProps) {
  const [outcome, setOutcome] = useState<RefundReconcileOutcome | null>(null);
  const [memo, setMemo] = useState('');
  // 동기 제출 latch — 같은 tick 연속 클릭(isProcessing 전파 전)에도 onConfirm 1회만 발화.
  const submittingRef = useRef(false);
  // 메모 1~500자(공백 제외 필수) — maxLength 외 프로그램/붙여넣기 초과도 방어(백엔드 계약 정합).
  const canSubmit =
    outcome !== null &&
    memo.trim().length > 0 &&
    memo.length <= 500 &&
    !isProcessing;

  // 닫힘(닫기·성공 후 close 포함) 시 입력·latch 초기화 — 재오픈 시 이전 선택/메모 잔존 방지.
  useEffect(() => {
    if (!isOpen) {
      setOutcome(null);
      setMemo('');
      submittingRef.current = false;
    }
  }, [isOpen]);

  // 처리 종료(성공/실패로 isProcessing=false) 시 latch 해제 — 실패 후 시트 유지 재제출 허용.
  useEffect(() => {
    if (!isProcessing) submittingRef.current = false;
  }, [isProcessing]);

  const handleConfirm = () => {
    if (submittingRef.current || !canSubmit || outcome === null) return;
    submittingRef.current = true; // 클릭 즉시 잠금(동기)
    onConfirm(outcome, memo.trim());
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => {
        if (isProcessing) return;
        onClose();
      }}
      title={MESSAGES.refund.reconcileSheetTitle}
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
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="h-12 flex-[1.4] rounded-w-md bg-it-blue-500 text-card-title font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? MESSAGES.refund.reconcileProcessing : MESSAGES.refund.reconcileConfirm}
          </button>
        </div>
      }
    >
      <div className="mt-1 space-y-4 pb-2">
        <p className="text-card-body leading-relaxed text-it-ink-600 dark:text-rink-300">
          {MESSAGES.refund.reconcileSheetBody}
        </p>

        {/* PG 결과 2택 */}
        <div>
          <p className="mb-1.5 text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300">
            {MESSAGES.refund.reconcileOutcomeLabel}{' '}
            <span className="text-it-red-500 dark:text-it-red-400">*</span>
          </p>
          {/* 네이티브 radio(name 그룹) — 방향키 이동·스페이스 선택이 기본 제공된다(WAI-ARIA 수동
              구현 대신). 입력은 sr-only 로 시각 숨김하고 peer 로 라벨 박스에 상태/포커스를 반영. */}
          <div
            role="radiogroup"
            aria-label={MESSAGES.refund.reconcileOutcomeLabel}
            className="flex flex-col gap-2"
          >
            {OUTCOMES.map((opt) => {
              const on = outcome === opt.value;
              return (
                <label key={opt.value} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="refund-reconcile-outcome"
                    value={opt.value}
                    checked={on}
                    onChange={() => setOutcome(opt.value)}
                    disabled={isProcessing}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-12 items-center gap-2 rounded-w-md border-[1.5px] px-4 text-card-body font-semibold transition-colors motion-reduce:transition-none',
                      'peer-focus-visible:ring-2 peer-focus-visible:ring-it-blue-500/40',
                      'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                      on
                        ? 'border-it-blue-500 bg-it-blue-50 text-it-blue-600 dark:border-it-blue-400 dark:bg-it-blue-900/30 dark:text-it-blue-300'
                        : 'border-it-line-strong text-it-ink-700 hover:bg-it-fill dark:border-rink-700 dark:text-it-ink-200 dark:hover:bg-rink-700/50',
                    )}
                  >
                    <Icon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-[18px]" aria-hidden="true" />
                    <Icon name={opt.icon} className="text-[16px]" aria-hidden="true" />
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 확인 메모(필수) */}
        <div>
          <label
            htmlFor="refund-reconcile-memo"
            className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300"
          >
            {MESSAGES.refund.reconcileMemoLabel}{' '}
            <span className="text-it-red-500 dark:text-it-red-400">*</span>
          </label>
          <textarea
            id="refund-reconcile-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={MESSAGES.refund.reconcileMemoPlaceholder}
            rows={3}
            maxLength={500}
            disabled={isProcessing}
            className="w-full resize-none rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 py-3 text-card-body text-it-ink-800 transition-colors placeholder:text-it-ink-400 focus:border-it-blue-500 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 motion-reduce:transition-none disabled:opacity-60 dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-it-ink-300"
          />
          {/* 필수 안내 — 항상 자리 예약(min-h)으로 시트 높이 점프 방지 */}
          <p
            className={`mt-1 min-h-[18px] text-card-meta text-it-red-500 dark:text-it-red-400${memo.trim() ? ' invisible' : ''}`}
          >
            {MESSAGES.refund.reconcileMemoRequired}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

export default RefundReconcileSheet;
