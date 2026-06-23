'use client';

/**
 * CreditAdjustModal — 감독/코치 회차 조정 모달
 *
 * 사용처:
 *  - /classes-manage/[id]/roster (배치된 학생 행)
 *  - 향후 /coach-members, /director-credits 등 확장 가능
 *
 * 동작:
 *  1. +/- 토글로 양수/음수 모드 전환
 *  2. 수량(1~100) · 사유(2~200자) 입력
 *  3. 확인 → ConfirmDialog → POST /credits/adjust
 *  4. 성공: toast + onSuccess() + onClose()
 *  5. 403 (백엔드 RBAC 그레이스 기간 안전망): "권한 없음" toast
 *
 * 디자인 토큰만 사용 (gradient/blur/colored-shadow 금지).
 * 다크모드 dark: variant 전수 적용.
 */

import { memo, useCallback, useMemo, useState } from 'react';

import { Modal } from '@/components/ui/Modal/Modal';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100;
const MIN_REASON_LEN = 2;
const MAX_REASON_LEN = 200;

export interface CreditAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 조정 대상 사용자 ID (학생/자녀의 userId) */
  userId: string;
  /** 조정 대상 사용자 표시명 (모달 헤더에 사용) */
  userName: string;
  /** 성공 시 호출 (예: 명단 reload) */
  onSuccess?: () => void;
}

type Sign = 'add' | 'subtract';

export const CreditAdjustModal = memo(function CreditAdjustModal({
  isOpen,
  onClose,
  userId,
  userName,
  onSuccess,
}: CreditAdjustModalProps) {
  const { toast } = useToast();
  const { modal } = useModal();

  const [sign, setSign] = useState<Sign>('add');
  const [amountInput, setAmountInput] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 정수만 허용 (음수/소수점 차단 — 부호는 토글로 제어)
  const handleAmountChange = useCallback((value: string) => {
    // 빈 문자열 허용 (사용자가 지우는 중)
    if (value === '') {
      setAmountInput('');
      return;
    }
    // 양의 정수 1~100 만 허용
    const digitsOnly = value.replace(/[^0-9]/g, '');
    if (digitsOnly === '') {
      setAmountInput('');
      return;
    }
    const parsed = parseInt(digitsOnly, 10);
    if (Number.isNaN(parsed)) return;
    if (parsed > MAX_AMOUNT) {
      setAmountInput(String(MAX_AMOUNT));
      return;
    }
    setAmountInput(String(parsed));
  }, []);

  const handleReset = useCallback(() => {
    setSign('add');
    setAmountInput('');
    setReason('');
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    handleReset();
    onClose();
  }, [isSubmitting, handleReset, onClose]);

  const numericAmount = useMemo(() => {
    const n = parseInt(amountInput, 10);
    return Number.isFinite(n) ? n : 0;
  }, [amountInput]);

  const signedAmount = useMemo(() => {
    if (numericAmount === 0) return 0;
    return sign === 'add' ? numericAmount : -numericAmount;
  }, [numericAmount, sign]);

  const trimmedReason = reason.trim();
  const reasonLength = trimmedReason.length;

  const amountValid =
    numericAmount >= MIN_AMOUNT && numericAmount <= MAX_AMOUNT;
  const reasonValid =
    reasonLength >= MIN_REASON_LEN && reasonLength <= MAX_REASON_LEN;
  const isValid = amountValid && reasonValid && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!isValid || !userId) return;

    const confirmMessage =
      sign === 'add'
        ? MESSAGES.credits.adjust.confirmAdd(numericAmount)
        : MESSAGES.credits.adjust.confirmSubtract(numericAmount);

    const confirmed = await modal.confirm({
      title: MESSAGES.credits.adjust.title,
      message: confirmMessage,
      confirmText: MESSAGES.credits.adjust.submit,
      cancelText: MESSAGES.credits.adjust.cancel,
      variant: sign === 'add' ? 'default' : 'warning',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const res = await api.post<{ success?: boolean }>('/credits/adjust', {
        userId,
        amount: signedAmount,
        reason: trimmedReason,
      });

      if (res.success) {
        toast.success(MESSAGES.credits.adjust.success);
        onSuccess?.();
        handleReset();
        onClose();
        return;
      }

      // 백엔드 RBAC 그레이스 기간 안전망 — 403 분기
      if (res.error?.statusCode === 403) {
        toast.error(MESSAGES.credits.adjust.forbidden);
        return;
      }

      toast.error(res.error?.message ?? MESSAGES.credits.adjust.failure);
    } catch {
      toast.error(MESSAGES.credits.adjust.failure);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isValid,
    userId,
    sign,
    numericAmount,
    signedAmount,
    trimmedReason,
    modal,
    toast,
    onSuccess,
    handleReset,
    onClose,
  ]);

  const previewLabel =
    numericAmount === 0
      ? '수량을 입력해주세요'
      : sign === 'add'
        ? `+${numericAmount}회 추가`
        : `-${numericAmount}회 차감`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${MESSAGES.credits.adjust.title} · ${userName}`}
      size="md"
      showCloseButton
      closeOnOverlayClick={!isSubmitting}
      closeOnEscape={!isSubmitting}
    >
      <div className="flex flex-col gap-5">
        {/* ─── 1. +/- 토글 ─── */}
        <div className="flex flex-col gap-2">
          <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
            조정 방향
          </span>
          <div
            role="radiogroup"
            aria-label="조정 방향 선택"
            className="grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={sign === 'add'}
              onClick={() => setSign('add')}
              disabled={isSubmitting}
              className={cn(
                'min-h-[52px] rounded-w-md border-2 flex items-center justify-center gap-2 text-card-body font-bold transition-colors motion-reduce:transition-none active:brightness-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                sign === 'add'
                  ? 'bg-ice-500 border-ice-500 text-white shadow-sh-1'
                  : 'bg-wsurface dark:bg-rink-800 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700/40',
                isSubmitting && 'opacity-60 cursor-not-allowed',
              )}
            >
              <Icon name="add" className="text-[20px]" aria-hidden="true" />
              <span>회차 추가</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sign === 'subtract'}
              onClick={() => setSign('subtract')}
              disabled={isSubmitting}
              className={cn(
                'min-h-[52px] rounded-w-md border-2 flex items-center justify-center gap-2 text-card-body font-bold transition-colors motion-reduce:transition-none active:brightness-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-flame-500/40',
                sign === 'subtract'
                  ? 'bg-flame-500 border-flame-500 text-white shadow-sh-1'
                  : 'bg-wsurface dark:bg-rink-800 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700/40',
                isSubmitting && 'opacity-60 cursor-not-allowed',
              )}
            >
              <Icon name="remove" className="text-[20px]" aria-hidden="true" />
              <span>회차 차감</span>
            </button>
          </div>
        </div>

        {/* ─── 2. 수량 입력 ─── */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="credit-adjust-amount"
            className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300"
          >
            {MESSAGES.credits.adjust.amountLabel}
          </label>
          <div className="relative">
            <input
              id="credit-adjust-amount"
              type="number"
              inputMode="numeric"
              min={MIN_AMOUNT}
              max={MAX_AMOUNT}
              step={1}
              value={amountInput}
              onChange={(e) => handleAmountChange(e.target.value)}
              disabled={isSubmitting}
              placeholder={MESSAGES.credits.adjust.amountPlaceholder}
              aria-describedby="credit-adjust-amount-hint"
              className={cn(
                'w-full min-h-[52px] px-4 pr-12 rounded-w-md border bg-wsurface dark:bg-rink-800',
                'border-wline dark:border-rink-700 text-card-body font-bold tabular-nums text-wtext-1 dark:text-white',
                'placeholder-wtext-3 dark:placeholder-rink-400',
                'focus:outline-none focus:border-ice-500 dark:focus:border-ice-500',
                'focus-visible:ring-2 focus-visible:ring-ice-500/40',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            />
            <span
              className="absolute right-4 top-1/2 -translate-y-1/2 text-card-body font-semibold text-wtext-3 dark:text-rink-300 pointer-events-none"
              aria-hidden="true"
            >
              회
            </span>
          </div>
          <p
            id="credit-adjust-amount-hint"
            className="text-card-meta text-wtext-4 dark:text-rink-400"
          >
            {MESSAGES.credits.adjust.amountHint}
          </p>
        </div>

        {/* ─── 3. 미리보기 ─── */}
        <div
          className={cn(
            'rounded-w-md border px-4 py-3 flex items-center justify-between',
            numericAmount === 0
              ? 'bg-wbg dark:bg-rink-900/30 border-wline-2 dark:border-rink-700'
              : sign === 'add'
                ? 'bg-ice-500/10 border-ice-500/30 dark:bg-ice-500/15'
                : 'bg-flame-500/10 border-flame-500/30 dark:bg-flame-500/15',
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
            미리보기
          </span>
          <span
            className={cn(
              'text-card-emphasis font-extrabold tabular-nums',
              numericAmount === 0
                ? 'text-wtext-4 dark:text-rink-400'
                : sign === 'add'
                  ? 'text-ice-500'
                  : 'text-flame-500',
            )}
          >
            {previewLabel}
          </span>
        </div>

        {/* ─── 4. 사유 입력 ─── */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="credit-adjust-reason"
            className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300"
          >
            {MESSAGES.credits.adjust.reasonLabel}
          </label>
          <textarea
            id="credit-adjust-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LEN))}
            disabled={isSubmitting}
            placeholder={MESSAGES.credits.adjust.reasonPlaceholder}
            rows={3}
            maxLength={MAX_REASON_LEN}
            aria-describedby="credit-adjust-reason-hint"
            className={cn(
              'w-full px-4 py-3 rounded-w-md border bg-wsurface dark:bg-rink-800',
              'border-wline dark:border-rink-700 text-card-body text-wtext-1 dark:text-white',
              'placeholder-wtext-3 dark:placeholder-rink-400',
              'focus:outline-none focus:border-ice-500 dark:focus:border-ice-500',
              'focus-visible:ring-2 focus-visible:ring-ice-500/40',
              'disabled:opacity-60 disabled:cursor-not-allowed resize-none',
            )}
          />
          <div
            id="credit-adjust-reason-hint"
            className="flex items-center justify-between text-card-meta text-wtext-4 dark:text-rink-400"
          >
            <span>{MESSAGES.credits.adjust.reasonHint}</span>
            <span className="tabular-nums" aria-live="polite">
              {reasonLength} / {MAX_REASON_LEN}
            </span>
          </div>
        </div>

        {/* ─── 5. 액션 버튼 ─── */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className={cn(
              'flex-1 min-h-[52px] rounded-w-md border border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800',
              'text-card-body font-bold text-wtext-2 dark:text-rink-100',
              'hover:bg-wbg dark:hover:bg-rink-700/40 active:brightness-95',
              'transition-colors motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            {MESSAGES.credits.adjust.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className={cn(
              'flex-1 min-h-[52px] rounded-w-md text-card-body font-extrabold text-white',
              'active:brightness-95 transition-colors motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              sign === 'add'
                ? 'bg-ice-500 hover:bg-ice-700 shadow-sh-1 focus-visible:ring-ice-500/40'
                : 'bg-flame-500 hover:bg-flame-600 shadow-sh-1 focus-visible:ring-flame-500/40',
              !isValid && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isSubmitting
              ? MESSAGES.credits.adjust.submitting
              : MESSAGES.credits.adjust.submit}
          </button>
        </div>
      </div>
    </Modal>
  );
});
