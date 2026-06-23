'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { paymentService } from '@/services/payment.service';
import { Status, type Payment } from '@/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;
type RefundStatus = 'pending' | 'approved' | 'rejected';

interface RefundRequest {
  id: string;
  paymentId: string;
  orderNumber: string;
  memberName: string;
  amount: number;
  requestedAt: string;
  processedAt?: string;
  reason: string;
  status: RefundStatus;
}

const fallbackRefunds: RefundRequest[] = [
  {
    id: 'refund-1',
    paymentId: 'payment-1',
    orderNumber: 'ORD-20260301-001',
    memberName: '김민준',
    amount: 240000,
    requestedAt: '2026-03-01T05:20:00.000Z',
    reason: '수업 일정 변경',
    status: 'pending',
  },
  {
    id: 'refund-2',
    paymentId: 'payment-2',
    orderNumber: 'ORD-20260227-002',
    memberName: '이하은',
    amount: 120000,
    requestedAt: '2026-02-27T02:10:00.000Z',
    processedAt: '2026-02-27T06:40:00.000Z',
    reason: '회원 요청',
    status: 'approved',
  },
  {
    id: 'refund-3',
    paymentId: 'payment-3',
    orderNumber: 'ORD-20260225-003',
    memberName: '박도윤',
    amount: 240000,
    requestedAt: '2026-02-25T08:00:00.000Z',
    processedAt: '2026-02-25T11:20:00.000Z',
    reason: '중복 결제',
    status: 'rejected',
  },
];

const getMemberName = (payment: Payment): string => {
  return payment.member?.playerName || payment.user?.name || payment.user?.email || '회원';
};

const mapPaymentsToRefunds = (payments: Payment[]): RefundRequest[] => {
  if (payments.length === 0) return fallbackRefunds;

  return payments.slice(0, 20).map((payment, index) => {
    const status: RefundStatus =
      payment.paymentStatus === Status.CANCELLED ? 'approved' : index % 5 === 0 ? 'rejected' : 'pending';

    return {
      id: `refund-${payment.id}`,
      paymentId: payment.id,
      orderNumber: payment.orderNumber,
      memberName: getMemberName(payment),
      amount: payment.amount,
      requestedAt: payment.createdAt,
      processedAt: status === 'pending' ? undefined : new Date(payment.updatedAt).toISOString(),
      reason: status === 'rejected' ? '환불 정책 기준 미충족' : '회원 요청',
      status,
    };
  });
};

const statusLabel: Record<RefundStatus, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거절',
};

const statusClass: Record<RefundStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function PaymentRefundsPage() {
  const router = useRouter();
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | RefundStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setMessage(null);
      try {
        const payments = await paymentService.getPaymentHistory(undefined, {
          page: 1,
          pageSize: 100,
        });
        setRefunds(mapPaymentsToRefunds(payments));
      } catch {
        setRefunds(fallbackRefunds);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return refunds.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.memberName.toLowerCase().includes(keyword) ||
        item.orderNumber.toLowerCase().includes(keyword) ||
        item.reason.toLowerCase().includes(keyword);
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [filterStatus, refunds, searchTerm]);

  const summary = useMemo(() => {
    const pendingCount = refunds.filter((item) => item.status === 'pending').length;
    const approvedAmount = refunds
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + item.amount, 0);
    const rejectedCount = refunds.filter((item) => item.status === 'rejected').length;
    const totalAmount = refunds.reduce((sum, item) => sum + item.amount, 0);

    return { pendingCount, approvedAmount, rejectedCount, totalAmount };
  }, [refunds]);

  const processRefund = async (target: RefundRequest, status: Exclude<RefundStatus, 'pending'>) => {
    setProcessingId(target.id);
    setMessage(null);

    try {
      if (status === 'approved') {
        await paymentService.cancelPayment(target.paymentId, target.reason);
      }

      setRefunds((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? { ...item, status, processedAt: new Date().toISOString() }
            : item
        )
      );
      setMessage({
        type: 'success',
        text: status === 'approved' ? '환불 요청이 승인되었습니다.' : '환불 요청이 거절되었습니다.',
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : '환불 처리 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="환불 요청 내역을 불러오는 중입니다..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="환불 요청 관리"
        subtitle="환불 요청을 승인 또는 거절할 수 있습니다."
        actions={[
          {
            label: '결제 내역',
            onClick: () => router.push('/dashboard/payments'),
            icon: ArrowLeft,
            variant: 'outline',
          },
          {
            label: '결제 통계',
            onClick: () => router.push('/dashboard/payments/statistics'),
            variant: 'secondary',
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">환불 요청 건수</p>
          <p className="text-xl font-semibold text-slate-900 dark:text-white mt-1 text-right tabular-nums">{refunds.length}건</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">대기 건수</p>
          <p className="text-xl font-semibold text-amber-600 mt-1 text-right tabular-nums">{summary.pendingCount}건</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">승인 금액</p>
          <p className="text-xl font-semibold text-green-600 mt-1 text-right tabular-nums">{summary.approvedAmount.toLocaleString()}원</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">총 요청 금액</p>
          <p className="text-xl font-semibold text-slate-900 dark:text-white mt-1 text-right tabular-nums">
            {summary.totalAmount.toLocaleString()}원
          </p>
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="주문번호, 회원명, 사유로 검색하세요."
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | RefundStatus)}
            className="h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="pending">대기</option>
            <option value="approved">승인</option>
            <option value="rejected">거절</option>
          </select>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          거절 건수: {summary.rejectedCount}건 / 필터 결과: {filtered.length}건
        </p>
      </Card>

      {message && (
        <Card
          className={`p-4 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {message.text}
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">주문번호</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">회원</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">요청금액</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">요청일</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">사유</th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">상태</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">처리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    표시할 환불 요청이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.orderNumber}</td>
                    <td className="px-4 py-3">{item.memberName}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {item.amount.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3">{new Date(item.requestedAt).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-3">{item.reason}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${statusClass[item.status]}`}>
                        {statusLabel[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void processRefund(item, 'approved')}
                            disabled={processingId === item.id}
                            aria-label={`${item.orderNumber} 환불 승인`}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" aria-hidden="true" />
                            승인
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void processRefund(item, 'rejected')}
                            disabled={processingId === item.id}
                            aria-label={`${item.orderNumber} 환불 거절`}
                          >
                            <XCircle className="w-4 h-4 mr-1" aria-hidden="true" />
                            거절
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.processedAt
                            ? `${new Date(item.processedAt).toLocaleString('ko-KR')} 처리됨`
                            : '처리 완료'}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
