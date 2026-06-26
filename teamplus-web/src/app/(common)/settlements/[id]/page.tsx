'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
interface Transaction {
  id: string;
  orderNumber: string;
  productName: string;
  paymentDate: string;
  paymentMethod: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: 'completed' | 'pending';
}

interface SettlementData {
  id: string;
  settlementMonth: string;
  totalRevenue: number;
  platformFee: number;
  paymentFee: number;
  netAmount: number;
  status: string;
  transactions: Array<{
    id: string;
    paymentId: string | null;
    transactionType: string;
    amount: number;
    description: string | null;
    transactionDate: string;
  }>;
}

const TYPE_LABEL: Record<string, string> = {
  class_payment: '수업 결제',
  shop_order: '쇼핑 주문',
  refund: '환불',
  fee: '수수료',
};

function mapTransaction(tx: SettlementData['transactions'][number]): Transaction {
  const date = new Date(tx.transactionDate);
  const paymentDate = date.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '');
  return {
    id: tx.id,
    orderNumber: tx.paymentId ?? '-',
    productName: tx.description ?? TYPE_LABEL[tx.transactionType] ?? tx.transactionType,
    paymentDate,
    paymentMethod: TYPE_LABEL[tx.transactionType] ?? '-',
    amount: tx.amount,
    fee: 0,
    netAmount: tx.amount,
    status: tx.transactionType === 'refund' || tx.amount < 0 ? 'pending' : 'completed',
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

function TransactionCard({ transaction, isLast }: { transaction: Transaction; isLast?: boolean }) {
  const isCompleted = transaction.status === 'completed';

  return (
    <div
      className={`py-4 transition-colors motion-reduce:transition-none ${
        !isLast ? 'border-b border-it-line dark:border-rink-700' : ''
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-card-meta text-it-ink-400 font-mono tracking-tight uppercase">
            {transaction.orderNumber}
          </p>
          <h3 className="text-card-body font-bold text-it-ink-800 dark:text-white mt-0.5">
            {transaction.productName}
          </h3>
        </div>
        <span
          className={`px-2.5 py-1 rounded-w-pill text-card-meta font-semibold ${
            isCompleted
              ? 'bg-mint/10 dark:bg-mint/15 text-mint'
              : 'bg-it-fill dark:bg-rink-700 text-it-ink-600 dark:text-rink-100'
          }`}
        >
          {isCompleted ? '완료' : '정산대기'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-y-2 text-card-meta">
        <div className="flex flex-col">
          <span className="text-it-ink-400">결제 일시</span>
          <span className="font-medium text-it-ink-600 dark:text-rink-100">
            {transaction.paymentDate}
          </span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-it-ink-400">결제 수단</span>
          <span className="font-medium text-it-ink-600 dark:text-rink-100">
            {transaction.paymentMethod}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-it-ink-400">결제 금액</span>
          <span className="font-bold text-it-ink-800 dark:text-white text-right tabular-nums">
            {formatCurrency(transaction.amount)}
          </span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-it-ink-400">실지급액</span>
          <span
            className={`font-bold tabular-nums ${
              isCompleted
                ? 'text-it-blue-500'
                : 'text-it-ink-400 dark:text-rink-300'
            }`}
          >
            {formatCurrency(transaction.netAmount)}
          </span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-it-line dark:border-rink-700 flex justify-between items-center">
        <span className="text-card-meta text-it-ink-400 italic">
          수수료 10% 적용: -{formatCurrency(transaction.fee)}
        </span>
        <button type="button" className="text-it-blue-500 text-card-meta font-bold flex items-center gap-1">
          상세 보기
          <Icon name="chevron_right" className="text-[14px]" />
        </button>
      </div>
    </div>
  );
}

export default function SettlementDetailPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const params = useParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [visibleCount, setVisibleCount] = useState(3);

  const settlementId = (params?.id ?? '') as string;

  const loadSettlement = useCallback(async () => {
    if (!settlementId) return;
    setIsLoading(true);
    try {
      const res = await api.get<SettlementData>(`/admin/settlements/${settlementId}`);
      if (res.success && res.data) {
        setSettlement(res.data);
        setTransactions(res.data.transactions.map(mapTransaction));
      }
    } finally {
      setIsLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    void loadSettlement();
  }, [loadSettlement]);

  const [year, month] = (settlement?.settlementMonth ?? settlementId).split('-');
  const periodText = year && month ? `${year}년 ${month}월` : settlementId;
  const dateRange = year && month
    ? `${year}. ${month.padStart(2, '0')}. 01 - ${year}. ${month.padStart(2, '0')}. ${new Date(Number(year), Number(month), 0).getDate()}`
    : '';

  const totalPayment = settlement?.totalRevenue ?? transactions.reduce((sum, t) => sum + t.amount, 0);
  const totalFee = settlement ? (settlement.platformFee + settlement.paymentFee) : transactions.reduce((sum, t) => sum + t.fee, 0);
  const netAmount = settlement?.netAmount ?? (totalPayment - totalFee);
  const isCompleted = settlement?.status === 'completed';

  const visibleTransactions = transactions.slice(0, visibleCount);

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={`${periodText} 정산 상세`} />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {/* flat 흰 섹션 — 정산 요약(카드 박스 제거) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 p-4 flex flex-col gap-4">
          {/* Period Selector */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center bg-it-fill dark:bg-rink-800 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 px-3 py-2 gap-3">
              <Icon name="calendar_today" className="text-it-ink-400" />
              <span className="text-card-body font-medium text-it-ink-600 dark:text-rink-100">
                {dateRange || '-'}
              </span>
            </div>
            <button type="button" className="w-full sm:w-auto px-4 py-2 bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold rounded-w-md text-card-body flex items-center justify-center gap-2 transition-colors motion-reduce:transition-none">
              <Icon name="description" className="text-[18px]" />
              정산 내역 엑셀 다운로드
            </button>
          </div>

          {/* Stats Summary Grid — flat 인셋 2x2 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5 rounded-w-md p-4 bg-it-fill dark:bg-puck/40">
              <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-medium uppercase tracking-wider">
                총 결제 금액
              </p>
              <p className="text-it-ink-800 dark:text-white text-card-title font-bold tabular-nums">
                {formatCurrency(totalPayment)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-w-md p-4 bg-it-fill dark:bg-puck/40">
              <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-medium uppercase tracking-wider">
                수수료 합계
              </p>
              <p className="text-it-red-500 dark:text-it-red-300 text-card-title font-bold tabular-nums">
                -{formatCurrency(totalFee)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-w-md p-4 bg-it-blue-50 dark:bg-it-blue-500/15">
              <p className="text-it-blue-500 text-card-meta font-medium uppercase tracking-wider">
                최종 정산 예정액
              </p>
              <p className="text-it-blue-500 text-xl font-bold tabular-nums">
                {formatCurrency(netAmount)}
              </p>
            </div>
            <div
              className={`flex flex-col gap-1.5 rounded-w-md p-4 ${
                isCompleted
                  ? 'bg-mint/10 dark:bg-mint/15'
                  : 'bg-it-fill dark:bg-puck/40'
              }`}
            >
              <p
                className={`text-card-meta font-medium uppercase tracking-wider ${
                  isCompleted
                    ? 'text-mint'
                    : 'text-it-ink-500 dark:text-rink-300'
                }`}
              >
                정산 상태
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`size-2 rounded-w-pill ${
                    isCompleted ? 'bg-mint' : 'bg-it-ink-300'
                  }`}
                ></span>
                <p
                  className={`text-card-title font-bold ${
                    isCompleted
                      ? 'text-mint'
                      : 'text-it-ink-600 dark:text-rink-100'
                  }`}
                >
                  {isCompleted ? '정산 완료' : '정산 대기'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* flat 흰 섹션 — 거래 내역 */}
        <section className="bg-it-surface dark:bg-it-blue-950 p-4">
          {/* Transaction List Header */}
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-it-ink-800 dark:text-white text-card-title font-bold tracking-tight">
              상세 거래 내역
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" className="p-2 text-it-ink-400 hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
                <Icon name="filter_list" />
              </button>
              <button type="button" className="p-2 text-it-ink-400 hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
                <Icon name="search" />
              </button>
            </div>
          </div>

          {/* Transaction List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-w-pill border-4 border-it-line dark:border-rink-700 border-t-it-blue-500 animate-spin motion-reduce:animate-none"></div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-it-ink-400">
              <Icon name="receipt_long" className="text-5xl mb-3" />
              <p className="text-card-body">거래 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleTransactions.map((transaction, idx) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  isLast={idx === visibleTransactions.length - 1}
                />
              ))}
            </div>
          )}

          {/* Load More Button */}
          {visibleCount < transactions.length && (
            <button type="button" onClick={() => setVisibleCount((prev) => prev + 3)}
              className="mt-3 w-full py-4 border border-dashed border-it-line-strong dark:border-rink-700 rounded-w-md text-it-ink-500 text-card-body font-medium hover:bg-it-fill dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
            >
              거래 내역 더보기 ({visibleCount}/{transactions.length})
            </button>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
