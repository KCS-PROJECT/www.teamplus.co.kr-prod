'use client';

/**
 * TeamSettlementAccountsTab - 팀별 정산 지급 계좌 등록 현황 + 등록 완료/해제/초기화
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 감독이 제출한 계좌를 운영자가 나이스페이 서브몰 등록 후 완료 처리하는 흐름
 * 2. 휴먼 디자인: 상태 칩 + 검색 + 표, 위험 동작은 확인 다이얼로그로 분리
 * 3. AI 스타일 금지: gradient, blur 미사용, 솔리드 컬러만
 * 4. Tone & Manner: MESSAGES 상수, 한글 버튼 라벨
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { api } from '@/services/api-client';
import { isoToDateInput } from '@/lib/kst-date';
import { getAccountStatusMeta, type AccountStatus } from './accountStatusMeta';
import { ActionNotice } from './ActionNotice';

interface TeamAccount {
  teamId: string;
  status: AccountStatus;
  businessNumber: string;
  bankCode: string;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  submittedAt: string | null;
  registeredAt: string | null;
  registeredBy: { id: string; name: string } | null;
  updatedAt: string;
  subMallId: string | null;
  lastResCode: string | null;
  lastResMsg: string | null;
  lastAttemptedAt: string | null;
  registrationInProgress: boolean;
}

/** 마지막 나이스 서브몰 등록 호출 — 운영자용 원인 설명(통신 원인·코드·나이스 원문). */
interface LastNiceCall {
  outcome: 'SUCCESS' | 'TERMINAL' | 'AMBIGUOUS' | 'CONFIG';
  resCode: string | null;
  detail: string;
  at: string;
}

interface TeamAccountRow {
  teamId: string;
  teamName: string;
  teamCode: string;
  account: TeamAccount | null;
  lastNiceCall?: LastNiceCall | null;
  niceAction?: 'REGISTER' | 'UPDATE' | 'NONE' | null;
  niceSubId?: string | null;
}

interface AccountsMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  payoutApiMode?: 'off' | 'readonly' | 'live';
}

type StatusFilter = 'all' | 'NONE' | AccountStatus;
type DialogAction = 'register' | 'unregister' | 'reset';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const NOTICE_DURATION_MS = 4000;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: MESSAGES.settlement.filterAll },
  { value: 'NONE', label: getAccountStatusMeta(null).label },
  { value: 'SUBMITTED', label: getAccountStatusMeta('SUBMITTED').label },
  { value: 'REGISTERED', label: getAccountStatusMeta('REGISTERED').label },
  { value: 'FAILED', label: getAccountStatusMeta('FAILED').label },
];

const kstDateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatKst(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return kstDateTimeFormat.format(date);
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

function getErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

const chipClass = (selected: boolean) =>
  `px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
    selected
      ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
  }`;

export function TeamSettlementAccountsTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TeamAccountRow[]>([]);
  const [meta, setMeta] = useState<AccountsMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogRow, setDialogRow] = useState<TeamAccountRow | null>(null);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [registrationChecked, setRegistrationChecked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [niceRegisteringTeamId, setNiceRegisteringTeamId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // 필터를 빠르게 바꿀 때 먼저 보낸 요청이 늦게 도착해 최신 화면을 덮는 경쟁을 막는다.
  const requestSeqRef = useRef(0);

  const loadAccounts = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: PAGE_SIZE,
      };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (q) params.q = q;
      const res = await api.get<{ data: TeamAccountRow[]; meta: AccountsMeta }>(
        '/settlements/accounts',
        { params },
      );
      if (seq !== requestSeqRef.current) return;
      const totalPages = res.meta?.totalPages ?? 0;
      if (page > Math.max(totalPages, 1)) {
        // 처리 후 마지막 페이지가 비면 유효한 마지막 페이지로 다시 조회한다.
        setPage(Math.max(totalPages, 1));
        return;
      }
      setRows(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      setRows([]);
      setMeta(null);
      setLoadError(extractErrorMessage(error, MESSAGES.settlement.accountsLoadError));
    } finally {
      if (seq === requestSeqRef.current) setIsLoading(false);
    }
  }, [page, statusFilter, q]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next === q) return;
      setQ(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, q]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleStatusFilterChange = (next: StatusFilter) => {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setPage(1);
  };

  const openDialog = (action: DialogAction, row: TeamAccountRow) => {
    setDialogAction(action);
    setDialogRow(row);
    setResetStep(1);
    setRegistrationChecked(false);
  };

  const closeDialog = () => {
    if (isProcessing) return;
    setDialogAction(null);
    setDialogRow(null);
  };

  const handleConfirm = async () => {
    if (!dialogAction || !dialogRow?.account) return;
    const { teamId } = dialogRow;
    const { updatedAt } = dialogRow.account;
    setIsProcessing(true);
    try {
      if (dialogAction === 'reset') {
        await api.delete(`/settlements/accounts/${teamId}`);
        setNotice({
          type: 'success',
          text: MESSAGES.settlement.accountResetSuccess,
        });
      } else {
        const nextStatus: AccountStatus = dialogAction === 'register' ? 'REGISTERED' : 'SUBMITTED';
        await api.patch(`/settlements/accounts/${teamId}/registration`, {
          status: nextStatus,
          expectedUpdatedAt: updatedAt,
        });
        setNotice({
          type: 'success',
          text:
            dialogAction === 'register'
              ? MESSAGES.settlement.accountRegisterSuccess
              : MESSAGES.settlement.accountUnregisterSuccess,
        });
      }
      setDialogAction(null);
      setDialogRow(null);
      void loadAccounts();
    } catch (error) {
      const fallback =
        dialogAction === 'reset'
          ? MESSAGES.settlement.accountResetError
          : dialogAction === 'register'
            ? MESSAGES.settlement.accountRegisterError
            : MESSAGES.settlement.accountUnregisterError;
      const status = getErrorStatus(error);
      setNotice({
        type: 'error',
        text: extractErrorMessage(
          error,
          status === 409 ? MESSAGES.settlement.accountConflictRefetch : fallback,
        ),
      });
      setDialogAction(null);
      setDialogRow(null);
      // 다른 운영자가 먼저 바꿨거나(409) 이미 없는 계좌(404)면 최신 목록으로 맞춘다.
      if (status === 409 || status === 404) void loadAccounts();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNiceRegister = async (row: TeamAccountRow) => {
    if (niceRegisteringTeamId) return;
    setNiceRegisteringTeamId(row.teamId);
    try {
      const result = await api.post<TeamAccount & { lastNiceCall?: LastNiceCall | null }>(
        `/settlements/accounts/${row.teamId}/register`,
      );
      const detail = result?.lastNiceCall?.outcome !== 'SUCCESS' ? result?.lastNiceCall?.detail : undefined;
      if (result?.status === 'REGISTERED') {
        setNotice({
          type: 'success',
          text: MESSAGES.settlement.accountNiceRegisterSuccess,
        });
      } else if (result?.status === 'FAILED') {
        setNotice({
          type: 'error',
          text: MESSAGES.settlementDynamic.accountNiceRegisterFailed(
            detail || result.lastResMsg || MESSAGES.settlement.accountNiceRegisterFailedFallback,
          ),
        });
      } else {
        setNotice({
          type: 'success',
          text: detail
            ? MESSAGES.settlementDynamic.accountNiceRegisterCheckingWithReason(detail)
            : MESSAGES.settlement.accountNiceRegisterChecking,
        });
      }
      void loadAccounts();
    } catch (error) {
      const status = getErrorStatus(error);
      setNotice({
        type: 'error',
        text: extractErrorMessage(error, MESSAGES.settlement.accountNiceRegisterError),
      });
      if (status === 409 || status === 404) void loadAccounts();
    } finally {
      setNiceRegisteringTeamId(null);
    }
  };

  const handleNiceExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await api.downloadFile(
        '/settlements/accounts/nice-registration-export',
        MESSAGES.settlementDynamic.niceRegistrationFileName(
          isoToDateInput(new Date().toISOString()).replace(/-/g, ''),
        ),
      );
    } catch (error) {
      setNotice({
        type: 'error',
        text: extractErrorMessage(error, MESSAGES.settlement.niceExportError),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const isLiveMode = meta?.payoutApiMode === 'live';

  const dialogAccount = dialogRow?.account ?? null;
  const dialogFields = dialogAccount
    ? [
        {
          label: MESSAGES.settlement.accountColBusinessNumber,
          value: dialogAccount.businessNumber,
        },
        {
          label: MESSAGES.settlement.accountColBank,
          value: `${dialogAccount.bankName} (${dialogAccount.bankCode})`,
        },
        {
          label: MESSAGES.settlement.accountColAccountNumber,
          value: dialogAccount.bankAccount,
        },
        {
          label: MESSAGES.settlement.accountColHolder,
          value: dialogAccount.accountHolder,
        },
      ]
    : [];

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <ActionNotice notice={notice} />

      {!isLiveMode && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleNiceExport()}
            disabled={isExporting}
            className="h-11 shrink-0"
          >
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            {isExporting ? MESSAGES.settlement.niceExportDownloading : MESSAGES.settlement.niceExportButton}
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">{MESSAGES.settlement.niceExportGuide}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div
          role="group"
          aria-label={MESSAGES.settlement.accountsStatusFilterLabel}
          className="flex flex-wrap items-center gap-1.5"
        >
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={statusFilter === option.value}
              onClick={() => handleStatusFilterChange(option.value)}
              className={chipClass(statusFilter === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchInput}
            maxLength={50}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={MESSAGES.settlement.accountsSearchPlaceholder}
            aria-label={MESSAGES.settlement.accountsSearchLabel}
            className="h-11 pl-8"
          />
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-900/20"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadAccounts()} className="h-10 shrink-0">
            {MESSAGES.settlement.retry}
          </Button>
        </div>
      )}

      <div className="w-0 min-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColTeam}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColStatus}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColBusinessNumber}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColBank}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColAccountNumber}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColHolder}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColSubmittedAt}</TableHead>
              <TableHead className="whitespace-nowrap">{MESSAGES.settlement.accountColRegistered}</TableHead>
              <TableHead className="sticky right-0 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)] dark:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.5)] bg-white text-right whitespace-nowrap dark:bg-slate-800">{MESSAGES.settlement.accountColActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10">
                  {MESSAGES.settlement.accountsLoading}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                  {MESSAGES.settlement.accountsEmpty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const account = row.account;
                const statusMeta = getAccountStatusMeta(account?.status);
                return (
                  <TableRow key={row.teamId} className="group">
                    <TableCell className="whitespace-nowrap">
                      <p className="font-medium text-slate-900 dark:text-white">{row.teamName}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{row.teamCode}</p>
                    </TableCell>
                    <TableCell>
                      {/* 서브몰 ID 는 대부분 팀 ID 와 같아 목록에 적지 않고, 문의·대조할 때만 마우스를 올려 본다. */}
                      <span
                        title={
                          account?.subMallId
                            ? MESSAGES.settlementDynamic.accountSubMallId(account.subMallId)
                            : undefined
                        }
                      >
                        <Badge className={`${statusMeta.badge} whitespace-nowrap`}>{statusMeta.label}</Badge>
                      </span>
                      {!isLiveMode && account && row.niceAction === 'REGISTER' && account.status !== 'REGISTERED' && (
                        <div className="mt-1">
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 whitespace-nowrap">
                            {MESSAGES.settlement.niceActionRegister}
                          </Badge>
                        </div>
                      )}
                      {!isLiveMode && account && row.niceAction === 'UPDATE' && (
                        <div className="mt-1">
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                            {MESSAGES.settlement.niceActionUpdate}
                          </Badge>
                        </div>
                      )}
                      {!isLiveMode && account?.status === 'REGISTERED' && !account.subMallId && (
                        <p className="mt-1 max-w-[16rem] text-xs text-amber-700 dark:text-amber-400">
                          {MESSAGES.settlement.accountSubIdMissing}
                        </p>
                      )}
                      {account?.registrationInProgress && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          {MESSAGES.settlement.accountNiceInProgress}
                        </p>
                      )}
                      {/* 감독용 문구(lastResMsg) 대신 운영자용 원인을 보여준다 — 등록 완료 계좌의 거절된 변경 시도도 여기서 보인다. */}
                      {account && row.lastNiceCall && row.lastNiceCall.outcome !== 'SUCCESS' ? (
                        <div className="mt-1 max-w-[18rem] whitespace-normal break-words text-xs text-slate-500 dark:text-slate-400">
                          <p>{MESSAGES.settlementDynamic.accountNiceLastCall(row.lastNiceCall.detail)}</p>
                          <p className="tabular-nums text-slate-400 dark:text-slate-500">
                            {formatKst(row.lastNiceCall.at)}
                          </p>
                        </div>
                      ) : (
                        account &&
                        (account.status === 'FAILED' || account.status === 'SUBMITTED') &&
                        account.lastResMsg && (
                          <p className="mt-1 max-w-[16rem] whitespace-normal break-words text-xs text-slate-500 dark:text-slate-400">
                            {account.lastResMsg}
                          </p>
                        )
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                      {account?.businessNumber ?? '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-900 dark:text-white">
                      {account ? account.bankName : '-'}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                      {account?.bankAccount ?? '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-900 dark:text-white">{account?.accountHolder ?? '-'}</TableCell>
                    <TableCell className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {account ? formatKst(account.submittedAt) : MESSAGES.settlement.accountNotSubmitted}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {account?.registeredAt ? (
                        <>
                          <span>{formatKst(account.registeredAt)}</span>
                          {account.registeredBy && (
                            <span className="block text-slate-400 dark:text-slate-500">
                              {account.registeredBy.name}
                            </span>
                          )}
                        </>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="sticky right-0 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)] dark:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.5)] bg-white text-right group-hover:bg-slate-50 dark:bg-slate-800 dark:group-hover:bg-slate-700">
                      {account && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* 서브몰 ID 기록이 없는 등록 완료 계좌(이전 수동 처리분)는 live 에서 재등록이 필요하다. */}
                          {isLiveMode && (account.status !== 'REGISTERED' || !account.subMallId) && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleNiceRegister(row)}
                              disabled={account.registrationInProgress || niceRegisteringTeamId !== null}
                            >
                              {niceRegisteringTeamId === row.teamId
                                ? MESSAGES.settlement.accountNiceRegistering
                                : MESSAGES.settlement.accountNiceRegisterButton}
                            </Button>
                          )}
                          {!isLiveMode &&
                            (account.status === 'SUBMITTED' ||
                              account.status === 'FAILED' ||
                              (account.status === 'REGISTERED' && !account.subMallId)) && (
                            <Button type="button" size="sm" onClick={() => openDialog('register', row)}>
                              {MESSAGES.settlement.accountRegisterButton}
                            </Button>
                          )}
                          {!isLiveMode && account.status === 'REGISTERED' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openDialog('unregister', row)}
                            >
                              {MESSAGES.settlement.accountUnregisterButton}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog('reset', row)}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          >
                            {MESSAGES.settlement.accountResetButton}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {MESSAGES.settlementDynamic.accountsCount(
              meta.total,
              meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1,
              Math.min(meta.page * meta.pageSize, meta.total),
            )}
          </span>
          {meta.totalPages > 1 && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={MESSAGES.settlement.prevPage}
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
                aria-label={MESSAGES.settlement.nextPage}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogAction !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          {dialogAction && dialogRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialogAction === 'register'
                    ? MESSAGES.settlement.accountRegisterTitle
                    : dialogAction === 'unregister'
                      ? MESSAGES.settlement.accountUnregisterTitle
                      : MESSAGES.settlement.accountResetTitle}
                </DialogTitle>
                <DialogDescription>
                  {dialogAction === 'register'
                    ? MESSAGES.settlement.accountRegisterDescription
                    : dialogAction === 'unregister'
                      ? MESSAGES.settlement.accountUnregisterDescription
                      : MESSAGES.settlement.accountResetDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {MESSAGES.settlementDynamic.accountRegisterTeam(dialogRow.teamName)}
                </p>
                <dl className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-2 text-sm">
                  {dialogFields.map((field) => (
                    <div key={field.label} className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">{field.label}</dt>
                      <dd className="text-slate-900 dark:text-white tabular-nums text-right">{field.value}</dd>
                    </div>
                  ))}
                </dl>

                {dialogAction === 'register' && (dialogRow.niceSubId ?? dialogAccount?.subMallId) && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {MESSAGES.settlement.accountSubIdLabel}
                    </p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums break-all">
                      {dialogRow.niceSubId ?? dialogAccount?.subMallId}
                    </p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {MESSAGES.settlement.accountRegisterSubIdNotice}
                    </p>
                  </div>
                )}

                {dialogAction === 'unregister' && (
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {MESSAGES.settlement.accountUnregisterSubIdNotice}
                  </p>
                )}

                {dialogAction === 'register' && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={registrationChecked}
                      onChange={(e) => setRegistrationChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {MESSAGES.settlement.accountRegisterCheckbox}
                    </span>
                  </label>
                )}

                {dialogAction === 'reset' && resetStep === 2 && (
                  <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    {MESSAGES.settlement.accountResetSecondWarning}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isProcessing}>
                  {MESSAGES.settlement.cancel}
                </Button>
                {dialogAction === 'reset' && resetStep === 1 ? (
                  <Button type="button" variant="destructive" onClick={() => setResetStep(2)}>
                    {MESSAGES.settlement.accountResetNext}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant={dialogAction === 'reset' ? 'destructive' : 'default'}
                    onClick={() => void handleConfirm()}
                    disabled={isProcessing || (dialogAction === 'register' && !registrationChecked)}
                  >
                    {isProcessing
                      ? MESSAGES.settlement.processing
                      : dialogAction === 'register'
                        ? MESSAGES.settlement.accountRegisterConfirm
                        : dialogAction === 'unregister'
                          ? MESSAGES.settlement.accountUnregisterConfirm
                          : MESSAGES.settlement.accountResetConfirm}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TeamSettlementAccountsTab;
