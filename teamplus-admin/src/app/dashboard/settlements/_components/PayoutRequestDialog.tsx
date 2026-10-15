'use client';

/**
 * PayoutRequestDialog - 나이스 지급대행 API 로 지급을 요청하는 단계형 팝업
 *
 * 1) 지급일 확인 + 지급 대상 미리보기  2) 확인 체크 후 요청  3) 건별 결과 표시
 * 운영 데이터가 바뀌는 요청이라 미리보기에서 받은 계좌 시각(accountUpdatedAt)을 그대로 돌려보내
 * 그 사이 계좌가 바뀐 건은 서버가 거르게 한다.
 */

import { useEffect, useRef, useState } from 'react';
import { MESSAGES } from '@/lib/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { api } from '@/services/api-client';
import { getPayoutOutcomeMeta, type PayoutRequestOutcome } from './payoutRequestMeta';
import {
  PayoutConfirmBox,
  PayoutDialogSection,
  PayoutSummaryTiles,
  type PayoutSummaryTile,
} from './payoutDialogParts';

interface PayoutDefaults {
  mode: 'off' | 'readonly' | 'live';
  payoutDayOfMonth: number;
  defaultPayDate: string;
  maxItems: number;
}

interface PreviewIncluded {
  settlementId: string;
  teamId: string;
  teamName: string;
  settlementMonth: string;
  netAmount: number;
  /** 실패 건의 재요청 — 요청할 때 서버가 나이스에서 그 실패 건의 상태를 먼저 확인한다 */
  isRetry: boolean;
  subMallId: string | null;
  bankName: string | null;
  bankAccountMasked: string | null;
  accountHolder: string | null;
  accountUpdatedAt: string | null;
  accntDesc: string | null;
}

interface PreviewExcluded {
  settlementId: string;
  teamId: string;
  teamName: string;
  settlementMonth: string;
  netAmount: number;
  reasonCode: string;
  reason: string;
}

interface PayoutPreview {
  payDate: string;
  mode: string;
  included: PreviewIncluded[];
  excluded: PreviewExcluded[];
  includedCount: number;
  includedTotal: number;
  excludedCount: number;
  balance: number | null;
  balanceError: string | null;
  balanceShort: boolean;
}

interface PayoutRequestResultRow {
  settlementId: string;
  teamName: string;
  amount: number;
  outcome: PayoutRequestOutcome;
  requestId: string | null;
  niceSeq: string | null;
  reasonCode: string | null;
  message: string | null;
}

interface PayoutRequestResponse {
  payDate: string;
  results: PayoutRequestResultRow[];
  summary: { requested: number; unconfirmed: number; rejected: number; skipped: number; errored?: number };
}

type Step = 'preview' | 'result';

/** 지급일의 '일' 이 이 값 이하면 지난달 말 결제 대금이 아직 들어오기 전일 수 있다. */
const EARLY_PAY_DAY = 8;
/** 날짜 입력은 연·월·일 칸마다 onChange 가 나므로 잠시 모았다가 한 번만 미리보기(나이스 잔액 조회 포함)를 부른다. */
const PREVIEW_DEBOUNCE_MS = 600;

function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
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

function extractErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: unknown } })?.response?.data as
    | { errorCode?: string; code?: string }
    | undefined;
  return data?.errorCode ?? data?.code;
}

/** 요약 타일 — 지급 팀 · 지급 합계 · 나이스 잔액(못 읽었거나 모자라면 노란 타일). */
function buildPreviewTiles(preview: PayoutPreview): PayoutSummaryTile[] {
  const balanceTile: PayoutSummaryTile =
    preview.balance === null
      ? {
          key: 'balance',
          label: MESSAGES.settlement.payoutRequestBalanceLabel,
          value: MESSAGES.settlement.payoutSummaryBalanceUnknown,
          tone: 'warn',
          note: preview.balanceError ?? undefined,
        }
      : {
          key: 'balance',
          label: MESSAGES.settlement.payoutRequestBalanceLabel,
          value: formatAmount(preview.balance),
          tone: preview.balanceShort ? 'warn' : 'default',
          note: preview.balanceShort ? MESSAGES.settlement.payoutSummaryBalanceShort : undefined,
        };
  return [
    { key: 'teams', label: MESSAGES.settlement.payoutSummaryTeams, value: `${preview.includedCount}건` },
    { key: 'total', label: MESSAGES.settlement.payoutSummaryTotal, value: formatAmount(preview.includedTotal) },
    balanceTile,
  ];
}

function buildResultTiles(summary: PayoutRequestResponse['summary']): PayoutSummaryTile[] {
  const errored = summary.errored ?? 0;
  return [
    { key: 'requested', label: MESSAGES.settlement.payoutOutcomeRequested, value: `${summary.requested}건` },
    {
      key: 'unconfirmed',
      label: MESSAGES.settlement.payoutOutcomeUnconfirmed,
      value: `${summary.unconfirmed}건`,
      tone: summary.unconfirmed > 0 ? 'warn' : 'default',
    },
    {
      key: 'rejected',
      label: MESSAGES.settlement.payoutOutcomeRejected,
      value: `${summary.rejected}건`,
      tone: summary.rejected > 0 ? 'warn' : 'default',
    },
    { key: 'skipped', label: MESSAGES.settlement.payoutOutcomeSkipped, value: `${summary.skipped}건` },
    {
      key: 'errored',
      label: MESSAGES.settlement.payoutOutcomeError,
      value: `${errored}건`,
      tone: errored > 0 ? 'warn' : 'default',
    },
  ];
}

interface PayoutRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지급 요청 대상으로 고른 정산 id (최대 maxItems 건) */
  settlementIds: string[];
  /** 요청이 한 건이라도 서버에 전달된 뒤 호출 — 부모가 목록을 다시 불러온다. */
  onSubmitted: () => void;
}

export function PayoutRequestDialog({
  open,
  onOpenChange,
  settlementIds,
  onSubmitted,
}: PayoutRequestDialogProps) {
  const [step, setStep] = useState<Step>('preview');
  const [payDate, setPayDate] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [response, setResponse] = useState<PayoutRequestResponse | null>(null);
  const previewSeqRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingPreview = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  useEffect(() => cancelPendingPreview, []);

  const loadPreview = async (date: string) => {
    const seq = ++previewSeqRef.current;
    setPreview(null);
    setConfirmed(false);
    setPreviewError(null);
    setDateError(null);
    setSubmitError(null);
    if (!date) {
      setIsPreviewLoading(false);
      return;
    }
    setIsPreviewLoading(true);
    try {
      const res = await api.get<PayoutPreview>('/settlements/payout-requests/preview', {
        params: { settlementIds: settlementIds.join(','), payDate: date },
      });
      if (seq !== previewSeqRef.current) return;
      setPreview(res);
    } catch (error) {
      if (seq !== previewSeqRef.current) return;
      const code = extractErrorCode(error);
      if (code === 'PAYOUT_DATE_INVALID') {
        setDateError(extractErrorMessage(error, MESSAGES.settlement.payoutRequestDateInvalid));
      } else if (code === 'PAYOUT_API_OFF') {
        setPreviewError(extractErrorMessage(error, MESSAGES.settlement.payoutRequestOffError));
      } else {
        setPreviewError(extractErrorMessage(error, MESSAGES.settlement.payoutRequestPreviewError));
      }
    } finally {
      if (seq === previewSeqRef.current) setIsPreviewLoading(false);
    }
  };

  // 열릴 때마다 처음 단계로 되돌리고, 서버 기본 지급일로 미리보기를 불러온다.
  useEffect(() => {
    if (!open) return;
    cancelPendingPreview();
    const seq = ++previewSeqRef.current;
    setStep('preview');
    setPreview(null);
    setPreviewError(null);
    setDateError(null);
    setSubmitError(null);
    setConfirmed(false);
    setResponse(null);
    setPayDate('');
    setIsPreviewLoading(true);

    void (async () => {
      let date = '';
      try {
        const defaults = await api.get<PayoutDefaults>('/settlements/payout-requests/defaults');
        date = defaults.defaultPayDate;
      } catch (error) {
        if (seq !== previewSeqRef.current) return;
        setPreviewError(extractErrorMessage(error, MESSAGES.settlement.payoutRequestPreviewError));
        setIsPreviewLoading(false);
        return;
      }
      if (seq !== previewSeqRef.current) return;
      setPayDate(date);
      await loadPreview(date);
    })();
    // 팝업이 열리는 순간의 선택 목록으로만 조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = (nextOpen: boolean) => {
    if (nextOpen || isSubmitting) return;
    cancelPendingPreview();
    previewSeqRef.current += 1;
    onOpenChange(false);
  };

  const handlePayDateChange = (date: string) => {
    setPayDate(date);
    // 바뀐 날짜의 미리보기가 오기 전까지는 이전 미리보기로 요청하지 못하게 바로 비우고,
    //   아직 오지 않은 이전 날짜의 응답도 버린다.
    previewSeqRef.current += 1;
    setPreview(null);
    setConfirmed(false);
    setIsPreviewLoading(true);
    cancelPendingPreview();
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      void loadPreview(date);
    }, PREVIEW_DEBOUNCE_MS);
  };

  const handleSubmit = async () => {
    if (!preview || !confirmed || preview.included.length === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setDateError(null);
    try {
      const res = await api.post<PayoutRequestResponse>('/settlements/payout-requests', {
        payDate,
        items: preview.included.map((item) => ({
          settlementId: item.settlementId,
          expectedAccountUpdatedAt: item.accountUpdatedAt,
        })),
      });
      setResponse(res);
      setStep('result');
      setConfirmed(false);
      onSubmitted();
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const code = extractErrorCode(error);
      if (code === 'PAYOUT_DATE_INVALID') {
        setDateError(extractErrorMessage(error, MESSAGES.settlement.payoutRequestDateInvalid));
      } else if (status === undefined) {
        // 응답을 못 받았으면 나이스에 접수됐는지 알 수 없다 — 다시 누르게 두지 않고 결과 조회로 안내한다.
        setSubmitError(MESSAGES.settlement.payoutRequestNoResponse);
        onSubmitted();
      } else {
        setSubmitError(extractErrorMessage(error, MESSAGES.settlement.payoutRequestSubmitError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const payDay = Number(payDate.slice(8, 10));
  const showEarlyNotice = payDate.length === 10 && payDay >= 1 && payDay <= EARLY_PAY_DAY;
  const canSubmit =
    !!preview &&
    preview.includedCount > 0 &&
    confirmed &&
    !isPreviewLoading &&
    !isSubmitting &&
    !submitError;
  const hasRetry = !!preview && preview.included.some((item) => item.isRetry);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'result'
              ? MESSAGES.settlement.payoutRequestResultTitle
              : MESSAGES.settlement.payoutRequestTitle}
          </DialogTitle>
          <DialogDescription>{MESSAGES.settlement.payoutRequestDescription}</DialogDescription>
        </DialogHeader>

        {step === 'preview' ? (
          <div className="space-y-4 py-2">
            <PayoutDialogSection title={MESSAGES.settlement.payoutConditionTitle}>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="payout-request-pay-date"
                  className="text-sm font-medium text-slate-900 dark:text-white"
                >
                  {MESSAGES.settlement.payoutDateLabel}
                </label>
                <Input
                  id="payout-request-pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => handlePayDateChange(e.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={dateError ? true : undefined}
                  aria-describedby={dateError ? 'payout-request-date-error' : undefined}
                  className="h-11 w-44"
                />
              </div>
              {dateError && (
                <p id="payout-request-date-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
                  {dateError}
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {MESSAGES.settlement.payoutDeadlineNotice}
              </p>
              {showEarlyNotice && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {MESSAGES.settlement.payoutRequestEarlyDateNotice}
                </p>
              )}
            </PayoutDialogSection>

            {isPreviewLoading && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {MESSAGES.settlement.payoutRequestPreviewLoading}
              </p>
            )}

            {previewError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {previewError}
              </p>
            )}

            {preview && (
              <>
                <PayoutSummaryTiles tiles={buildPreviewTiles(preview)} />

                <PayoutDialogSection
                  title={MESSAGES.settlement.payoutRequestIncludedTitle}
                  count={preview.included.length}
                  flush={preview.included.length > 0}
                  footer={hasRetry ? MESSAGES.settlement.payoutRequestRetryCheckNotice : undefined}
                >
                  {preview.included.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {MESSAGES.settlement.payoutRequestIncludedEmpty}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{MESSAGES.settlement.payoutColTeam}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutRequestColMonth}</TableHead>
                          <TableHead className="text-right">{MESSAGES.settlement.payoutColAmount}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutRequestColBank}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutRequestColAccount}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutRequestColHolder}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.included.map((item) => (
                          <TableRow key={item.settlementId}>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              <span className="inline-flex items-center gap-1.5">
                                {item.teamName}
                                {item.isRetry && (
                                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0 text-[11px]">
                                    {MESSAGES.settlement.payoutRequestRetryBadge}
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="tabular-nums text-slate-500 dark:text-slate-400">
                              {item.settlementMonth}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                              {formatAmount(item.netAmount)}
                            </TableCell>
                            <TableCell className="text-slate-500 dark:text-slate-400">
                              {item.bankName ?? '-'}
                            </TableCell>
                            <TableCell className="tabular-nums text-slate-500 dark:text-slate-400">
                              {item.bankAccountMasked ?? '-'}
                            </TableCell>
                            <TableCell className="text-slate-500 dark:text-slate-400">
                              {item.accountHolder ?? '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </PayoutDialogSection>

                {preview.excluded.length > 0 && (
                  <PayoutDialogSection
                    title={MESSAGES.settlement.payoutRequestExcludedTitle}
                    count={preview.excluded.length}
                    flush
                    collapsible
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{MESSAGES.settlement.payoutColTeam}</TableHead>
                          <TableHead>{MESSAGES.settlement.payoutRequestColMonth}</TableHead>
                          <TableHead className="text-right">
                            {MESSAGES.settlement.payoutColExcludedAmount}
                          </TableHead>
                          <TableHead>{MESSAGES.settlement.payoutColReason}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.excluded.map((item) => (
                          <TableRow key={item.settlementId}>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {item.teamName}
                            </TableCell>
                            <TableCell className="tabular-nums text-slate-500 dark:text-slate-400">
                              {item.settlementMonth}
                            </TableCell>
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

                {preview.included.length > 0 && (
                  <PayoutConfirmBox
                    checked={confirmed}
                    onChange={setConfirmed}
                    disabled={isSubmitting}
                    label={MESSAGES.settlement.payoutRequestConfirmCheckbox}
                  />
                )}
              </>
            )}

            {submitError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {submitError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {response && (
              <>
                <PayoutSummaryTiles tiles={buildResultTiles(response.summary)} columns={5} />
                <PayoutDialogSection
                  title={MESSAGES.settlement.payoutRequestResultRows}
                  count={response.results.length}
                  flush
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{MESSAGES.settlement.payoutColTeam}</TableHead>
                        <TableHead className="text-right">{MESSAGES.settlement.payoutColAmount}</TableHead>
                        <TableHead>{MESSAGES.settlement.payoutRequestColResult}</TableHead>
                        <TableHead>{MESSAGES.settlement.payoutRequestColMessage}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.results.map((row) => {
                        const outcomeMeta = getPayoutOutcomeMeta(row.outcome);
                        return (
                          <TableRow key={row.settlementId}>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {row.teamName}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                              {formatAmount(row.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge className={outcomeMeta.badge}>{outcomeMeta.label}</Badge>
                            </TableCell>
                            <TableCell className="text-slate-500 dark:text-slate-400 whitespace-normal">
                              {row.message ?? ''}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </PayoutDialogSection>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            {MESSAGES.settlement.close}
          </Button>
          {step === 'preview' && (
            <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {isSubmitting
                ? MESSAGES.settlement.payoutRequestSubmitting
                : MESSAGES.settlement.payoutRequestSubmit}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PayoutRequestDialog;
