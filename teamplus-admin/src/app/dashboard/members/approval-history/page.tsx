'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Check,
  X,
} from 'lucide-react';
import { api } from '@/services/api-client';

// ─── 타입 정의 ───────────────────────────────────────────

type ApprovalStatus = 'APPROVED' | 'REJECTED';
type ViewMode = 'calendar' | 'list';
type FilterType = 'all' | 'category';

interface ApprovalHistory {
  id: string;
  childName: string;
  parentName: string;
  clubName: string;
  status: ApprovalStatus;
  appliedAt: string;
  processedAt: string;
  rejectionReason?: string;
  rawDate?: Date;
}

interface ApiApprovalItem {
  id: string;
  approvalStatus: string;
  joinedAt: string;
  playerName?: string;
  user?: { id: string; username: string; email: string };
  club?: { id: string; clubName: string };
}

// ─── 상태 배지 스타일 ──────────────────────────────────────

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; className: string }> = {
  APPROVED: {
    label: '승인완료',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-transparent',
  },
  REJECTED: {
    label: '거절',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent',
  },
};


// ─── 페이지 컴포넌트 ────────────────────────────────────

const ITEMS_PER_PAGE = 8;

export default function ApprovalHistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('all');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [history, setHistory] = useState<ApprovalHistory[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await api.get<ApiApprovalItem[]>('/admin/members/approval-history?limit=200');
      const processed = (items ?? []).map((m) => ({
        id: m.id,
        childName: m.playerName ?? m.user?.username ?? '이름 없음',
        parentName: m.user?.username ?? '',
        clubName: m.club?.clubName ?? '',
        status: String(m.approvalStatus).toUpperCase() as ApprovalStatus,
        appliedAt: new Date(m.joinedAt).toLocaleString('ko-KR'),
        processedAt: new Date(m.joinedAt).toLocaleString('ko-KR'),
        rawDate: new Date(m.joinedAt)
      }));
      setHistory(processed);
    } catch (e) {
      console.error('[ApprovalHistory] 로드 실패:', e);
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 달력 관련 로직
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const startDay = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();
    
    const days = [];
    
    // 이전 달 빈 칸
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    // 현재 달 날짜
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  }, [currentDate]);

  const changeMonth = (offset: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  const getDayHistory = (date: Date) => {
    return history.filter(item => {
      const itemDate = (item as unknown as Record<string, unknown>).rawDate as Date | undefined;
      return itemDate && 
             itemDate.getFullYear() === date.getFullYear() &&
             itemDate.getMonth() === date.getMonth() &&
             itemDate.getDate() === date.getDate();
    });
  };

  // 필터링된 데이터 (리스트용)
  const filteredData = useMemo(() => {
    return history.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [history, statusFilter]);

  const visibleData = filteredData.slice(0, visibleCount);
  const hasMore = visibleCount < filteredData.length;

  // 필터 초기화
  const handleResetFilters = () => {
    setDateFrom('');
    setStatusFilter('all');
    setVisibleCount(ITEMS_PER_PAGE);
  };

  // 더보기
  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };

  if (isLoading) {
    return <LoadingSpinner message="승인 내역을 불러오는 중..." />;
  }

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="회원 승인 및 거절 내역"
        description="회원 가입 신청의 승인 및 거절 처리 이력을 확인할 수 있습니다."
      />

        {/* 상단 탭 토글: 달력 | 리스트 + 전체 | 구분 */}
        <div className="flex items-center justify-between">
          {/* 달력 / 리스트 토글 */}
          <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 min-w-[160px]">
            {/* 슬라이딩 인디케이터 */}
            <div 
              className={`absolute top-1 bottom-1 transition-all duration-300 ease-in-out bg-primary rounded-md shadow-sm ${
                viewMode === 'calendar' ? 'left-1 w-[calc(50%-4px)]' : 'left-[calc(50%)] w-[calc(50%-4px)]'
              }`}
            />
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 motion-reduce:transition-none whitespace-nowrap ${
                viewMode === 'calendar'
                  ? 'text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>달력</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 motion-reduce:transition-none whitespace-nowrap ${
                viewMode === 'list'
                  ? 'text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <List className="w-4 h-4 shrink-0" />
              <span>리스트</span>
            </button>
          </div>

          {/* 전체 / 구분 토글 */}
          <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 min-w-[140px]">
            {/* 슬라이딩 인디케이터 */}
            <div 
              className={`absolute top-1 bottom-1 transition-all duration-300 ease-in-out bg-primary rounded-md shadow-sm ${
                filterType === 'all' ? 'left-1 w-[calc(50%-4px)]' : 'left-[calc(50%)] w-[calc(50%-4px)]'
              }`}
            />
            <button
              type="button"
              onClick={() => setFilterType('all')}
              aria-pressed={filterType === 'all'}
              className={`relative z-10 flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 motion-reduce:transition-none ${
                filterType === 'all'
                  ? 'text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setFilterType('category')}
              aria-pressed={filterType === 'category'}
              className={`relative z-10 flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 motion-reduce:transition-none ${
                filterType === 'category'
                  ? 'text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              구분
            </button>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="space-y-3">
            {/* 달력 헤더 */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-4 shadow-md">
              <div className="flex items-center justify-between">
                {/* 월 네비게이션 */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => changeMonth(-1)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors motion-reduce:transition-none"
                    aria-label="이전 달"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white tabular-nums min-w-[120px] text-center">
                    {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                  </h3>
                  <button
                    type="button"
                    onClick={() => changeMonth(1)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors motion-reduce:transition-none"
                    aria-label="다음 달"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {/* 오늘 버튼 */}
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date())}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors motion-reduce:transition-none"
                >
                  오늘
                </button>
              </div>
            </div>

            {/* 달력 그리드 */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
              {/* 요일 행 */}
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <div
                    key={d}
                    className={`py-2.5 text-center text-xs font-semibold tracking-wide uppercase ${
                      i === 0
                        ? 'text-red-500 dark:text-red-400'
                        : i === 6
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 날짜 셀 */}
              <div className="grid grid-cols-7">
                {calendarDays.map((date, i) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${i}`}
                        className="h-24 sm:h-28 border-b border-r border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50"
                      />
                    );
                  }

                  const dayHistory = getDayHistory(date);
                  const isToday = new Date().toDateString() === date.toDateString();
                  const isSunday = date.getDay() === 0;
                  const isSaturday = date.getDay() === 6;
                  const approvedCount = dayHistory.filter(h => h.status === 'APPROVED').length;
                  const rejectedCount = dayHistory.filter(h => h.status === 'REJECTED').length;

                  return (
                    <div
                      key={date.toISOString()}
                      className={`h-24 sm:h-28 border-b border-r border-slate-100 dark:border-slate-700/50 p-1.5 sm:p-2 relative group transition-colors ${
                        isToday
                          ? 'bg-blue-50/60 dark:bg-blue-900/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      {/* 날짜 숫자 */}
                      <div className="flex items-start justify-between mb-1">
                        <span
                          className={`inline-flex items-center justify-center text-xs font-bold leading-none ${
                            isToday
                              ? 'bg-primary text-white w-6 h-6 rounded-full shadow-md'
                              : isSunday
                              ? 'text-red-500 dark:text-red-400'
                              : isSaturday
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {/* 건수 요약 뱃지 (이벤트 있을 때만) */}
                        {dayHistory.length > 0 && (
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 tabular-nums">
                            {dayHistory.length}건
                          </span>
                        )}
                      </div>

                      {/* 이벤트 카드 영역 */}
                      <div className="space-y-0.5 overflow-hidden max-h-[calc(100%-28px)]">
                        {dayHistory.slice(0, 2).map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-1 text-[10px] sm:text-[11px] leading-tight px-1.5 py-0.5 rounded ${
                              item.status === 'APPROVED'
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                            }`}
                          >
                            {item.status === 'APPROVED' ? (
                              <Check className="w-2.5 h-2.5 shrink-0" />
                            ) : (
                              <X className="w-2.5 h-2.5 shrink-0" />
                            )}
                            <span className="truncate">{item.childName}</span>
                          </div>
                        ))}
                        {dayHistory.length > 2 && (
                          <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                            {approvedCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-600 dark:text-green-400">
                                <Check className="w-2 h-2" />
                                {approvedCount}
                              </span>
                            )}
                            {rejectedCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-red-600 dark:text-red-400">
                                <X className="w-2 h-2" />
                                {rejectedCount}
                              </span>
                            )}
                            {dayHistory.length > 2 && (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500">
                                +{dayHistory.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 범례 */}
            <div className="flex items-center justify-end gap-4 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                <span className="text-xs text-slate-500 dark:text-slate-400">승인</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                <span className="text-xs text-slate-500 dark:text-slate-400">거절</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 필터 영역: 조회 기간 + 처리 상태 */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* 조회 기간 */}
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    조회 기간
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* 처리 상태 */}
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    처리 상태
                  </label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as 'all' | ApprovalStatus)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="전체 상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 상태</SelectItem>
                      <SelectItem value="APPROVED">승인완료</SelectItem>
                      <SelectItem value="REJECTED">거절</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 건수 + 필터 초기화 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  회원 가입 처리 이력
                </span>
                <span className="text-sm font-bold text-primary">
                  {filteredData.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors motion-reduce:transition-none"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                필터 초기화
              </button>
            </div>

            {/* 카드 리스트 */}
            <div className="space-y-3">
              {visibleData.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-primary/40 dark:hover:border-primary/40 hover:shadow-md transition-all motion-reduce:transition-none cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    {/* 좌측: 아동명, 부모명, 상태 배지 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {item.childName} (자녀)
                        </h3>
                        <Badge className={STATUS_CONFIG[item.status].className}>
                          {STATUS_CONFIG[item.status].label}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        회원: {item.parentName}{item.clubName ? ` · ${item.clubName}` : ''}
                      </p>
                    </div>

                    {/* 우측: 화살표 */}
                    <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500 mt-1 flex-shrink-0" />
                  </div>

                  {/* 날짜 정보 */}
                  <div className="flex gap-8 mt-3">
                    <div>
                      <p className="text-xs text-primary font-medium mb-0.5">신청일시</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{item.appliedAt}</p>
                    </div>
                    <div>
                      <p className="text-xs text-primary font-medium mb-0.5">처리일시</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{item.processedAt}</p>
                    </div>
                  </div>

                  {/* 거절 사유 (거절인 경우만 표시) */}
                  {item.status === 'REJECTED' && item.rejectionReason && (
                    <div className="mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                        거절 사유
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {item.rejectionReason}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 더보기 버튼 */}
            {hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors motion-reduce:transition-none"
                >
                  이전 내역 더보기
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* 데이터 없을 때 */}
            {filteredData.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                  <List className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  조건에 맞는 처리 내역이 없습니다.
                </p>
              </div>
            )}
          </>
        )}
    </div>
  );
}
