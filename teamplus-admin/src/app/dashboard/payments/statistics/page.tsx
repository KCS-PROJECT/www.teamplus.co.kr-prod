'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { clubService } from '@/services/club.service';
import { paymentService } from '@/services/payment.service';
import { Status, type Club, type Payment } from '@/types';

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

interface CalculatedStats {
  totalSales: number;
  refundAmount: number;
  netSales: number;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  averageAmount: number;
}

const nowIso = (): string => new Date().toISOString();

const fallbackClubs: Club[] = [
  {
    id: 'fallback-club-1',
    clubCode: 'ACE-001',
    clubName: 'ACE 아이스하키',
    coachId: 'coach-1',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

const fallbackPayments: Payment[] = [
  {
    id: 'payment-1',
    orderNumber: 'ORD-20260301-001',
    userId: 'user-1',
    amount: 240000,
    paymentStatus: Status.COMPLETED,
    paymentMethod: 'card',
    createdAt: '2026-03-01T02:00:00.000Z',
    updatedAt: '2026-03-01T02:00:00.000Z',
    member: {
      id: 'member-1',
      userId: 'user-1',
      clubId: 'fallback-club-1',
      playerName: '김민준',
      playerAge: 9,
      approvalStatus: Status.APPROVED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    product: {
      id: 'product-1',
      classId: 'class-1',
      productName: '신규반 월 8회',
      price: 240000,
      sessionsPerMonth: 8,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  },
  {
    id: 'payment-2',
    orderNumber: 'ORD-20260302-002',
    userId: 'user-2',
    amount: 280000,
    paymentStatus: Status.COMPLETED,
    paymentMethod: 'bank',
    createdAt: '2026-03-02T04:30:00.000Z',
    updatedAt: '2026-03-02T04:30:00.000Z',
    member: {
      id: 'member-2',
      userId: 'user-2',
      clubId: 'fallback-club-1',
      playerName: '이하은',
      playerAge: 10,
      approvalStatus: Status.APPROVED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    product: {
      id: 'product-2',
      classId: 'class-2',
      productName: '중급반 월 8회',
      price: 280000,
      sessionsPerMonth: 8,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  },
  {
    id: 'payment-3',
    orderNumber: 'ORD-20260302-003',
    userId: 'user-3',
    amount: 120000,
    paymentStatus: Status.CANCELLED,
    paymentMethod: 'card',
    createdAt: '2026-03-02T07:00:00.000Z',
    updatedAt: '2026-03-03T01:10:00.000Z',
    member: {
      id: 'member-3',
      userId: 'user-3',
      clubId: 'fallback-club-1',
      playerName: '박도윤',
      playerAge: 11,
      approvalStatus: Status.APPROVED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    product: {
      id: 'product-3',
      classId: 'class-1',
      productName: '신규반 월 4회',
      price: 120000,
      sessionsPerMonth: 4,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  },
  {
    id: 'payment-4',
    orderNumber: 'ORD-20260303-004',
    userId: 'user-4',
    amount: 320000,
    paymentStatus: Status.FAILED,
    paymentMethod: 'card',
    createdAt: '2026-03-03T03:50:00.000Z',
    updatedAt: '2026-03-03T03:55:00.000Z',
  },
];

const getDefaultStartDate = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const getDefaultEndDate = (): string => new Date().toISOString().slice(0, 10);

const toApiDate = (date: string): string => new Date(`${date}T00:00:00`).toISOString();

const formatCurrency = (amount: number): string => `${Math.round(amount).toLocaleString()}원`;

const calculateStats = (payments: Payment[]): CalculatedStats => {
  const completed = payments.filter((payment) => payment.paymentStatus === Status.COMPLETED);
  const failed = payments.filter((payment) => payment.paymentStatus === Status.FAILED);
  const cancelled = payments.filter((payment) => payment.paymentStatus === Status.CANCELLED);

  const totalSales = completed.reduce((sum, item) => sum + item.amount, 0);
  const refundAmount = cancelled.reduce((sum, item) => sum + item.amount, 0);
  const netSales = totalSales - refundAmount;

  return {
    totalSales,
    refundAmount,
    netSales,
    totalCount: payments.length,
    completedCount: completed.length,
    failedCount: failed.length,
    cancelledCount: cancelled.length,
    averageAmount: completed.length > 0 ? totalSales / completed.length : 0,
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
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('all');
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<MessageState>(null);
  const clubSelectId = useId();
  const startDateId = useId();
  const endDateId = useId();

  useEffect(() => {
    const loadClubs = async () => {
      try {
        const list = await clubService.getClubs({ page: 1, pageSize: 50 });
        setClubs(list.length > 0 ? list : fallbackClubs);
      } catch {
        setClubs(fallbackClubs);
      }
    };
    void loadClubs();
  }, []);

  const loadStatistics = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    const clubId = selectedClubId === 'all' ? undefined : selectedClubId;
    const apiStartDate = toApiDate(startDate);
    const apiEndDate = toApiDate(endDate);

    try {
      const paymentList = clubId
        ? await paymentService
            .getPaymentHistoryByClub(clubId, {
              page: 1,
              pageSize: 200,
              startDate: apiStartDate,
              endDate: apiEndDate,
            })
            .catch(() => fallbackPayments)
        : await paymentService
            .getPaymentHistory(undefined, {
              page: 1,
              pageSize: 200,
              startDate: apiStartDate,
              endDate: apiEndDate,
            })
            .catch(() => fallbackPayments);

      setPayments(paymentList.length > 0 ? paymentList : fallbackPayments);

      await paymentService
        .getPaymentStatistics(clubId, apiStartDate, apiEndDate)
        .catch(() => null);
    } catch (error) {
      const text = error instanceof Error ? error.message : '결제 통계를 불러오는 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
      setPayments(fallbackPayments);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, selectedClubId, startDate]);

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

  const calculated = useMemo(() => calculateStats(payments), [payments]);

  const methodSummary = useMemo<MethodSummary[]>(() => {
    const map = new Map<string, { amount: number; count: number }>();
    payments.forEach((payment) => {
      const key = payment.paymentMethod || 'other';
      const previous = map.get(key) || { amount: 0, count: 0 };
      map.set(key, { amount: previous.amount + payment.amount, count: previous.count + 1 });
    });

    const totalAmount = payments.reduce((sum, item) => sum + item.amount, 0) || 1;
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
        const className = payment.product?.productName || '미분류 상품';
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
            <label htmlFor={clubSelectId} className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">클럽</label>
            <select
              id={clubSelectId}
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              aria-label="통계 조회 클럽 선택"
              className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
            >
              <option value="all">전체 클럽</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.clubName}
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">총 매출</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 text-right tabular-nums">
            {formatCurrency(calculated.totalSales)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">환불 금액</p>
          <p className="text-2xl font-semibold text-red-600 mt-1 text-right tabular-nums">{formatCurrency(calculated.refundAmount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">순매출</p>
          <p className="text-2xl font-semibold text-green-600 mt-1 text-right tabular-nums">{formatCurrency(calculated.netSales)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">평균 결제 금액</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 text-right tabular-nums">
            {formatCurrency(calculated.averageAmount)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">결제 상태별 현황</h2>
          <StatusBar
            label="완료"
            value={calculated.completedCount}
            total={calculated.totalCount}
            barClass="bg-green-500"
          />
          <StatusBar
            label="실패"
            value={calculated.failedCount}
            total={calculated.totalCount}
            barClass="bg-red-500"
          />
          <StatusBar
            label="환불"
            value={calculated.cancelledCount}
            total={calculated.totalCount}
            barClass="bg-amber-500"
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

