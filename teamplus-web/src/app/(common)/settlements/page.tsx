'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/hooks/useNavigation';
import { MonthNavigator } from '@/components/shared';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { kstYearMonth } from '@/lib/kst-month';

import { usePageReady } from '@/hooks/usePageReady';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettlementStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'rejected';

// 목록 로드 실패 3분류 — 404/403/기타(네트워크·서버 오류). 성공+0건(빈 달)은 별도(EmptyState).
type SettlementListErrorKind = 'notFound' | 'denied' | 'load' | null;

interface SettlementListItem {
  id: string;
  teamId: string;
  teamName: string;
  settlementMonth: string;
  totalRevenue: number;
  platformFee: number;
  paymentFee: number;
  refundAmount: number;
  netAmount: number;
  status: SettlementStatus;
}

interface ApiSettlementListItem {
  id: string;
  teamId?: string;
  settlementMonth?: string;
  totalRevenue?: number;
  platformFee?: number;
  paymentFee?: number;
  refundAmount?: number;
  netAmount?: number;
  status?: string;
  team?: { id?: string; name?: string };
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES: SettlementStatus[] = [
  'pending',
  'approved',
  'processing',
  'paid',
  'failed',
  'rejected',
];

function normalizeStatus(status?: string): SettlementStatus {
  const value = (status ?? '').toLowerCase();
  return (VALID_STATUSES as string[]).includes(value) ? (value as SettlementStatus) : 'pending';
}

// 정산은 결제일 기준 월 마감 후 확정되므로 당월은 항상 비어 보인다 — 기본 노출월을
// 지난달로 잡는다. KST 오늘은 프로젝트 유틸(kstYearMonth)로 산출하고, 이후는 정수
// 연산만 사용해(로컬 Date 생성 없이) 월 경계 오류를 피한다.
function getDefaultSettlementMonth(): { year: number; month: number } {
  const [y, m] = kstYearMonth().split('-').map(Number);
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

function extractSettlementItems(payload: unknown): ApiSettlementListItem[] {
  if (Array.isArray(payload)) return payload as ApiSettlementListItem[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as ApiSettlementListItem[];
    if (Array.isArray(obj.items)) return obj.items as ApiSettlementListItem[];
  }
  return [];
}

function mapApiSettlement(item: ApiSettlementListItem): SettlementListItem {
  return {
    id: item.id,
    teamId: item.teamId ?? item.team?.id ?? '',
    teamName: item.team?.name ?? MESSAGES.settlements.teamFallback,
    settlementMonth: item.settlementMonth ?? '-',
    totalRevenue: item.totalRevenue ?? 0,
    platformFee: item.platformFee ?? 0,
    paymentFee: item.paymentFee ?? 0,
    refundAmount: item.refundAmount ?? 0,
    netAmount: item.netAmount ?? 0,
    status: normalizeStatus(item.status),
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

// 수수료는 항상 차감액으로 표기하되, 0원일 때는 "-0원"이 되지 않도록 부호를 붙이지 않는다.
function formatFeeAmount(fee: number): string {
  return fee ? `-${formatCurrency(fee)}` : formatCurrency(0);
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; className: string }> = {
  pending: {
    label: MESSAGES.settlements.statusPending,
    className: 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100',
  },
  approved: {
    label: MESSAGES.settlements.statusApproved,
    className: 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500',
  },
  processing: {
    label: MESSAGES.settlements.statusProcessing,
    className: 'bg-sun-500/10 text-sun-500 dark:bg-sun-500/15 dark:text-sun-500',
  },
  paid: {
    label: MESSAGES.settlements.statusPaid,
    className: 'bg-mint/10 text-mint dark:bg-mint/15 dark:text-mint',
  },
  failed: {
    label: MESSAGES.settlements.statusFailed,
    className: 'bg-flame-500/10 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500',
  },
  rejected: {
    label: MESSAGES.settlements.statusRejected,
    className: 'bg-flame-500/10 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SettlementCard({
  item,
  onOpen,
}: {
  item: SettlementListItem;
  onOpen: (id: string) => void;
}) {
  const statusCfg = SETTLEMENT_STATUS[item.status];
  const fee = item.platformFee + item.paymentFee;
  const isNetNegative = item.netAmount < 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="w-full py-4 text-left transition-colors motion-reduce:transition-none border-b border-it-line dark:border-rink-700 last:border-b-0 active:brightness-95"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-card-title font-bold text-it-ink-800 dark:text-white truncate">
            {item.teamName}
          </p>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 mt-0.5">
            {item.settlementMonth}
          </p>
        </div>
        <span
          className={`shrink-0 ml-3 inline-flex items-center px-2 py-0.5 rounded-w-pill text-card-meta font-bold ${statusCfg.className}`}
        >
          {statusCfg.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            {MESSAGES.settlements.totalRevenueLabel}
          </p>
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums">
            {formatCurrency(item.totalRevenue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            {MESSAGES.settlements.refundLabel}
          </p>
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums">
            {formatCurrency(item.refundAmount)}
          </p>
        </div>
        <div>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            {MESSAGES.settlements.feeLabel}
          </p>
          <p className="text-card-body font-bold text-it-red-500 tabular-nums">
            {formatFeeAmount(fee)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 font-medium mb-0.5">
            {MESSAGES.settlements.netAmountLabel}
          </p>
          <p
            className={`text-card-body font-bold tabular-nums ${
              isNetNegative ? 'text-flame-500' : 'text-it-blue-500'
            }`}
          >
            {formatCurrency(item.netAmount)}
          </p>
        </div>
      </div>

      {/* 순지급액 마이너스 — 환불 초과로 지급 보류 */}
      {isNetNegative && (
        <p className="mt-3 text-card-meta font-bold text-flame-500">
          {MESSAGES.settlements.negativeNetAmountNotice}
        </p>
      )}

      <div className="flex items-center justify-end gap-0.5 pt-3 mt-3 border-t border-it-line dark:border-rink-700 text-it-blue-500 text-card-meta font-semibold">
        {MESSAGES.settlements.detailsTitle}
        <Icon name="chevron_right" className="text-card-body" />
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex items-center justify-center size-16 rounded-w-md bg-it-fill dark:bg-rink-800 mb-4">
        <Icon name="receipt_long" className="text-3xl text-it-ink-400 dark:text-rink-500" />
      </div>
      <p className="text-card-body font-medium text-it-ink-500 dark:text-rink-300">
        {MESSAGES.settlements.emptyMonth}
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

  const { navigate } = useNavigation();
  const [settlements, setSettlements] = useState<SettlementListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<SettlementListErrorKind>(null);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [navYear, setNavYear] = useState(() => getDefaultSettlementMonth().year);
  const [navMonth, setNavMonth] = useState(() => getDefaultSettlementMonth().month);

  const loadSettlements = useCallback(async (year: number, month: number) => {
    setIsLoading(true);
    try {
      const monthParam = `${year}-${String(month).padStart(2, '0')}`;
      const res = await api.get<unknown>('/settlements', {
        params: { month: monthParam, page: 1, pageSize: 50 },
      });
      if (!res.success) {
        setSettlements([]);
        const status = res.error?.statusCode;
        setErrorKind(status === 404 ? 'notFound' : status === 403 ? 'denied' : 'load');
        return;
      }
      const items = extractSettlementItems(res.data).map(mapApiSettlement);
      setSettlements(items);
      setErrorKind(null);
    } catch {
      setSettlements([]);
      setErrorKind('load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettlements(navYear, navMonth);
  }, [loadSettlements, navYear, navMonth]);

  const handleMonthChange = useCallback(
    (y: number, m: number) => {
      setNavYear(y);
      setNavMonth(m);
      void loadSettlements(y, m);
    },
    [loadSettlements],
  );

  const handleOpenDetail = useCallback(
    (id: string) => {
      void navigate(`/settlements/${id}`);
    },
    [navigate],
  );

  if (isLoading) return null;

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.settlements.pageTitle} />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8 flex flex-col">
        {/* MonthNavigator — 공유 컴포넌트(ICETIMES flat variant). flat 흰 헤더 래퍼. */}
        <MonthNavigator
          year={navYear}
          month={navMonth}
          onChange={handleMonthChange}
          iceTheme
          className="bg-it-surface dark:bg-it-blue-950 border-b border-it-line dark:border-rink-700"
        />

        {/* flat 흰 섹션 — 정산 건 카드 목록(카드 박스 제거). flex-1 로 잔여 높이까지
            흰 배경을 채워 카드 1~2건일 때 하단에 큰 회색(bg-it-canvas) 여백이 남지 않게 한다. */}
        <section className="mt-2 flex-1 bg-it-surface dark:bg-it-blue-950 p-4">
          <p className="mb-3 text-card-meta text-it-ink-400 dark:text-rink-300">
            {MESSAGES.settlements.basisNotice}
          </p>

          {errorKind ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-card-body text-it-ink-500 dark:text-rink-300">
                {errorKind === 'notFound'
                  ? MESSAGES.settlements.notFound
                  : errorKind === 'denied'
                    ? MESSAGES.settlements.deniedList
                    : MESSAGES.settlements.loadError}
              </p>
              <button
                type="button"
                onClick={() => void loadSettlements(navYear, navMonth)}
                className="inline-flex h-10 items-center justify-center rounded-w-md bg-it-blue-500 px-5 text-card-body font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 motion-reduce:transition-none"
              >
                {MESSAGES.settlements.retry}
              </button>
            </div>
          ) : settlements.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col">
              {settlements.map((item) => (
                <SettlementCard key={item.id} item={item} onOpen={handleOpenDetail} />
              ))}
            </div>
          )}

          {/* Bottom safe area */}
          <div className="h-8" />
        </section>
      </main>
    </MobileContainer>
  );
}
