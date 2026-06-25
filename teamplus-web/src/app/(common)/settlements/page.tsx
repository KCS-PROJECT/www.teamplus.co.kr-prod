'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { StatCard } from '@/components/shared';
import { MonthNavigator } from '@/components/shared';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettlementStatus = 'completed' | 'pending' | 'processing';
type TransactionStatus = 'completed' | 'pending';

interface Settlement {
  id: string;
  period: string;
  totalPayment: number;
  totalFee: number;
  netAmount: number;
  status: SettlementStatus;
  transactionCount: number;
}

interface Transaction {
  id: string;
  orderNumber: string;
  productName: string;
  paidAt: string;
  paymentMethod: string;
  amount: number;
  netAmount: number;
  fee: number;
  status: TransactionStatus;
}

interface ApiSettlement {
  id: string;
  period?: string;
  settlementMonth?: string;
  totalPayment?: number;
  totalRevenue?: number;
  totalFee?: number;
  platformFee?: number;
  paymentFee?: number;
  netAmount?: number;
  status?: string;
  transactionCount?: number;
  transactions?: ApiTransaction[];
}

interface ApiTransaction {
  id?: string;
  orderNumber?: string;
  productName?: string;
  paidAt?: string;
  paymentMethod?: string;
  amount?: number;
  netAmount?: number;
  fee?: number;
  status?: string;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

// Backend SettlementDetailStatus (PENDING · APPROVED · REJECTED · PAID · HOLD) +
// SettlementApprovalStatus (PENDING · APPROVED · REJECTED · REVIEW) 를 UI 3-state로 정규화
function normalizeSettlementStatus(status?: string): SettlementStatus {
  const value = (status ?? '').toLowerCase();
  // 정산 완료 상태
  if (value === 'completed' || value === 'paid') return 'completed';
  // 승인/처리 중 상태
  if (value === 'processing' || value === 'approved' || value === 'review') {
    return 'processing';
  }
  // 대기/반려/보류 등 pending 계열
  return 'pending';
}

function extractSettlementItems(payload: unknown): ApiSettlement[] {
  if (Array.isArray(payload)) return payload as ApiSettlement[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as ApiSettlement[];
    if (Array.isArray(obj.items)) return obj.items as ApiSettlement[];
    const nested = obj.data;
    if (nested && typeof nested === 'object') {
      const nestedObj = nested as Record<string, unknown>;
      if (Array.isArray(nestedObj.data)) return nestedObj.data as ApiSettlement[];
      if (Array.isArray(nestedObj.items)) return nestedObj.items as ApiSettlement[];
    }
  }
  return [];
}

function mapApiSettlement(item: ApiSettlement): Settlement {
  const totalPayment = item.totalPayment ?? item.totalRevenue ?? 0;
  const totalFee = item.totalFee ?? (item.platformFee ?? 0) + (item.paymentFee ?? 0);
  return {
    id: item.id,
    period: item.period ?? item.settlementMonth ?? '-',
    totalPayment,
    totalFee,
    netAmount: item.netAmount ?? Math.max(0, totalPayment - totalFee),
    status: normalizeSettlementStatus(item.status),
    transactionCount: item.transactionCount ?? item.transactions?.length ?? 0,
  };
}

function mapApiTransaction(t: ApiTransaction, idx: number): Transaction {
  return {
    id: t.id ?? `tx-${idx}`,
    orderNumber: t.orderNumber ?? `ORD-${String(idx + 1).padStart(4, '0')}`,
    productName: t.productName ?? '수업 결제',
    paidAt: t.paidAt ?? '',
    paymentMethod: t.paymentMethod ?? '카드',
    amount: t.amount ?? 0,
    netAmount: t.netAmount ?? 0,
    fee: t.fee ?? 0,
    status: (t.status ?? 'completed') === 'completed' ? 'completed' : 'pending',
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

function formatDateTime(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '-', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '-', time: '' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}.${mm}.${dd}`, time: `${hh}:${mi}` };
}

// ---------------------------------------------------------------------------
// Status configs
// ---------------------------------------------------------------------------

const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; className: string }> = {
  completed: {
    label: '정산 완료',
    className: 'bg-mint/10 text-mint dark:bg-mint/15 dark:text-mint',
  },
  pending: {
    label: '정산 대기',
    className: 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100',
  },
  processing: {
    label: '처리 중',
    className: 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500',
  },
};

// primaryStatus 가 위 3개 외 값일 경우 크래시 방지용 fallback
const SETTLEMENT_STATUS_FALLBACK: { label: string; className: string } = {
  label: '미정',
  className: 'bg-it-fill text-it-ink-400 dark:bg-rink-700 dark:text-rink-300',
};

const TX_STATUS: Record<TransactionStatus, { label: string; className: string }> = {
  completed: {
    label: '완료',
    className: 'bg-mint/10 text-mint dark:bg-mint/15 dark:text-mint',
  },
  pending: {
    label: '정산 대기',
    className: 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100',
  },
};

// 알 수 없는 TransactionStatus (백엔드 enum 확장) 대비 fallback
const TX_STATUS_FALLBACK: { label: string; className: string } = {
  label: '미정',
  className: 'bg-it-fill text-it-ink-400 dark:bg-rink-700 dark:text-rink-300',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TransactionCard({ tx, isLast }: { tx: Transaction; isLast?: boolean }) {
  const { date, time } = formatDateTime(tx.paidAt);
  const statusCfg = TX_STATUS[tx.status] ?? TX_STATUS_FALLBACK;

  return (
    <article
      className={`py-4 transition-colors motion-reduce:transition-none ${
        !isLast ? 'border-b border-it-line dark:border-rink-700' : ''
      }`}
    >
      {/* Header: 주문번호 + 상품명 */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-card-meta font-mono text-it-ink-400 dark:text-rink-300 mb-0.5">
            {tx.orderNumber}
          </p>
          <p className="text-card-title font-bold text-it-ink-800 dark:text-white truncate">
            {tx.productName}
          </p>
        </div>
        <span className={`shrink-0 ml-3 inline-flex items-center px-2 py-0.5 rounded-w-pill text-card-meta font-bold ${statusCfg.className}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* 2-col grid: 결제일시/수단, 결제금액/실지급액 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            결제 일시
          </p>
          <p className="text-card-meta font-medium text-it-ink-600 dark:text-rink-100 tabular-nums">
            {date}
            {time && <span className="text-it-ink-400 dark:text-rink-300 ml-1">{time}</span>}
          </p>
        </div>
        <div>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            결제 수단
          </p>
          <p className="text-card-meta font-medium text-it-ink-600 dark:text-rink-100">
            {tx.paymentMethod}
          </p>
        </div>
        <div>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            결제 금액
          </p>
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums text-right">
            {formatCurrency(tx.amount)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            실지급액
          </p>
          <p className="text-card-body font-bold text-it-blue-500 tabular-nums">
            {formatCurrency(tx.netAmount)}
          </p>
        </div>
      </div>

      {/* Footer: 수수료 + 상세 보기 */}
      <div className="flex items-center justify-between pt-3 border-t border-it-line dark:border-rink-700">
        <span className="text-card-meta text-it-red-500 dark:text-it-red-300 font-medium">
          수수료 -{formatCurrency(tx.fee)}
        </span>
        <button
          type="button"
          className="text-it-blue-500 text-card-meta font-semibold flex items-center gap-0.5 hover:underline"
        >
          상세 보기
          <Icon name="chevron_right" className="text-card-body" />
        </button>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex items-center justify-center size-16 rounded-w-md bg-it-fill dark:bg-rink-800 mb-4">
        <Icon name="receipt_long" className="text-3xl text-it-ink-400 dark:text-rink-500" />
      </div>
      <p className="text-card-body font-medium text-it-ink-500 dark:text-rink-300 mb-1">
        {MESSAGES.empty('거래 내역')}
      </p>
      <p className="text-card-meta text-it-ink-400 dark:text-rink-300">
        해당 월의 거래 내역이 없습니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettlementsPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { toast } = useToast();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [navYear, setNavYear] = useState(() => new Date().getFullYear());
  const [navMonth, setNavMonth] = useState(() => new Date().getMonth() + 1);
  const [visibleCount, setVisibleCount] = useState(5);

  const loadSettlements = useCallback(async (year: number, month: number) => {
    setIsLoading(true);
    try {
      const res = await api.get<unknown>('/admin/settlements', {
        params: { year, month },
      });
      if (!res.success) {
        setSettlements([]);
        setTransactions([]);
        return;
      }
      const items = extractSettlementItems(res.data);
      const mapped = items.map(mapApiSettlement);
      setSettlements(mapped);

      // 거래 내역 추출
      const txList: Transaction[] = [];
      for (const item of items) {
        if (Array.isArray(item.transactions)) {
          txList.push(...item.transactions.map(mapApiTransaction));
        }
      }
      setTransactions(txList);
    } catch {
      setSettlements([]);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettlements(navYear, navMonth);
  }, [loadSettlements, navYear, navMonth]);

  const settlementList = Array.isArray(settlements) ? settlements : [];

  // Derived stats
  const stats = useMemo(() => {
    const totalPayment = settlementList.reduce((s, v) => s + v.totalPayment, 0);
    const totalFee = settlementList.reduce((s, v) => s + v.totalFee, 0);
    const netAmount = settlementList.reduce((s, v) => s + v.netAmount, 0);
    const completedCount = settlementList.filter((s) => s.status === 'completed').length;
    const pendingCount = settlementList.filter((s) => s.status === 'pending').length;
    const primaryStatus: SettlementStatus =
      pendingCount > 0 ? 'pending' : completedCount > 0 ? 'completed' : 'processing';
    return { totalPayment, totalFee, netAmount, primaryStatus };
  }, [settlementList]);

  const visibleTx = useMemo(
    () => transactions.slice(0, visibleCount),
    [transactions, visibleCount],
  );

  const handleMonthChange = useCallback((y: number, m: number) => {
    setNavYear(y);
    setNavMonth(m);
    setVisibleCount(5);
    void loadSettlements(y, m);
  }, [loadSettlements]);

  const handleDownload = useCallback(() => {
    toast.info(MESSAGES.settlements.downloadComingSoon);
  }, [toast]);

  if (isLoading) return null;

  const statusCfg = SETTLEMENT_STATUS[stats.primaryStatus] ?? SETTLEMENT_STATUS_FALLBACK;

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="정산 상세" />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {/* MonthNavigator — 공유 컴포넌트(ICETIMES flat variant). flat 흰 헤더 래퍼. */}
        <MonthNavigator
          year={navYear}
          month={navMonth}
          onChange={handleMonthChange}
          iceTheme
          className="bg-it-surface dark:bg-it-blue-950 border-b border-it-line dark:border-rink-700"
        />

        {/* flat 흰 섹션 — 통계 그리드 + 거래 내역(카드 박스 제거) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 p-4 flex flex-col gap-4">
          {/* StatCard 4-grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="총 결제"
              value={formatCurrency(stats.totalPayment)}
              icon={<Icon name="payments" className="text-xl" />}
              accentColor="primary"
              iceTheme
            />
            <StatCard
              label="수수료"
              value={`-${formatCurrency(stats.totalFee)}`}
              icon={<Icon name="receipt_long" className="text-xl" />}
              accentColor="error"
              iceTheme
            />
            <StatCard
              label="최종 정산예정액"
              value={formatCurrency(stats.netAmount)}
              icon={<Icon name="account_balance" className="text-xl" />}
              accentColor="success"
              iceTheme
            />
            <StatCard
              label="상태"
              value={statusCfg.label}
              icon={<Icon name="info" className="text-xl" />}
              accentColor={
                stats.primaryStatus === 'completed'
                  ? 'success'
                  : stats.primaryStatus === 'pending'
                    ? 'warning'
                    : 'primary'
              }
              iceTheme
            />
          </div>

          {/* Transaction List Section */}
          <section>
            <div className="flex items-center justify-between mb-1 px-1">
              <h2 className="text-card-emphasis font-bold text-it-ink-800 dark:text-white">
                상세 거래 내역
              </h2>
              <span className="text-card-meta font-medium text-it-ink-400 dark:text-rink-300">
                총 {transactions.length}건
              </span>
            </div>

            {transactions.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col">
                {visibleTx.map((tx, idx) => (
                  <TransactionCard
                    key={tx.id}
                    tx={tx}
                    isLast={idx === visibleTx.length - 1 && visibleCount >= transactions.length}
                  />
                ))}
              </div>
            )}

            {/* 더보기 버튼 */}
            {visibleCount < transactions.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 5)}
                className="mt-3 w-full py-3 rounded-w-md border border-dashed border-it-line-strong dark:border-rink-700 text-card-body font-semibold text-it-ink-500 dark:text-rink-300 hover:bg-it-fill dark:hover:bg-rink-800 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                거래 내역 더보기
              </button>
            )}
          </section>

          {/* 엑셀 다운로드 버튼 */}
          <button
            type="button"
            onClick={handleDownload}
            disabled
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-w-md bg-it-blue-500 text-white font-semibold text-card-body hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="download" className="text-card-title" />
            정산 내역 엑셀 다운로드
          </button>

          {/* Bottom safe area */}
          <div className="h-8" />
        </section>
      </main>
    </MobileContainer>
  );
}
