'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, TrendingUp, TrendingDown, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { api } from '@/services/api-client';

interface PointTransaction {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: 'EARN' | 'USE' | 'EXPIRE' | 'ADJUST' | 'REFUND';
  amount: number;
  balance: number;
  description?: string;
  referenceId?: string;
  referenceType?: string;
  expiresAt?: string;
  createdAt: string;
}

const typeLabels: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  EARN:   { label: '적립',    color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',     icon: TrendingUp },
  USE:    { label: '사용',    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',         icon: TrendingDown },
  EXPIRE: { label: '만료',    color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',        icon: AlertCircle },
  ADJUST: { label: '조정',    color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', icon: RefreshCw },
  REFUND: { label: '환불복구', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', icon: RefreshCw },
};

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: { username: string; email: string };
}

interface AuditLogResponse {
  data: AuditLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function mapAuditLogToTransaction(log: AuditLog): PointTransaction {
  // 백엔드는 `newValue` 필드에 데이터를 저장 (타입에는 `metadata`로 정의됨)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (log as any).newValue ?? log.metadata ?? {};
  const amount = typeof raw.amount === 'number' ? (raw.amount as number) : 0;
  const balance = typeof raw.balance === 'number' ? (raw.balance as number) : 0;
  return {
    id: log.id,
    userId: typeof raw.targetUserId === 'string' ? raw.targetUserId : log.userId,
    userName: log.user?.username ?? '관리자',
    userEmail: log.user?.email ?? '',
    type: 'ADJUST',
    amount,
    balance,
    description: typeof raw.reason === 'string' ? raw.reason : log.action,
    createdAt: new Date(log.createdAt).toLocaleString('ko-KR'),
  };
}

export default function PointsHistoryPage() {
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<AuditLogResponse>(
        '/admin/audit-logs?action=POINTS_ADJUSTED&limit=100'
      );
      setTransactions((res.data ?? []).map(mapAuditLogToTransaction));
    } catch (error) {
      console.error('[PointsPage] 포인트 내역 로드 실패:', error);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesType = typeFilter === 'all' || tx.type === typeFilter;
    // dateFilter 로직 생략 (실제로는 날짜 비교 필요)
    return matchesSearch && matchesType;
  });

  const getStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayTx = transactions.filter((tx) => tx.createdAt.startsWith(today.replace(/-/g, '-')));

    const earnTotal = transactions
      .filter((tx) => tx.type === 'EARN' || tx.type === 'REFUND')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const useTotal = transactions
      .filter((tx) => tx.type === 'USE')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const expireTotal = transactions
      .filter((tx) => tx.type === 'EXPIRE')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return { earnTotal, useTotal, expireTotal, todayCount: todayTx.length };
  };

  const stats = getStats();

  const handleExport = async () => {
    if (filteredTransactions.length === 0) return;
    try {
      const XLSX = await import('xlsx');
      const rows = filteredTransactions.map((tx) => ({
        일시: tx.createdAt,
        회원명: tx.userName,
        이메일: tx.userEmail,
        유형: typeLabels[tx.type]?.label ?? tx.type,
        포인트: tx.amount,
        잔액: tx.balance,
        설명: tx.description ?? '',
        참조유형: tx.referenceType ?? '',
        참조ID: tx.referenceId ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '포인트 내역');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `포인트내역_${today}.xlsx`);
    } catch (error) {
      console.error('[PointsPage] 엑셀 내보내기 실패:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="포인트 내역을 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="포인트 내역"
        description="전체 포인트 거래 내역을 조회합니다."
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-4 w-4 text-green-500" />
            총 적립
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            +{stats.earnTotal.toLocaleString()}P
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <TrendingDown className="h-4 w-4 text-blue-500" />
            총 사용
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            -{stats.useTotal.toLocaleString()}P
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <AlertCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            총 만료
          </div>
          <div className="text-2xl font-bold text-slate-600 dark:text-slate-300">
            -{stats.expireTotal.toLocaleString()}P
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
          <div className="text-sm text-slate-500 dark:text-slate-400">전체 거래</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{transactions.length}건</div>
        </div>
      </div>

      {/* 필터 및 액션 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md p-4">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="회원명, 이메일, 설명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="포인트 내역 검색"
              className="pl-10 h-11"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-32 h-11">
              <SelectValue placeholder="유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              <SelectItem value="EARN">적립</SelectItem>
              <SelectItem value="USE">사용</SelectItem>
              <SelectItem value="EXPIRE">만료</SelectItem>
              <SelectItem value="ADJUST">조정</SelectItem>
              <SelectItem value="REFUND">환불복구</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-32 h-11">
              <SelectValue placeholder="기간" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기간</SelectItem>
              <SelectItem value="today">오늘</SelectItem>
              <SelectItem value="week">최근 7일</SelectItem>
              <SelectItem value="month">최근 30일</SelectItem>
              <SelectItem value="quarter">최근 3개월</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleExport} className="min-h-[44px]">
          <Download className="h-4 w-4 mr-2" aria-hidden="true" />
          내보내기
        </Button>
      </div>

      {/* 거래 내역 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <TableHead className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">일시</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">회원</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">유형</TableHead>
              <TableHead className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">포인트</TableHead>
              <TableHead className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">잔액</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">설명</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">참조</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                  거래 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((tx) => {
                const typeInfo = typeLabels[tx.type];
                const Icon = typeInfo.icon;
                return (
                  <TableRow key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <TableCell className="px-4 py-4 text-center">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{tx.createdAt}</span>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-center">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{tx.userName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{tx.userEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-center">
                      <div className="flex justify-center">
                        <Badge className={typeInfo.color}>
                          <Icon className="h-3 w-3 mr-1" />
                          {typeInfo.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right">
                      <span
                        className={`font-semibold tabular-nums ${
                          tx.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {tx.amount > 0 ? '+' : ''}
                        {tx.amount.toLocaleString()}P
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right">
                      <span className="text-slate-600 dark:text-slate-300 tabular-nums">{tx.balance.toLocaleString()}P</span>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        {tx.description || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-center">
                      {tx.referenceId ? (
                        <div className="text-xs">
                          <span className="text-slate-400 dark:text-slate-500">{tx.referenceType}: </span>
                          <span className="text-blue-600 dark:text-blue-400">{tx.referenceId}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
