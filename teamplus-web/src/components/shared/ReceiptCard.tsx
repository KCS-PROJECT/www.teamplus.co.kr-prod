'use client';

/**
 * ReceiptCard - TEAMPLUS Shared Component
 * 영수증 카드. 점선 구분선으로 헤더/본문/총액 영역을 구분합니다.
 * 사용 화면: /payment/complete, /payment/receipt/[id], /payment/history 상세
 */

import { cn } from '@/lib/utils';

export type ReceiptStatus = 'paid' | 'cancelled' | 'refunded' | 'pending';

export interface ReceiptCardProps {
  /** 상점/가맹점명 */
  merchantName: string;
  /** 주문 번호 (UUID 또는 표시용 번호) */
  orderNumber: string;
  /** 결제일시 (예: "2026.04.12 14:32") */
  paymentDate: string;
  /** 결제수단 (예: "카카오페이", "신용카드") */
  method: string;
  /** 상품명 */
  productName: string;
  /** 총액 (원 단위 숫자) */
  totalAmount: number;
  /** 영수증 상태 */
  status?: ReceiptStatus;
  /** 추가 className */
  className?: string;
}

const STATUS_META: Record<ReceiptStatus, { label: string; className: string }> = {
  paid: {
    label: '결제완료',
    className: 'bg-success/10 text-success',
  },
  cancelled: {
    label: '결제취소',
    className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  },
  refunded: {
    label: '환불완료',
    className: 'bg-warning/10 text-warning',
  },
  pending: {
    label: '결제대기',
    className: 'bg-info/10 text-info',
  },
};

function formatWon(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

export function ReceiptCard({
  merchantName,
  orderNumber,
  paymentDate,
  method,
  productName,
  totalAmount,
  status = 'paid',
  className,
}: ReceiptCardProps) {
  const meta = STATUS_META[status];

  return (
    <article
      className={cn(
        'bg-white dark:bg-rink-800',
        'rounded-2xl border border-wline dark:border-rink-700',
        'overflow-hidden',
        className
      )}
      aria-label={`영수증 ${orderNumber}`}
    >
      {/* Header */}
      <header className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-wtext-1 dark:text-white truncate">
            {merchantName}
          </h3>
          <p className="mt-1 text-xs text-wtext-3 dark:text-rink-300 truncate">
            주문번호 {orderNumber}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold',
            meta.className
          )}
        >
          {meta.label}
        </span>
      </header>

      {/* Dashed divider */}
      <div
        className="border-t border-dashed border-wline dark:border-rink-700 mx-5"
        aria-hidden="true"
      />

      {/* Body - detail fields */}
      <dl className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-wtext-3 dark:text-rink-300">결제일시</dt>
          <dd className="text-sm font-semibold text-wtext-1 dark:text-white text-right">
            {paymentDate}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-wtext-3 dark:text-rink-300">결제수단</dt>
          <dd className="text-sm font-semibold text-wtext-1 dark:text-white text-right">
            {method}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-wtext-3 dark:text-rink-300 shrink-0">상품명</dt>
          <dd className="text-sm font-semibold text-wtext-1 dark:text-white text-right break-keep">
            {productName}
          </dd>
        </div>
      </dl>

      {/* Dashed divider */}
      <div
        className="border-t border-dashed border-wline dark:border-rink-700 mx-5"
        aria-hidden="true"
      />

      {/* Total */}
      <footer className="px-5 py-4 bg-wbg dark:bg-rink-900/40 flex items-center justify-between">
        <span className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
          총 결제금액
        </span>
        <span className="text-xl font-bold text-ice-500">
          {formatWon(totalAmount)}
        </span>
      </footer>
    </article>
  );
}

export default ReceiptCard;
