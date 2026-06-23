'use client';

/**
 * 푸시 알림 관리 페이지 - TEAMPLUS
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Bell, Send, Users, Clock, CheckCircle2, XCircle, Search, Filter, Eye, RefreshCw, Trash2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const ITEMS_PER_PAGE = 10;

// 타겟 레이블 (UI 표시용)
const TARGET_LABELS: Record<string, string> = {
  all: '전체 회원',
  parents: '학부모',
  coaches: '코치',
  teens: '청소년 (TEEN)',
  children: '어린이 (CHILD)',
  directors: '관장/감독',
  admins: '관리자',
  active: '활성 회원',
  inactive: '비활성 회원',
};

// 발송 대상 → 백엔드 API 파라미터 변환
const mapTargetToApi = (target: string): { targetType: 'all' | 'role'; role?: string } => {
  if (target === 'parents') return { targetType: 'role', role: 'PARENT' };
  if (target === 'coaches') return { targetType: 'role', role: 'COACH' };
  if (target === 'teens') return { targetType: 'role', role: 'TEEN' };
  if (target === 'children') return { targetType: 'role', role: 'CHILD' };
  if (target === 'directors') return { targetType: 'role', role: 'DIRECTOR' };
  if (target === 'admins') return { targetType: 'role', role: 'ADMIN' };
  return { targetType: 'all' };
};

interface PushNotification {
  id: string;
  title: string;
  message: string;
  target: string;
  sentAt: string;
  status: string;
  sent: number;
  opened: number;
}

/** 백엔드 GET /notifications/admin/push-history 응답 아이템 */
interface PushHistoryApiItem {
  id: string;
  adminId?: string | null;
  title?: string | null;
  body?: string | null;
  targetType?: string | null;
  role?: string | null;
  deviceCount?: number;
  sentAt: string;
}

/** API 응답 → PushNotification 변환 */
const mapApiPush = (item: PushHistoryApiItem): PushNotification => {
  const targetLabel = item.role
    ? TARGET_LABELS[item.role.toLowerCase()] ?? item.role
    : item.targetType === 'all'
      ? '전체 회원'
      : item.targetType ?? '—';

  return {
    id: item.id,
    title: item.title ?? '(제목 없음)',
    message: item.body ?? '',
    target: targetLabel,
    sentAt: new Date(item.sentAt).toLocaleString('ko-KR'),
    status: 'success',
    sent: item.deviceCount ?? 0,
    opened: 0,
  };
};

export default function PushManagementPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [pushHistory, setPushHistory] = useState<PushNotification[]>([]);
  const [newPush, setNewPush] = useState({
    title: '',
    message: '',
    target: 'all',
    scheduleType: 'now',
    scheduledAt: '',
  });
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPush, setSelectedPush] = useState<PushNotification | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pushToDelete, setPushToDelete] = useState<string | null>(null);

  const loadPushHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<
        { data?: PushHistoryApiItem[]; pagination?: { total: number } }
        | PushHistoryApiItem[]
      >('/notifications/admin/push-history', {
        params: { page: '1', limit: '100' },
      });

      const items: PushHistoryApiItem[] = Array.isArray(res)
        ? res
        : (res as { data?: PushHistoryApiItem[] }).data ?? [];
      setPushHistory(items.map(mapApiPush));
    } catch (error) {
      console.error('[Push] 이력 로드 실패:', error);
      setPushHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPushHistory();
  }, [loadPushHistory]);

  // 검색 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // 로딩 중 표시
  if (isLoading) {
    return <LoadingSpinner message="푸시 알림 이력을 불러오는 중..." />;
  }

  const handleSendClick = () => {
    setValidationError(null);
    setSendError(null);
    setSendSuccess(null);

    if (!newPush.title.trim() || !newPush.message.trim()) {
      setValidationError('제목과 내용을 입력해주세요.');
      return;
    }

    setShowSendConfirm(true);
  };

  const handleSend = async () => {
    setShowSendConfirm(false);
    const { targetType, role } = mapTargetToApi(newPush.target);

    setIsSending(true);
    try {
      await api.post('/notifications/admin/push', {
        title: newPush.title,
        bodyText: newPush.message,
        targetType,
        ...(role && { role }),
      });

      setSendSuccess('푸시 알림이 발송되었습니다.');
      setNewPush({ title: '', message: '', target: 'all', scheduleType: 'now', scheduledAt: '' });
      await loadPushHistory();
    } catch (error) {
      console.error('[Push] 발송 실패:', error);
      setSendError('푸시 발송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSending(false);
    }
  };

  const handleViewDetail = (push: PushNotification) => {
    setSelectedPush(push);
    setShowDetailModal(true);
  };

  const handleResend = async (push: PushNotification) => {
    setNewPush({
      title: push.title,
      message: push.message,
      target: 'all',
      scheduleType: 'now',
      scheduledAt: '',
    });
    setShowDetailModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeletePush = (id: string) => {
    setPushToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (pushToDelete) {
      setPushHistory(pushHistory.filter(p => p.id !== pushToDelete));
      setPushToDelete(null);
    }
    setShowDeleteConfirm(false);
  };

  const filteredHistory = pushHistory.filter(item =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 페이징 계산
  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedHistory = filteredHistory.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <PageHeader
        title="푸시 알림 관리"
        description="푸시 알림을 발송하고 이력을 관리합니다"
      />

      {/* 통계 카드 */}
      <StatsGrid
        stats={[
          { label: '총 발송', value: 0, icon: Send },
          { label: '열람', value: 0, icon: CheckCircle2 },
          { label: '열람률', value: '0%', icon: Users },
          { label: '이번 주 발송', value: 0, icon: Clock },
        ]}
      />

      {/* 새 푸시 알림 발송 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">새 푸시 알림</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">새로운 푸시 알림을 작성하고 발송합니다</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">알림 제목</label>
              <Input
                value={newPush.title}
                onChange={(e) => setNewPush({ ...newPush, title: e.target.value })}
                placeholder="알림 제목을 입력하세요"
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">발송 대상</label>
              <select
                value={newPush.target}
                onChange={(e) => setNewPush({ ...newPush, target: e.target.value })}
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-sm dark:text-white"
              >
                <option value="all">전체 회원</option>
                <option value="parents">학부모</option>
                <option value="coaches">코치</option>
                <option value="teens">청소년 (TEEN)</option>
                <option value="children">어린이 (CHILD)</option>
                <option value="directors">관장/감독</option>
                <option value="admins">관리자</option>
                <option value="active">활성 회원</option>
                <option value="inactive">비활성 회원</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">알림 내용</label>
            <textarea
              value={newPush.message}
              onChange={(e) => setNewPush({ ...newPush, message: e.target.value })}
              placeholder="알림 내용을 입력하세요"
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-sm dark:text-white dark:placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">발송 시점</label>
              <select
                value={newPush.scheduleType}
                onChange={(e) => setNewPush({ ...newPush, scheduleType: e.target.value })}
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-sm dark:text-white"
              >
                <option value="now">즉시 발송</option>
                <option value="scheduled">예약 발송</option>
              </select>
            </div>
            {newPush.scheduleType === 'scheduled' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">예약 일시</label>
                <Input
                  type="datetime-local"
                  value={newPush.scheduledAt}
                  onChange={(e) => setNewPush({ ...newPush, scheduledAt: e.target.value })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* 유효성 검사 에러 */}
          {validationError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {validationError}
            </div>
          )}

          {/* 발송 결과 메시지 */}
          {sendSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {sendSuccess}
            </div>
          )}
          {sendError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {sendError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSendClick}
              disabled={isSending}
              className="bg-primary hover:bg-primary-dark gap-2 disabled:opacity-50 h-11 px-5 motion-reduce:transition-none"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              {isSending ? '발송 중...' : '푸시 발송'}
            </Button>
          </div>
        </div>
      </div>

      {/* 발송 이력 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">발송 이력</h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10 w-full sm:w-64 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-2 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                <Filter className="w-4 h-4" />
                필터
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50">
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">번호</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">제목</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">대상</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">발송일시</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">발송</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">열람</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {paginatedHistory.map((item, index) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  {/* 번호 (내림차순) */}
                  <td className="px-4 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    {filteredHistory.length - startIndex - index}
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{item.title}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">{item.message}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-sm text-slate-600 dark:text-slate-300">{item.target}</td>
                  <td className="px-4 py-4 text-center text-sm text-slate-600 dark:text-slate-300 tabular-nums">{item.sentAt}</td>
                  <td className="px-4 py-4 text-center text-sm font-medium text-slate-900 dark:text-white tabular-nums">{item.sent.toLocaleString()}</td>
                  <td className="px-4 py-4 text-center text-sm font-medium text-slate-900 dark:text-white tabular-nums">{item.opened.toLocaleString()}</td>
                  <td className="px-4 py-4 text-center">
                    {item.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                        <XCircle className="w-3 h-3" />
                        실패
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleViewDetail(item)}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                        title="상세보기"
                        aria-label="상세보기"
                      >
                        <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResend(item)}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-primary/10 rounded-lg transition-colors motion-reduce:transition-none"
                        title="재발송"
                        aria-label="재발송"
                      >
                        <RefreshCw className="w-4 h-4 text-primary" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePush(item.id)}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                        title="삭제하기"
                        aria-label="삭제하기"
                      >
                        <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paginatedHistory.length === 0 && (
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">발송 이력이 없습니다</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-1">
              {/* 맨 처음 */}
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                aria-label="맨 처음 페이지"
                className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                  currentPage === 1
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title="맨 처음"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              {/* 이전 */}
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="이전 페이지"
                className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                  currentPage === 1
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title="이전"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* 페이지 번호 */}
              <div className="flex items-center">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page, idx) => (
                  <div key={page} className="flex items-center">
                    {idx > 0 && (
                      <span className="text-slate-300 dark:text-slate-600 mx-0.5">|</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePageChange(page)}
                      aria-label={`${page}페이지로 이동`}
                      aria-current={currentPage === page ? 'page' : undefined}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none tabular-nums ${
                        currentPage === page
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {page}
                    </button>
                  </div>
                ))}
              </div>

              {/* 다음 */}
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="다음 페이지"
                className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                  currentPage === totalPages
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title="다음"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* 맨 끝 */}
              <button
                type="button"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="맨 끝 페이지"
                className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                  currentPage === totalPages
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title="맨 끝"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            {/* 페이지 정보 */}
            <div className="text-center mt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                총 {filteredHistory.length}건 중 {startIndex + 1}-{Math.min(endIndex, filteredHistory.length)}건 표시
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 상세보기 모달 */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} size="md">
        <ModalHeader title="푸시 알림 상세" icon={Bell} />
        <ModalBody>
          {selectedPush && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedPush.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 tabular-nums">{selectedPush.sentAt}</p>
                </div>
                {selectedPush.status === 'success' ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    발송 완료
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-sm font-medium">
                    <XCircle className="w-4 h-4" />
                    발송 실패
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">알림 내용</label>
                <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-sm text-slate-700 dark:text-slate-300">{selectedPush.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{selectedPush.sent.toLocaleString()}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">발송 수</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{selectedPush.opened.toLocaleString()}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">열람 수</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400">발송 대상</p>
                  <p className="font-medium text-slate-900 dark:text-white">{selectedPush.target}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400">열람률</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedPush.sent > 0 ? ((selectedPush.opened / selectedPush.sent) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowDetailModal(false)}
            className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            닫기
          </Button>
          <Button
            onClick={() => selectedPush && handleResend(selectedPush)}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            재발송
          </Button>
        </ModalFooter>
      </Modal>

      {/* 발송 확인 모달 */}
      <Modal isOpen={showSendConfirm} onClose={() => setShowSendConfirm(false)} size="sm">
        <ModalHeader title="푸시 알림 발송 확인" icon={Send} />
        <ModalBody>
          <div className="space-y-4 py-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">제목</span>
                <span className="font-medium text-slate-900 dark:text-white">{newPush.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">발송 대상</span>
                <span className="font-medium text-slate-900 dark:text-white">{TARGET_LABELS[newPush.target] ?? newPush.target}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">발송 시점</span>
                <span className="font-medium text-slate-900 dark:text-white">{newPush.scheduleType === 'now' ? '즉시 발송' : `예약: ${newPush.scheduledAt}`}</span>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              위 내용으로 푸시 알림을 발송하시겠습니까?
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowSendConfirm(false)}
            className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white gap-2"
          >
            <Send className="w-4 h-4" />
            발송하기
          </Button>
        </ModalFooter>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
        <ModalHeader title="발송 이력 삭제" icon={AlertCircle} />
        <ModalBody>
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              이 발송 이력을 삭제하시겠습니까?
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              삭제된 이력은 복구할 수 없습니다.
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            onClick={confirmDelete}
            className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white"
          >
            삭제하기
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
