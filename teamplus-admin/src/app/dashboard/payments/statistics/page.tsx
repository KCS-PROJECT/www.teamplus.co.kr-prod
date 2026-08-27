'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { clubService } from '@/services/club.service';
import {
  paymentService,
  type AdminPaymentItem,
  type AdminPaymentStats,
} from '@/services/payment.service';
import { Status, type Club } from '@/types';

type MessageState = { type: 'error'; text: string } | null;

interface MethodSummary {
  method: string;
  amount: number;
  count: number;
  ratio: number;
}

interface ClassSummary {
  className: string;
  amount: number;
}

/** 서버 집계(admin/stats)에 없는 파생값만 목록에서 계산한다. */
interface DerivedStats {
  /** 결론이 난 결제 건수 (완료 + 환불 + 실패) — 상태 비율의 분모 */
  settledCount: number;
  averageAmount: number;
}

const getDefaultStartDate = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const getDefaultEndDate = (): string => new Date().toISOString().slice(0, 10);

const toApiDate = (date: string): string => new Date(`${date}T00:00:00`).toISOString();

const formatCurrency = (amount: number): string => `${Math.round(amount).toLocaleString()}원`;

/**
 * 승인된 적 없는 상태 — 금액 집계에서 제외한다.
 *  `cancelled` 는 환불이 아니라 결제 화면 진입 후 이탈·재시도로 버려진 주문이다.
 */
const INCOMPLETE_STATUSES: string[] = [Status.PENDING, Status.CANCELLED];

const sumAmount = (list: AdminPaymentItem[]): number =>
  list.reduce((sum, item) => sum + item.amount, 0);

/** KPI 는 서버 집계를 쓰고, 서버가 주지 않는 값만 목록에서 파생한다. */
const deriveStats = (
  payments: AdminPaymentItem[],
  stats: AdminPaymentStats | null
): DerivedStats => {
  const completed = payments.filter((p) => p.paymentStatus === Status.COMPLETED);

  // 상태 비율의 분모는 전체가 아니라 "결론이 난 건"이다.
  //   전체(totalPayments)에는 결제 화면 진입 후 이탈한 주문이 다수 포함돼 있어,
  //   그대로 분모로 쓰면 완료 비율이 실제보다 훨씬 낮게 보인다.
  const settledCount = stats
    ? stats.completedCount + stats.refundedCount + stats.failedCount
    : payments.filter((p) => !INCOMPLETE_STATUSES.includes(p.paymentStatus)).length;

  return {
    settledCount,
    averageAmount:
      stats && stats.completedCount > 0
        ? stats.totalRevenue / stats.completedCount
        : completed.length > 0
          ? sumAmount(completed) / completed.length
          : 0,
  };
};

const toMethodLabel = (method?: string): string => {
  if (method === 'card') return '카드';
  if (method === 'bank') return '계좌이체';
  if (method === 'mobile') return '휴대폰';
  return '기타';
};

export default function PaymentStatisticsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Club[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('all');
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [stats, setStats] = useState<AdminPaymentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<MessageState>(null);
  const teamSelectId = useId();
  const startDateId = useId();
  const endDateId = useId();

  useEffect(() => {
    const loadTeams = async () => {
      try {
        // 응답 필드는 아직 clubName/clubCode 계약이라 타입은 Club 을 그대로 쓴다.
        const list = await clubService.getClubs({ page: 1, pageSize: 50 });
        setTeams(list);
      } catch {
        setTeams([]);
      }
    };
    void loadTeams();
  }, []);

  const loadStatistics = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    const query = {
      teamId: selectedTeamId === 'all' ? undefined : selectedTeamId,
      startDate: toApiDate(startDate),
      endDate: toApiDate(endDate),
    };

    try {
      // 조회 실패를 빈 목록으로 감추지 않는다 — 매출이 0인 것과 API 가 죽은 것은 다르다.
      const [list, statsResult] = await Promise.all([
        paymentService.getAdminPaymentList({ ...query, page: 1, limit: 200 }),
        paymentService.getAdminPaymentStats(query),
      ]);

      setPayments(list.data ?? []);
      setStats(statsResult);
    } catch (error) {
      const text = error instanceof Error ? error.message : '결제 통계를 불러오는 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
      setPayments([]);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, selectedTeamId, startDate]);

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

  const derived = useMemo(() => deriveStats(payments, stats), [payments, stats]);

  const methodSummary = useMemo<MethodSummary[]>(() => {
    // 매출 비중이므로 승인된 결제만 집계한다 — 이탈·진행 중 건이 섞이면 비중이 왜곡된다.
    const approved = payments.filter(
      (p) => !INCOMPLETE_STATUSES.includes(p.paymentStatus) && p.paymentStatus !== Status.FAILED,
    );
    const map = new Map<string, { amount: number; count: number }>();
    approved.forEach((payment) => {
      const key = payment.paymentMethod || 'other';
      const previous = map.get(key) || { amount: 0, count: 0 };
      map.set(key, { amount: previous.amount + payment.amount, count: previous.count + 1 });
    });

    const totalAmount = sumAmount(approved) || 1;
    return Array.from(map.entries())
      .map(([method, summary]) => ({
        method,
        amount: summary.amount,
        count: summary.count,
        ratio: Math.round((summary.amount / totalAmount) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [payments]);

  const classSummary = useMemo<ClassSummary[]>(() => {
    const map = new Map<string, number>();
    payments
      .filter((payment) => payment.paymentStatus === Status.COMPLETED)
      .forEach((payment) => {
        const className = payment.productName || '미분류 상품';
        const amount = map.get(className) || 0;
        map.set(className, amount + payment.amount);
      });

    return Array.from(map.entries())
      .map(([className, amount]) => ({ className, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [payments]);

  if (isLoading) {
    return <LoadingSpinner message="결제 통계를 불러오는 중입니다..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="결제 통계"
        subtitle="기간/클럽별 매출 및 환불 추이를 확인합니다."
        actions={[
          {
            label: '결제 내역',
            onClick: () => router.push('/dashboard/payments'),
            icon: ArrowLeft,
            variant: 'outline',
          },
          {
            label: '환불 요청',
            onClick: () => router.push('/dashboard/payments/refunds'),
            variant: 'secondary',
          },
        ]}
      />

      <Card className="p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label htmlFor={teamSelectId} className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">팀</label>
            <select
              id={teamSelectId}
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              aria-label="통계 조회 팀 선택"
              className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
            >
              <option value="all">전체 팀</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.clubName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={startDateId} className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">시작일</label>
            <input
              id={startDateId}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="통계 조회 시작일 선택"
              className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor={endDateId} className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">종료일</label>
            <input
              id={endDateId}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="통계 조회 종료일 선택"
              className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full min-h-[44px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors motion-reduce:transition-none"
              onClick={() => void loadStatistics()}
              aria-label="선택한 조건으로 통계 갱신"
            >
              통계 갱신
            </button>
          </div>
        </div>
      </Card>

      {message && (
        <Card className="p-4 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm">
          {message.text}
        </Card>
      )}

      {!message && payments.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            선택한 기간에 결제 내역이 없습니다.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            조회 기간이나 팀을 바꿔서 다시 확인해보세요.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">총 결제</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 text-right tabular-nums">
            {formatCurrency(stats?.totalRevenue ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">환불 금액</p>
          <p className="text-2xl font-semibold text-red-600 mt-1 text-right tabular-nums">
            {formatCurrency(stats?.totalRefunded ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">순매출</p>
          <p className="text-2xl font-semibold text-green-600 mt-1 text-right tabular-nums">
            {formatCurrency(stats?.netRevenue ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">평균 결제 금액</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 text-right tabular-nums">
            {formatCurrency(derived.averageAmount)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">결제 상태별 현황</h2>
          <StatusBar
            label="완료"
            value={stats?.completedCount ?? 0}
            total={derived.settledCount}
            barClass="bg-green-500"
          />
          <StatusBar
            label="환불"
            value={stats?.refundedCount ?? 0}
            total={derived.settledCount}
            barClass="bg-amber-500"
          />
          <StatusBar
            label="실패"
            value={stats?.failedCount ?? 0}
            total={derived.settledCount}
            barClass="bg-red-500"
          />
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">결제 방법별 비중</h2>
          {methodSummary.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">집계 가능한 결제 데이터가 없습니다.</p>
          ) : (
            methodSummary.map((item) => (
              <div key={item.method} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{toMethodLabel(item.method)}</span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                    {item.ratio}% ({item.count}건)
                  </span>
                </div>
                <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${item.ratio}%` }} />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">수업별 매출 상위 5개</h2>
        {classSummary.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">수업별 매출 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {classSummary.map((item, index) => (
              <div
                key={`${item.className}-${index}`}
                className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center justify-between text-sm"
              >
                <span className="text-slate-700 dark:text-slate-300">{item.className}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-right tabular-nums">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusBar({
  label,
  value,
  total,
  barClass,
}: {
  label: string;
  value: number;
  total: number;
  barClass: string;
}) {
  const ratio = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
          {value}건 ({ratio}%)
        </span>
      </div>
      <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full ${barClass}`} style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

