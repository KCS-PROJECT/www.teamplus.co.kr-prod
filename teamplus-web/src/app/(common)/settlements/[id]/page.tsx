'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/hooks/useNavigation';
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
  pgFeeAmount?: number;
  netAmount: number;
}

// 상세 로드 실패 3분류 — 404/403/기타(네트워크·서버 오류).
type SettlementDetailErrorKind = 'notFound' | 'denied' | 'load' | null;

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

// 받을 금액에서 빠지는 금액(환불·수수료) 표기 — 양수는 "-X원", 음수(수수료 환급)는 "+X원", 0원은 부호 없이.
function formatDeduction(amount: number): string {
  if (amount > 0) return `-${formatCurrency(amount)}`;
  if (amount < 0) return `+${formatCurrency(-amount)}`;
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

type AmountTone = 'default' | 'minus' | 'total' | 'negative';

const AMOUNT_TONE_CLASS: Record<AmountTone, string> = {
  default: 'text-it-ink-800 dark:text-white',
  minus: 'text-it-red-500 dark:text-it-red-300',
  total: 'font-bold text-it-blue-500',
  negative: 'font-bold text-flame-500',
};

// 계산 내역 한 줄 — 왼쪽 항목명, 오른쪽 금액.
function AmountRow({
  label,
  value,
  tone = 'default',
  className = '',
}: {
  label: string;
  value: string;
  tone?: AmountTone;
  className?: string;
}) {
  const isTotal = tone === 'total' || tone === 'negative';
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${className}`}>
      <dt
        className={`text-card-body ${
          isTotal
            ? 'font-bold text-it-ink-800 dark:text-white'
            : 'text-it-ink-500 dark:text-rink-300'
        }`}
      >
        {label}
      </dt>
      <dd className={`text-card-body tabular-nums ${AMOUNT_TONE_CLASS[tone]}`}>{value}</dd>
    </div>
  );
}

// 훈련·대회 한 줄 아래에 적는 금액 계산 — 있는 항목만. 뺄 것이 없으면 결제 금액이 지급액과 같아 건수만 적는다.
function groupSummaryParts(group: SettlementGroup): string[] {
  const pgFeeAmount = group.pgFeeAmount ?? 0;
  const paymentLabel = MESSAGES.settlements.groupPaymentRowLabel(group.paymentCount);
  const hasDeduction = group.refundCount > 0 || group.feeAmount !== 0 || pgFeeAmount !== 0;
  if (!hasDeduction) return [paymentLabel];
  const parts: string[] = [];
  if (group.paymentCount > 0) {
    parts.push(`${paymentLabel} ${formatCurrency(group.paymentAmount)}`);
  }
  if (group.refundCount > 0) {
    parts.push(
      `${MESSAGES.settlements.groupRefundRowLabel(group.refundCount)} ${formatDeduction(group.refundAmount)}`,
    );
  }
  if (group.feeAmount !== 0) {
    parts.push(`${MESSAGES.settlements.platformFeeLabel} ${formatDeduction(group.feeAmount)}`);
  }
  if (pgFeeAmount !== 0) {
    parts.push(`${MESSAGES.settlements.pgFeeLabel} ${formatDeduction(pgFeeAmount)}`);
  }
  return parts;
}

function GroupRow({ group }: { group: SettlementGroup }) {
  const parts = groupSummaryParts(group);
  return (
    <div className="border-b border-it-line py-3 last:border-b-0 dark:border-rink-700">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center rounded-w-pill bg-it-fill px-1.5 py-0.5 text-[11px] font-bold text-it-ink-600 dark:bg-rink-700 dark:text-rink-100">
            {groupSourceLabel(group.sourceType)}
          </span>
          <p className="truncate text-card-body font-bold text-it-ink-800 dark:text-white">
            {group.name}
          </p>
        </div>
        <span
          className={`shrink-0 text-card-body font-bold tabular-nums ${
            group.netAmount < 0 ? 'text-flame-500' : 'text-it-ink-800 dark:text-white'
          }`}
        >
          {formatCurrency(group.netAmount)}
        </span>
      </div>
      {/* 항목 단위로만 줄이 넘어가게 한다 — "결제 수수료 / -6,600원" 처럼 중간에서 끊기지 않도록. */}
      <p className="mt-1 flex flex-wrap gap-x-1 text-card-meta tabular-nums text-it-ink-500 dark:text-rink-300">
        {parts.map((part, i) => (
          <span key={part} className="whitespace-nowrap">
            {i > 0 ? `· ${part}` : part}
          </span>
        ))}
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
  const { navigate, back } = useNavigation();

  // 알림 딥링크 등으로 히스토리가 없을 때 뒤로가기가 앱 밖으로 나가지 않도록 목록으로 보낸다.
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) back();
    else void navigate('/settlements');
  }, [back, navigate]);

  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<SettlementDetailErrorKind>(null);

  const [groups, setGroups] = useState<SettlementGroup[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryErrored, setSummaryErrored] = useState(false);

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
        <PageAppBar title={MESSAGES.settlements.detailTitle} onBack={handleBack} />
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
  const periodText =
    year && month
      ? MESSAGES.settlements.yearMonthLabel(year, String(Number(month)))
      : settlement.settlementMonth;
  const statusCfg = SETTLEMENT_STATUS[settlement.status];
  const platformFee = settlement.platformFee;
  const paymentFee = settlement.paymentFee;

  const payouts = settlement.transactions.filter((t) => t.transactionType === 'payout');
  const rejectReason = settlement.transactions.find((t) => t.transactionType === 'reject');

  const hasBankInfo = settlement.bankName || settlement.bankAccount || settlement.accountHolder;
  const isNetNegative = settlement.netAmount < 0;
  const isPaid = settlement.status === 'paid';
  const amountLabel = isPaid
    ? MESSAGES.settlements.paidAmountLabel
    : MESSAGES.settlements.receivableLabel;
  // transactions 는 서버가 지급일 내림차순으로 준다 — 첫 payout 이 가장 최근 지급이다.
  const lastPayout = isPaid ? payouts[0] : undefined;
  const paidDate = lastPayout ? formatDateOnly(lastPayout.transactionDate) : '';
  // 운영자가 메모 없이 지급하면 서버가 기본 문구를 채운다 — 직접 적은 메모만 보여준다.
  const payoutNote =
    lastPayout?.description && lastPayout.description !== MESSAGES.settlements.payoutDefaultNote
      ? lastPayout.description
      : null;

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={MESSAGES.settlements.detailTitle} onBack={handleBack} />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {/* 받을 금액 — 상태·지급일·계좌를 한 덩어리로 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 p-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-card-title font-bold text-it-ink-800 dark:text-white">
                {periodText}
              </p>
              <p className="mt-0.5 truncate text-card-meta text-it-ink-500 dark:text-rink-300">
                {settlement.teamName}
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-w-pill text-card-meta font-bold ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
          </div>

          <div>
            <p className="text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
              {amountLabel}
            </p>
            <p
              className={`mt-1 text-w-h2 font-bold tabular-nums ${
                isNetNegative ? 'text-flame-500' : 'text-it-blue-500'
              }`}
            >
              {formatCurrency(settlement.netAmount)}
            </p>
            {paidDate && (
              <p className="mt-1 text-card-meta text-it-ink-500 dark:text-rink-300">
                {MESSAGES.settlements.paidDateLabel(paidDate)}
              </p>
            )}
            {payoutNote && (
              <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-rink-300">
                {MESSAGES.settlements.memoLabel}: {payoutNote}
              </p>
            )}
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

          {/* 지급 계좌 — 값이 있을 때만 표시(코치는 계좌번호 null) */}
          {hasBankInfo && (
            <div className="rounded-w-md bg-it-fill px-4 py-3 dark:bg-puck/40">
              <p className="text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
                {MESSAGES.settlements.bankInfoTitle}
              </p>
              {settlement.bankName && (
                <p className="mt-0.5 text-card-body text-it-ink-800 dark:text-white">
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
          )}
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 계산 내역 — 매출에서 무엇이 빠져 받을 금액이 됐는지 */}
        <section className="bg-it-surface dark:bg-it-blue-950 p-4">
          <h2 className="text-it-ink-800 dark:text-white text-card-title font-bold tracking-tight mb-1">
            {MESSAGES.settlements.breakdownTitle}
          </h2>
          <dl className="flex flex-col">
            <AmountRow
              label={MESSAGES.settlements.totalRevenueLabel}
              value={formatCurrency(settlement.totalRevenue)}
            />
            <AmountRow
              label={MESSAGES.settlements.refundLabel}
              value={formatDeduction(settlement.refundAmount)}
              tone={settlement.refundAmount !== 0 ? 'minus' : 'default'}
            />
            {platformFee !== 0 && (
              <AmountRow
                label={MESSAGES.settlements.platformFeeLabel}
                value={formatDeduction(platformFee)}
                tone="minus"
              />
            )}
            <AmountRow
              label={MESSAGES.settlements.pgFeeLabel}
              value={formatDeduction(paymentFee)}
              tone={paymentFee !== 0 ? 'minus' : 'default'}
            />
            <AmountRow
              label={amountLabel}
              value={formatCurrency(settlement.netAmount)}
              tone={isNetNegative ? 'negative' : 'total'}
              className="mt-1.5 border-t border-it-line pt-3 dark:border-rink-700"
            />
          </dl>
          <p className="mt-3 text-card-meta text-it-ink-400 dark:text-rink-300">
            {MESSAGES.settlements.basisNotice}
          </p>
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
              {groups.map((group) => (
                <GroupRow key={groupKey(group)} group={group} />
              ))}
            </div>
          )}
        </section>

        {/* Bottom safe area */}
        <div className="h-8" />
      </main>
    </MobileContainer>
  );
}
