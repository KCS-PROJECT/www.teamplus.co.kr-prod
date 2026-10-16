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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  CornerDownRight,
  Download,
  Eye,
  Undo2,
  XCircle,
} from 'lucide-react';
import { api } from '@/services/api-client';
import { isoToDateInput } from '@/lib/kst-date';
import { SettlementDetailDialog, type SettlementStatus } from './SettlementDetailDialog';
import { getAccountStatusMeta, type AccountStatus } from './accountStatusMeta';
import { ActionNotice } from './ActionNotice';
import { PayoutRequestDialog } from './PayoutRequestDialog';
import { PayoutConfirmBox, PayoutDialogSection, PayoutSummaryTiles } from './payoutDialogParts';
import { isoToKstDateTimeLabel } from '@/lib/kst-date';
import {
  formatPayoutMonthDay,
  getPayoutBlockMeta,
  getPayoutStatusLabelOverride,
  getRowExclusion,
  getStageAction,
  joinPayoutReasons,
  type PayoutApiMode,
  type PayoutRequestInfo,
  type PayoutView,
  type SettlementStage,
} from './payoutRequestMeta';

// ════════════════════════════════════════════════
// 타입
// ════════════════════════════════════════════════

/** POST /settlements/:id/payout-cancel — 나이스를 부른 뒤의 결과 */
interface PayoutCancelResponse {
  settlementId: string;
  requestId: string;
  outcome: 'CANCELLED' | 'UNCONFIRMED' | 'REJECTED';
  resCode: string | null;
  message: string;
}

interface PayoutRequestDefaults {
  mode: PayoutApiMode;
  payoutDayOfMonth: number;
  defaultPayDate: string;
  maxItems: number;
}

/** 지급 요청 버튼 한 번에 담을 수 있는 최대 건수의 기본값 — 서버 defaults 가 오면 그 값을 쓴다. */
const DEFAULT_PAYOUT_MAX_ITEMS = 10;

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
  payoutScheduledDate?: string | null;
  payoutRequest?: PayoutRequestInfo | null;
  /** 운영자 확인이 필요한 지급 요청 수 — 0보다 크면 지급 요청·수동 완료가 막힌 정산(ADMIN) */
  reviewOpenCount?: number;
  /** 확인 필요 사유 중 돈이 두 번 나갔을 수 있는 것이 있음(ADMIN) */
  duplicateSuspected?: boolean;
  /** 지급 대기·지급 실패 정산을 지금 나이스에 요청할 수 없는 이유 코드 — 요청할 수 있으면 null(ADMIN, 지급 요청과 같은 판정) */
  payoutBlock?: string | null;
  accountStatus?: AccountStatus | null;
  team: { id: string; name: string };
  _count: { details: number };
}

interface SettlementListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** payoutView 를 보낸 지급 대기·지급 실패 조회에서만 — 그 조건 전체 기준 */
  payoutCounts?: { ready: number; blocked: number; readyNetAmount: number };
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
  pgFeeRate?: number;
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

interface PayoutPreviewIncluded {
  settlementId: string;
  teamId: string;
  teamName: string;
  subMallId: string;
  netAmount: number;
}

interface PayoutPreviewExcluded {
  settlementId: string;
  teamId: string;
  teamName: string;
  netAmount: number;
  reasonCode: string;
  reason: string;
}

interface PayoutPreview {
  month: string;
  payDate: string;
  included: PayoutPreviewIncluded[];
  excluded: PayoutPreviewExcluded[];
  includedCount: number;
  includedTotal: number;
  excludedCount: number;
  excludedTotal: number;
  paidThisMonth?: { count: number; netAmount: number };
  fingerprint: string;
}

interface SettlementSummaryBucket {
  count: number;
  netAmount: number;
}

interface ApproveBatchResultRow {
  settlementId: string;
  teamName: string | null;
  outcome: 'APPROVED' | 'SKIPPED' | 'ERROR';
  reasonCode: string | null;
  reason: string | null;
}

interface ApproveBatchResponse {
  results: ApproveBatchResultRow[];
  summary: { approved: number; skipped: number; errored: number };
}

interface SettlementSummaryResponse {
  pgFeeRate?: number;
  pending: SettlementSummaryBucket;
  approved: SettlementSummaryBucket;
  processing: SettlementSummaryBucket;
  failed: SettlementSummaryBucket;
  paid: SettlementSummaryBucket;
  rejected: { count: number };
  /** 그 달에서 운영자 확인이 필요한 지급 요청이 있는 정산 수 — byStatus 는 정산 상태별(단계 탭의 빨간 표시) */
  review?: { count: number; byStatus?: Record<string, number> };
  /** 나이스 결과 조회의 마지막 성공·실패 시각 */
  payoutCheck?: { lastSucceededAt: string | null; lastFailedAt: string | null };
}

/** 그 달에서 운영자 확인이 필요한 지급 요청이 있는 정산 수. */
function reviewCountOf(summary: SettlementSummaryResponse | null): number {
  return summary?.review?.count ?? 0;
}

/** 단계에서 갈라져 나오는 상태 — 반려는 승인 대기에서, 지급 실패는 지급 처리 중에서 나온다. */
const STAGE_BRANCH: Partial<Record<SettlementStage, SettlementStage>> = {
  pending: 'rejected',
  processing: 'failed',
};

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

function formatRatePercent(rate: number): string {
  return String(parseFloat((rate * 100).toFixed(2)));
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

function getErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode;
}

/** 한국 시간 기준 오늘 다음의 첫 평일(공휴일은 고려하지 않는다) — 서버의 지급일 검증과 같은 기준. */
function getDefaultPayDate(): string {
  const d = new Date(`${isoToDateInput(new Date().toISOString())}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

interface NiceBalance {
  remainAmt: number;
  checkedAt: string;
}

const balanceTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function isPayoutApiOff(error: unknown): boolean {
  const res = (error as { response?: { status?: number; data?: { errorCode?: string } } })?.response;
  return res?.status === 409 && res.data?.errorCode === 'PAYOUT_API_OFF';
}

/** 나이스 지급대행 잔액 — 지급대행 모드가 꺼져 있으면(409) 카드 자체를 숨긴다. */
function NiceBalanceCard() {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['settlements', 'nice-balance'],
    queryFn: () => api.get<NiceBalance>('/settlements/balance'),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });

  if (isLoading || isPayoutApiOff(error)) return null;

  const checkedDate = data ? new Date(data.checkedAt) : null;
  const checkedText =
    checkedDate && !Number.isNaN(checkedDate.getTime()) ? balanceTimeFormat.format(checkedDate) : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900 dark:text-white">{MESSAGES.settlement.balanceTitle}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {MESSAGES.settlement.balanceRetry}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {extractErrorMessage(error, MESSAGES.settlement.balanceLoadError)}
        </p>
      ) : data ? (
        <div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatAmount(data.remainAmt)}
          </p>
          {checkedText && (
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {MESSAGES.settlementDynamic.balanceCheckedAt(checkedText)}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 월을 열 때 볼 곳 — 확인 필요가 있으면 그것만, 아니면 순서대로 첫 번째 할 일이 있는 단계, 없으면 전체(조회용). */
function getStartView(summary: SettlementSummaryResponse): { stage: SettlementStage; reviewOnly: boolean } {
  if (reviewCountOf(summary) > 0) return { stage: 'all', reviewOnly: true };
  if (summary.pending.count > 0) return { stage: 'pending', reviewOnly: false };
  if (summary.approved.count > 0) return { stage: 'approved', reviewOnly: false };
  if (summary.failed.count > 0) return { stage: 'failed', reviewOnly: false };
  if (summary.processing.count > 0) return { stage: 'processing', reviewOnly: false };
  return { stage: 'all', reviewOnly: false };
}

interface MonthlySettlementTabProps {
  /** 요청 불가 행의 [계좌 확인] — 지급 계좌 탭을 그 팀 이름으로 연다 */
  onOpenAccounts?: (teamName: string) => void;
}

export function MonthlySettlementTab({ onOpenAccounts }: MonthlySettlementTabProps = {}) {
  const [month, setMonth] = useState(getDefaultMonth());
  // 단계 = 정산 상태 필터. 한 단계에는 일괄 작업이 하나뿐이다.
  const [statusFilter, setStatusFilter] = useState<SettlementStage>('all');
  // 확인 필요만 보기 — 상태와 상관없이 운영자 확인이 필요한 정산을 모은다(켜면 단계는 전체).
  const [reviewOnly, setReviewOnly] = useState(false);
  // 지급 대기·지급 실패 안의 구분. 운영자가 고르기 전에는 목록이 올 때마다 할 일이 있는 쪽으로 맞춘다.
  const [payoutView, setPayoutView] = useState<PayoutView>('ready');
  const payoutViewTouchedRef = useRef(false);
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

  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payDate, setPayDate] = useState('');
  const [payoutPreview, setPayoutPreview] = useState<PayoutPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [payoutConfirmed, setPayoutConfirmed] = useState(false);
  const [isPayoutDownloading, setIsPayoutDownloading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const previewSeqRef = useRef(0);

  // 지급대행 모드 — 꺼져 있거나 조회에 실패하면 기존 수동 지급 흐름을 그대로 쓴다.
  const { data: payoutDefaults, isLoading: isPayoutModeLoading } = useQuery({
    queryKey: ['settlements', 'payout-defaults'],
    queryFn: () => api.get<PayoutRequestDefaults>('/settlements/payout-requests/defaults'),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });
  const payoutMode: PayoutApiMode = payoutDefaults?.mode ?? 'off';
  const isLiveMode = payoutMode === 'live';
  const maxPayoutItems = payoutDefaults?.maxItems ?? DEFAULT_PAYOUT_MAX_ITEMS;
  // 체크박스 선택 — 지금 단계에서 작업할 수 있는 행만 담긴다.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 다음 단계로 넘어가며 미리 체크해 둘 정산 id — 목록이 새로 오면 한 번 쓰고 비운다.
  const preselectRef = useRef<string[] | null>(null);
  // 월을 처음 열 때 한 번, 할 일이 있는 첫 단계 탭으로 들어간다. 운영자가 탭을 고르면 끈다.
  const autoStageRef = useRef(true);
  // 시작 단계를 정하느라 먼저 읽은 현황 — 바로 이어지는 목록 조회가 한 번 재사용한다.
  const prefetchedSummaryRef = useRef<{ month: string; data: SettlementSummaryResponse } | null>(null);
  // 방금 승인한 정산 id — 상단 [지급 대기 n건 지급 요청] 버튼으로 넘어갈 때 그 행을 체크해 둔다.
  const lastApprovedIdsRef = useRef<string[]>([]);
  const [isPayoutRequestOpen, setIsPayoutRequestOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<ApproveBatchResponse | null>(null);
  // 지급 취소 확인 창의 대상 행 — 지급 처리 중 단계에서 한 건씩만 취소한다(나이스가 단건만 받는다).
  const [cancelTarget, setCancelTarget] = useState<SettlementListItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // 목록 조회 요청 순번 — 필터를 빠르게 바꿀 때 먼저 보낸 요청이 나중에 도착해
  // 최신 화면을 덮어쓰는 경쟁을 막는다. 응답 시점에 최신 순번이 아니면 버린다.
  const requestSeqRef = useRef(0);

  const loadSettlements = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    // 다른 쪽·다른 페이지를 다시 읽으러 갈 때는 로딩 표시를 끄지 않는다(빈 표가 잠깐 보이지 않게).
    let rereading = false;
    setIsLoading(true);
    setLoadError(null);
    try {
      // 월을 처음 열 때는 현황을 먼저 읽어 할 일이 있는 첫 단계로 들어간다 — 전체 목록을 받았다가 버리지 않는다.
      if (autoStageRef.current) {
        const summary = await api
          .get<SettlementSummaryResponse>('/settlements/summary', { params: { month } })
          .catch(() => null);
        if (seq !== requestSeqRef.current) return;
        // 늦게 도착해 버려진 조회가 시작 단계 판단까지 지우지 않도록 판단이 끝난 뒤에 끈다.
        autoStageRef.current = false;
        // 이어지는 목록 조회가 현황을 다시 읽지 않게 넘겨 둔다.
        if (summary) prefetchedSummaryRef.current = { month, data: summary };
        const start = summary ? getStartView(summary) : { stage: 'all' as const, reviewOnly: false };
        if (start.stage !== statusFilter || start.reviewOnly !== reviewOnly) {
          setStatusFilter(start.stage);
          setReviewOnly(start.reviewOnly);
          return; // 보는 곳이 바뀌면 이 함수가 다시 만들어져 그 목록을 읽는다
        }
      }
      const prefetched =
        prefetchedSummaryRef.current?.month === month ? prefetchedSummaryRef.current.data : null;
      prefetchedSummaryRef.current = null;
      const params: Record<string, string | number> = { month, page, pageSize: PAGE_SIZE };
      // 확인 필요는 상태가 아니라 "운영자 확인이 필요한 지급 요청이 있음" 조건이다.
      if (reviewOnly) params.needsReview = 'true';
      else if (statusFilter !== 'all') params.status = statusFilter;
      // 지급 대기·지급 실패(live)의 "요청 가능 / 요청 불가"는 서버가 그 조건 전체 기준으로 나누고 센다.
      const payoutStage = !reviewOnly && isLiveMode && getStageAction(statusFilter) === 'payout';
      if (payoutStage) params.payoutView = payoutView;
      let summaryFailed = false;
      const [listRes, summaryRes] = await Promise.all([
        api.get<{ data: SettlementListItem[]; meta: SettlementListMeta }>('/settlements', { params }),
        prefetched
          ? Promise.resolve(prefetched)
          : api
              .get<SettlementSummaryResponse>('/settlements/summary', { params: { month } })
              .catch(() => {
                summaryFailed = true;
                return null;
              }),
      ]);
      if (seq !== requestSeqRef.current) return; // 늦게 도착한 응답 — 무시
      const nextRows = listRes.data ?? [];
      const counts = listRes.meta?.payoutCounts;
      // 운영자가 고르기 전에는 할 일이 있는 쪽을 보여 준다 — 요청 가능이 있으면 그쪽, 없고 요청 불가만 있으면 요청 불가.
      if (payoutStage && counts && !payoutViewTouchedRef.current) {
        const want: PayoutView = counts.ready === 0 && counts.blocked > 0 ? 'blocked' : 'ready';
        if (want !== payoutView) {
          rereading = true;
          // 요청 불가 쪽에는 체크칸이 없다 — 넘겨받은 선택은 버린다.
          if (want === 'blocked') preselectRef.current = null;
          setRows([]);
          setPage(1);
          setPayoutView(want);
          return; // 다른 쪽을 다시 읽는다
        }
      }
      // 처리 뒤 건수가 줄어 지금 페이지가 비면 마지막 페이지로 옮긴다.
      const lastPage = listRes.meta?.totalPages ?? 0;
      if (nextRows.length === 0 && lastPage > 0 && page > lastPage) {
        rereading = true;
        setPage(lastPage);
        return;
      }
      setRows(nextRows);
      // 다음 단계로 넘어오며 넘겨받은 id 가 있으면 그걸 체크하고, 아니면 화면에서 사라진 정산만 선택에서 뺀다.
      const preselect = preselectRef.current;
      preselectRef.current = null;
      setSelectedIds((prev) =>
        (preselect ?? prev).filter((id) => nextRows.some((r) => r.id === id)),
      );
      setMeta(listRes.meta ?? null);
      setMonthSummary(summaryRes);
      setMonthSummaryFailed(summaryFailed);
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      setRows([]);
      setMeta(null);
      setLoadError(extractErrorMessage(error, MESSAGES.settlement.listLoadError));
    } finally {
      if (seq === requestSeqRef.current && !rereading) setIsLoading(false);
    }
  }, [month, page, statusFilter, reviewOnly, payoutView, isLiveMode]);

  // 지급대행 모드를 알아야 지급 대기·지급 실패를 나눠 받을지 정한다 — 모드 조회가 끝난 뒤에 읽는다.
  useEffect(() => {
    if (isPayoutModeLoading) return;
    void loadSettlements();
  }, [loadSettlements, isPayoutModeLoading]);

  // 보이지 않는 페이지·월의 정산이 승인·지급 요청에 섞이지 않도록 목록 조건이 바뀌면 선택과 일괄 승인 결과를 비운다.
  useEffect(() => {
    setSelectedIds([]);
    setApproveResult(null);
  }, [month, page, statusFilter, reviewOnly]);

  // 월/단계는 값 변경 핸들러(handleMonthChange/handleGoToStage)에서
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

  const loadPayoutPreview = async (date: string) => {
    const seq = ++previewSeqRef.current;
    setPayoutPreview(null);
    setPayoutConfirmed(false);
    setPreviewError(null);
    if (!date) {
      setIsPreviewLoading(false);
      return;
    }
    setIsPreviewLoading(true);
    try {
      const res = await api.get<PayoutPreview>('/settlements/payout-file/preview', {
        params: { month, payDate: date },
      });
      if (seq !== previewSeqRef.current) return;
      setPayoutPreview(res);
    } catch (error) {
      if (seq !== previewSeqRef.current) return;
      setPreviewError(extractErrorMessage(error, MESSAGES.settlement.payoutPreviewError));
    } finally {
      if (seq === previewSeqRef.current) setIsPreviewLoading(false);
    }
  };

  const handleOpenPayout = () => {
    const date = getDefaultPayDate();
    setPayDate(date);
    setPayoutMsg(null);
    setIsPayoutOpen(true);
    void loadPayoutPreview(date);
  };

  const handleClosePayout = (open: boolean) => {
    if (open || isPayoutDownloading) return;
    previewSeqRef.current += 1;
    setIsPayoutOpen(false);
  };

  const handlePayDateChange = (date: string) => {
    setPayDate(date);
    setPayoutMsg(null);
    void loadPayoutPreview(date);
  };

  const handleDownloadPayoutFile = async () => {
    if (!payoutPreview || !payoutConfirmed) return;
    setIsPayoutDownloading(true);
    setPayoutMsg(null);
    try {
      const query = new URLSearchParams({
        month,
        payDate,
        fingerprint: payoutPreview.fingerprint,
      });
      await api.downloadFile(
        `/settlements/payout-file?${query.toString()}`,
        MESSAGES.settlementDynamic.payoutFileName(payDate.replace(/-/g, ''), month),
      );
      setPayoutConfirmed(false);
      setPayoutMsg({ type: 'success', text: MESSAGES.settlement.payoutFileDownloaded });
    } catch (error) {
      const changed = getErrorCode(error) === 'PAYOUT_FILE_CHANGED';
      if (changed) void loadPayoutPreview(payDate);
      setPayoutMsg({
        type: 'error',
        text: extractErrorMessage(
          error,
          changed ? MESSAGES.settlement.payoutFileChangedFallback : MESSAGES.settlement.payoutFileError,
        ),
      });
    } finally {
      setIsPayoutDownloading(false);
    }
  };

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (!checked) return prev.filter((x) => x !== id);
      return prev.includes(id) ? prev : [...prev, id];
    });
  };

  // 머리 행 체크박스 — 이 페이지에서 지금 단계의 작업을 할 수 있는 행 전체.
  const handleToggleAll = (checked: boolean, eligibleIds: string[]) => {
    setSelectedIds((prev) => {
      if (!checked) return prev.filter((id) => !eligibleIds.includes(id));
      const merged = new Set(prev);
      eligibleIds.forEach((id) => merged.add(id));
      return [...merged];
    });
  };

  const handleApproveBatch = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsApproving(true);
    try {
      const res = await api.post<ApproveBatchResponse>('/settlements/approve-batch', { ids });
      setIsApproveConfirmOpen(false);
      setApproveResult(res);
      setActionMsg({
        type: res.summary.approved > 0 ? 'success' : 'error',
        text: MESSAGES.settlementDynamic.approveBatchResult(
          res.summary.approved,
          res.summary.skipped + res.summary.errored,
        ),
      });
      lastApprovedIdsRef.current = res.results
        .filter((r) => r.outcome === 'APPROVED')
        .map((r) => r.settlementId);
      void loadSettlements();
    } catch (error) {
      setIsApproveConfirmOpen(false);
      setActionMsg({ type: 'error', text: extractErrorMessage(error, MESSAGES.settlement.approveBatchError) });
    } finally {
      setIsApproving(false);
    }
  };

  // 나이스를 부른 뒤의 결과는 200 으로 온다 — 취소됨만 성공, 확인 중·취소 안 됨은 서버 문구를 그대로 알린다.
  const handleCancelPayout = async (target: SettlementListItem) => {
    setIsCancelling(true);
    try {
      const res = await api.post<PayoutCancelResponse>(`/settlements/${target.id}/payout-cancel`);
      setActionMsg({ type: res.outcome === 'CANCELLED' ? 'success' : 'error', text: res.message });
    } catch (error) {
      setActionMsg({ type: 'error', text: extractErrorMessage(error, MESSAGES.settlement.payoutCancelError) });
    } finally {
      setIsCancelling(false);
      setCancelTarget(null);
      void loadSettlements();
    }
  };

  const handlePayoutRequestSubmitted = () => {
    setSelectedIds([]);
    void loadSettlements();
  };

  // 단계 탭으로 옮긴다. 방금 승인한 행을 넘겨받으면 그 행을 체크해 둔다 — 승인한 건을 그대로 지급 요청으로 잇는다.
  const handleGoToStage = (stage: SettlementStage, preselectIds: string[] = []) => {
    autoStageRef.current = false;
    // 이미 그 단계의 첫 페이지면 목록이 다시 조회되지 않는다 — 넘겨받은 행은 바로 체크하고 남겨 두지 않는다.
    if (stage === statusFilter && page === 1 && !reviewOnly) {
      if (preselectIds.length > 0) {
        if (payoutView !== 'ready') {
          // 요청 가능 쪽을 다시 읽으며 넘겨받은 행을 체크한다 — 받아 올 때까지 요청 불가 행을 요청 가능 규칙으로 그리지 않는다.
          preselectRef.current = preselectIds;
          setRows([]);
          setIsLoading(true);
          setPayoutView('ready');
        } else {
          setSelectedIds(preselectIds.filter((id) => rows.some((r) => r.id === id)));
        }
      }
      return;
    }
    payoutViewTouchedRef.current = false;
    preselectRef.current = preselectIds;
    setPayoutView('ready');
    setReviewOnly(false);
    setStatusFilter(stage);
    setPage(1);
  };

  const handleToggleReviewOnly = () => {
    autoStageRef.current = false;
    payoutViewTouchedRef.current = false;
    setPayoutView('ready');
    setReviewOnly((prev) => !prev);
    setStatusFilter('all');
    setPage(1);
  };

  const handleSelectPayoutView = (view: PayoutView) => {
    if (view === payoutView) return;
    payoutViewTouchedRef.current = true;
    // 다른 쪽을 받아 올 때까지 이전 쪽 행을 새 쪽의 규칙(체크칸·사유 배지)으로 그리지 않는다.
    setRows([]);
    setIsLoading(true);
    setPayoutView(view);
    setSelectedIds([]);
    setPage(1);
  };

  // 상단의 다음 작업 버튼 — 그 단계 탭으로 들어간다(확인 필요면 확인 필요만 보기). 지급 대기로 갈 때는 방금 승인한 행을 체크해 둔다.
  const handleNextAction = (target: SettlementStage | 'review') => {
    if (target === 'review') {
      if (!reviewOnly) handleToggleReviewOnly();
      return;
    }
    const preselect = target === 'approved' ? lastApprovedIdsRef.current : [];
    lastApprovedIdsRef.current = [];
    handleGoToStage(target, preselect);
  };

  const handleViewDetail = (id: string) => {
    setSelectedId(id);
    setIsDetailOpen(true);
  };

  // 필터 변경 시 같은 렌더에서 page 를 1로 리셋 — 별도 effect 의 2회 조회 경쟁을 방지한다.
  const handleMonthChange = (nextMonth: string) => {
    setMonth(nextMonth);
    // 다른 달은 그 달의 할 일이 있는 첫 단계부터 시작한다(현황을 읽은 뒤 정한다).
    setStatusFilter('all');
    setReviewOnly(false);
    setPayoutView('ready');
    payoutViewTouchedRef.current = false;
    autoStageRef.current = true;
    lastApprovedIdsRef.current = [];
    setPage(1);
    // 마감 결과는 방금 실행한 월의 보고서라 다른 월 목록 위에 남기지 않는다.
    setCloseResult(null);
  };

  const baseAction = reviewOnly ? null : getStageAction(statusFilter);
  // 지급 대기·지급 실패는 지금 요청할 수 있는 정산과 없는 정산(서버의 payoutBlock)을 나눠 보여 준다.
  //   지급 엑셀(live 아님)은 엑셀 미리보기가 자체 제외 기준으로 거르므로 나누지 않는다.
  const isPayoutStage = baseAction === 'payout' && isLiveMode;
  // 서버가 고른 쪽만 돌려준다 — 건수는 그 조건 전체 기준(meta.payoutCounts).
  const payoutCounts = isPayoutStage ? (meta?.payoutCounts ?? null) : null;
  const showBlocked = isPayoutStage && payoutView === 'blocked';
  // 요청 불가 쪽은 고를 것이 없어 체크박스와 작업 바를 두지 않는다.
  const stageAction = showBlocked ? null : baseAction;
  const tableColSpan = stageAction ? 10 : 9;
  // 승인 대기에서 승인할 수 없는 행(음수) — 행에 사유를 적고 체크박스를 두지 않는다.
  const rowExclusions = new Map(
    rows.map((r) => [r.id, stageAction ? getRowExclusion(r, stageAction) : null] as const),
  );
  const eligibleRows = rows.filter((r) => rowExclusions.get(r.id) === null);
  const eligibleIds = eligibleRows.map((r) => r.id);
  const selectedRows = eligibleRows.filter((r) => selectedIds.includes(r.id));
  const selectedTotal = selectedRows.reduce((sum, r) => sum + r.netAmount, 0);
  const payableOverLimit = stageAction === 'payout' && selectedRows.length > maxPayoutItems;
  const allChecked = eligibleRows.length > 0 && eligibleRows.every((r) => selectedIds.includes(r.id));
  const skippedApproveRows = approveResult?.results.filter((r) => r.outcome !== 'APPROVED') ?? [];
  const summaryBuckets: { key: SettlementStage; label: string; count: number; net: number | null }[] = monthSummary
    ? [
        { key: 'pending', label: MESSAGES.settlement.monthSummaryPendingLabel, count: monthSummary.pending.count, net: monthSummary.pending.netAmount },
        { key: 'approved', label: MESSAGES.settlement.monthSummaryApprovedLabel, count: monthSummary.approved.count, net: monthSummary.approved.netAmount },
        { key: 'processing', label: MESSAGES.settlement.monthSummaryProcessingLabel, count: monthSummary.processing.count, net: monthSummary.processing.netAmount },
        { key: 'failed', label: MESSAGES.settlement.monthSummaryFailedLabel, count: monthSummary.failed.count, net: monthSummary.failed.netAmount },
        { key: 'paid', label: MESSAGES.settlement.monthSummaryPaidLabel, count: monthSummary.paid.count, net: monthSummary.paid.netAmount },
        { key: 'rejected', label: MESSAGES.settlement.monthSummaryRejectedLabel, count: monthSummary.rejected.count, net: null },
      ]
    : [];
  const summaryTeamCount = summaryBuckets.reduce((sum, b) => sum + b.count, 0);
  const summaryTotalNet = summaryBuckets.reduce((sum, b) => sum + (b.net ?? 0), 0);
  const stageBucket = reviewOnly ? undefined : summaryBuckets.find((b) => b.key === statusFilter);
  const stageLabel = reviewOnly
    ? MESSAGES.settlement.stageReviewLabel
    : (stageBucket?.label ?? MESSAGES.settlement.stageAllLabel);
  // 지급 요청 단계의 작업 바는 요청 가능한 정산만 센다.
  const stageTotal = isPayoutStage
    ? (payoutCounts?.ready ?? meta?.total ?? rows.length)
    : (stageBucket?.count ?? meta?.total ?? rows.length);
  const stageNet = isPayoutStage ? (payoutCounts?.readyNetAmount ?? null) : (stageBucket?.net ?? null);
  const reviewByStatus = monthSummary?.review?.byStatus ?? {};
  const reviewCount = reviewCountOf(monthSummary);
  const lastCheck = monthSummary?.payoutCheck ?? null;
  const lastCheckFailedRecently =
    !!lastCheck?.lastFailedAt &&
    (!lastCheck.lastSucceededAt || lastCheck.lastFailedAt > lastCheck.lastSucceededAt);
  // 그 달의 다음 작업 — 순서대로 첫 번째 할 일. 지금 그 단계에 있으면 작업 바가 맡으므로 버튼을 숨긴다.
  const nextAction = (() => {
    if (!monthSummary || summaryTeamCount === 0) return null;
    const s = monthSummary;
    // 돈이 두 번 나갔을 수 있는 일은 승인·지급 요청보다 먼저다.
    const review = reviewCountOf(s);
    if (review > 0) {
      return { stage: 'review' as const, label: MESSAGES.settlementDynamic.nextActionReview(review) };
    }
    if (s.pending.count > 0) {
      return { stage: 'pending' as const, label: MESSAGES.settlementDynamic.nextActionApprove(s.pending.count) };
    }
    if (s.approved.count > 0) {
      return {
        stage: 'approved' as const,
        label: isLiveMode
          ? MESSAGES.settlementDynamic.nextActionPayout(s.approved.count)
          : MESSAGES.settlementDynamic.nextActionPayoutManual(s.approved.count),
      };
    }
    if (s.failed.count > 0) {
      return { stage: 'failed' as const, label: MESSAGES.settlementDynamic.nextActionFailed(s.failed.count) };
    }
    return null;
  })();
  const showNextAction =
    nextAction !== null &&
    (nextAction.stage === 'review' ? !reviewOnly : reviewOnly || nextAction.stage !== statusFilter);

  // 단계 탭 — 순서 있는 네 단계는 화살표로 잇고, 갈라져 나오는 상태(반려·지급 실패)는 그 단계 밑에 붙인다. 숫자는 건수 하나만 보여 준다.
  const orderedStages: SettlementStage[] = ['pending', 'approved', 'processing', 'paid'];
  // 숫자 배지 — 그 상태에 확인 필요 정산이 있으면 빨갛게 둔다(확인 필요는 단계가 아니라 표시다).
  const renderCountBadge = (count: number, active: boolean, alert: boolean) => (
    <span
      className={`rounded-full px-2 text-xs tabular-nums ${
        alert
          ? 'bg-red-600 text-white'
          : active
            ? 'bg-white/20'
            : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      {count}
    </span>
  );
  const renderStageTab = (key: SettlementStage) => {
    const active = !reviewOnly && statusFilter === key;
    const bucket = summaryBuckets.find((b) => b.key === key);
    const label = bucket?.label ?? MESSAGES.settlement.stageAllLabel;
    const count = bucket?.count ?? summaryTeamCount;
    const className = active
      ? 'bg-primary text-white'
      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-200 dark:hover:bg-slate-700';
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => handleGoToStage(key)}
        className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      >
        <span>{label}</span>
        {renderCountBadge(count, active, key !== 'all' && (reviewByStatus[key] ?? 0) > 0)}
      </button>
    );
  };
  // 갈라져 나온 상태 — 단계 밑의 작은 칩. 지급 실패는 건수가 있으면 빨갛다(다시 요청해야 할 일).
  const renderBranchTab = (key: SettlementStage) => {
    const active = !reviewOnly && statusFilter === key;
    const bucket = summaryBuckets.find((b) => b.key === key);
    const count = bucket?.count ?? 0;
    const alert = key === 'failed' && count > 0;
    const className = active
      ? alert
        ? 'bg-red-600 text-white'
        : 'bg-primary text-white'
      : alert
        ? 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700';
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => handleGoToStage(key)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md pl-2 pr-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      >
        <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{bucket?.label}</span>
        {renderCountBadge(count, active, (reviewByStatus[key] ?? 0) > 0)}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <ActionNotice notice={actionMsg} />

      <NiceBalanceCard />

      {/* 월 선택 + 마감 */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="h-11 w-40"
            aria-label="정산 월 선택"
          />
          {summaryTeamCount > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
              {MESSAGES.settlementDynamic.monthTeamsSummary(summaryTeamCount, formatAmount(summaryTotalNet))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* 다음 작업 버튼은 맨 왼쪽 — 오른쪽 정렬이라 나타나고 사라져도 나머지 버튼 자리가 움직이지 않는다 */}
          {showNextAction && nextAction && (
            <Button type="button" onClick={() => handleNextAction(nextAction.stage)} className="h-11">
              {nextAction.label}
              <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant={summaryTeamCount > 0 ? 'outline' : 'default'}
            onClick={() => setIsCloseConfirmOpen(true)}
            disabled={isClosing}
            className="h-11"
          >
            {isClosing ? MESSAGES.settlement.closeInProgress : MESSAGES.settlement.closeButton}
          </Button>
        </div>
      </div>

      {/* 일괄 승인 결과 — 건너뛴 건의 사유를 남겨 둔다(안내 띠는 4초 뒤 사라지므로) */}
      {approveResult && skippedApproveRows.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              {MESSAGES.settlement.approveBatchSkippedTitle} ·{' '}
              {MESSAGES.settlementDynamic.approveBatchResult(
                approveResult.summary.approved,
                approveResult.summary.skipped + approveResult.summary.errored,
              )}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setApproveResult(null)}>
              {MESSAGES.settlement.close}
            </Button>
          </div>
          <ul className="space-y-1">
            {skippedApproveRows.map((r) => (
              <li key={r.settlementId} className="text-sm text-amber-800 dark:text-amber-300">
                {r.teamName ?? r.settlementId} — {r.reason ?? r.outcome}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 단계 탭 — 누르면 그 상태만 보이고 작업 바가 그 단계의 작업 하나를 보여 준다. 전체는 조회용 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
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
          <div role="group" aria-label={MESSAGES.settlement.stageTabsAria} className="flex flex-wrap items-start gap-2">
            {orderedStages.map((key, i) => {
              const branch = STAGE_BRANCH[key];
              return (
                <Fragment key={key}>
                  {i > 0 && (
                    <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  )}
                  <div className="flex flex-col items-start gap-1">
                    {renderStageTab(key)}
                    {branch && renderBranchTab(branch)}
                  </div>
                </Fragment>
              );
            })}
            <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {(reviewCount > 0 || reviewOnly) && (
                <button
                  type="button"
                  aria-pressed={reviewOnly}
                  onClick={handleToggleReviewOnly}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    reviewOnly
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span>{MESSAGES.settlement.reviewOnlyToggle}</span>
                  <span
                    className={`rounded-full px-2 text-xs tabular-nums ${
                      reviewOnly ? 'bg-white/20' : 'bg-white text-red-700 dark:bg-slate-800 dark:text-red-300'
                    }`}
                  >
                    {reviewCount}
                  </span>
                </button>
              )}
              {renderStageTab('all')}
            </span>
          </div>
        )}
        {summaryTeamCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {(monthSummary?.pgFeeRate ?? 0) > 0 ? (
              <p>{MESSAGES.settlementDynamic.pgFeeRateNotice(formatRatePercent(monthSummary?.pgFeeRate ?? 0))}</p>
            ) : (
              <span />
            )}
            {/* 결과 반영은 배치가 한다 — 운영자는 마지막으로 나이스를 읽은 시각만 본다 */}
            <p className="tabular-nums">
              {MESSAGES.settlement.lastCheckLabel}{' '}
              {lastCheck?.lastSucceededAt
                ? isoToKstDateTimeLabel(lastCheck.lastSucceededAt)
                : MESSAGES.settlement.lastCheckNever}
              {lastCheckFailedRecently && (
                <span className="ml-2 text-amber-700 dark:text-amber-400">{MESSAGES.settlement.lastCheckFailedNote}</span>
              )}
            </p>
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

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm">
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
              <p className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.pgFeeLabel}</p>
              <p className="font-bold text-slate-900 dark:text-white tabular-nums">{formatAmount(closeResult.totals.paymentFee ?? 0)}</p>
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

      {/* 지급 대기·지급 실패 안의 구분 — 요청할 수 있는 정산만 작업 바로 이어지고, 요청 불가는 이유와 갈 곳만 보여 준다 */}
      {isPayoutStage && (
        <div
          role="group"
          aria-label={MESSAGES.settlement.payoutViewAria}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
        >
          {(['ready', 'blocked'] as const).map((view) => {
            const active = payoutView === view;
            const count = (view === 'ready' ? payoutCounts?.ready : payoutCounts?.blocked) ?? 0;
            const warn = view === 'blocked' && count > 0;
            return (
              <button
                key={view}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectPayoutView(view)}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <span>{view === 'ready' ? MESSAGES.settlement.payoutViewReady : MESSAGES.settlement.payoutViewBlocked}</span>
                <span
                  className={`rounded-full px-2 text-xs tabular-nums ${
                    warn
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 작업 바 — 작업이 있는 단계(승인 대기·지급 대기·지급 실패)에서만, 그 단계의 작업 하나만 보여 준다 */}
      {stageAction && (
        <div
          role="toolbar"
          aria-label={stageLabel}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
        >
          <p className="text-sm text-slate-600 dark:text-slate-300 min-w-0 flex-1" aria-live="polite">
            {MESSAGES.settlementDynamic.stageSelected(
              stageLabel,
              stageTotal,
              stageNet === null ? null : formatAmount(stageNet),
              selectedRows.length,
            )}
          </p>
          {stageAction === 'approve' && (
            <Button
              type="button"
              onClick={() => setIsApproveConfirmOpen(true)}
              disabled={isApproving || selectedRows.length === 0}
              className="h-11"
            >
              {MESSAGES.settlementDynamic.approveSelected(selectedRows.length)}
            </Button>
          )}
          {stageAction === 'payout' &&
            (isLiveMode ? (
              <Button
                type="button"
                onClick={() => setIsPayoutRequestOpen(true)}
                disabled={selectedRows.length === 0 || payableOverLimit}
                className="h-11"
                title={payableOverLimit ? MESSAGES.settlementDynamic.payoutRequestSelectLimit(maxPayoutItems) : undefined}
              >
                {statusFilter === 'failed'
                  ? MESSAGES.settlementDynamic.payoutRetrySelected(selectedRows.length)
                  : MESSAGES.settlementDynamic.payoutRequestSelected(selectedRows.length)}
              </Button>
            ) : (
              // live 가 아니면 지급은 나이스 관리자에 엑셀을 올려서 한다 — live 에서는 숨겨 API 요청과 겹치지 않게 한다.
              !isPayoutModeLoading && (
                <Button type="button" variant="outline" onClick={handleOpenPayout} className="h-11">
                  <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                  {MESSAGES.settlement.payoutFileButton}
                </Button>
              )
            ))}
          {payableOverLimit && isLiveMode && (
            <p className="basis-full text-sm text-amber-700 dark:text-amber-400">
              {MESSAGES.settlementDynamic.payoutRequestSelectLimit(maxPayoutItems)}
            </p>
          )}
        </div>
      )}

      {/* 팀별 정산 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {stageAction && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    disabled={eligibleRows.length === 0}
                    onChange={(e) => handleToggleAll(e.target.checked, eligibleIds)}
                    aria-label={MESSAGES.settlement.selectAllAria}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-40"
                  />
                </TableHead>
              )}
              <TableHead>팀</TableHead>
              <TableHead className="text-right">총매출</TableHead>
              <TableHead className="text-right">환불</TableHead>
              <TableHead className="text-right">수수료</TableHead>
              <TableHead className="text-right">순지급액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>{MESSAGES.settlement.colAccountStatus}</TableHead>
              <TableHead className="text-right">명세</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={tableColSpan} className="text-center py-10">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tableColSpan} className="text-center py-10 text-slate-500">
                  {isPayoutStage && !showBlocked && (payoutCounts?.blocked ?? 0) > 0
                    ? MESSAGES.settlement.payoutRequestIncludedEmpty
                    : MESSAGES.settlement.listEmpty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const statusInfo = STATUS_META[row.status] ?? STATUS_META.pending;
                const StatusIcon = statusInfo.icon;
                const accountMeta = getAccountStatusMeta(row.accountStatus);
                const fee = (row.platformFee ?? 0) + (row.paymentFee ?? 0);
                const statusLabel =
                  getPayoutStatusLabelOverride(row.status, row.payoutScheduledDate) ?? statusInfo.label;
                const payoutReasons = joinPayoutReasons(row.payoutRequest);
                const needsAttention = !!(row.payoutRequest?.needsAttention || row.payoutRequest?.needsReview);
                const exclusion = rowExclusions.get(row.id) ?? null;
                const block = showBlocked && row.payoutBlock ? getPayoutBlockMeta(row.payoutBlock) : null;
                // 확인 필요는 팀 칸의 "확인 필요 / 이중 지급 의심" 배지가 이미 말한다 — 같은 뜻의 배지를 겹쳐 달지 않는다.
                const showBlockBadge = !!block && row.payoutBlock !== 'PAYOUT_REVIEW_OPEN';
                return (
                  <TableRow key={row.id}>
                    {stageAction && (
                      <TableCell>
                        {exclusion === null ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={(e) => handleToggleSelect(row.id, e.target.checked)}
                            aria-label={`${row.team?.name} ${MESSAGES.settlement.selectRowAria}`}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                        ) : (
                          <span className="text-slate-400" aria-hidden="true">
                            —
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {row.team?.name}
                        {row.duplicateSuspected ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0 text-[11px]">
                            {MESSAGES.settlement.duplicateSuspectBadge}
                          </Badge>
                        ) : (row.reviewOpenCount ?? 0) > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0 text-[11px]">
                            {MESSAGES.settlement.reviewOpenBadge}
                          </Badge>
                        ) : null}
                      </span>
                      {exclusion && (
                        <p className="mt-0.5 text-xs font-normal text-amber-700 dark:text-amber-400">{exclusion}</p>
                      )}
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
                      <div className="flex items-center gap-1.5 flex-wrap" title={payoutReasons || undefined}>
                        <Badge className={statusInfo.badge}>
                          <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
                          {statusLabel}
                        </Badge>
                        {needsAttention && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                            {MESSAGES.settlement.needsAttentionBadge}
                          </Badge>
                        )}
                        {row.netAmount < 0 && (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                            {MESSAGES.settlement.negativeNetBadge}
                          </Badge>
                        )}
                        {showBlockBadge && block && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {block.label}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={accountMeta.badge}>{accountMeta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {row._count?.details ?? 0}건
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {block?.action === 'account' && onOpenAccounts && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenAccounts(row.team?.name ?? '')}
                          >
                            {MESSAGES.settlement.payoutBlockGoAccount}
                          </Button>
                        )}
                        {block?.action === 'detail' && (
                          <Button type="button" variant="outline" size="sm" onClick={() => handleViewDetail(row.id)}>
                            {MESSAGES.settlement.payoutBlockGoDetail}
                          </Button>
                        )}
                        {isLiveMode && row.status === 'processing' && row.payoutRequest?.cancelable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCancelTarget(row)}
                            disabled={isCancelling}
                            aria-label={MESSAGES.settlementDynamic.payoutCancelAria(row.team?.name ?? '')}
                          >
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                            {MESSAGES.settlement.payoutCancelButton}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost-primary"
                          size="sm"
                          onClick={() => handleViewDetail(row.id)}
                          aria-label={MESSAGES.settlementDynamic.detailAria(row.team?.name ?? '')}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
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

      {/* 나이스 지급 엑셀 다이얼로그 — 지급 요청 팝업과 같은 조각(구역·타일·확인 상자)으로 짠다 */}
      <Dialog open={isPayoutOpen} onOpenChange={handleClosePayout}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{MESSAGES.settlement.payoutFileTitle}</DialogTitle>
            <DialogDescription>{MESSAGES.settlement.payoutFileDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <PayoutDialogSection title={MESSAGES.settlement.payoutConditionTitle}>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="payout-pay-date" className="text-sm font-medium text-slate-900 dark:text-white">
                  {MESSAGES.settlement.payoutDateLabel}
                </label>
                <Input
                  id="payout-pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => handlePayDateChange(e.target.value)}
                  className="h-11 w-44"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPayoutMsg(null);
                    void loadPayoutPreview(payDate);
                  }}
                  disabled={isPreviewLoading || !payDate}
                  className="h-11"
                >
                  {MESSAGES.settlement.payoutPreviewButton}
                </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{MESSAGES.settlement.payoutDeadlineNotice}</p>
            </PayoutDialogSection>

            {isPreviewLoading && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{MESSAGES.settlement.payoutPreviewLoading}</p>
            )}

            {previewError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {previewError}
              </p>
            )}

            {payoutPreview && (
              <>
                <PayoutSummaryTiles
                  tiles={[
                    {
                      key: 'teams',
                      label: MESSAGES.settlement.payoutSummaryTeams,
                      value: `${payoutPreview.includedCount}건`,
                    },
                    {
                      key: 'total',
                      label: MESSAGES.settlement.payoutSummaryTotal,
                      value: formatAmount(payoutPreview.includedTotal),
                    },
                    {
                      key: 'paid',
                      label: MESSAGES.settlement.payoutSummaryPaidThisMonth,
                      value: `${payoutPreview.paidThisMonth?.count ?? 0}건`,
                      note:
                        (payoutPreview.paidThisMonth?.count ?? 0) > 0
                          ? formatAmount(payoutPreview.paidThisMonth?.netAmount ?? 0)
                          : undefined,
                    },
                  ]}
                />

                <PayoutDialogSection
                  title={MESSAGES.settlement.payoutIncludedTitle}
                  count={payoutPreview.included.length}
                  flush={payoutPreview.included.length > 0}
                >
                  {payoutPreview.included.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {MESSAGES.settlement.payoutIncludedEmpty}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{MESSAGES.settlement.payoutColTeam}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutColSubId}</TableHead>
                          <TableHead className="text-right">{MESSAGES.settlement.payoutColAmount}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payoutPreview.included.map((item) => (
                          <TableRow key={item.settlementId}>
                            <TableCell className="font-medium text-slate-900 dark:text-white">{item.teamName}</TableCell>
                            <TableCell className="tabular-nums text-slate-500 dark:text-slate-400">{item.subMallId}</TableCell>
                            <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                              {formatAmount(item.netAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </PayoutDialogSection>

                {payoutPreview.excluded.length > 0 && (
                  <PayoutDialogSection
                    title={MESSAGES.settlement.payoutExcludedTitle}
                    count={payoutPreview.excluded.length}
                    flush
                    collapsible
                    footer={`${MESSAGES.settlement.payoutSummaryExcludedTotal} ${formatAmount(payoutPreview.excludedTotal)}`}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{MESSAGES.settlement.payoutColTeam}</TableHead>
                          <TableHead className="text-right">{MESSAGES.settlement.payoutColExcludedAmount}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutColReason}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payoutPreview.excluded.map((item) => (
                          <TableRow key={item.settlementId}>
                            <TableCell className="font-medium text-slate-900 dark:text-white">{item.teamName}</TableCell>
                            <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                              {formatAmount(item.netAmount)}
                            </TableCell>
                            <TableCell className="text-slate-500 dark:text-slate-400 whitespace-normal">
                              {item.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </PayoutDialogSection>
                )}

                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">{MESSAGES.settlement.payoutFileWarning}</p>
                </div>

                <PayoutConfirmBox
                  checked={payoutConfirmed}
                  onChange={setPayoutConfirmed}
                  label={MESSAGES.settlement.payoutFileConfirmCheckbox}
                />
              </>
            )}

            {payoutMsg && (
              <p
                role={payoutMsg.type === 'error' ? 'alert' : 'status'}
                className={`text-sm ${
                  payoutMsg.type === 'error'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-green-700 dark:text-green-400'
                }`}
              >
                {payoutMsg.text}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClosePayout(false)}
              disabled={isPayoutDownloading}
            >
              {MESSAGES.settlement.close}
            </Button>
            <Button
              type="button"
              onClick={() => void handleDownloadPayoutFile()}
              disabled={
                isPayoutDownloading ||
                isPreviewLoading ||
                !payoutPreview ||
                payoutPreview.includedCount === 0 ||
                !payoutConfirmed
              }
            >
              {isPayoutDownloading
                ? MESSAGES.settlement.payoutFileDownloading
                : MESSAGES.settlement.payoutFileDownloadButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 선택 승인 확인 다이얼로그 */}
      <Dialog open={isApproveConfirmOpen} onOpenChange={(open) => !isApproving && setIsApproveConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{MESSAGES.settlement.approveBatchTitle}</DialogTitle>
            <DialogDescription>
              {MESSAGES.settlementDynamic.approveBatchConfirmBody(selectedRows.length, formatAmount(selectedTotal))}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 overflow-y-auto space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {selectedRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span>{r.team?.name}</span>
                <span className="tabular-nums">{formatAmount(r.netAmount)}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsApproveConfirmOpen(false)} disabled={isApproving}>
              {MESSAGES.settlement.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => void handleApproveBatch(selectedRows.map((r) => r.id))}
              disabled={isApproving || selectedRows.length === 0}
            >
              {isApproving ? MESSAGES.settlement.approveBatchSubmitting : MESSAGES.settlement.approveBatchSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 지급 취소 확인 다이얼로그 */}
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && !isCancelling && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{MESSAGES.settlement.payoutCancelTitle}</DialogTitle>
            <DialogDescription>
              {MESSAGES.settlementDynamic.payoutCancelConfirmBody(
                formatPayoutMonthDay(cancelTarget?.payoutRequest?.settlementDate) ?? '-',
              )}
            </DialogDescription>
          </DialogHeader>
          {cancelTarget && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.payoutCancelColTeam}</dt>
              <dd className="text-right text-slate-900 dark:text-white">{cancelTarget.team?.name ?? '-'}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.payoutCancelColAmount}</dt>
              <dd className="text-right tabular-nums text-slate-900 dark:text-white">
                {formatAmount(cancelTarget.payoutRequest?.amount ?? cancelTarget.netAmount)}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">{MESSAGES.settlement.payoutCancelColPayDate}</dt>
              <dd className="text-right tabular-nums text-slate-900 dark:text-white">
                {cancelTarget.payoutRequest?.settlementDate ?? '-'}
              </dd>
            </dl>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={isCancelling}>
              {MESSAGES.settlement.payoutCancelKeep}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => cancelTarget && void handleCancelPayout(cancelTarget)}
              disabled={isCancelling || cancelTarget === null}
            >
              {isCancelling ? MESSAGES.settlement.payoutCancelSubmitting : MESSAGES.settlement.payoutCancelSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayoutRequestDialog
        open={isPayoutRequestOpen}
        onOpenChange={setIsPayoutRequestOpen}
        settlementIds={stageAction === 'payout' ? selectedRows.map((r) => r.id) : []}
        onSubmitted={handlePayoutRequestSubmitted}
      />

      <SettlementDetailDialog
        open={isDetailOpen}
        settlementId={selectedId}
        payoutMode={payoutMode}
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
