'use client';

/**
 * OverviewTab - 팀별 수업 결제 현황 (월별 조회)
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 월별 결제완료/미수금 현황을 팀 단위로 조망
 * 2. 휴먼 디자인: 통계 카드 + 팀별 표 조합
 * 3. AI 스타일 금지: gradient, blur 미사용, 솔리드 컬러만
 * 4. Tone & Manner: MESSAGES 상수, 서버 계산값 신뢰(프론트 재계산 금지)
 *
 * 수수료·순지급액은 서버(feeRate/platformFee/netAmount)가 계산한 값을 그대로 표시한다.
 * 프론트에는 수수료율을 하드코딩하지 않는다 — 서버 값이 없으면 0으로 처리한다.
 * 미수금은 확정 청구된 금액만 집계한다 (project_unpaid_definition_contract 정책과 동일).
 */

import { useCallback, useEffect, useState } from 'react';
import { MESSAGES } from '@/lib/messages';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AlertCircle, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/services/api-client';

interface SettlementOverviewTotals {
  classCount: number;
  studentCount: number;
  paidCount: number;
  unpaidCount: number;
  paidAmount: number;
  unpaidAmount: number;
  totalAmount: number;
  feeRate?: number;
  platformFee?: number;
  netAmount?: number;
  memberCount?: number;
  outstandingAmount?: number;
  billedAmount?: number;
  outstandingMemberCount?: number;
}

interface SettlementOverviewTeam extends SettlementOverviewTotals {
  teamId: string;
  teamName: string;
  teamCode?: string | null;
}

interface SettlementOverview {
  yearMonth?: string;
  feeRate?: number;
  totals: SettlementOverviewTotals;
  teams: SettlementOverviewTeam[];
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function OverviewTab() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<SettlementOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<SettlementOverview>('/payments/admin/settlement-overview', {
        params: { yearMonth: month },
      });
      // api-client extractData 가 { success, data } 를 풀어주므로 res 가 곧 SettlementOverview.
      const payload =
        res && typeof res === 'object' && 'totals' in res
          ? (res as SettlementOverview)
          : ((res as { data?: SettlementOverview })?.data ?? null);
      if (payload && payload.totals) {
        setData(payload);
      } else {
        setError(MESSAGES.settlement.overviewLoadError);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : MESSAGES.settlement.overviewLoadError);
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const feeRate = data?.totals.feeRate ?? data?.feeRate ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-11 w-40"
          aria-label="결제 현황 조회 월"
        />
      </div>

      {isLoading ? (
        <LoadingSpinner message="정산 개요를 불러오는 중..." />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
          <Button type="button" variant="outline" onClick={() => void load()} className="mt-3">
            다시 시도
          </Button>
        </div>
      ) : data ? (
        <OverviewContent data={data} feeRate={feeRate} />
      ) : null}
    </div>
  );
}

function OverviewContent({ data, feeRate }: { data: SettlementOverview; feeRate: number }) {
  const { totals, teams } = data;
  const totalFee = totals.platformFee ?? 0;
  const totalSettlement = totals.netAmount ?? 0;
  const outstandingAmount = totals.outstandingAmount ?? totals.unpaidAmount;
  const outstandingMemberCount = totals.outstandingMemberCount ?? totals.unpaidCount;

  return (
    <div className="space-y-6">
      {data.yearMonth && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {MESSAGES.settlementDynamic.overviewPeriod(data.yearMonth)}
        </p>
      )}

      {/* 전체 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MiniStatsCard
          title="총 결제 금액"
          value={`${totals.paidAmount.toLocaleString()}원`}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <MiniStatsCard
          title="미수금(확정 청구)"
          value={`${outstandingAmount.toLocaleString()}원`}
          icon={<AlertCircle className="h-5 w-5" />}
          variant="warning"
          description={MESSAGES.settlementDynamic.outstandingMembers(outstandingMemberCount)}
        />
        <MiniStatsCard
          title={`플랫폼 수수료 (${(feeRate * 100).toFixed(0)}%)`}
          value={`${totalFee.toLocaleString()}원`}
          icon={<Receipt className="h-5 w-5" />}
          variant="info"
        />
        <MiniStatsCard
          title="정산 예정액 (결제 수수료 차감 전)"
          value={`${totalSettlement.toLocaleString()}원`}
          icon={<Wallet className="h-5 w-5" />}
          variant="primary"
        />
      </div>

      {/* 부가 통계 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300">
          전체 수업 <strong className="tabular-nums">{totals.classCount}</strong>건
        </span>
        <span className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 text-emerald-700 dark:text-emerald-300">
          결제완료 <strong className="tabular-nums">{totals.paidCount}</strong>명
        </span>
        <span className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 text-amber-700 dark:text-amber-300">
          미수금 <strong className="tabular-nums">{outstandingMemberCount}</strong>명
        </span>
        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300">
          전체 학생 <strong className="tabular-nums">{totals.studentCount}</strong>명
        </span>
      </div>

      {/* 팀별 정산 테이블 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>팀</TableHead>
              <TableHead className="text-right">수업</TableHead>
              <TableHead className="text-right">결제완료</TableHead>
              <TableHead className="text-right">미수금 대상</TableHead>
              <TableHead className="text-right">결제 금액</TableHead>
              <TableHead className="text-right">미수금</TableHead>
              <TableHead className="text-right">수수료 ({(feeRate * 100).toFixed(0)}%)</TableHead>
              <TableHead className="text-right">정산 예정액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500 dark:text-slate-400 py-8">
                  등록된 팀이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              teams.map((t) => {
                const fee = t.platformFee ?? 0;
                const settlement = t.netAmount ?? 0;
                const teamOutstandingAmount = t.outstandingAmount ?? t.unpaidAmount;
                const teamOutstandingCount = t.outstandingMemberCount ?? t.unpaidCount;
                return (
                  <TableRow key={t.teamId}>
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {t.teamCode ? `${t.teamName} (${t.teamCode})` : t.teamName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.classCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {t.paidCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {teamOutstandingCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                      {t.paidAmount.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {teamOutstandingAmount.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {fee.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-primary">
                      {settlement.toLocaleString()}원
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        ※ 미수금은 확정 청구된 금액만 집계합니다(선불 미결제 대기 건 제외). 수수료율은 서버 설정값({(feeRate * 100).toFixed(0)}%)이 결제 완료 금액에만 적용됩니다.
      </p>
    </div>
  );
}

export default OverviewTab;
