'use client';

/**
 * [2026-06-17] 대회 자녀별 결제/신청 상태 행 — 공용 컴포넌트.
 *  대회 상세(자녀별 결제내역)와 참가결제(신청선수) 화면에서 동일한 내용을 표시하기 위한 SoT.
 *
 * 상태별 표기:
 *  · PAID                      → "결제완료" 배지 + [결제취소]
 *  · PENDING + orderNumber     → [후불결제] (감독 정산 완료 → 결제 가능)
 *  · 그 외(UNPAID 등, 정산 전) → [참가취소] + "정산 대기" 배지
 */

import { Icon } from '@/components/ui/Icon';

export interface ChildPaymentRowProps {
  name: string;
  amount: number;
  paymentStatus: string;
  orderNumber: string | null;
  cancelling: boolean;
  onPay: () => void;
  onCancel: () => void;
}

export function ChildPaymentRow({
  name,
  amount,
  paymentStatus,
  orderNumber,
  cancelling,
  onPay,
  onCancel,
}: ChildPaymentRowProps) {
  const isPaid = paymentStatus === 'PAID';
  // 후불 정산 완료(PENDING + orderNumber) → 결제 가능. 그 전(UNPAID 등) → 정산 대기.
  const canPay = !isPaid && paymentStatus === 'PENDING' && !!orderNumber;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800">
      <span className="flex items-center gap-2 min-w-0">
        <Icon name="person" className="text-[20px] text-wtext-3" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block font-bold text-wtext-1 dark:text-white truncate">
            {name}
          </span>
          {amount > 0 && (
            <span className="block text-w-caption font-num tabular-nums text-wtext-3 dark:text-rink-300">
              {new Intl.NumberFormat('ko-KR').format(amount)}원
            </span>
          )}
        </span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {isPaid ? (
          <>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 text-w-caption font-bold">
              결제완료
            </span>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-400 text-w-caption font-bold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cancelling ? '취소 중...' : '결제취소'}
            </button>
          </>
        ) : canPay ? (
          <button
            type="button"
            onClick={onPay}
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-ice-500 text-white text-w-caption font-bold hover:bg-ice-700"
          >
            후불결제
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-400 text-w-caption font-bold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cancelling ? '취소 중...' : '참가취소'}
            </button>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100 text-w-caption font-bold">
              정산 대기
            </span>
          </>
        )}
      </div>
    </div>
  );
}
