'use client';

/**
 * MonthlySettlementTab - 팀별 월 정산 마감 + 목록 + 지급 CSV
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 월 선택 → 마감 → 팀별 결과 목록 → 상세(승인/거절/지급) 흐름
 * 2. 휴먼 디자인: 마감 결과를 숫자 나열이 아닌 항목별 카드로 구성
 * 3. AI 스타일 금지: gradient, blur 미사용, 솔리드 컬러만
 * 4. Tone & Manner: MESSAGES 상수, 한글 버튼 라벨
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  XCircle,
} from 'lucide-react';
import { api } from '@/services/api-client';
import { SettlementDetailDialog, type SettlementStatus } from './SettlementDetailDialog';

// ════════════════════════════════════════════════
// 타입
// ════════════════════════════════════════════════

interface SettlementListItem {
  id: string;
  teamId: string;
  settlementMonth: string;
  totalRevenue: number;
  platformFee: number;
  paymentFee: number;
  refundAmount: number;
  netAmount: number;
  status: SettlementStatus;
  team: { id: string; name: string };
  _count: { details: number };
}

interface SettlementListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SettlementCloseSkip {
  teamId: string;
  teamName: string;
  reason: 'LOCKED_STATUS' | 'FAILED';
  status?: string;
}

interface SettlementCloseConflict {
  eventKey: string;
  existingSettlementId: string;
}

interface SettlementUnmatchedRefund {
  refundLogId: string;
  orderNumber: string;
  amount: number;
}

interface SettlementRefundWithoutLog {
  paymentId: string;
  orderNumber: string;
  amount: number;
}

interface SettlementLateArrival {
  paymentId: string;
  orderNumber: string;
  teamId: string;
  month: string;
}

interface SettlementNegativeNetTeam {
  teamId: string;
  teamName: string;
  netAmount: number;
}

interface SettlementCloseResult {
  month: string;
  commissionRate: number;
  created: number;
  updated: number;
  deleted: number;
  // 아래 배열·객체 필드는 백엔드/어드민 버전이 어긋나도 화면이 죽지 않도록
  // 옵셔널로 두고 읽는 쪽에서 반드시 기본값을 채운다(구버전 응답 방어).
  skipped?: SettlementCloseSkip[];
  totals: {
    teamCount: number;
    paymentCount: number;
    refundCount: number;
    totalRevenue: number;
    refundAmount: number;
    platformFee: number;
    paymentFee: number;
    netAmount: number;
  };
  excluded?: { mockAmount: number };
  teamUnattributed?: { count: number; amount: number };
  unmatchedRefunds?: SettlementUnmatchedRefund[];
  refundsWithoutLog?: SettlementRefundWithoutLog[];
  lateArrivals?: SettlementLateArrival[];
  /** 잠긴 달(이미 마감된 월)에 뒤늦게 확정된 환불 */
  lateRefunds?: SettlementUnmatchedRefund[];
  conflicts?: SettlementCloseConflict[];
  negativeNetTeams?: SettlementNegativeNetTeam[];
  warnings?: { previousMonthNotClosed: boolean };
}

interface SettlementSummaryBucket {
  count: number;
  netAmount: number;
}

interface SettlementSummaryResponse {
  pending: SettlementSummaryBucket;
  approved: SettlementSummaryBucket;
  paid: SettlementSummaryBucket;
  rejected: { count: number };
}

const STATUS_META: Record<
  SettlementStatus,
  { label: string; badge: string; icon: typeof Clock }
> = {
  pending: {
    label: MESSAGES.settlement.statusPending,
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: Clock,
  },
  approved: {
    label: MESSAGES.settlement.statusApproved,
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: CheckCircle,
  },
  processing: {
    label: MESSAGES.settlement.statusProcessing,
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Clock,
  },
  paid: {
    label: MESSAGES.settlement.statusPaid,
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle,
  },
  rejected: {
    label: MESSAGES.settlement.statusRejected,
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: XCircle,
  },
  failed: {
    label: MESSAGES.settlement.statusFailed,
    badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    icon: AlertTriangle,
  },
};

const SKIP_REASON_LABEL: Record<SettlementCloseSkip['reason'], string> = {
  LOCKED_STATUS: MESSAGES.settlement.skipReasonLocked,
  FAILED: MESSAGES.settlement.skipReasonFailed,
};

const PAGE_SIZE = 20;

function getDefaultMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 서버가 내려준 부호를 그대로 쓰는 공용 금액 포맷. -0 은 0원으로 정규화한다. */
function formatAmount(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return `${normalized.toLocaleString()}원`;
}

/** 'YYYY-MM' 문자열 산술로 한 달 전을 계산한다 (Date 객체·타임존 변환 금지). */
function getPreviousMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (m <= 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data as
    | { message?: string | string[] }
    | undefined;
  const raw = data?.message;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return fallback;
}

export function MonthlySettlementTab() {
  const [month, setMonth] = useState(getDefaultMonth());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [rows, setRows] = useState<SettlementListItem[]>([]);
  const [meta, setMeta] = useState<SettlementListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [monthSummary, setMonthSummary] = useState<SettlementSummaryResponse | null>(null);
  const [monthSummaryFailed, setMonthSummaryFailed] = useState(false);

  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<SettlementCloseResult | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCsvDownloading, setIsCsvDownloading] = useState(false);

  // 목록 조회 요청 순번 — 필터를 빠르게 바꿀 때 먼저 보낸 요청이 나중에 도착해
  // 최신 화면을 덮어쓰는 경쟁을 막는다. 응답 시점에 최신 순번이 아니면 버린다.
  const requestSeqRef = useRef(0);

  const loadSettlements = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string | number> = { month, page, pageSize: PAGE_SIZE };
      if (statusFilter !== 'all') params.status = statusFilter;
      let summaryFailed = false;
      const [listRes, summaryRes] = await Promise.all([
        api.get<{ data: SettlementListItem[]; meta: SettlementListMeta }>('/settlements', { params }),
        api
          .get<SettlementSummaryResponse>('/settlements/summary', { params: { month } })
          .catch(() => {
            summaryFailed = true;
            return null;
          }),
      ]);
      if (seq !== requestSeqRef.current) return; // 늦게 도착한 응답 — 무시
      setRows(listRes.data ?? []);
      setMeta(listRes.meta ?? null);
      setMonthSummary(summaryRes);
      setMonthSummaryFailed(summaryFailed);
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      setRows([]);
      setMeta(null);
      setLoadError(extractErrorMessage(error, MESSAGES.settlement.listLoadError));
    } finally {
      if (seq === requestSeqRef.current) setIsLoading(false);
    }
  }, [month, page, statusFilter]);

  useEffect(() => {
    void loadSettlements();
  }, [loadSettlements]);

  // 월/상태 필터는 값 변경 핸들러(handleMonthChange/handleStatusFilterChange)에서
  // page 를 같은 렌더로 1 리셋한다 — 별도 effect 로 나누면 필터 변경 시
  // (이전 page 로 1회) + (page=1 로 1회) 총 2회 조회가 나가 응답 순서가 뒤섞일 수 있다.

  useEffect(() => {
    if (!actionMsg) return;
    const timer = setTimeout(() => setActionMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [actionMsg]);

  const handleCloseConfirmed = async () => {
    setIsClosing(true);
    try {
      const result = await api.post<SettlementCloseResult>('/settlements/close', { month });
      setCloseResult(result);
      setIsCloseConfirmOpen(false);
      setActionMsg({ type: 'success', text: MESSAGES.settlementDynamic.closeSuccessSummary(month) });
      void loadSettlements();
    } catch (error) {
      setIsCloseConfirmOpen(false);
      setActionMsg({ type: 'error', text: extractErrorMessage(error, MESSAGES.settlement.closeError) });
    } finally {
      setIsClosing(false);
    }
  };

  const handleDownloadCsv = async () => {
    setIsCsvDownloading(true);
    try {
      await api.downloadFile(
        `/settlements/payout-export?month=${encodeURIComponent(month)}`,
        MESSAGES.settlementDynamic.csvFileName(month),
      );
    } catch (error) {
      setActionMsg({ type: 'error', text: extractErrorMessage(error, MESSAGES.settlement.csvDownloadError) });
    } finally {
      setIsCsvDownloading(false);
    }
  };

  const handleViewDetail = (id: string) => {
    setSelectedId(id);
    setIsDetailOpen(true);
  };

  // 필터 변경 시 같은 렌더에서 page 를 1로 리셋 — 별도 effect 의 2회 조회 경쟁을 방지한다.
  const handleMonthChange = (nextMonth: string) => {
    setMonth(nextMonth);
    setPage(1);
    // 마감 결과는 방금 실행한 월의 보고서라 다른 월 목록 위에 남기지 않는다.
    setCloseResult(null);
  };

  const handleStatusFilterChange = (nextStatus: string) => {
    setStatusFilter(nextStatus);
    setPage(1);
  };

  const approvedCount = monthSummary?.approved.count ?? 0;
  const summaryBuckets = monthSummary
    ? [
        { key: 'pending', label: MESSAGES.settlement.monthSummaryPendingLabel, count: monthSummary.pending.count, net: monthSummary.pending.netAmount },
        { key: 'approved', label: MESSAGES.settlement.monthSummaryApprovedLabel, count: monthSummary.approved.count, net: monthSummary.approved.netAmount },
        { key: 'paid', label: MESSAGES.settlement.monthSummaryPaidLabel, count: monthSummary.paid.count, net: monthSummary.paid.netAmount },
        { key: 'rejected', label: MESSAGES.settlement.monthSummaryRejectedLabel, count: monthSummary.rejected.count, net: null },
      ]
    : [];
  const summaryTeamCount = summaryBuckets.reduce((sum, b) => sum + b.count, 0);
  const summaryTotalNet = summaryBuckets.reduce((sum, b) => sum + (b.net ?? 0), 0);

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div
          className={`p-3 rounded-lg text-sm ${
            actionMsg.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* 월 선택 + 마감 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="h-11 w-40"
            aria-label="정산 월 선택"
          />
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="h-11 w-32">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="pending">{MESSAGES.settlement.statusPending}</SelectItem>
              <SelectItem value="approved">{MESSAGES.settlement.statusApproved}</SelectItem>
              <SelectItem value="processing">{MESSAGES.settlement.statusProcessing}</SelectItem>
              <SelectItem value="paid">{MESSAGES.settlement.statusPaid}</SelectItem>
              <SelectItem value="rejected">{MESSAGES.settlement.statusRejected}</SelectItem>
              <SelectItem value="failed">{MESSAGES.settlement.statusFailed}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadCsv}
            disabled={isCsvDownloading || approvedCount === 0}
            className="h-11"
            title={approvedCount === 0 ? MESSAGES.settlement.csvDownloadEmpty : undefined}
          >
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            {MESSAGES.settlement.csvDownload}
          </Button>
          <Button
            type="button"
            onClick={() => setIsCloseConfirmOpen(true)}
            disabled={isClosing}
            className="h-11"
          >
            {isClosing ? MESSAGES.settlement.closeInProgress : MESSAGES.settlement.closeButton}
          </Button>
        </div>
      </div>

      {/* 월 정산 현황 — 마감 여부와 무관하게 선택한 월의 저장된 정산 상태를 항상 표시 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
        <h3 className="font-bold text-slate-900 dark:text-white">
          {MESSAGES.settlementDynamic.monthSummaryTitle(month)}
        </h3>
        {monthSummaryFailed ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2">
            <p className="text-sm text-red-700 dark:text-red-400">{MESSAGES.settlement.monthSummaryLoadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadSettlements()}>
              {MESSAGES.settlement.retry}
            </Button>
          </div>
        ) : !monthSummary && isLoading ? null : summaryTeamCount === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{MESSAGES.settlement.monthSummaryNotClosed}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.monthSummaryTeamCount}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{summaryTeamCount}건</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.monthSummaryTotalNet}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{formatAmount(summaryTotalNet)}</p>
            </div>
            {summaryBuckets.map((b) => (
              <div key={b.key} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
                <p className="text-slate-500 dark:text-slate-400">{b.label}</p>
                <p className="font-bold text-slate-900 dark:text-white tabular-nums">{b.count}건</p>
                {b.net !== null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{formatAmount(b.net)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 마감 결과 — 방금 실행한 마감의 보고서(월 변경 시 초기화) */}
      {closeResult && (() => {
        // 구버전 백엔드 응답 방어 — 배열·옵셔널 객체 필드에 기본값을 채운다.
        const skipped = closeResult.skipped ?? [];
        const excludedMockAmount = closeResult.excluded?.mockAmount ?? 0;
        const teamUnattributedCount = closeResult.teamUnattributed?.count ?? 0;
        const teamUnattributedAmount = closeResult.teamUnattributed?.amount ?? 0;
        const conflicts = closeResult.conflicts ?? [];
        const refundsWithoutLog = closeResult.refundsWithoutLog ?? [];
        const unmatchedRefunds = closeResult.unmatchedRefunds ?? [];
        const lateArrivals = closeResult.lateArrivals ?? [];
        const lateRefunds = closeResult.lateRefunds ?? [];
        const negativeNetTeams = closeResult.negativeNetTeams ?? [];
        const previousMonthNotClosed = closeResult.warnings?.previousMonthNotClosed ?? false;

        return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">
              {MESSAGES.settlement.closeResultTitle} · {closeResult.month} ({MESSAGES.settlement.closeResultJustRun})
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCloseResult(null)}>
              {MESSAGES.settlement.close}
            </Button>
          </div>

          {/* 전월 미마감 경고 — 있을 때만 최상단에 표시 */}
          {previousMonthNotClosed && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {MESSAGES.settlementDynamic.previousMonthNotClosedWarning(getPreviousMonthLabel(closeResult.month))}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeGenerated}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{closeResult.created}건</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeUpdated}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{closeResult.updated}건</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeDeleted}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{closeResult.deleted}건</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeSkipped}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{skipped.length}건</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closePaymentCount}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{closeResult.totals.paymentCount}건</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeRefundCount}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{closeResult.totals.refundCount}건</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeTotalRevenue}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{formatAmount(closeResult.totals.totalRevenue)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeRefundAmountLabel}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{formatAmount(closeResult.totals.refundAmount)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.closeNetAmountLabel}</p>
              <p className="font-bold text-primary tabular-nums">{formatAmount(closeResult.totals.netAmount)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {excludedMockAmount > 0 && (
              <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-slate-600 dark:text-slate-300">
                {MESSAGES.settlement.closeExcludedMock} <strong className="tabular-nums">{formatAmount(excludedMockAmount)}</strong>
              </span>
            )}
            {teamUnattributedCount > 0 && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                {MESSAGES.settlement.closeTeamUnattributed} <strong className="tabular-nums">{teamUnattributedCount}</strong>건 ·{' '}
                <strong className="tabular-nums">{formatAmount(teamUnattributedAmount)}</strong>
              </span>
            )}
            {conflicts.length > 0 && (
              <span className="rounded-md bg-red-50 dark:bg-red-900/20 px-2.5 py-1 text-red-600 dark:text-red-400">
                {MESSAGES.settlement.closeConflicts} <strong className="tabular-nums">{conflicts.length}</strong>건
              </span>
            )}
            {refundsWithoutLog.length > 0 && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                {MESSAGES.settlement.closeRefundsWithoutLog} <strong className="tabular-nums">{refundsWithoutLog.length}</strong>건
              </span>
            )}
            {unmatchedRefunds.length > 0 && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                {MESSAGES.settlement.closeUnmatchedRefunds} <strong className="tabular-nums">{unmatchedRefunds.length}</strong>건
              </span>
            )}
            {lateArrivals.length > 0 && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                {MESSAGES.settlement.closeLateArrivals} <strong className="tabular-nums">{lateArrivals.length}</strong>건
              </span>
            )}
            {lateRefunds.length > 0 && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                {MESSAGES.settlement.closeLateRefunds} <strong className="tabular-nums">{lateRefunds.length}</strong>건
              </span>
            )}
            {negativeNetTeams.length > 0 && (
              <span className="rounded-md bg-red-50 dark:bg-red-900/20 px-2.5 py-1 text-red-600 dark:text-red-400">
                {MESSAGES.settlement.closeNegativeNetTeams} <strong className="tabular-nums">{negativeNetTeams.length}</strong>팀
              </span>
            )}
          </div>

          {skipped.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              {skipped.map((s) => (
                <p key={s.teamId}>
                  {s.teamName} — {SKIP_REASON_LABEL[s.reason]}
                </p>
              ))}
            </div>
          )}

          {lateArrivals.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
              <p className="text-xs text-amber-700 dark:text-amber-400">{MESSAGES.settlement.lateArrivalNote}</p>
              {lateArrivals.map((la) => (
                <p key={la.paymentId} className="text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                  {la.orderNumber} ({la.month})
                </p>
              ))}
            </div>
          )}

          {lateRefunds.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
              <p className="text-xs text-amber-700 dark:text-amber-400">{MESSAGES.settlement.lateRefundNote}</p>
              {lateRefunds.map((lr) => (
                <p key={lr.refundLogId} className="text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                  {lr.orderNumber} — {formatAmount(lr.amount)}
                </p>
              ))}
            </div>
          )}

          {negativeNetTeams.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 space-y-1">
              <p className="text-xs text-red-700 dark:text-red-400">{MESSAGES.settlement.closeNegativeNetNote}</p>
              {negativeNetTeams.map((t) => (
                <p key={t.teamId} className="text-xs text-red-700 dark:text-red-400 tabular-nums">
                  {t.teamName} — {formatAmount(t.netAmount)}
                </p>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-900/20"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
          </div>
          <Button type="button" variant="outline" onClick={loadSettlements} className="h-10 shrink-0">
            {MESSAGES.settlement.retry}
          </Button>
        </div>
      )}

      {/* 팀별 정산 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>팀</TableHead>
              <TableHead className="text-right">총매출</TableHead>
              <TableHead className="text-right">환불</TableHead>
              <TableHead className="text-right">수수료</TableHead>
              <TableHead className="text-right">순지급액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">명세</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                  해당 월 정산 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const statusInfo = STATUS_META[row.status] ?? STATUS_META.pending;
                const StatusIcon = statusInfo.icon;
                const fee = (row.platformFee ?? 0) + (row.paymentFee ?? 0);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {row.team?.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                      {formatAmount(row.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {formatAmount(row.refundAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                      {formatAmount(fee)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-bold ${
                        row.netAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-primary'
                      }`}
                    >
                      {formatAmount(row.netAmount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={statusInfo.badge}>
                          <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
                          {statusInfo.label}
                        </Badge>
                        {row.netAmount < 0 && (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                            {MESSAGES.settlement.negativeNetBadge}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {row._count?.details ?? 0}건
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost-primary"
                        size="sm"
                        onClick={() => handleViewDetail(row.id)}
                        aria-label={`${row.team?.name} 정산 상세 보기`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
            {page} / {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* 마감 확인 다이얼로그 */}
      <Dialog open={isCloseConfirmOpen} onOpenChange={setIsCloseConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{MESSAGES.settlementDynamic.closeConfirmTitle(month)}</DialogTitle>
            <DialogDescription>{MESSAGES.settlementDynamic.closeConfirmBody(month)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCloseConfirmOpen(false)} disabled={isClosing}>
              {MESSAGES.settlement.cancel}
            </Button>
            <Button type="button" onClick={handleCloseConfirmed} disabled={isClosing}>
              {isClosing ? MESSAGES.settlement.closeInProgress : MESSAGES.settlement.closeButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettlementDetailDialog
        open={isDetailOpen}
        settlementId={selectedId}
        onOpenChange={setIsDetailOpen}
        onActionSuccess={(message) => {
          setActionMsg({ type: 'success', text: message });
          void loadSettlements();
        }}
        onActionError={(message) => setActionMsg({ type: 'error', text: message })}
      />
    </div>
  );
}

export default MonthlySettlementTab;
