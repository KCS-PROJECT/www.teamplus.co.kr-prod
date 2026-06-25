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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 카드(rounded-2xl + border) 1:1 보존(회귀 0).
   *   true 시 카드 외곽 제거 → 흰 섹션 hairline 행 + it-blue 총액. 점선 구분·구조 동일.
   */
  iceTheme?: boolean;
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
  iceTheme = false,
}: ReceiptCardProps) {
  const meta = STATUS_META[status];

  // ── 토큰 분기 (iceTheme=false 경로 원본 1:1 보존) ──────────────────────────
  const shell = iceTheme
    ? 'bg-it-surface dark:bg-rink-800 overflow-hidden'
    : 'bg-white dark:bg-rink-800 rounded-2xl border border-wline dark:border-rink-700 overflow-hidden';
  const labelText = iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300';
  const valueText = iceTheme ? 'text-it-ink-900 dark:text-white' : 'text-wtext-1 dark:text-white';
  const titleText = iceTheme ? 'text-it-ink-900 dark:text-white' : 'text-wtext-1 dark:text-white';
  const dashed = iceTheme ? 'border-it-line dark:border-rink-700' : 'border-wline dark:border-rink-700';
  const totalBg = iceTheme ? 'bg-it-fill dark:bg-rink-900/40' : 'bg-wbg dark:bg-rink-900/40';
  const totalLabel = iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100';
  const totalAccent = iceTheme ? 'text-it-blue-500' : 'text-ice-500';

  return (
    <article className={cn(shell, className)} aria-label={`영수증 ${orderNumber}`}>
      {/* Header */}
      <header className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('text-base font-bold truncate', titleText)}>
            {merchantName}
          </h3>
          <p className={cn('mt-1 text-xs truncate', labelText)}>
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
        className={cn('border-t border-dashed mx-5', dashed)}
        aria-hidden="true"
      />

      {/* Body - detail fields */}
      <dl className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <dt className={cn('text-sm', labelText)}>결제일시</dt>
          <dd className={cn('text-sm font-semibold text-right', valueText)}>
            {paymentDate}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className={cn('text-sm', labelText)}>결제수단</dt>
          <dd className={cn('text-sm font-semibold text-right', valueText)}>
            {method}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className={cn('text-sm shrink-0', labelText)}>상품명</dt>
          <dd className={cn('text-sm font-semibold text-right break-keep', valueText)}>
            {productName}
          </dd>
        </div>
      </dl>

      {/* Dashed divider */}
      <div
        className={cn('border-t border-dashed mx-5', dashed)}
        aria-hidden="true"
      />

      {/* Total */}
      <footer className={cn('px-5 py-4 flex items-center justify-between', totalBg)}>
        <span className={cn('text-sm font-semibold', totalLabel)}>
          총 결제금액
        </span>
        <span className={cn('text-xl font-bold', totalAccent)}>
          {formatWon(totalAmount)}
        </span>
      </footer>
    </article>
  );
}

export default ReceiptCard;
