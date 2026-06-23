'use client';

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { PageHeader } from '@/components/ui/page-header';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { AdminTabs } from '@/components/ui/admin-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Wallet,
  Search,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  Eye,
  TrendingUp,
  Users,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/services/api-client';

type SettlementStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'paid'
  | 'rejected'
  | 'failed';

interface Settlement {
  id: string;
  coachId: string;
  coachName: string;
  coachEmail: string;
  period: string;
  classCount: number;
  studentCount: number;
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  netAmount: number;
  status: SettlementStatus;
  bankName?: string;
  accountNumber?: string;
  requestedAt: string;
  processedAt?: string;
  note?: string;
}

interface ApiSettlement {
  id: string;
  clubId: string;
  settlementMonth: string;
  totalRevenue: number;
  platformFee: number;
  paymentFee: number;
  netAmount: number;
  status: string;
  bankName?: string;
  bankAccount?: string;
  accountHolder?: string;
  completedAt?: string;
  createdAt: string;
  club: { id: string; clubName: string };
}

interface _ApiSettlementResponse {
  data: ApiSettlement[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function normalizeSettlementStatus(status?: string): SettlementStatus {
  const value = (status ?? '').toLowerCase();
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'paid' ||
    value === 'rejected' ||
    value === 'failed'
  ) {
    return value;
  }
  return 'pending';
}

function extractSettlementItems(payload: unknown): ApiSettlement[] {
  if (Array.isArray(payload)) return payload as ApiSettlement[];

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as ApiSettlement[];
    if (Array.isArray(obj.items)) return obj.items as ApiSettlement[];

    // 일부 응답은 data 안에 또 data/items를 담아서 내려올 수 있음
    const nested = obj.data;
    if (nested && typeof nested === 'object') {
      const nestedObj = nested as Record<string, unknown>;
      if (Array.isArray(nestedObj.data)) return nestedObj.data as ApiSettlement[];
      if (Array.isArray(nestedObj.items)) return nestedObj.items as ApiSettlement[];
    }
  }

  return [];
}

function mapApiSettlement(item: ApiSettlement): Settlement {
  const commissionAmount = (item.platformFee ?? 0) + (item.paymentFee ?? 0);
  const grossAmount = item.totalRevenue ?? 0;
  const commissionRate = grossAmount > 0 ? Math.round((commissionAmount / grossAmount) * 100) : 0;
  return {
    id: item.id,
    coachId: item.clubId,
    coachName: item.club?.clubName ?? '',
    coachEmail: '',
    period: item.settlementMonth,
    classCount: 0,
    studentCount: 0,
    grossAmount,
    commissionRate,
    commissionAmount,
    netAmount: item.netAmount ?? 0,
    status: normalizeSettlementStatus(item.status),
    bankName: item.bankName ?? undefined,
    accountNumber: item.bankAccount ?? undefined,
    requestedAt: item.createdAt ? item.createdAt.split('T')[0] : '',
    processedAt: item.completedAt ? item.completedAt.split('T')[0] : undefined,
  };
}

const statusLabels: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: '대기중', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: '승인됨', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  processing: { label: '처리중', color: 'bg-purple-100 text-purple-700', icon: Clock },
  completed: { label: '완료', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  paid: { label: '지급완료', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: '거절', color: 'bg-red-100 text-red-700', icon: XCircle },
  failed: { label: '실패', color: 'bg-red-100 text-red-700', icon: XCircle },
};


// [추가 2026-05-14] 정산 탭 키 — string literal 제네릭을 직접 useState 에 쓰면
//  SWC TSX 파서가 `<'coach'` 를 JSX 로 오인하므로 type alias 로 분리.
type SettlementTab = 'coach' | 'class';

export default function SettlementsPage() {
  // [추가 2026-05-14] 탭 — 수업 결제 정산(기본) / 코치 정산
  const [activeTab, setActiveTab] = useState<SettlementTab>('class');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);

  const loadSettlements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<unknown>('/settlements?limit=100');
      const items = extractSettlementItems(res);
      setSettlements(items.map(mapApiSettlement));
    } catch (error) {
      console.error('[SettlementsPage] 정산 목록 로드 실패:', error);
      setSettlements([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  const settlementList = Array.isArray(settlements) ? settlements : [];

  const filteredSettlements = settlementList.filter((settlement) => {
    const matchesSearch =
      settlement.coachName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      settlement.coachEmail.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || settlement.status === statusFilter;
    const matchesPeriod = periodFilter === 'all' || settlement.period === periodFilter;
    return matchesSearch && matchesStatus && matchesPeriod;
  });

  const getStats = () => {
    const pendingAmount = settlementList
      .filter((s) => s.status === 'pending')
      .reduce((sum, s) => sum + s.netAmount, 0);
    const completedAmount = settlementList
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + s.netAmount, 0);
    const pendingCount = settlementList.filter((s) => s.status === 'pending').length;
    const totalCoaches = new Set(settlementList.map((s) => s.coachId)).size;

    return { pendingAmount, completedAmount, pendingCount, totalCoaches };
  };

  const stats = getStats();

  const handleViewDetail = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setIsDetailOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedSettlement) return;
    setIsProcessing(true);
    try {
      await api.post(`/settlements/${selectedSettlement.id}/approve`, {});
      setIsDetailOpen(false);
      setActionMsg({ type: 'success', text: MESSAGES.settlement.approved });
      setTimeout(() => setActionMsg(null), 3000);
      loadSettlements();
    } catch (error) {
      console.error('[SettlementsPage] 정산 승인 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.settlement.approveError });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectConfirmed = async () => {
    if (!selectedSettlement) return;
    setIsProcessing(true);
    try {
      await api.patch(`/settlements/${selectedSettlement.id}/reject`, { reason: '관리자 거절' });
      setIsDetailOpen(false);
      setConfirmAction(null);
      setActionMsg({ type: 'success', text: MESSAGES.settlement.rejected });
      setTimeout(() => setActionMsg(null), 3000);
      loadSettlements();
    } catch (error) {
      console.error('[SettlementsPage] 정산 거절 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.settlement.rejectError });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = () => {
    if (!selectedSettlement) return;
    setConfirmAction({ id: selectedSettlement.id, action: 'reject' });
  };

  const handlePayoutConfirmed = async () => {
    if (!selectedSettlement) return;
    setIsProcessing(true);
    try {
      await api.post(`/settlements/${selectedSettlement.id}/payout`, {});
      setIsPayoutOpen(false);
      setIsDetailOpen(false);
      setActionMsg({ type: 'success', text: MESSAGES.settlementDynamic.paid(selectedSettlement.netAmount) });
      setTimeout(() => setActionMsg(null), 4000);
      loadSettlements();
    } catch (error) {
      console.error('[SettlementsPage] 정산 지급 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.settlement.payError });
      setIsPayoutOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    setActionMsg({ type: 'success', text: MESSAGES.settlement.csvExported });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const periods = [...new Set(settlementList.map((s) => s.period))].sort().reverse();

  if (isLoading) {
    return <LoadingSpinner message="정산 내역을 불러오는 중..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      <PageHeader
        title="정산 관리"
        description="코치 정산과 팀별 수업 결제 정산을 관리합니다."
      />

      {/* [추가 2026-05-14] 탭 — 수업 결제 정산(첫 번째) / 코치 정산 */}
      <AdminTabs
        tabs={[
          { id: 'class', label: '수업 결제 정산' },
          { id: 'coach', label: '코치 정산' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as SettlementTab)}
        variant="segment"
      />

      {activeTab === 'class' && <ClassSettlementTab />}

      {activeTab === 'coach' && (
      <>
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MiniStatsCard
          title="대기중 정산"
          value={`${stats.pendingCount}건`}
          icon={<AlertCircle className="h-5 w-5" />}
          variant="warning"
        />
        <MiniStatsCard
          title="대기중 금액"
          value={`${stats.pendingAmount.toLocaleString()}원`}
          icon={<Wallet className="h-5 w-5" />}
          variant="info"
        />
        <MiniStatsCard
          title="완료 금액 (전체)"
          value={`${stats.completedAmount.toLocaleString()}원`}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <MiniStatsCard
          title="등록 코치"
          value={`${stats.totalCoaches}명`}
          icon={<Users className="h-5 w-5" />}
          variant="primary"
        />
      </div>

      {/* 필터 및 액션 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              type="search"
              placeholder="코치명 또는 이메일 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 pl-10"
              aria-label="코치명 또는 이메일 검색"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="pending">대기중</SelectItem>
              <SelectItem value="approved">승인됨</SelectItem>
              <SelectItem value="processing">처리중</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="paid">지급완료</SelectItem>
              <SelectItem value="rejected">거절</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="정산 기간" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기간</SelectItem>
              {periods.map((period) => (
                <SelectItem key={period} value={period}>
                  {period}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={handleExport} className="h-11">
          <Download className="h-4 w-4 mr-2" aria-hidden="true" />
          내보내기
        </Button>
      </div>

      {/* 정산 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>코치</TableHead>
              <TableHead>정산 기간</TableHead>
              <TableHead>수업 수</TableHead>
              <TableHead className="text-right">총 매출</TableHead>
              <TableHead className="text-right">수수료</TableHead>
              <TableHead className="text-right">정산 금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : filteredSettlements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                  정산 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredSettlements.map((settlement) => {
                const statusInfo = statusLabels[settlement.status] ?? statusLabels.pending;
                const StatusIcon = statusInfo.icon;
                return (
                  <TableRow key={settlement.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{settlement.coachName}</p>
                        <p className="text-sm text-slate-500">{settlement.coachEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {settlement.period}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{settlement.classCount}회</p>
                        <p className="text-sm text-slate-500">{settlement.studentCount}명 수강</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium tabular-nums text-slate-900 dark:text-white">{settlement.grossAmount.toLocaleString()}원</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        <p className="text-red-600 dark:text-red-400 tabular-nums">-{settlement.commissionAmount.toLocaleString()}원</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">({settlement.commissionRate}%)</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-bold text-primary tabular-nums">
                        {settlement.netAmount.toLocaleString()}원
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusInfo.color}>
                        <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost-primary"
                        size="sm"
                        onClick={() => handleViewDetail(settlement)}
                        aria-label={`${settlement.coachName} 정산 상세 보기`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 정산 상세 다이얼로그 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>정산 상세</DialogTitle>
            <DialogDescription>
              정산 내역을 확인하고 승인 또는 거절할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {selectedSettlement && (
            <div className="space-y-6">
              {/* 코치 정보 */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedSettlement.coachName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{selectedSettlement.coachEmail}</p>
                  </div>
                  <Badge className={(statusLabels[selectedSettlement.status] ?? statusLabels.pending).color}>
                    {(statusLabels[selectedSettlement.status] ?? statusLabels.pending).label}
                  </Badge>
                </div>
              </div>

              {/* 정산 내역 */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                  <Receipt className="h-4 w-4" aria-hidden="true" />
                  정산 내역
                </h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <dt className="text-slate-500 dark:text-slate-400">정산 기간</dt>
                    <dd className="text-slate-900 dark:text-white tabular-nums">{selectedSettlement.period}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <dt className="text-slate-500 dark:text-slate-400">수업 횟수</dt>
                    <dd className="text-slate-900 dark:text-white tabular-nums">{selectedSettlement.classCount}회</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <dt className="text-slate-500 dark:text-slate-400">수강생 수</dt>
                    <dd className="text-slate-900 dark:text-white tabular-nums">{selectedSettlement.studentCount}명</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <dt className="text-slate-500 dark:text-slate-400">총 매출</dt>
                    <dd className="font-medium text-slate-900 dark:text-white tabular-nums">{selectedSettlement.grossAmount.toLocaleString()}원</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <dt className="text-slate-500 dark:text-slate-400">수수료 ({selectedSettlement.commissionRate}%)</dt>
                    <dd className="text-red-600 dark:text-red-400 tabular-nums">-{selectedSettlement.commissionAmount.toLocaleString()}원</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <dt className="text-slate-700 dark:text-slate-200 font-medium">정산 금액</dt>
                    <dd className="font-bold text-primary tabular-nums">{selectedSettlement.netAmount.toLocaleString()}원</dd>
                  </div>
                </dl>
              </div>

              {/* 계좌 정보 */}
              {selectedSettlement.bankName && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    입금 계좌
                  </h4>
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-900 dark:text-white tabular-nums">
                      {selectedSettlement.bankName} {selectedSettlement.accountNumber}
                    </p>
                  </div>
                </div>
              )}

              {/* 일정 */}
              <div className="text-sm text-slate-500 dark:text-slate-400 space-y-0.5">
                <p>요청일: <span className="tabular-nums">{selectedSettlement.requestedAt}</span></p>
                {selectedSettlement.processedAt && (
                  <p>처리일: <span className="tabular-nums">{selectedSettlement.processedAt}</span></p>
                )}
              </div>
            </div>
          )}

          {confirmAction?.action === 'reject' && selectedSettlement && (
            <div
              className="flex items-center gap-2 mx-6 mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
              role="alert"
            >
              <span className="text-sm text-red-700 dark:text-red-400 flex-1">정말 정산을 거절하시겠습니까?</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-8 text-xs">취소</Button>
              <Button type="button" size="sm" variant="destructive" onClick={handleRejectConfirmed} className="h-8 text-xs">거절하기</Button>
            </div>
          )}
          <DialogFooter>
            {selectedSettlement?.status === 'pending' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  거절
                </Button>
                <Button type="button" onClick={handleApprove} disabled={isProcessing}>
                  {isProcessing ? '처리 중...' : '승인하기'}
                </Button>
              </>
            )}
            {selectedSettlement?.status === 'approved' && (
              <>
                <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>
                  닫기
                </Button>
                <Button
                  type="button"
                  onClick={() => setIsPayoutOpen(true)}
                  disabled={isProcessing}
                  variant="success"
                >
                  지급하기
                </Button>
              </>
            )}
            {selectedSettlement?.status !== 'pending' && selectedSettlement?.status !== 'approved' && (
              <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>
                닫기
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 지급 확인 모달 */}
      <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>정산 지급 확인</DialogTitle>
            <DialogDescription>
              다음 정산을 실제로 지급하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {selectedSettlement && (
            <div className="py-2 space-y-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">클럽명</span>
                  <span className="font-medium text-slate-900 dark:text-white">{selectedSettlement.coachName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">정산 기간</span>
                  <span className="text-slate-900 dark:text-white tabular-nums">{selectedSettlement.period}</span>
                </div>
                <div className="flex justify-between items-baseline border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">지급 금액</span>
                  <span className="font-bold text-green-600 dark:text-green-400 text-base tabular-nums">
                    {selectedSettlement.netAmount.toLocaleString()}원
                  </span>
                </div>
              </div>
              {selectedSettlement.bankName && (
                <div className="text-sm text-primary bg-primary/5 dark:bg-primary/10 rounded-lg p-3">
                  입금 계좌: <span className="tabular-nums">{selectedSettlement.bankName} {selectedSettlement.accountNumber}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPayoutOpen(false)}
              disabled={isProcessing}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handlePayoutConfirmed}
              disabled={isProcessing}
              variant="success"
            >
              {isProcessing ? '처리 중...' : '지급 실행'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// 수업 결제 정산 탭 — GET /payments/admin/settlement-overview
// ════════════════════════════════════════════════

interface SettlementOverviewTeam {
  teamId: string;
  teamName: string;
  teamCode?: string | null;
  classCount: number;
  studentCount: number;
  paidCount: number;
  unpaidCount: number;
  paidAmount: number;
  unpaidAmount: number;
  totalAmount: number;
}

interface SettlementOverview {
  totals: {
    classCount: number;
    studentCount: number;
    paidCount: number;
    unpaidCount: number;
    paidAmount: number;
    unpaidAmount: number;
    totalAmount: number;
  };
  teams: SettlementOverviewTeam[];
}

// 운영 초반 수수료율 — 결제 완료 금액의 3%
const PLATFORM_FEE_RATE = 0.03;

function ClassSettlementTab() {
  const [data, setData] = useState<SettlementOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<SettlementOverview>('/payments/admin/settlement-overview');
      // api-client extractData 가 { success, data } 를 풀어주므로 res 가 곧 SettlementOverview.
      const payload =
        res && typeof res === 'object' && 'totals' in res
          ? (res as SettlementOverview)
          : ((res as { data?: SettlementOverview })?.data ?? null);
      if (payload && payload.totals) {
        setData(payload);
      } else {
        setError('정산 개요를 불러오지 못했습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '정산 개요를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (isLoading) {
    return <LoadingSpinner message="정산 개요를 불러오는 중..." />;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6 text-center">
        <AlertCircle className="w-8 h-8 mx-auto text-red-500" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
        <Button type="button" variant="outline" onClick={() => void load()} className="mt-3">
          다시 시도
        </Button>
      </div>
    );
  }
  if (!data) return null;

  const { totals, teams } = data;
  // 3% 수수료 — 결제 완료 금액 기준 (프론트 표시 계산)
  const totalFee = Math.round(totals.paidAmount * PLATFORM_FEE_RATE);
  const totalSettlement = totals.paidAmount - totalFee;

  return (
    <div className="space-y-6">
      {/* 전체 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MiniStatsCard
          title="총 결제 금액"
          value={`${totals.paidAmount.toLocaleString()}원`}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <MiniStatsCard
          title="미납 금액 (추정)"
          value={`${totals.unpaidAmount.toLocaleString()}원`}
          icon={<AlertCircle className="h-5 w-5" />}
          variant="warning"
        />
        <MiniStatsCard
          title={`플랫폼 수수료 (${(PLATFORM_FEE_RATE * 100).toFixed(0)}%)`}
          value={`${totalFee.toLocaleString()}원`}
          icon={<Receipt className="h-5 w-5" />}
          variant="info"
        />
        <MiniStatsCard
          title="정산 예정액 (수수료 차감)"
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
          미납 <strong className="tabular-nums">{totals.unpaidCount}</strong>명
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
              <TableHead className="text-right">미납</TableHead>
              <TableHead className="text-right">결제 금액</TableHead>
              <TableHead className="text-right">미납 금액</TableHead>
              <TableHead className="text-right">수수료 ({(PLATFORM_FEE_RATE * 100).toFixed(0)}%)</TableHead>
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
                const fee = Math.round(t.paidAmount * PLATFORM_FEE_RATE);
                const settlement = t.paidAmount - fee;
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
                      {t.unpaidCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                      {t.paidAmount.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {t.unpaidAmount.toLocaleString()}원
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
        ※ 미납 금액은 미결제 학생의 등록 상품가 기준 추정치입니다. 수수료는 운영 초반 정책({(PLATFORM_FEE_RATE * 100).toFixed(0)}%)으로
        결제 완료 금액에만 적용됩니다.
      </p>
    </div>
  );
}
