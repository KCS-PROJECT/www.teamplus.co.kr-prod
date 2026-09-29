'use client';

/**
 * SettlementDetailDialog - 팀 월 정산 상세 + 승인/거절/지급 액션
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: MonthlySettlementTab 에서 행 클릭 시 여는 상세 다이얼로그
 * 2. 휴먼 디자인: 요약 → 명세 표 → 액션 순서의 자연스러운 정보 위계
 * 3. AI 스타일 금지: gradient, blur 미사용, 솔리드 컬러만
 * 4. Tone & Manner: MESSAGES 상수, 한글 버튼 라벨
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MESSAGES } from '@/lib/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  Download,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '@/services/api-client';

export type SettlementStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'rejected';

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

interface SettlementTransaction {
  id: string;
  paymentId: string | null;
  transactionType: string;
  amount: number;
  description: string | null;
  transactionDate: string;
  createdAt: string;
}

interface SettlementDetail {
  id: string;
  teamId: string;
  settlementMonth: string;
  totalRevenue: number;
  platformFee: number;
  paymentFee: number;
  refundAmount: number;
  netAmount: number;
  status: SettlementStatus;
  bankName?: string | null;
  bankAccount?: string | null;
  accountHolder?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string };
  transactions: SettlementTransaction[];
}

type SettlementEntryType = 'PAYMENT' | 'REFUND';

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
  entryType: SettlementEntryType;
  attributionMonth: string | null;
}

interface SettlementDetailsMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type SettlementSourceType = 'CLASS' | 'TOURNAMENT' | 'OTHER';

interface SettlementSummaryGroup {
  sourceType: SettlementSourceType;
  sourceId: string | null;
  name: string;
  paymentCount: number;
  paymentAmount: number;
  refundCount: number;
  refundAmount: number;
  feeAmount: number;
  netAmount: number;
}

interface SettlementSummaryTotals {
  paymentCount: number;
  paymentAmount: number;
  refundCount: number;
  refundAmount: number;
  feeAmount: number;
  netAmount: number;
}

type DetailTab = 'summary' | 'lines';
type EntryFilter = 'ALL' | SettlementEntryType;

interface SourceFilter {
  sourceType: SettlementSourceType;
  sourceId: string | null;
  name: string;
}

interface LinesQuery {
  page: number;
  entryType: EntryFilter;
  q: string;
  source: SourceFilter | null;
}

const DETAIL_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const INITIAL_LINES_QUERY: LinesQuery = { page: 1, entryType: 'ALL', q: '', source: null };

const SOURCE_META: Record<SettlementSourceType, { label: string; badge: string }> = {
  CLASS: {
    label: MESSAGES.settlement.sourceClass,
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  TOURNAMENT: {
    label: MESSAGES.settlement.sourceTournament,
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  OTHER: {
    label: MESSAGES.settlement.sourceOther,
    badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  },
};

const ENTRY_FILTER_OPTIONS: { value: EntryFilter; label: string }[] = [
  { value: 'ALL', label: MESSAGES.settlement.filterAll },
  { value: 'PAYMENT', label: MESSAGES.settlement.entryTypePayment },
  { value: 'REFUND', label: MESSAGES.settlement.entryTypeRefund },
];

/** 목록 조회와 CSV 내보내기가 같은 필터를 쓰도록 페이지 정보를 뺀 조건만 만든다. */
function buildLineFilterParams(query: LinesQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.entryType !== 'ALL') params.entryType = query.entryType;
  if (query.q) params.q = query.q;
  if (query.source) {
    params.sourceType = query.source.sourceType;
    // 원천 id 가 없는 묶음은 상품명 일치로 좁힌다. 유형은 저장된 값을 그대로 보낸다.
    if (query.source.sourceId) {
      params.sourceId = query.source.sourceId;
    } else {
      params.productName = query.source.name;
    }
  }
  return params;
}

/** 서버가 내려준 부호를 그대로 쓰는 공용 금액 포맷. -0 은 0원으로 정규화한다. */
function formatAmount(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return MESSAGES.settlementDynamic.amountWon(normalized.toLocaleString());
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

function linesKeyOf(settlementId: string, query: LinesQuery): string {
  return `${settlementId}|${JSON.stringify(query)}`;
}

/** 파일 내려받기는 blob 응답이라 오류 본문도 Blob 으로 온다. 서버 메시지를 꺼내 쓴다. */
async function extractBlobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string | string[] };
      const raw = parsed?.message;
      if (Array.isArray(raw) && raw.length > 0) return raw.join(', ');
      if (typeof raw === 'string' && raw.length > 0) return raw;
    } catch {
      return fallback;
    }
    return fallback;
  }
  return extractErrorMessage(error, fallback);
}

interface SettlementDetailDialogProps {
  open: boolean;
  settlementId: string | null;
  onOpenChange: (open: boolean) => void;
  /** 승인/거절/지급 성공 시 부모 목록 새로고침 */
  onActionSuccess: (message: string) => void;
  onActionError: (message: string) => void;
}

export function SettlementDetailDialog({
  open,
  settlementId,
  onOpenChange,
  onActionSuccess,
  onActionError,
}: SettlementDetailDialogProps) {
  const [detail, setDetail] = useState<SettlementDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [lines, setLines] = useState<SettlementDetailLine[]>([]);
  const [linesMeta, setLinesMeta] = useState<SettlementDetailsMeta | null>(null);
  const [linesQuery, setLinesQuery] = useState<LinesQuery>(INITIAL_LINES_QUERY);
  const [searchInput, setSearchInput] = useState('');
  const [isLinesLoading, setIsLinesLoading] = useState(false);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [isCsvDownloading, setIsCsvDownloading] = useState(false);

  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const [summaryGroups, setSummaryGroups] = useState<SettlementSummaryGroup[]>([]);
  const [summaryTotals, setSummaryTotals] = useState<SettlementSummaryTotals | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // 늦게 도착한 이전 응답이 최신 화면을 덮지 않도록 요청마다 번호를 매긴다.
  const linesSeq = useRef(0);
  const loadedLinesKey = useRef<string | null>(null);
  const summarySeq = useRef(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectValidationError, setRejectValidationError] = useState<string | null>(null);
  const [isPayoutConfirmOpen, setIsPayoutConfirmOpen] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setIsDetailLoading(true);
    setDetailError(null);
    try {
      const res = await api.get<SettlementDetail>(`/settlements/${id}`);
      setDetail(res);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setDetailError(
        status === 404
          ? MESSAGES.settlement.detailNotFound
          : extractErrorMessage(error, MESSAGES.settlement.detailLoadError),
      );
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  const loadLines = useCallback(async (id: string, query: LinesQuery) => {
    const seq = ++linesSeq.current;
    setIsLinesLoading(true);
    setLinesError(null);
    try {
      const res = await api.get<{ data: SettlementDetailLine[]; meta: SettlementDetailsMeta }>(
        `/settlements/${id}/details`,
        { params: { page: query.page, pageSize: DETAIL_PAGE_SIZE, ...buildLineFilterParams(query) } },
      );
      if (seq !== linesSeq.current) return;
      // 재시도 버튼처럼 효과를 거치지 않은 조회도 성공하면 기록해, 탭 전환 시 같은 조건을 다시 부르지 않는다.
      loadedLinesKey.current = linesKeyOf(id, query);
      setLines(res.data ?? []);
      setLinesMeta(res.meta ?? null);
    } catch (error) {
      if (seq !== linesSeq.current) return;
      loadedLinesKey.current = null;
      setLines([]);
      setLinesError(extractErrorMessage(error, MESSAGES.settlement.detailsLoadError));
    } finally {
      if (seq === linesSeq.current) setIsLinesLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (id: string) => {
    const seq = ++summarySeq.current;
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await api.get<{
        data: SettlementSummaryGroup[];
        meta: { groupCount: number; totals: SettlementSummaryTotals };
      }>(`/settlements/${id}/details/summary`);
      if (seq !== summarySeq.current) return;
      setSummaryGroups(res.data ?? []);
      setSummaryTotals(res.meta?.totals ?? null);
    } catch (error) {
      if (seq !== summarySeq.current) return;
      setSummaryGroups([]);
      setSummaryTotals(null);
      setSummaryError(extractErrorMessage(error, MESSAGES.settlement.summaryLoadError));
    } finally {
      if (seq === summarySeq.current) setIsSummaryLoading(false);
    }
  }, []);

  // 건별 탭은 처음 열릴 때와 조건이 바뀔 때만 조회한다. 아래 초기화 효과보다 먼저 선언해야
  // 정산 건이 바뀌는 렌더에서 이 효과가 낸 이전 조건 요청을 초기화 효과가 무효 처리할 수 있다.
  useEffect(() => {
    if (!open || !settlementId || activeTab !== 'lines') return;
    const key = linesKeyOf(settlementId, linesQuery);
    if (loadedLinesKey.current === key) return;
    loadedLinesKey.current = key;
    tableScrollRef.current?.scrollTo({ top: 0 });
    void loadLines(settlementId, linesQuery);
  }, [open, settlementId, activeTab, linesQuery, loadLines]);

  useEffect(() => {
    if (!open || !settlementId) return;
    setShowRejectForm(false);
    setRejectReason('');
    setRejectValidationError(null);
    linesSeq.current += 1;
    loadedLinesKey.current = null;
    setActiveTab('summary');
    setLinesQuery(INITIAL_LINES_QUERY);
    setSearchInput('');
    setLines([]);
    setLinesMeta(null);
    setLinesError(null);
    setIsLinesLoading(false);
    void loadDetail(settlementId);
    void loadSummary(settlementId);
  }, [open, settlementId, loadDetail, loadSummary]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setLinesQuery((prev) => (prev.q === next ? prev : { ...prev, q: next, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handlePageChange = (nextPage: number) => {
    setLinesQuery((prev) => ({ ...prev, page: nextPage }));
  };

  const handleEntryFilterChange = (entryType: EntryFilter) => {
    setLinesQuery((prev) => (prev.entryType === entryType ? prev : { ...prev, entryType, page: 1 }));
  };

  const handleSourceSelect = (group: SettlementSummaryGroup) => {
    setSearchInput('');
    setLinesQuery({
      page: 1,
      entryType: 'ALL',
      q: '',
      source: { sourceType: group.sourceType, sourceId: group.sourceId, name: group.name },
    });
    setActiveTab('lines');
  };

  const handleSourceClear = () => {
    setLinesQuery((prev) => ({ ...prev, source: null, page: 1 }));
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: DetailTab = activeTab === 'summary' ? 'lines' : 'summary';
    setActiveTab(next);
    document.getElementById(`settlement-tab-${next}`)?.focus();
  };

  const handleLinesCsvDownload = async () => {
    if (!settlementId || !detail) return;
    setIsCsvDownloading(true);
    try {
      const safeTeamName = (detail.team?.name ?? '').replace(/[\\/:*?"<>|]/g, '_');
      await api.downloadFile(
        `/settlements/${settlementId}/details/export`,
        MESSAGES.settlementDynamic.linesCsvFileName(detail.settlementMonth, safeTeamName),
        { params: buildLineFilterParams(linesQuery) },
      );
    } catch (error) {
      onActionError(await extractBlobErrorMessage(error, MESSAGES.settlement.linesCsvDownloadError));
    } finally {
      setIsCsvDownloading(false);
    }
  };

  const handleApprove = async () => {
    if (!settlementId) return;
    setIsProcessing(true);
    try {
      await api.post(`/settlements/${settlementId}/approve`, {});
      onOpenChange(false);
      onActionSuccess(MESSAGES.settlement.approved);
    } catch (error) {
      onActionError(extractErrorMessage(error, MESSAGES.settlement.approveError));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!settlementId) return;
    if (!rejectReason.trim()) {
      setRejectValidationError(MESSAGES.settlement.rejectReasonRequired);
      return;
    }
    setIsProcessing(true);
    try {
      await api.post(`/settlements/${settlementId}/reject`, { reason: rejectReason.trim() });
      onOpenChange(false);
      onActionSuccess(MESSAGES.settlement.rejected);
    } catch (error) {
      onActionError(extractErrorMessage(error, MESSAGES.settlement.rejectError));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayoutConfirmed = async () => {
    if (!settlementId || !detail) return;
    setIsProcessing(true);
    try {
      await api.post(`/settlements/${settlementId}/payout`, {});
      setIsPayoutConfirmOpen(false);
      onOpenChange(false);
      onActionSuccess(MESSAGES.settlementDynamic.paid(detail.netAmount));
    } catch (error) {
      setIsPayoutConfirmOpen(false);
      onActionError(extractErrorMessage(error, MESSAGES.settlement.payError));
    } finally {
      setIsProcessing(false);
    }
  };

  const statusMeta = detail ? STATUS_META[detail.status] : null;
  const StatusIcon = statusMeta?.icon ?? Clock;
  const rejectReasonFromTx = detail?.transactions?.find(
    (t) => t.transactionType === 'reject',
  )?.description;
  const isNegative = (detail?.netAmount ?? 0) < 0;
  const totalFee = detail ? detail.platformFee + detail.paymentFee : 0;
  // 수수료율이 0 인 동안에는 명세의 수수료 열을 숨긴다 — 요율이 생기면 자동으로 다시 보인다.
  const showFeeColumn = totalFee !== 0 || lines.some((line) => line.feeAmount !== 0);
  const colCount = showFeeColumn ? 5 : 4;
  const showSummaryFeeColumn =
    (summaryTotals?.feeAmount ?? 0) !== 0 || summaryGroups.some((group) => group.feeAmount !== 0);
  const summaryColCount = showSummaryFeeColumn ? 5 : 4;
  const hasLineFilter =
    linesQuery.entryType !== 'ALL' || linesQuery.q !== '' || linesQuery.source !== null;
  const tabClass = (tab: DetailTab) =>
    `px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-primary text-primary dark:border-primary-light dark:text-primary-light'
        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
    }`;
  const chipClass = (selected: boolean) =>
    `px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
      selected
        ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
    }`;
  const summaryItems = detail
    ? [
        { key: 'revenue', label: MESSAGES.settlement.amountTotalRevenue, value: detail.totalRevenue, emphasis: false },
        { key: 'refund', label: MESSAGES.settlement.amountRefund, value: detail.refundAmount, emphasis: false },
        { key: 'fee', label: MESSAGES.settlement.amountFee, value: totalFee, emphasis: false },
        { key: 'net', label: MESSAGES.settlement.amountNet, value: detail.netAmount, emphasis: true },
      ]
    : [];
  const headCellClass = 'px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* 명세가 늘어도 화면 밖으로 넘치지 않도록 높이를 제한한다. 제목·금액 요약·액션은 고정하고 명세 표만 스크롤한다. */}
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {detail ? (
                <>
                  <span>{detail.team?.name}</span>
                  <span className="font-normal text-slate-400 dark:text-slate-500 tabular-nums">
                    · {detail.settlementMonth}
                  </span>
                  {statusMeta && (
                    <Badge className={statusMeta.badge}>
                      <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
                      {statusMeta.label}
                    </Badge>
                  )}
                  {isNegative && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                      {MESSAGES.settlement.negativeNetBadge}
                    </Badge>
                  )}
                </>
              ) : (
                MESSAGES.settlement.detailTitle
              )}
            </DialogTitle>
            <DialogDescription>
              {detail?.status === 'rejected' && rejectReasonFromTx ? (
                <span className="text-red-600 dark:text-red-400">
                  {MESSAGES.settlement.rejectReasonLabel}: {rejectReasonFromTx}
                </span>
              ) : (
                MESSAGES.settlement.detailDescription
              )}
            </DialogDescription>
          </DialogHeader>

          {isDetailLoading ? (
            <LoadingSpinner message={MESSAGES.settlement.detailLoading} />
          ) : detailError ? (
            <div
              className="flex flex-col gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                <p className="text-sm text-red-700 dark:text-red-400">{detailError}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => settlementId && void loadDetail(settlementId)}
                className="h-9 shrink-0"
              >
                {MESSAGES.settlement.retry}
              </Button>
            </div>
          ) : detail ? (
            <>
              {/* 금액 요약 — 한 줄 4칸 + 계좌 한 줄 */}
              <div className="shrink-0 space-y-2">
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  {summaryItems.map((item) => (
                    <div key={item.key} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
                      <dt className="text-xs text-slate-500 dark:text-slate-400">{item.label}</dt>
                      <dd
                        className={`tabular-nums ${
                          item.emphasis
                            ? `font-bold ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-primary'}`
                            : 'font-medium text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatAmount(item.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {isNegative && (
                  <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    {MESSAGES.settlement.payoutDisabledNegative}
                  </p>
                )}
                {detail.bankName && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {MESSAGES.settlement.bankAccountLabel}:{' '}
                    <span className="text-slate-900 dark:text-white tabular-nums">
                      {detail.bankName} {detail.bankAccount}
                    </span>
                    {detail.accountHolder && ` · ${MESSAGES.settlement.accountHolderSeparator} ${detail.accountHolder}`}
                  </p>
                )}
              </div>

              {/* 명세 — 탭·조건 막대는 고정하고 표 영역만 스크롤, 표 머리 고정 */}
              <div className="min-h-0 flex-1 flex flex-col gap-2">
                <div
                  role="tablist"
                  aria-label={MESSAGES.settlement.detailTabsLabel}
                  className="shrink-0 flex border-b border-slate-200 dark:border-slate-700"
                >
                  <button
                    type="button"
                    role="tab"
                    id="settlement-tab-summary"
                    aria-selected={activeTab === 'summary'}
                    aria-controls="settlement-tabpanel"
                    tabIndex={activeTab === 'summary' ? 0 : -1}
                    onClick={() => setActiveTab('summary')}
                    onKeyDown={handleTabKeyDown}
                    className={tabClass('summary')}
                  >
                    {MESSAGES.settlement.tabSummary}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="settlement-tab-lines"
                    aria-selected={activeTab === 'lines'}
                    aria-controls="settlement-tabpanel"
                    tabIndex={activeTab === 'lines' ? 0 : -1}
                    onClick={() => setActiveTab('lines')}
                    onKeyDown={handleTabKeyDown}
                    className={tabClass('lines')}
                  >
                    {MESSAGES.settlement.tabLines}
                  </button>
                </div>

                <div
                  role="tabpanel"
                  id="settlement-tabpanel"
                  aria-labelledby={`settlement-tab-${activeTab}`}
                  className="min-h-0 flex-1 flex flex-col gap-2"
                >
                  {activeTab === 'lines' && (
                    <div className="shrink-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          role="group"
                          aria-label={MESSAGES.settlement.filterEntryTypeLabel}
                          className="flex items-center gap-1.5"
                        >
                          {ENTRY_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={linesQuery.entryType === option.value}
                              onClick={() => handleEntryFilterChange(option.value)}
                              className={chipClass(linesQuery.entryType === option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative min-w-[180px] flex-1">
                          <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                            aria-hidden="true"
                          />
                          <Input
                            type="search"
                            value={searchInput}
                            maxLength={100}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder={MESSAGES.settlement.searchPlaceholder}
                            aria-label={MESSAGES.settlement.searchLabel}
                            className="h-9 pl-8"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleLinesCsvDownload}
                          disabled={isCsvDownloading}
                          className="shrink-0"
                        >
                          <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                          {MESSAGES.settlement.linesCsvDownload}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {MESSAGES.settlement.detailCount(linesMeta?.total ?? lines.length)}
                        </h4>
                        {linesQuery.source && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 py-0.5 pl-2.5 pr-1 text-xs text-slate-700 dark:text-slate-200">
                            {linesQuery.source.name}
                            <button
                              type="button"
                              onClick={handleSourceClear}
                              aria-label={MESSAGES.settlementDynamic.sourceFilterChip(linesQuery.source.name)}
                              className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div
                    ref={tableScrollRef}
                    className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    {activeTab === 'summary' ? (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className={`${headCellClass} text-left`}>{MESSAGES.settlement.colSource}</th>
                            <th className={`${headCellClass} text-right whitespace-nowrap`}>
                              {MESSAGES.settlement.colPayment}
                            </th>
                            <th className={`${headCellClass} text-right whitespace-nowrap`}>
                              {MESSAGES.settlement.colRefund}
                            </th>
                            {showSummaryFeeColumn && (
                              <th className={`${headCellClass} text-right whitespace-nowrap`}>
                                {MESSAGES.settlement.colFee}
                              </th>
                            )}
                            <th className={`${headCellClass} text-right whitespace-nowrap`}>
                              {MESSAGES.settlement.colNet}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {isSummaryLoading ? (
                            <tr>
                              <td colSpan={summaryColCount} className="px-3 py-6 text-center text-sm text-slate-500">
                                {MESSAGES.settlement.summaryLoading}
                              </td>
                            </tr>
                          ) : summaryError ? (
                            <tr>
                              <td colSpan={summaryColCount} className="px-3 py-6">
                                <div className="flex flex-col items-center gap-2 text-center">
                                  <p className="text-sm text-red-600 dark:text-red-400">{summaryError}</p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => settlementId && void loadSummary(settlementId)}
                                  >
                                    {MESSAGES.settlement.retry}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ) : summaryGroups.length === 0 ? (
                            <tr>
                              <td colSpan={summaryColCount} className="px-3 py-6 text-center text-sm text-slate-500">
                                {MESSAGES.settlement.summaryEmpty}
                              </td>
                            </tr>
                          ) : (
                            summaryGroups.map((group) => {
                              const sourceMeta = SOURCE_META[group.sourceType];
                              return (
                                <tr
                                  key={`${group.sourceType}:${group.sourceId ?? group.name}`}
                                  onClick={() => handleSourceSelect(group)}
                                  className="cursor-pointer border-b border-slate-100 dark:border-slate-700/60 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                                >
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      title={MESSAGES.settlement.summaryRowHint}
                                      className="flex w-full items-center gap-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                    >
                                      <Badge className={`${sourceMeta.badge} px-1.5 py-0 text-[11px]`}>
                                        {sourceMeta.label}
                                      </Badge>
                                      <span className="text-slate-900 dark:text-white">{group.name}</span>
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                                    {MESSAGES.settlementDynamic.countAmount(
                                      group.paymentCount,
                                      formatAmount(group.paymentAmount),
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                                    {group.refundCount === 0 && group.refundAmount === 0 ? (
                                      <span className="text-slate-400 dark:text-slate-500">-</span>
                                    ) : (
                                      <span className="text-red-600 dark:text-red-400">
                                        {MESSAGES.settlementDynamic.countAmount(
                                          group.refundCount,
                                          formatAmount(group.refundAmount),
                                        )}
                                      </span>
                                    )}
                                  </td>
                                  {showSummaryFeeColumn && (
                                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                                      {formatAmount(group.feeAmount)}
                                    </td>
                                  )}
                                  <td
                                    className={`px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap ${
                                      group.netAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {formatAmount(group.netAmount)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {summaryTotals && !isSummaryLoading && !summaryError && summaryGroups.length > 0 && (
                          <tfoot className="sticky bottom-0 bg-slate-50 dark:bg-slate-800">
                            <tr className="border-t border-slate-200 dark:border-slate-700 font-semibold">
                              <td className="px-3 py-2 text-slate-900 dark:text-white">
                                {MESSAGES.settlement.totalRowLabel}
                              </td>
                              <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                                {MESSAGES.settlementDynamic.countAmount(
                                  summaryTotals.paymentCount,
                                  formatAmount(summaryTotals.paymentAmount),
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                                {summaryTotals.refundCount === 0 && summaryTotals.refundAmount === 0 ? (
                                  <span className="text-slate-400 dark:text-slate-500">-</span>
                                ) : (
                                  <span className="text-red-600 dark:text-red-400">
                                    {MESSAGES.settlementDynamic.countAmount(
                                      summaryTotals.refundCount,
                                      formatAmount(summaryTotals.refundAmount),
                                    )}
                                  </span>
                                )}
                              </td>
                              {showSummaryFeeColumn && (
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                                  {formatAmount(summaryTotals.feeAmount)}
                                </td>
                              )}
                              <td
                                className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                                  summaryTotals.netAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {formatAmount(summaryTotals.netAmount)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className={`${headCellClass} text-left`}>{MESSAGES.settlement.colProduct}</th>
                            <th className={`${headCellClass} text-left whitespace-nowrap`}>
                              {MESSAGES.settlement.colAttributionMonth}
                            </th>
                            <th className={`${headCellClass} text-right whitespace-nowrap`}>
                              {MESSAGES.settlement.colPaymentAmount}
                            </th>
                            {showFeeColumn && (
                              <th className={`${headCellClass} text-right whitespace-nowrap`}>
                                {MESSAGES.settlement.colFee}
                              </th>
                            )}
                            <th className={`${headCellClass} text-right whitespace-nowrap`}>
                              {MESSAGES.settlement.colActualAmount}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {isLinesLoading ? (
                            <tr>
                              <td colSpan={colCount} className="px-3 py-6 text-center text-sm text-slate-500">
                                {MESSAGES.settlement.linesLoading}
                              </td>
                            </tr>
                          ) : linesError ? (
                            <tr>
                              <td colSpan={colCount} className="px-3 py-6">
                                <div className="flex flex-col items-center gap-2 text-center">
                                  <p className="text-sm text-red-600 dark:text-red-400">{linesError}</p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => settlementId && void loadLines(settlementId, linesQuery)}
                                  >
                                    {MESSAGES.settlement.retry}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ) : lines.length === 0 ? (
                            <tr>
                              <td colSpan={colCount} className="px-3 py-6 text-center text-sm text-slate-500">
                                {hasLineFilter ? MESSAGES.settlement.linesFilteredEmpty : MESSAGES.settlement.linesEmpty}
                              </td>
                            </tr>
                          ) : (
                            lines.map((line) => {
                              const isRefund = line.entryType === 'REFUND';
                              return (
                                <tr
                                  key={line.id}
                                  className="border-b border-slate-100 dark:border-slate-700/60 last:border-b-0"
                                >
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      {isRefund && (
                                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0 text-[11px]">
                                          {MESSAGES.settlement.entryTypeRefund}
                                        </Badge>
                                      )}
                                      <span className="text-slate-900 dark:text-white">{line.productName}</span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums break-all">
                                      {line.orderNumber}
                                    </p>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {line.attributionMonth
                                      ? MESSAGES.settlementDynamic.attributionMonthLabel(line.attributionMonth)
                                      : '-'}
                                  </td>
                                  <td
                                    className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                                      line.paymentAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {formatAmount(line.paymentAmount)}
                                  </td>
                                  {showFeeColumn && (
                                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                                      {formatAmount(line.feeAmount)}
                                    </td>
                                  )}
                                  <td
                                    className={`px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap ${
                                      line.actualAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {formatAmount(line.actualAmount)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {activeTab === 'lines' && linesMeta && linesMeta.totalPages > 1 && (
                    <div className="shrink-0 flex items-center justify-center gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePageChange(linesQuery.page - 1)}
                        disabled={linesQuery.page <= 1}
                        aria-label={MESSAGES.settlement.prevPage}
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {linesQuery.page} / {linesMeta.totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePageChange(linesQuery.page + 1)}
                        disabled={linesQuery.page >= linesMeta.totalPages}
                        aria-label={MESSAGES.settlement.nextPage}
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {/* 거절 사유 입력 — 액션 버튼 바로 위 고정 영역에 연다 */}
          {showRejectForm && detail?.status === 'pending' && (
            <div className="shrink-0 space-y-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-3">
              <label htmlFor="reject-reason" className="text-sm font-medium text-red-700 dark:text-red-400">
                {MESSAGES.settlement.rejectReasonLabel}
              </label>
              <Textarea
                id="reject-reason"
                autoFocus
                rows={2}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectValidationError) setRejectValidationError(null);
                }}
                placeholder={MESSAGES.settlement.rejectReasonPlaceholder}
                className="bg-white dark:bg-slate-800"
              />
              {rejectValidationError && (
                <p className="text-xs text-red-600 dark:text-red-400">{rejectValidationError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason('');
                    setRejectValidationError(null);
                  }}
                  disabled={isProcessing}
                >
                  {MESSAGES.settlement.cancel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleRejectSubmit}
                  disabled={isProcessing}
                >
                  {isProcessing ? MESSAGES.settlement.processing : MESSAGES.settlement.rejectConfirmButton}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0">
            {detail?.status === 'pending' && !showRejectForm && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRejectForm(true)}
                  disabled={isProcessing}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  {MESSAGES.settlement.rejectButton}
                </Button>
                <Button type="button" onClick={handleApprove} disabled={isProcessing}>
                  {isProcessing ? MESSAGES.settlement.processing : MESSAGES.settlement.approveButton}
                </Button>
              </>
            )}
            {detail?.status === 'approved' && (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {MESSAGES.settlement.close}
                </Button>
                <Button
                  type="button"
                  onClick={() => setIsPayoutConfirmOpen(true)}
                  disabled={isProcessing || detail.netAmount < 0}
                  variant="success"
                  title={detail.netAmount < 0 ? MESSAGES.settlement.payoutDisabledNegative : undefined}
                >
                  {MESSAGES.settlement.payoutButton}
                </Button>
              </>
            )}
            {detail && detail.status !== 'pending' && detail.status !== 'approved' && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {MESSAGES.settlement.close}
              </Button>
            )}
            {(!detail || (detail.status === 'pending' && showRejectForm)) && !isDetailLoading && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {MESSAGES.settlement.close}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 지급 확인 다이얼로그 */}
      <Dialog open={isPayoutConfirmOpen} onOpenChange={setIsPayoutConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{MESSAGES.settlement.payoutConfirmTitle}</DialogTitle>
            <DialogDescription>{MESSAGES.settlement.payoutIrreversible}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="py-2 space-y-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">팀명</span>
                  <span className="font-medium text-slate-900 dark:text-white">{detail.team?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">정산월</span>
                  <span className="text-slate-900 dark:text-white tabular-nums">{detail.settlementMonth}</span>
                </div>
                <div className="flex justify-between items-baseline border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">지급 금액</span>
                  <span className="font-bold text-green-600 dark:text-green-400 text-base tabular-nums">
                    {formatAmount(detail.netAmount)}
                  </span>
                </div>
              </div>
              {detail.bankName && (
                <div className="text-sm text-primary bg-primary/5 dark:bg-primary/10 rounded-lg p-3">
                  입금 계좌: <span className="tabular-nums">{detail.bankName} {detail.bankAccount}</span>
                </div>
              )}
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                {MESSAGES.settlement.payoutConfirmNote}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPayoutConfirmOpen(false)}
              disabled={isProcessing}
            >
              {MESSAGES.settlement.cancel}
            </Button>
            <Button type="button" onClick={handlePayoutConfirmed} disabled={isProcessing} variant="success">
              {isProcessing ? MESSAGES.settlement.processing : MESSAGES.settlement.payoutExecute}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SettlementDetailDialog;
