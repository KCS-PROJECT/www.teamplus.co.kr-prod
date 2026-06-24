'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type MessageState = { type: 'success' | 'error'; text: string } | null;
type HistoryStatus = 'pending' | 'sent' | 'delivered' | 'failed';
type HistoryChannel = 'alimtalk' | 'push' | 'sms';

interface NotificationHistory {
  id: string;
  title: string;
  templateName: string;
  channel: HistoryChannel;
  target: string;
  sentAt: string;
  receiverCount: number;
  successCount: number;
  status: HistoryStatus;
  failReason?: string;
}

const seedData: NotificationHistory[] = [
  {
    id: 'history-1',
    title: '결제 완료 안내',
    templateName: 'PAYMENT_SUCCESS',
    channel: 'alimtalk',
    target: '전체 회원',
    sentAt: '2026-03-05T01:30:00.000Z',
    receiverCount: 42,
    successCount: 42,
    status: 'delivered',
  },
  {
    id: 'history-2',
    title: '수업 취소 안내',
    templateName: 'CLASS_CANCELLED',
    channel: 'alimtalk',
    target: '중급 스케이팅반',
    sentAt: '2026-03-04T07:10:00.000Z',
    receiverCount: 12,
    successCount: 11,
    status: 'failed',
    failReason: '일부 수신자 전화번호 형식 오류',
  },
  {
    id: 'history-3',
    title: '출석 체크 리마인더',
    templateName: 'ATTENDANCE_REMINDER',
    channel: 'push',
    target: '오늘 수업 대상자',
    sentAt: '2026-03-04T23:00:00.000Z',
    receiverCount: 37,
    successCount: 37,
    status: 'sent',
  },
  {
    id: 'history-4',
    title: '결제권 만료 안내',
    templateName: 'CREDIT_EXPIRING',
    channel: 'sms',
    target: '만료 예정 회원',
    sentAt: '2026-03-03T08:20:00.000Z',
    receiverCount: 9,
    successCount: 9,
    status: 'delivered',
  },
  {
    id: 'history-5',
    title: '회원 승인 완료',
    templateName: 'MEMBERSHIP_APPROVED',
    channel: 'alimtalk',
    target: '승인 완료 회원',
    sentAt: '2026-03-03T01:45:00.000Z',
    receiverCount: 5,
    successCount: 0,
    status: 'pending',
  },
];

const statusLabel: Record<HistoryStatus, string> = {
  pending: '대기',
  sent: '발송됨',
  delivered: '도달',
  failed: '실패',
};

const statusClass: Record<HistoryStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  sent: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  delivered: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const channelLabel: Record<HistoryChannel, string> = {
  alimtalk: '알림톡',
  push: '푸시',
  sms: 'SMS',
};

export default function NotificationHistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationHistory[]>(seedData);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HistoryStatus>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | HistoryChannel>('all');
  const [message, setMessage] = useState<MessageState>(null);

  const filtered = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        item.templateName.toLowerCase().includes(keyword) ||
        item.target.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesChannel = channelFilter === 'all' || item.channel === channelFilter;
      return matchesSearch && matchesStatus && matchesChannel;
    });
  }, [channelFilter, items, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    const total = items.length;
    const delivered = items.filter((item) => item.status === 'delivered').length;
    const failed = items.filter((item) => item.status === 'failed').length;
    const pending = items.filter((item) => item.status === 'pending').length;
    return { total, delivered, failed, pending };
  }, [items]);

  const retryFailed = (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.status !== 'failed') return;

    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'sent',
              failReason: undefined,
              sentAt: new Date().toISOString(),
            }
          : item
      )
    );

    setMessage({ type: 'success', text: '재발송 요청이 접수되었습니다.' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="알림 발송 이력"
        subtitle="알림 발송 결과와 실패 사유를 확인합니다."
        actions={[
          {
            label: '알림 발송',
            onClick: () => router.push('/dashboard/notifications'),
            icon: ArrowLeft,
            variant: 'outline',
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">총 발송 건수</p>
          <p className="text-xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">{summary.total}건</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">도달 완료</p>
          <p className="text-xl font-semibold text-green-600 dark:text-green-400 mt-1 tabular-nums">{summary.delivered}건</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">실패</p>
          <p className="text-xl font-semibold text-red-600 dark:text-red-400 mt-1 tabular-nums">{summary.failed}건</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">대기</p>
          <p className="text-xl font-semibold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{summary.pending}건</p>
        </Card>
      </div>

      <Card className="p-5 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="알림 제목, 템플릿, 대상 검색"
            aria-label="알림 발송 이력 검색"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | HistoryStatus)}
            aria-label="상태 필터"
            className="h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-200 px-3 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="pending">대기</option>
            <option value="sent">발송됨</option>
            <option value="delivered">도달</option>
            <option value="failed">실패</option>
          </select>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as 'all' | HistoryChannel)}
            aria-label="채널 필터"
            className="h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-200 px-3 text-sm"
          >
            <option value="all">전체 채널</option>
            <option value="alimtalk">알림톡</option>
            <option value="push">푸시</option>
            <option value="sms">SMS</option>
          </select>
        </div>
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

      <Card className="p-0 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">제목</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">채널</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">대상</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">발송시각</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">성공/대상</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">상태</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">처리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    조건에 맞는 발송 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors motion-reduce:transition-none">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.templateName}</p>
                      {item.failReason && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{item.failReason}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{channelLabel[item.channel]}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.target}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">{new Date(item.sentAt).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                      {item.successCount} / {item.receiverCount}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusClass[item.status]}>{statusLabel[item.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'failed' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => retryFailed(item.id)}
                          className="gap-1 motion-reduce:transition-none"
                          aria-label={`${item.title} 재발송하기`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          재발송
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
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

