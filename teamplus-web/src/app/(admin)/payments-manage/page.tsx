'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
interface Payment {
  id: string;
  userName?: string;
  amount: number;
  status: string;
  createdAt: string;
}

const STATUS_META: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  completed: {
    label: '완료',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  pending: {
    label: '대기',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  refund_requested: {
    label: '환불 요청',
    badge: 'bg-ice-500/10 text-ice-500 dark:bg-ice-500/20',
    dot: 'bg-ice-500',
  },
  refunded: {
    label: '환불 완료',
    badge: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
    dot: 'bg-wtext-4 dark:bg-wbg0',
  },
  failed: {
    label: '실패',
    badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    dot: 'bg-red-500',
  },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export default function PaymentsManagePage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: Payment[] }>('/payments');
      setPayments(res.data?.data ?? []);
    } catch {
      setPayments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const summary = useMemo(() => {
    const completed = payments.filter((p) => p.status === 'completed');
    const totalCompleted = completed.reduce((sum, p) => sum + p.amount, 0);
    const refundPending = payments.filter((p) => p.status === 'refund_requested').length;
    return { count: payments.length, totalCompleted, refundPending };
  }, [payments]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="결제 관리" />

      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-28">
        {/* Hero summary */}
        <section className="mb-6">
          <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
            Payments
          </p>
          <h2 className="text-2xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
            결제 내역 관리
          </h2>
          <p className="mt-2 text-card-body font-medium text-wtext-3 dark:text-rink-300">
            결제 상태를 확인하고 환불 요청을 처리하세요.
          </p>
        </section>

        {/* Summary cards */}
        <section aria-label="결제 요약" className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
              완료 합계
            </p>
            <p className="mt-1 text-xl font-black text-wtext-1 dark:text-white text-right tabular-nums">
              {isLoading ? '—' : formatCurrency(summary.totalCompleted)}
            </p>
          </div>
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
              환불 대기
            </p>
            <p className="mt-1 text-xl font-black text-ice-500 text-right tabular-nums">
              {isLoading ? '—' : `${summary.refundPending}건`}
            </p>
          </div>
        </section>

        {/* Payment list */}
        <section aria-labelledby="payments-heading">
          <div className="mb-3 flex items-end justify-between">
            <h3
              id="payments-heading"
              className="text-card-title font-bold text-wtext-1 dark:text-white tracking-tight"
            >
              결제 목록
              {!isLoading && (
                <span className="ml-2 text-card-body font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                  {payments.length}건
                </span>
              )}
            </h3>
          </div>

          {isLoading ? null : payments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="receipt_long"
                  className="text-[28px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-4 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
                결제 내역이 없습니다.
              </p>
              <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                결제가 발생하면 이곳에 표시됩니다.
              </p>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="결제 목록">
              {payments.map((payment) => {
                const meta = STATUS_META[payment.status] ?? {
                  label: payment.status,
                  badge: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
                  dot: 'bg-wtext-4 dark:bg-wbg0',
                };
                const isRefundRequested = payment.status === 'refund_requested';
                const isCompleted = payment.status === 'completed';
                const isPending = payment.status === 'pending';

                return (
                  <li
                    key={payment.id}
                    className="bg-white dark:bg-rink-800 rounded-xl p-5 border border-wline dark:border-rink-700 shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-card-emphasis font-bold text-wtext-1 dark:text-white truncate">
                          {payment.userName ?? '알 수 없음'}
                        </h4>
                        <p className="mt-0.5 text-card-meta font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                          {formatDate(payment.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-w-pill px-2.5 py-1 text-card-meta font-bold ${meta.badge}`}
                      >
                        <span className={`size-1.5 rounded-w-pill ${meta.dot}`} aria-hidden="true" />
                        {meta.label}
                      </span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-wline-2 dark:border-rink-700 flex items-center justify-between gap-3">
                      <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                        결제 금액
                      </span>
                      <span className="text-xl font-black text-wtext-1 dark:text-white text-right tabular-nums">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 h-11 inline-flex items-center justify-center gap-1 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 text-card-body font-bold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                      >
                        <Icon name="description" className="text-[16px]" aria-hidden="true" />
                        상세 보기
                      </button>
                      {isRefundRequested && (
                        <button
                          type="button"
                          className="flex-1 h-11 inline-flex items-center justify-center gap-1 rounded-xl bg-ice-500 px-4 text-card-body font-bold text-white shadow-sm hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                        >
                          <Icon name="task_alt" className="text-[16px]" aria-hidden="true" />
                          환불 승인
                        </button>
                      )}
                      {isCompleted && (
                        <button
                          type="button"
                          className="flex-1 h-11 inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-rink-800 px-4 text-card-body font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                        >
                          <Icon name="currency_exchange" className="text-[16px]" aria-hidden="true" />
                          환불하기
                        </button>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          className="flex-1 h-11 inline-flex items-center justify-center gap-1 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 text-card-body font-bold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                        >
                          <Icon name="close" className="text-[16px]" aria-hidden="true" />
                          취소하기
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
