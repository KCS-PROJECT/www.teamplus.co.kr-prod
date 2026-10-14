'use client';

/**
 * PayoutCheckDialog - 나이스에 요청한 지급 건의 처리 결과를 지급일 기준으로 조회한다.
 * 조회가 끝나면 서버가 정산 상태를 갱신하므로 부모가 목록을 다시 불러온다.
 */

import { useEffect, useState } from 'react';
import { MESSAGES } from '@/lib/messages';
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
import { api } from '@/services/api-client';
import { isoToDateInput } from '@/lib/kst-date';

interface PayoutCheckResult {
  payDate: string;
  queried: boolean;
  checked: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  notFound: number;
  pending: number;
  needsReview: number;
  remainAmt: number | null;
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

interface PayoutCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 조회가 성공하면 호출 — 부모가 목록과 안내를 갱신한다. */
  onChecked: () => void;
}

export function PayoutCheckDialog({ open, onOpenChange, onChecked }: PayoutCheckDialogProps) {
  const [payDate, setPayDate] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PayoutCheckResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setPayDate(isoToDateInput(new Date().toISOString()));
    setError(null);
    setResult(null);
  }, [open]);

  const handleCheck = async () => {
    if (!payDate) return;
    setIsChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<PayoutCheckResult>('/settlements/payout-requests/check', { payDate });
      setResult(res);
      onChecked();
    } catch (err) {
      setError(extractErrorMessage(err, MESSAGES.settlement.payoutCheckError));
    } finally {
      setIsChecking(false);
    }
  };

  const tiles = result
    ? [
        { key: 'checked', label: MESSAGES.settlement.payoutCheckChecked, value: result.checked },
        { key: 'succeeded', label: MESSAGES.settlement.payoutCheckSucceeded, value: result.succeeded },
        { key: 'failed', label: MESSAGES.settlement.payoutCheckFailed, value: result.failed },
        { key: 'cancelled', label: MESSAGES.settlement.payoutCheckCancelled, value: result.cancelled },
        { key: 'notFound', label: MESSAGES.settlement.payoutCheckNotFound, value: result.notFound },
        { key: 'pending', label: MESSAGES.settlement.payoutCheckPending, value: result.pending },
        { key: 'needsReview', label: MESSAGES.settlement.payoutCheckNeedsReview, value: result.needsReview },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(next) => !isChecking && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{MESSAGES.settlement.payoutCheckTitle}</DialogTitle>
          <DialogDescription>{MESSAGES.settlement.payoutCheckDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="payout-check-pay-date" className="text-sm font-medium text-slate-900 dark:text-white">
              {MESSAGES.settlement.payoutDateLabel}
            </label>
            <Input
              id="payout-check-pay-date"
              type="date"
              value={payDate}
              onChange={(e) => {
                setPayDate(e.target.value);
                setResult(null);
                setError(null);
              }}
              disabled={isChecking}
              className="h-11 w-44"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          {result &&
            (result.queried ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {tiles.map((tile) => (
                    <div key={tile.key} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
                      <p className="font-bold text-slate-900 dark:text-white tabular-nums">{tile.value}건</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                  {MESSAGES.settlement.payoutCheckRemain}{' '}
                  {result.remainAmt === null
                    ? MESSAGES.settlement.payoutCheckRemainUnknown
                    : MESSAGES.settlementDynamic.amountWon(result.remainAmt.toLocaleString())}
                </p>
              </div>
            ) : (
              <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
                {MESSAGES.settlement.payoutCheckNoTarget}
              </p>
            ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isChecking}>
            {MESSAGES.settlement.close}
          </Button>
          <Button type="button" onClick={() => void handleCheck()} disabled={isChecking || !payDate}>
            {isChecking ? MESSAGES.settlement.payoutCheckSubmitting : MESSAGES.settlement.payoutCheckSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PayoutCheckDialog;
