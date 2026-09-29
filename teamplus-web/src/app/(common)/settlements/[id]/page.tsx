'use client';

import { useState, useEffect, useCallback, useContext } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/hooks/useNavigation';
import { AuthContext } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettlementStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'rejected';

interface SettlementTransaction {
  id: string;
  paymentId: string | null;
  transactionType: string;
  amount: number;
  description: string | null;
  transactionDate: string;
}

interface SettlementData {
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
  bankName: string | null;
  bankAccount: string | null;
  accountHolder: string | null;
  transactions: SettlementTransaction[];
}

interface ApiSettlementDetail {
  id: string;
  teamId?: string;
  settlementMonth?: string;
  totalRevenue?: number;
  platformFee?: number;
  paymentFee?: number;
  refundAmount?: number;
  netAmount?: number;
  status?: string;
  bankName?: string | null;
  bankAccount?: string | null;
  accountHolder?: string | null;
  team?: { id?: string; name?: string };
  transactions?: SettlementTransaction[];
}

interface SettlementDetailLine {
  id: string;
  paymentId: string;
  orderNumber: string;
  productName: string;
  paymentDate: string;
  paymentMethod: string;
  paymentAmount: number;
  feeRate: number;
  feeAmount: number;
  actualAmount: number;
  status: string;
  memo: string | null;
  entryType: 'PAYMENT' | 'REFUND';
  attributionMonth: string | null;
}

interface DetailsMeta {
  page: number;
  totalPages: number;
}

type GroupSourceType = 'CLASS' | 'TOURNAMENT' | 'OTHER';

interface SettlementGroup {
  sourceType: GroupSourceType;
  sourceId: string | null;
  name: string;
  paymentCount: number;
  paymentAmount: number;
  refundCount: number;
  refundAmount: number;
  feeAmount: number;
  netAmount: number;
}

interface SettlementGroupTotals {
  paymentCount: number;
  paymentAmount: number;
  refundCount: number;
  refundAmount: number;
  feeAmount: number;
  netAmount: number;
}

interface GroupDetailState {
  lines: SettlementDetailLine[];
  page: number;
  requestedPage: number;
  hasMore: boolean;
  isLoading: boolean;
  errored: boolean;
}

// 상세 로드 실패 3분류 — 404/403/기타(네트워크·서버 오류).
type SettlementDetailErrorKind = 'notFound' | 'denied' | 'load' | null;

const DETAILS_PAGE_SIZE = 10;

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

function mapSettlement(raw: ApiSettlementDetail): SettlementData {
  return {
    id: raw.id,
    teamId: raw.teamId ?? raw.team?.id ?? '',
    teamName: raw.team?.name ?? MESSAGES.settlements.teamFallback,
    settlementMonth: raw.settlementMonth ?? '-',
    totalRevenue: raw.totalRevenue ?? 0,
    platformFee: raw.platformFee ?? 0,
    paymentFee: raw.paymentFee ?? 0,
    refundAmount: raw.refundAmount ?? 0,
    netAmount: raw.netAmount ?? 0,
    status: normalizeStatus(raw.status),
    bankName: raw.bankName ?? null,
    bankAccount: raw.bankAccount ?? null,
    accountHolder: raw.accountHolder ?? null,
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
  };
}

function extractItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
  }
  return [];
}

// 명세 meta 는 { total, page, pageSize, totalPages } 로 확정 — page < totalPages 로 단순 판정.
function extractDetailsMeta(payload: unknown): DetailsMeta | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  if (!meta) return null;
  const page = typeof meta.page === 'number' ? meta.page : undefined;
  const totalPages = typeof meta.totalPages === 'number' ? meta.totalPages : undefined;
  if (page === undefined || totalPages === undefined) return null;
  return { page, totalPages };
}

// 귀속월("YYYY-MM") → "N월분" 표기. attributionMonth 가 없으면 표시하지 않는다.
function formatAttributionMonth(ym: string | null): string | null {
  if (!ym) return null;
  const month = Number(ym.split('-')[1]);
  if (!Number.isFinite(month)) return null;
  return MESSAGES.settlements.attributionMonthLabel(month);
}

function extractGroupTotals(payload: unknown): SettlementGroupTotals | null {
  if (!payload || typeof payload !== 'object') return null;
  const meta = (payload as Record<string, unknown>).meta as Record<string, unknown> | undefined;
  const totals = meta?.totals;
  if (!totals || typeof totals !== 'object') return null;
  return totals as SettlementGroupTotals;
}

function groupKey(group: SettlementGroup): string {
  return `${group.sourceType}:${group.sourceId ?? group.name}`;
}

function groupSourceLabel(sourceType: GroupSourceType): string {
  if (sourceType === 'CLASS') return MESSAGES.settlements.groupSourceClass;
  if (sourceType === 'TOURNAMENT') return MESSAGES.settlements.groupSourceTournament;
  return MESSAGES.settlements.groupSourceOther;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

// 수수료는 차감액으로 표기한다 — 양수(수수료)는 "-X원", 음수(환불 시 수수료 환급)는 "+X원", 0원은 부호 없이.
function formatFeeAmount(fee: number): string {
  if (fee > 0) return `-${formatCurrency(fee)}`;
  if (fee < 0) return `+${formatCurrency(-fee)}`;
  return formatCurrency(0);
}

// paymentDate·transactionDate 는 @db.Date(달력일, UTC 자정 저장) — 로컬/KST 변환 없이
// UTC 게터로만 "YYYY.MM.DD" 를 뽑아야 날짜가 하루 밀리지 않는다.
function formatDateOnly(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

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
// Sub components
// ---------------------------------------------------------------------------

function PayoutRow({ tx, isLast }: { tx: SettlementTransaction; isLast?: boolean }) {
  const isReject = tx.transactionType === 'reject';
  return (
    <div
      className={`py-3 ${!isLast ? 'border-b border-it-line dark:border-rink-700' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white">
            {isReject ? MESSAGES.settlements.rejectReasonLabel : formatCurrency(tx.amount)}
          </p>
          {tx.description && (
            <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-rink-300">
              {tx.description}
            </p>
          )}
        </div>
        <span className="shrink-0 text-card-meta text-it-ink-400 dark:text-rink-300 tabular-nums">
          {formatDateOnly(tx.transactionDate)}
        </span>
      </div>
    </div>
  );
}

function DetailLineRow({ line, isLast }: { line: SettlementDetailLine; isLast?: boolean }) {
  const isRefund = line.entryType === 'REFUND';
  const attributionLabel = formatAttributionMonth(line.attributionMonth);
  return (
    <div
      className={`py-4 ${!isLast ? 'border-b border-it-line dark:border-rink-700' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-w-pill text-[11px] font-bold ${
                isRefund
                  ? 'bg-flame-500/10 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500'
                  : 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500'
              }`}
            >
              {isRefund ? MESSAGES.settlements.entryTypeRefund : MESSAGES.settlements.entryTypePayment}
            </span>
            {attributionLabel && (
              <span className="text-card-meta text-it-ink-400 dark:text-rink-300">
                {attributionLabel}
              </span>
            )}
          </div>
          <p className="text-card-meta font-mono text-it-ink-400 dark:text-rink-300 mb-0.5">
            {line.orderNumber}
          </p>
          <p className="text-card-title font-bold text-it-ink-800 dark:text-white truncate">
            {line.productName}
          </p>
        </div>
        <span className="shrink-0 ml-3 text-card-meta text-it-ink-400 dark:text-rink-300 tabular-nums">
          {formatDateOnly(line.paymentDate)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 mb-0.5">
            {MESSAGES.settlements.paymentAmountLabel}
          </p>
          <p
            className={`text-card-body font-bold tabular-nums ${
              isRefund ? 'text-flame-500' : 'text-it-ink-800 dark:text-white'
            }`}
          >
            {formatCurrency(line.paymentAmount)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 mb-0.5">
            {MESSAGES.settlements.actualAmountLabel}
          </p>
          <p
            className={`text-card-body font-bold tabular-nums ${
              isRefund ? 'text-flame-500' : 'text-it-blue-500'
            }`}
          >
            {formatCurrency(line.actualAmount)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-card-meta text-it-red-500 dark:text-it-red-300">
        {MESSAGES.settlements.feeAmountLabel} ({(line.feeRate * 100).toFixed(1)}%){' '}
        {formatFeeAmount(line.feeAmount)}
      </p>
      {line.memo && (
        <p className="mt-1 text-card-meta text-it-ink-500 dark:text-rink-300">
          {MESSAGES.settlements.memoLabel}: {line.memo}
        </p>
      )}
    </div>
  );
}

function GroupSummaryBody({ group }: { group: SettlementGroup }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex shrink-0 items-center rounded-w-pill bg-it-fill px-1.5 py-0.5 text-[11px] font-bold text-it-ink-600 dark:bg-rink-700 dark:text-rink-100">
          {groupSourceLabel(group.sourceType)}
        </span>
        <p className="truncate text-card-title font-bold text-it-ink-800 dark:text-white">
          {group.name}
        </p>
      </div>
      <p className="mt-1 text-card-meta tabular-nums text-it-ink-500 dark:text-rink-300">
        {MESSAGES.settlements.groupPaymentSummary(
          group.paymentCount,
          formatCurrency(group.paymentAmount),
        )}
      </p>
      {group.refundCount > 0 && (
        <p className="text-card-meta tabular-nums text-it-red-500 dark:text-it-red-300">
          {MESSAGES.settlements.groupRefundSummary(
            group.refundCount,
            formatCurrency(group.refundAmount),
          )}
        </p>
      )}
      <p className="mt-1 text-card-meta text-it-ink-400 dark:text-rink-300">
        {MESSAGES.settlements.groupNetLabel}{' '}
        <span
          className={`text-card-body font-bold tabular-nums ${
            group.netAmount < 0 ? 'text-flame-500' : 'text-it-blue-500'
          }`}
        >
          {formatCurrency(group.netAmount)}
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettlementDetailPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const params = useParams();
  const { navigate } = useNavigation();
  // 인증 훅은 layout 에서만 호출 — 페이지는 이미 채워진 컨텍스트 값만 읽는다.
  const user = useContext(AuthContext)?.user;
  const canViewDetails = user?.userType === 'director' || user?.userType === 'admin';

  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<SettlementDetailErrorKind>(null);

  const [groups, setGroups] = useState<SettlementGroup[]>([]);
  const [groupTotals, setGroupTotals] = useState<SettlementGroupTotals | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryErrored, setSummaryErrored] = useState(false);
  // 그룹별 명세 — 키는 `${sourceType}:${sourceId ?? name}`. 첫 펼침 때만 조회한다.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [groupDetails, setGroupDetails] = useState<Record<string, GroupDetailState>>({});

  // 풀스크린 로더 fast-path (v11) — 정산 본문 + 명세 요약 첫 로드가 끝나야 OFF
  usePageReady(!isLoading && !isSummaryLoading);

  const settlementId = (params?.id ?? '') as string;

  const loadSettlement = useCallback(async () => {
    if (!settlementId) return;
    setIsLoading(true);
    try {
      const res = await api.get<ApiSettlementDetail>(`/settlements/${settlementId}`);
      if (res.success && res.data) {
        setSettlement(mapSettlement(res.data));
        setErrorKind(null);
      } else {
        const status = res.error?.statusCode;
        setErrorKind(status === 404 ? 'notFound' : status === 403 ? 'denied' : 'load');
      }
    } catch {
      setErrorKind('load');
    } finally {
      setIsLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    void loadSettlement();
  }, [loadSettlement]);

  const loadSummary = useCallback(async () => {
    if (!settlementId) return;
    setIsSummaryLoading(true);
    try {
      const res = await api.get<unknown>(`/settlements/${settlementId}/details/summary`);
      if (res.success) {
        setGroups(extractItems<SettlementGroup>(res.data));
        setGroupTotals(extractGroupTotals(res.data));
        setSummaryErrored(false);
      } else {
        setSummaryErrored(true);
      }
    } catch {
      setSummaryErrored(true);
    } finally {
      setIsSummaryLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // 그룹 결제 명세 — 감독만 조회(코치는 403 대상이라 호출 자체를 하지 않는다).
  const loadGroupDetails = useCallback(
    async (group: SettlementGroup, page: number) => {
      if (!settlementId || !canViewDetails) return;
      const key = groupKey(group);
      setGroupDetails((prev) => ({
        ...prev,
        [key]: {
          lines: prev[key]?.lines ?? [],
          page: prev[key]?.page ?? 0,
          hasMore: prev[key]?.hasMore ?? false,
          requestedPage: page,
          isLoading: true,
          errored: false,
        },
      }));
      const params: Record<string, string | number> = {
        page,
        pageSize: DETAILS_PAGE_SIZE,
        sourceType: group.sourceType,
      };
      if (group.sourceId) params.sourceId = group.sourceId;
      else params.productName = group.name;
      try {
        const res = await api.get<unknown>(`/settlements/${settlementId}/details`, { params });
        if (res.success) {
          const items = extractItems<SettlementDetailLine>(res.data);
          const meta = extractDetailsMeta(res.data);
          setGroupDetails((prev) => ({
            ...prev,
            [key]: {
              lines: page === 1 ? items : [...(prev[key]?.lines ?? []), ...items],
              page,
              requestedPage: page,
              hasMore: meta ? meta.page < meta.totalPages : false,
              isLoading: false,
              errored: false,
            },
          }));
        } else {
          setGroupDetails((prev) => ({
            ...prev,
            [key]: { ...prev[key], isLoading: false, errored: true },
          }));
        }
      } catch {
        setGroupDetails((prev) => ({
          ...prev,
          [key]: { ...prev[key], isLoading: false, errored: true },
        }));
      }
    },
    [settlementId, canViewDetails],
  );

  const handleToggleGroup = useCallback(
    (group: SettlementGroup) => {
      const key = groupKey(group);
      const willOpen = !openGroups[key];
      setOpenGroups((prev) => ({ ...prev, [key]: willOpen }));
      if (willOpen && !groupDetails[key]) void loadGroupDetails(group, 1);
    },
    [openGroups, groupDetails, loadGroupDetails],
  );

  if (isLoading) return null;

  if (!settlement) {
    const isDenied = errorKind === 'denied';
    const isNotFound = errorKind === 'notFound';
    const message = isNotFound
      ? MESSAGES.settlements.notFound
      : isDenied
        ? MESSAGES.settlements.deniedDetail
        : MESSAGES.settlements.loadError;
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title={MESSAGES.settlements.pageTitle} />
        <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
          <div className="flex flex-col items-center gap-3 px-5 py-20 text-center">
            <p className="text-card-body text-it-ink-500 dark:text-rink-300">{message}</p>
            {isNotFound || isDenied ? (
              <button
                type="button"
                onClick={() => void navigate('/settlements')}
                className="inline-flex h-10 items-center justify-center rounded-w-md bg-it-blue-500 px-5 text-card-body font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 motion-reduce:transition-none"
              >
                {MESSAGES.settlements.backToList}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void loadSettlement()}
                className="inline-flex h-10 items-center justify-center rounded-w-md bg-it-blue-500 px-5 text-card-body font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 motion-reduce:transition-none"
              >
                {MESSAGES.settlements.retry}
              </button>
            )}
          </div>
        </main>
      </MobileContainer>
    );
  }

  const [year, month] = settlement.settlementMonth.split('-');
  const periodText = year && month ? MESSAGES.settlements.yearMonthLabel(year, month) : settlement.settlementMonth;
  const statusCfg = SETTLEMENT_STATUS[settlement.status];
  const fee = settlement.platformFee + settlement.paymentFee;

  const payouts = settlement.transactions.filter((t) => t.transactionType === 'payout');
  const rejectReason = settlement.transactions.find((t) => t.transactionType === 'reject');

  const hasBankInfo = settlement.bankName || settlement.bankAccount || settlement.accountHolder;
  const isNetNegative = settlement.netAmount < 0;

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={MESSAGES.settlements.detailTitle(periodText)} />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {/* flat 흰 섹션 — 정산 요약(카드 박스 제거) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 p-4 flex flex-col gap-4">
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300">
            {MESSAGES.settlements.basisNotice}
          </p>

          <div className="flex items-center justify-between">
            <p className="text-card-title font-bold text-it-ink-800 dark:text-white">
              {settlement.teamName}
            </p>
            <span
              className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-w-pill text-card-meta font-bold ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
          </div>

          {/* 순지급액 마이너스 — 환불 초과로 지급 보류 */}
          {isNetNegative && (
            <div className="rounded-w-md bg-flame-500/10 dark:bg-flame-500/15 p-3">
              <p className="text-card-meta font-bold text-flame-500">
                {MESSAGES.settlements.negativeNetAmountNotice}
              </p>
            </div>
          )}

          {/* 반려 사유 */}
          {settlement.status === 'rejected' && rejectReason?.description && (
            <div className="rounded-w-md bg-it-red-50 dark:bg-it-red-500/10 p-3">
              <p className="text-card-meta font-bold text-it-red-500 mb-0.5">
                {MESSAGES.settlements.rejectReasonLabel}
              </p>
              <p className="text-card-meta text-it-ink-600 dark:text-rink-100">
                {rejectReason.description}
              </p>
            </div>
          )}

          {/* Stats Summary Grid — flat 인셋 2x2 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5 rounded-w-md p-4 bg-it-fill dark:bg-puck/40">
              <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-medium uppercase tracking-wider">
                {MESSAGES.settlements.totalRevenueLabel}
              </p>
              <p className="text-it-ink-800 dark:text-white text-card-title font-bold tabular-nums">
                {formatCurrency(settlement.totalRevenue)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-w-md p-4 bg-it-fill dark:bg-puck/40">
              <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-medium uppercase tracking-wider">
                {MESSAGES.settlements.refundLabel}
              </p>
              <p className="text-it-red-500 dark:text-it-red-300 text-card-title font-bold tabular-nums">
                {formatCurrency(settlement.refundAmount)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-w-md p-4 bg-it-fill dark:bg-puck/40">
              <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-medium uppercase tracking-wider">
                {MESSAGES.settlements.feeLabel}
              </p>
              <p className="text-it-red-500 dark:text-it-red-300 text-card-title font-bold tabular-nums">
                {formatFeeAmount(fee)}
              </p>
            </div>
            <div
              className={`flex flex-col gap-1.5 rounded-w-md p-4 ${
                isNetNegative ? 'bg-flame-500/10 dark:bg-flame-500/15' : 'bg-it-blue-50 dark:bg-it-blue-500/15'
              }`}
            >
              <p
                className={`text-card-meta font-medium uppercase tracking-wider ${
                  isNetNegative ? 'text-flame-500' : 'text-it-blue-500'
                }`}
              >
                {MESSAGES.settlements.netAmountLabel}
              </p>
              <p
                className={`text-xl font-bold tabular-nums ${
                  isNetNegative ? 'text-flame-500' : 'text-it-blue-500'
                }`}
              >
                {formatCurrency(settlement.netAmount)}
              </p>
            </div>
          </div>

          {/* 지급 계좌 — 값이 있을 때만 표시(코치는 계좌번호 null) */}
          {hasBankInfo && (
            <div className="rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 p-4">
              <p className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 mb-2">
                {MESSAGES.settlements.bankInfoTitle}
              </p>
              <div className="flex flex-col gap-1 text-card-body text-it-ink-800 dark:text-white">
                {settlement.bankName && (
                  <p>
                    {settlement.bankName}
                    {settlement.bankAccount ? ` ${settlement.bankAccount}` : ''}
                  </p>
                )}
                {settlement.accountHolder && (
                  <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                    {MESSAGES.settlements.accountHolderLabel} {settlement.accountHolder}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* flat 흰 섹션 — 지급 기록 */}
        <section className="bg-it-surface dark:bg-it-blue-950 p-4">
          <h2 className="text-it-ink-800 dark:text-white text-card-title font-bold tracking-tight mb-1">
            {MESSAGES.settlements.payoutHistoryTitle}
          </h2>
          {payouts.length === 0 ? (
            <p className="py-8 text-center text-card-body text-it-ink-400 dark:text-rink-300">
              {MESSAGES.settlements.emptyPayout}
            </p>
          ) : (
            <div className="flex flex-col">
              {payouts.map((tx, i) => (
                <PayoutRow key={tx.id} tx={tx} isLast={i === payouts.length - 1} />
              ))}
            </div>
          )}
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-it-blue-950 p-4">
          <h2 className="text-it-ink-800 dark:text-white text-card-title font-bold tracking-tight mb-1">
            {MESSAGES.settlements.groupsTitle}
          </h2>
          {summaryErrored ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-card-body text-it-ink-400 dark:text-rink-300">
                {MESSAGES.settlements.groupsLoadError}
              </p>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="inline-flex h-11 items-center justify-center rounded-w-md bg-it-blue-500 px-4 text-card-meta font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 motion-reduce:transition-none"
              >
                {MESSAGES.settlements.retry}
              </button>
            </div>
          ) : isSummaryLoading && groups.length === 0 ? null : groups.length === 0 ? (
            <p className="py-8 text-center text-card-body text-it-ink-400 dark:text-rink-300">
              {MESSAGES.settlements.groupsEmpty}
            </p>
          ) : (
            <div className="flex flex-col">
              {groups.map((group) => {
                const key = groupKey(group);
                const isOpen = !!openGroups[key];
                const detail = groupDetails[key];
                return (
                  <div key={key} className="border-b border-it-line dark:border-rink-700">
                    {canViewDetails ? (
                      <button
                        type="button"
                        onClick={() => handleToggleGroup(group)}
                        aria-expanded={isOpen}
                        className="flex min-h-[44px] w-full items-center gap-3 py-3 text-left active:brightness-95"
                      >
                        <GroupSummaryBody group={group} />
                        <Icon
                          name={isOpen ? 'expand_less' : 'expand_more'}
                          className="shrink-0 text-card-emphasis text-it-ink-500 dark:text-rink-300"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <div className="flex items-center py-3">
                        <GroupSummaryBody group={group} />
                      </div>
                    )}
                    {canViewDetails && isOpen && (
                      <div className="pb-3 pl-2">
                        {detail?.lines.map((line, i) => (
                          <DetailLineRow
                            key={line.id}
                            line={line}
                            isLast={i === detail.lines.length - 1}
                          />
                        ))}
                        {detail?.errored && (
                          <div className="flex flex-col items-center gap-2 py-3 text-center">
                            <p className="text-card-meta text-it-ink-400 dark:text-rink-300">
                              {MESSAGES.settlements.detailsLoadError}
                            </p>
                            <button
                              type="button"
                              onClick={() => void loadGroupDetails(group, detail.requestedPage)}
                              className="inline-flex h-11 items-center justify-center rounded-w-md bg-it-blue-500 px-4 text-card-meta font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 motion-reduce:transition-none"
                            >
                              {MESSAGES.settlements.retry}
                            </button>
                          </div>
                        )}
                        {detail && !detail.errored && detail.hasMore && (
                          <button
                            type="button"
                            onClick={() => void loadGroupDetails(group, detail.page + 1)}
                            disabled={detail.isLoading}
                            className="mt-2 min-h-[44px] w-full rounded-w-md border border-dashed border-it-line-strong dark:border-rink-700 text-card-body font-semibold text-it-ink-500 dark:text-rink-300 hover:bg-it-fill dark:hover:bg-rink-800 active:brightness-95 transition-colors motion-reduce:transition-none disabled:opacity-50"
                          >
                            {MESSAGES.settlements.detailsLoadMore}
                          </button>
                        )}
                        {detail && !detail.isLoading && !detail.errored && detail.lines.length === 0 && (
                          <p className="py-4 text-center text-card-meta text-it-ink-400 dark:text-rink-300">
                            {MESSAGES.settlements.detailsEmpty}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {groupTotals && (
                <div className="pt-3">
                  <p className="text-card-meta tabular-nums text-it-ink-500 dark:text-rink-300">
                    {MESSAGES.settlements.groupsTotalLabel}{' '}
                    {MESSAGES.settlements.groupPaymentSummary(
                      groupTotals.paymentCount,
                      formatCurrency(groupTotals.paymentAmount),
                    )}
                    {groupTotals.refundCount > 0 &&
                      ` / ${MESSAGES.settlements.groupRefundSummary(
                        groupTotals.refundCount,
                        formatCurrency(groupTotals.refundAmount),
                      )}`}
                  </p>
                  <p className="mt-1 text-card-body font-bold text-it-ink-800 dark:text-white">
                    {MESSAGES.settlements.groupsTotalPayoutLabel}{' '}
                    <span className="tabular-nums text-it-blue-500">
                      {formatCurrency(groupTotals.netAmount)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Bottom safe area */}
        <div className="h-8" />
      </main>
    </MobileContainer>
  );
}
