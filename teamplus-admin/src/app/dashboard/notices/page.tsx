'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Megaphone,
  Pin,
  Eye,
  EyeOff,
  Send,
  Calendar,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

// 백엔드 API 응답 타입
// 주의: 백엔드 createNotice()에서 DTO의 type 값을 DB의 targetType 컬럼에 저장함
interface ApiNotice {
  id: string;
  title: string;
  content?: string;
  targetType: string; // 실제로 category 값이 저장됨 (general/important/maintenance/event)
  isPinned?: boolean;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

interface ApiNoticesResponse {
  data: ApiNotice[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface Notice {
  id: string;
  title: string;
  content: string;
  category: 'general' | 'schedule' | 'event' | 'urgent';
  targetType: 'all' | 'club' | 'class';
  targetName?: string;
  isPinned: boolean;
  isPublished: boolean;
  viewCount: number;
  authorName: string;
  createdAt: string;
  publishedAt?: string;
}

// 백엔드 targetType 값 → 프론트 category 매핑
const mapBackendType = (type?: string): Notice['category'] => {
  switch (type) {
    case 'important': return 'urgent';
    case 'maintenance': return 'schedule';
    case 'event': return 'event';
    default: return 'general';
  }
};

// 프론트 category → 백엔드 type 매핑
const mapFrontendCategory = (category: Notice['category']): string => {
  switch (category) {
    case 'urgent': return 'important';
    case 'schedule': return 'maintenance';
    case 'event': return 'event';
    default: return 'general';
  }
};

const mapApiNotice = (n: ApiNotice): Notice => ({
  id: n.id,
  title: n.title,
  content: n.content ?? '',
  category: mapBackendType(n.targetType),
  targetType: 'all',
  isPinned: n.isPinned ?? false,
  isPublished: n.isActive,
  viewCount: 0,
  authorName: '관리자',
  createdAt: n.createdAt,
  publishedAt: n.isActive ? n.createdAt : undefined,
});

// 서버 검증 실패(400) 응답에서 사용자 친화적 메시지 추출
// 백엔드 응답 형식: { errors?: [{ field, message }], message?: string }
const extractServerErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback;
  }
  const respData = (error as { response?: { data?: { message?: string; errors?: Array<{ field?: string; message?: string }> } } })
    .response?.data;
  const firstFieldError = respData?.errors?.find((e) => e?.message)?.message;
  if (firstFieldError) return firstFieldError;
  if (respData?.message) return respData.message;
  return fallback;
};

export default function NoticesPage() {
  const router = useRouter();
  const noticeSearchId = useId();
  const noticeTitleId = useId();
  const noticeCategoryId = useId();
  const noticeContentId = useId();
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'general' | 'schedule' | 'event' | 'urgent'>('all');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Notice | null>(null);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [deletingNoticeId, setDeletingNoticeId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'general' as Notice['category'],
    targetType: 'all' as Notice['targetType'],
    isPinned: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadNotices = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<ApiNoticesResponse | ApiNotice[]>('/notices/admin/list?limit=100');
      const data: ApiNotice[] = Array.isArray(res)
        ? res
        : (res as ApiNoticesResponse).data ?? [];
      setNotices(data.map(mapApiNotice));
    } catch (error) {
      console.error('[NoticesPage] 공지사항 조회 실패:', error);
      setNotices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  void router;

  const filteredNotices = notices.filter((notice) => {
    const matchesSearch =
      notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notice.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notice.authorName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || notice.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // 고정된 공지를 상단에 정렬
  const sortedNotices = [...filteredNotices].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // 페이징 계산
  const totalPages = Math.ceil(sortedNotices.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedNotices = sortedNotices.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory]);

  const stats = {
    total: notices.length,
    published: notices.filter((n) => n.isPublished).length,
    pinned: notices.filter((n) => n.isPinned).length,
  };

  const getCategoryColor = (category: Notice['category']) => {
    switch (category) {
      case 'urgent':
        return 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700';
      case 'event':
        return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700';
      case 'schedule':
        return 'bg-primary/5 dark:bg-primary/20 text-blue-700 dark:text-primary-light border-blue-200 dark:border-blue-700';
      case 'general':
      default:
        return 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
    }
  };

  const getCategoryLabel = (category: Notice['category']) => {
    switch (category) {
      case 'urgent': return '긴급';
      case 'event': return '대회/이벤트';
      case 'schedule': return '일정';
      case 'general':
      default: return '일반';
    }
  };

  const getTargetLabel = (notice: Notice) => {
    switch (notice.targetType) {
      case 'club': return notice.targetName || '클럽';
      case 'class': return notice.targetName || '수업';
      default: return '전체';
    }
  };

  const handleAddNotice = async () => {
    const title = formData.title.trim();
    const content = formData.content.trim();

    if (title.length < 2) {
      setActionMsg({ type: 'error', text: MESSAGES.dashboardNotice.titleMinLength }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    if (title.length > 200) {
      setActionMsg({ type: 'error', text: MESSAGES.dashboardNotice.titleMaxLength }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    if (content.length < 10) {
      setActionMsg({ type: 'error', text: MESSAGES.dashboardNotice.contentMinLength }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    if (content.length > 10000) {
      setActionMsg({ type: 'error', text: MESSAGES.dashboardNotice.contentMaxLength }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title,
        content,
        type: mapFrontendCategory(formData.category),
        isPinned: formData.isPinned,
        isPublished: false,
      };

      if (editingNotice) {
        const res = await api.patch<ApiNotice>(`/notices/${editingNotice.id}`, payload);
        const updated = mapApiNotice(res as ApiNotice);
        setNotices(notices.map((n) => (n.id === editingNotice.id ? updated : n)));
        setEditingNotice(null);
      } else {
        const res = await api.post<ApiNotice>('/notices', payload);
        const created = mapApiNotice(res as ApiNotice);
        setNotices([created, ...notices]);
      }

      setFormData({ title: '', content: '', category: 'general', targetType: 'all', isPinned: false });
      setShowAddModal(false);
    } catch (error) {
      console.error('[NoticesPage] 공지 저장 실패:', error);
      setActionMsg({ type: 'error', text: extractServerErrorMessage(error, MESSAGES.dashboardNotice.saveErrorRetry) });
      setTimeout(() => setActionMsg(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditNotice = async (notice: Notice) => {
    // 상세 내용이 없는 경우(목록에서 content 미포함) 별도 조회
    let fullNotice = notice;
    if (!notice.content) {
      try {
        const res = await api.get<ApiNotice>(`/notices/${notice.id}`);
        fullNotice = mapApiNotice(res as ApiNotice);
      } catch {
        // 실패 시 기존 데이터 사용
      }
    }

    setEditingNotice(fullNotice);
    setFormData({
      title: fullNotice.title,
      content: fullNotice.content,
      category: fullNotice.category,
      targetType: fullNotice.targetType,
      isPinned: fullNotice.isPinned,
    });
    setShowAddModal(true);
  };

  const handleDeleteNotice = async (id: string) => {
    try {
      await api.delete(`/notices/${id}`);
      setNotices(notices.filter((n) => n.id !== id));
      setDeletingNoticeId(null);
    } catch (error) {
      console.error('[NoticesPage] 공지 삭제 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.dashboardNotice.deleteErrorRetry }); setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleTogglePublish = async (id: string) => {
    try {
      const res = await api.patch<{ id: string; isPublished: boolean }>(`/notices/${id}/publish`);
      const updated = res as { id: string; isPublished: boolean };
      setNotices(
        notices.map((n) =>
          n.id === id
            ? { ...n, isPublished: updated.isPublished, publishedAt: updated.isPublished ? new Date().toISOString() : n.publishedAt }
            : n
        )
      );
    } catch (error) {
      console.error('[NoticesPage] 공개 상태 변경 실패:', error);
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      const res = await api.patch<{ id: string; isPinned: boolean }>(`/notices/${id}/pin`);
      const updated = res as { id: string; isPinned: boolean };
      setNotices(
        notices.map((n) => (n.id === id ? { ...n, isPinned: updated.isPinned } : n))
      );
    } catch (error) {
      console.error('[NoticesPage] 고정 상태 변경 실패:', error);
    }
  };

  const handleOpenDetail = async (notice: Notice) => {
    let fullNotice = notice;
    if (!notice.content) {
      try {
        const res = await api.get<ApiNotice>(`/notices/${notice.id}`);
        fullNotice = mapApiNotice(res as ApiNotice);
        setNotices(notices.map((n) => (n.id === notice.id ? fullNotice : n)));
      } catch {
        // 실패 시 기존 데이터 사용
      }
    }
    setShowDetailModal(fullNotice);
  };

  if (isLoading) {
    return <LoadingSpinner message="공지사항을 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      <PageHeader title="공지사항 관리" subtitle={`전체 ${notices.length}개의 공지`} />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniStatsCard
          title="전체 공지"
          value={stats.total}
          icon={<Megaphone className="w-5 h-5" />}
          variant="primary"
        />
        <MiniStatsCard
          title="게시됨"
          value={stats.published}
          icon={<Send className="w-5 h-5" />}
          variant="success"
        />
        <MiniStatsCard
          title="고정됨"
          value={stats.pinned}
          icon={<Pin className="w-5 h-5" />}
          variant="warning"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 relative w-full sm:max-w-md">
          <label htmlFor={noticeSearchId} className="sr-only">공지사항 검색</label>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <Input
            id={noticeSearchId}
            placeholder="제목, 내용, 작성자로 검색해주세요"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="공지사항 검색 (제목, 내용, 작성자)"
            className="pl-10 h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="tablist" aria-label="공지 분류 필터">
            {(['all', 'urgent', 'event', 'schedule', 'general'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={filterCategory === cat}
                onClick={() => setFilterCategory(cat)}
                className={`min-h-[36px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors motion-reduce:transition-none ${
                  filterCategory === cat
                    ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat === 'all' ? '전체' : getCategoryLabel(cat)}
              </button>
            ))}
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditingNotice(null);
              setFormData({ title: '', content: '', category: 'general', targetType: 'all', isPinned: false });
              setShowAddModal(true);
            }}
            className="gap-2 h-11 bg-primary hover:bg-primary-dark text-white"
            aria-label="새 공지 작성"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">공지 작성</span>
          </Button>
        </div>
      </div>

      {/* Notices List */}
      <div className="space-y-3">
        {paginatedNotices.map((notice) => (
          <Card
            key={notice.id}
            className={`bg-white dark:bg-slate-800 border overflow-hidden ${
              notice.isPinned ? 'border-amber-300 dark:border-amber-600' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="p-5">
              <div className="flex items-start gap-4">
                {notice.isPinned && (
                  <div className="flex-shrink-0">
                    <Pin className="w-5 h-5 text-amber-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`${getCategoryColor(notice.category)} border text-xs`}
                    >
                      {getCategoryLabel(notice.category)}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-xs">
                      <Users className="w-3 h-3 mr-1" />
                      {getTargetLabel(notice)}
                    </Badge>
                    {!notice.isPublished && (
                      <Badge variant="outline" className="border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs">
                        <EyeOff className="w-3 h-3 mr-1" />
                        미게시
                      </Badge>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenDetail(notice)}
                    className="text-left text-base font-semibold text-slate-900 dark:text-white mb-1 hover:text-primary transition-colors motion-reduce:transition-none"
                    aria-label={`${notice.title} 공지 상세 보기`}
                  >
                    {notice.title}
                  </button>

                  {notice.content && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                      {notice.content.split('\n')[0]}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(notice.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                    <span>{notice.authorName}</span>
                    {notice.isPublished && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {notice.viewCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(notice.id)}
                    className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                      notice.isPinned
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500'
                    }`}
                    title={notice.isPinned ? '고정 해제' : '상단 고정'}
                    aria-label={notice.isPinned ? '상단 고정 해제' : '상단 고정'}
                    aria-pressed={notice.isPinned}
                  >
                    <Pin className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(notice.id)}
                    className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                      notice.isPublished
                        ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-green-600 dark:text-green-400'
                        : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-400 dark:text-slate-500'
                    }`}
                    title={notice.isPublished ? '게시 취소' : '게시하기'}
                    aria-label={notice.isPublished ? '게시 취소' : '게시하기'}
                    aria-pressed={notice.isPublished}
                  >
                    {notice.isPublished ? (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Send className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditNotice(notice)}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center hover:bg-primary/5 dark:hover:bg-primary/20 rounded-lg transition-colors motion-reduce:transition-none"
                    title="수정"
                    aria-label="공지 수정"
                  >
                    <Edit2 className="w-4 h-4 text-blue-600 dark:text-primary-light" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingNoticeId(notice.id)}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                    title="삭제"
                    aria-label="공지 삭제"
                  >
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              aria-label="첫 페이지"
              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                currentPage === 1
                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="이전 페이지"
              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                currentPage === 1
                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="flex items-center">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page, idx) => (
                <div key={page} className="flex items-center">
                  {idx > 0 && (
                    <span className="text-slate-300 dark:text-slate-600 mx-0.5" aria-hidden="true">|</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePageChange(page)}
                    aria-label={`${page} 페이지`}
                    aria-current={currentPage === page ? 'page' : undefined}
                    className={`min-w-[40px] min-h-[40px] px-2 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none tabular-nums ${
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

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="다음 페이지"
              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                currentPage === totalPages
                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              aria-label="마지막 페이지"
              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                currentPage === totalPages
                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronsRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="text-center mt-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              총 {sortedNotices.length}건 중 {startIndex + 1}-{Math.min(endIndex, sortedNotices.length)}건 표시
            </span>
          </div>
        </Card>
      )}

      {paginatedNotices.length === 0 && (
        <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <Megaphone className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {searchTerm || filterCategory !== 'all' ? '검색 결과가 없습니다.' : '등록된 공지사항이 없습니다.'}
          </p>
        </Card>
      )}

      {/* Add/Edit Notice Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingNotice(null);
        }}
        size="lg"
      >
        <ModalHeader title={editingNotice ? '공지 수정' : '새 공지 작성'} />
        <ModalBody scrollable maxHeight="60vh">
          <div className="space-y-4">
            <div>
              <label htmlFor={noticeTitleId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                제목 <span className="text-red-500">*</span>
              </label>
              <Input
                id={noticeTitleId}
                placeholder="공지 제목을 입력해주세요 (2~200자)"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                aria-label="공지 제목"
                aria-required="true"
                maxLength={200}
                className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-right">
                {formData.title.trim().length} / 200자
              </p>
            </div>
            <div>
              <label htmlFor={noticeCategoryId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">분류</label>
              <select
                id={noticeCategoryId}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as Notice['category'] })}
                aria-label="공지 분류 선택"
                className="w-full h-11 px-3 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
              >
                <option value="general">일반</option>
                <option value="schedule">일정</option>
                <option value="event">대회/이벤트</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
            <div>
              <label htmlFor={noticeContentId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                id={noticeContentId}
                placeholder="공지 내용을 입력해주세요 (10~10,000자)"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                aria-label="공지 내용"
                aria-required="true"
                rows={10}
                maxLength={10000}
                className="w-full px-3 py-2 min-h-[300px] border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-y leading-relaxed"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-right">
                {formData.content.trim().length} / 10,000자 (최소 10자)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPinned"
                checked={formData.isPinned}
                onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
              />
              <label htmlFor="isPinned" className="text-sm text-slate-700 dark:text-slate-300">
                상단 고정
              </label>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            onClick={() => {
              setShowAddModal(false);
              setEditingNotice(null);
            }}
            variant="outline"
            className="flex-1 h-11 border-slate-200 dark:border-slate-600"
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => handleAddNotice()}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : editingNotice ? '수정하기' : '저장하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!showDetailModal}
        onClose={() => setShowDetailModal(null)}
        size="lg"
      >
        {showDetailModal && (
          <>
            <ModalHeader title={showDetailModal.title} />
            <ModalBody scrollable maxHeight="60vh">
              <div className="flex items-center gap-2 mb-4">
                <Badge
                  variant="outline"
                  className={`${getCategoryColor(showDetailModal.category)} border`}
                >
                  {getCategoryLabel(showDetailModal.category)}
                </Badge>
                {showDetailModal.isPinned && (
                  <Badge variant="outline" className="border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30">
                    <Pin className="w-3 h-3 mr-1" />
                    고정
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <span>{showDetailModal.authorName}</span>
                <span>{new Date(showDetailModal.createdAt).toLocaleDateString('ko-KR')}</span>
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {showDetailModal.viewCount}
                </span>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                  {showDetailModal.content || '내용을 불러오는 중...'}
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                onClick={() => setShowDetailModal(null)}
                variant="outline"
                className="flex-1 h-11 border-slate-200 dark:border-slate-600"
              >
                닫기
              </Button>
              <Button
                type="button"
                onClick={() => {
                  handleEditNotice(showDetailModal);
                  setShowDetailModal(null);
                }}
                className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
              >
                수정하기
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingNoticeId}
        onClose={() => setDeletingNoticeId(null)}
        onConfirm={() => deletingNoticeId && handleDeleteNotice(deletingNoticeId)}
        title="공지를 삭제하시겠습니까?"
        description="이 작업은 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
      />
    </div>
  );
}
