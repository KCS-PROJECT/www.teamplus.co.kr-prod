'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import { env } from '@/lib/env';
import {
  Plus,
  Search,
  Trash2,
  Eye,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  FileText,
  MessageSquare,
} from 'lucide-react';

interface TmsPost {
  id: string;
  title: string;
  content: string;
  platform: string;
  category: string;
  priority: string;
  status: string;
  authorName: string;
  authorEmail?: string;
  assignee?: string;
  dueDate?: string;
  viewCount: number;
  commentCount: number;
  createdAt: string;
  attachments: TmsAttachment[];
}

interface TmsAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface TmsStats {
  total: number;
  todo: number;
  in_progress: number;
  review: number;
  done: number;
  rejected: number;
}

interface ApiResponse {
  data: TmsPost[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats: TmsStats;
}

const PLATFORM_OPTIONS = [
  { value: '', label: '전체 플랫폼' },
  { value: 'web', label: 'Web' },
  { value: 'app', label: 'App' },
  { value: 'admin', label: 'Admin' },
  { value: 'backend', label: 'Backend' },
  { value: 'other', label: '기타' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: '전체 카테고리' },
  { value: 'bug', label: '버그' },
  { value: 'feature', label: '기능 요청' },
  { value: 'improvement', label: '개선' },
  { value: 'design', label: '디자인' },
  { value: 'other', label: '기타' },
];

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'todo', label: 'TODO' },
  { value: 'in_progress', label: '진행중' },
  { value: 'review', label: '리뷰' },
  { value: 'done', label: '완료' },
  { value: 'rejected', label: '반려' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: '전체 우선순위' },
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'critical', label: '긴급' },
];

const platformBadge = (platform: string) => {
  const map: Record<string, { label: string; className: string }> = {
    web: { label: 'Web', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    app: { label: 'App', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    admin: { label: 'Admin', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    backend: { label: 'Backend', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    other: { label: '기타', className: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  };
  return map[platform] || map.other;
};

const categoryLabel = (cat: string) => {
  const map: Record<string, string> = {
    bug: '버그',
    feature: '기능 요청',
    improvement: '개선',
    design: '디자인',
    other: '기타',
  };
  return map[cat] || cat;
};

const priorityBadge = (priority: string) => {
  const map: Record<string, { label: string; className: string }> = {
    low: { label: '낮음', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    medium: { label: '보통', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    high: { label: '높음', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    critical: { label: '긴급', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  };
  return map[priority] || map.medium;
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    todo: { label: 'TODO', className: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
    in_progress: { label: '진행중', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    review: { label: '리뷰', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    done: { label: '완료', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    rejected: { label: '반려', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  };
  return map[status] || map.todo;
};

// 우선순위 정렬 가중치 (긴급 > 높음 > 보통 > 낮음)
const PRIORITY_SORT_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// 마감일 상태 계산
const getDueDateInfo = (dueDate?: string): { label: string; colorClass: string } | null => {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `D+${Math.abs(diffDays)}`, colorClass: 'text-red-600 dark:text-red-400 font-medium' };
  }
  if (diffDays <= 3) {
    return { label: `D-${diffDays}`, colorClass: 'text-amber-600 dark:text-amber-400 font-medium' };
  }
  return null;
};

// 이미지 파일 여부 판별
const isImageFile = (fileType: string) => fileType.startsWith('image/');

export default function TmsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<TmsPost[]>([]);
  const [stats, setStats] = useState<TmsStats>({ total: 0, todo: 0, in_progress: 0, review: 0, done: 0, rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 필터
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // 통계 카드 필터 활성화 상태 ('' = 전체, 'todo', 'in_progress', ...)
  const [activeStatCard, setActiveStatCard] = useState<string>('');

  // 인라인 담당자 편집
  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null);
  const [editingAssigneeValue, setEditingAssigneeValue] = useState('');

  // 이미지 팝업
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  // 모달
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TmsPost | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 생성 폼
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPlatform, setFormPlatform] = useState('web');
  const [formCategory, setFormCategory] = useState('bug');
  const [formPriority, setFormPriority] = useState('medium');
  const [formAuthorName, setFormAuthorName] = useState('');
  const [formAuthorEmail, setFormAuthorEmail] = useState('');
  const [formAssignee, setFormAssignee] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<TmsAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(pageSize));
      if (searchQuery) params.set('search', searchQuery);
      if (filterPlatform) params.set('platform', filterPlatform);
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);

      const res = await api.get<ApiResponse>(`/tms?${params.toString()}`);
      const result = res as unknown as ApiResponse;
      setPosts(result.data || []);
      setStats(result.stats || { total: 0, todo: 0, in_progress: 0, review: 0, done: 0, rejected: 0 });
      setTotalPages(result.pagination?.totalPages || 1);
      setTotalCount(result.pagination?.total || 0);
    } catch (error) {
      console.error('[TMS] 목록 로드 실패:', error);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, filterPlatform, filterCategory, filterStatus, filterPriority]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // 검색 핸들러 (Enter 키)
  const handleSearch = () => {
    setCurrentPage(1);
    loadPosts();
  };

  // 파일 업로드
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (uploadedFiles.length + files.length > 5) {
      setActionMsg({ type: 'error', text: MESSAGES.tms.attachmentLimit });
      return;
    }

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        const res = await api.post<TmsAttachment>('/tms/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const attachment = res as unknown as TmsAttachment;
        setUploadedFiles(prev => [...prev, attachment]);
      }
    } catch (error) {
      console.error('[TMS] 업로드 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.fileUploadError });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // 게시글 생성
  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim() || !formAuthorName.trim()) {
      setActionMsg({ type: 'error', text: MESSAGES.tms.postRequiredFields });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/tms', {
        title: formTitle,
        content: formContent,
        platform: formPlatform,
        category: formCategory,
        priority: formPriority,
        authorName: formAuthorName,
        authorEmail: formAuthorEmail || undefined,
        assignee: formAssignee || undefined,
        dueDate: formDueDate || undefined,
        attachmentIds: uploadedFiles.map(f => f.id),
      });
      setActionMsg({ type: 'success', text: MESSAGES.tms.postCreated });
      setIsCreateModalOpen(false);
      resetForm();
      loadPosts();
    } catch (error) {
      console.error('[TMS] 생성 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.postCreateError });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 상태 변경
  const handleStatusChange = async (postId: string, newStatus: string) => {
    try {
      await api.patch(`/tms/${postId}/status`, { status: newStatus });
      setActionMsg({ type: 'success', text: MESSAGES.tms.statusChanged });
      loadPosts();
    } catch (error) {
      console.error('[TMS] 상태 변경 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.statusError });
    }
  };

  // 삭제
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/tms/${deleteTarget.id}`);
      setActionMsg({ type: 'success', text: MESSAGES.tms.postDeleted });
      setDeleteTarget(null);
      loadPosts();
    } catch (error) {
      console.error('[TMS] 삭제 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.deleteError });
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormPlatform('web');
    setFormCategory('bug');
    setFormPriority('medium');
    setFormAuthorName('');
    setFormAuthorEmail('');
    setFormAssignee('');
    setFormDueDate('');
    setUploadedFiles([]);
  };

  // 통계 카드 클릭 시 상태 필터 연동
  const handleStatCardClick = (statusValue: string) => {
    if (activeStatCard === statusValue) {
      // 이미 선택된 카드를 다시 클릭하면 해제
      setActiveStatCard('');
      setFilterStatus('');
    } else {
      setActiveStatCard(statusValue);
      setFilterStatus(statusValue);
    }
    setCurrentPage(1);
  };

  // 인라인 담당자 저장
  const handleAssigneeSave = async (postId: string) => {
    try {
      await api.patch(`/tms/${postId}`, { assignee: editingAssigneeValue || undefined });
      setActionMsg({ type: 'success', text: MESSAGES.tms.assigneeChanged });
      setEditingAssigneeId(null);
      loadPosts();
    } catch (error) {
      console.error('[TMS] 담당자 변경 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.assigneeError });
    }
  };

  // 우선순위 기반 정렬 (긴급→높음→보통→낮음, 동일 우선순위 내 최신순)
  const sortedPosts = [...posts].sort((a, b) => {
    const priorityA = PRIORITY_SORT_ORDER[a.priority] ?? 2;
    const priorityB = PRIORITY_SORT_ORDER[b.priority] ?? 2;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // API base URL (이미지 썸네일용) — env.API_ORIGIN 이 `/api/v1` 제거된 origin 을 제공
  const apiBaseUrl = env.API_ORIGIN;
  const getFileUrl = (fileUrl: string) => encodeURI(`${apiBaseUrl}${fileUrl}`);

  // 알림 자동 닫기
  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="수정사항 관리"
        description="외부 수정사항/요청사항을 등록하고 관리합니다."
      />

      {/* 알림 메시지 */}
      {actionMsg && (
        <div className={`p-4 rounded-lg text-sm font-medium ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* 통계 카드 — 클릭 시 해당 상태로 필터링 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: '', label: '전체', count: stats.total, icon: ClipboardList, iconBg: 'bg-slate-100 dark:bg-slate-700', iconColor: 'text-slate-600 dark:text-slate-300' },
          { key: 'todo', label: 'TODO', count: stats.todo, icon: AlertCircle, iconBg: 'bg-slate-100 dark:bg-slate-700', iconColor: 'text-slate-500' },
          { key: 'in_progress', label: '진행중', count: stats.in_progress, icon: Clock, iconBg: 'bg-blue-50 dark:bg-blue-900/20', iconColor: 'text-blue-600 dark:text-blue-400' },
          { key: 'review', label: '리뷰', count: stats.review, icon: Eye, iconBg: 'bg-purple-50 dark:bg-purple-900/20', iconColor: 'text-purple-600 dark:text-purple-400' },
          { key: 'done', label: '완료', count: stats.done, icon: CheckCircle2, iconBg: 'bg-green-50 dark:bg-green-900/20', iconColor: 'text-green-600 dark:text-green-400' },
          { key: 'rejected', label: '반려', count: stats.rejected, icon: XCircle, iconBg: 'bg-red-50 dark:bg-red-900/20', iconColor: 'text-red-600 dark:text-red-400' },
        ].map((card) => {
          const Icon = card.icon;
          const isActive = activeStatCard === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => handleStatCardClick(card.key)}
              aria-pressed={isActive}
              className={`min-h-[44px] p-4 rounded-xl border text-left motion-reduce:transition-none transition-colors ${
                isActive
                  ? 'border-primary bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-400'
                  : 'border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${card.iconBg}`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{card.count}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{card.label}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 검색 + 필터 + 등록 버튼 */}
      <Card className="p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* 검색 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="제목, 내용, 작성자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 h-10"
              aria-label="수정사항 검색"
            />
          </div>
          {/* 필터 */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filterPlatform}
              onChange={(e) => { setFilterPlatform(e.target.value); setCurrentPage(1); }}
              aria-label="플랫폼 필터"
              className="h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 motion-reduce:transition-none"
            >
              {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
              aria-label="카테고리 필터"
              className="h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 motion-reduce:transition-none"
            >
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setActiveStatCard(e.target.value); setCurrentPage(1); }}
              aria-label="상태 필터"
              className="h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 motion-reduce:transition-none"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filterPriority}
              onChange={(e) => { setFilterPriority(e.target.value); setCurrentPage(1); }}
              aria-label="우선순위 필터"
              className="h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 motion-reduce:transition-none"
            >
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="h-10 px-5 text-sm font-semibold bg-primary hover:bg-primary-dark text-white shrink-0 motion-reduce:transition-none"
          >
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
            등록하기
          </Button>
        </div>
      </Card>

      {/* 테이블 */}
      <Card className="border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-slate-500 dark:text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p>등록된 수정사항이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">상태</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">우선순위</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">플랫폼</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 min-w-[200px]">제목</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">카테고리</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">작성자</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">담당자</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">마감일</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">등록일</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedPosts.map((post) => {
                  const sBadge = statusBadge(post.status);
                  const pBadge = priorityBadge(post.priority);
                  const plBadge = platformBadge(post.platform);
                  const dueDateInfo = getDueDateInfo(post.dueDate);
                  const firstImage = post.attachments.find(a => isImageFile(a.fileType));

                  return (
                    <tr
                      key={post.id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/tms/${post.id}`)}
                    >
                      {/* 상태 */}
                      <td className="px-4 py-3 text-center">
                        <select
                          value={post.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleStatusChange(post.id, e.target.value)}
                          className={`px-2 py-1 text-xs font-medium rounded-md border-0 cursor-pointer ${sBadge.className}`}
                        >
                          <option value="todo">TODO</option>
                          <option value="in_progress">진행중</option>
                          <option value="review">리뷰</option>
                          <option value="done">완료</option>
                          <option value="rejected">반려</option>
                        </select>
                      </td>
                      {/* 우선순위 */}
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs ${pBadge.className}`}>{pBadge.label}</Badge>
                      </td>
                      {/* 플랫폼 */}
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs ${plBadge.className}`}>{plBadge.label}</Badge>
                      </td>
                      {/* 제목 + 댓글수 + 이미지 썸네일 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* 이미지 첨부파일 썸네일 (24x24) — 클릭 시 팝업 */}
                          {firstImage && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: getFileUrl(firstImage.fileUrl), name: firstImage.fileName }); }}
                              className="shrink-0 hover:ring-2 hover:ring-blue-400 rounded transition-all"
                              title="이미지 크게 보기"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={getFileUrl(firstImage.fileUrl)}
                                alt=""
                                className="w-6 h-6 rounded object-cover border border-slate-200 dark:border-slate-600"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </button>
                          )}
                          {/* 첨부파일이 있지만 이미지가 아닌 경우 아이콘 */}
                          {!firstImage && post.attachments.length > 0 && (
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span
                            className="font-medium text-slate-900 dark:text-white truncate max-w-[250px]"
                            title={post.content.length > 100 ? post.content.slice(0, 100) + '...' : post.content}
                          >
                            {post.title}
                          </span>
                          {/* 댓글 수 뱃지 */}
                          {post.commentCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 shrink-0">
                              <MessageSquare className="w-3 h-3" />
                              <span>{post.commentCount}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 카테고리 */}
                      <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{categoryLabel(post.category)}</td>
                      {/* 작성자 */}
                      <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{post.authorName}</td>
                      {/* 담당자 — 인라인 편집 */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {editingAssigneeId === post.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="text"
                              value={editingAssigneeValue}
                              onChange={(e) => setEditingAssigneeValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAssigneeSave(post.id);
                                if (e.key === 'Escape') setEditingAssigneeId(null);
                              }}
                              autoFocus
                              className="w-20 px-1.5 py-0.5 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                              placeholder="담당자명"
                            />
                            <button
                              onClick={() => handleAssigneeSave(post.id)}
                              className="p-0.5 text-green-600 hover:text-green-700"
                              title="저장"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingAssigneeId(null)}
                              className="p-0.5 text-slate-400 hover:text-slate-600"
                              title="취소"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingAssigneeId(post.id);
                              setEditingAssigneeValue(post.assignee || '');
                            }}
                            className={`text-sm hover:underline ${
                              post.assignee
                                ? 'text-slate-600 dark:text-slate-400'
                                : 'text-slate-400 dark:text-slate-500 italic'
                            }`}
                            title="클릭하여 담당자 지정"
                          >
                            {post.assignee || '미지정'}
                          </button>
                        )}
                      </td>
                      {/* 마감일 — 경과/임박 표시 */}
                      <td className="px-4 py-3 text-center">
                        {post.dueDate ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={dueDateInfo ? dueDateInfo.colorClass : 'text-slate-600 dark:text-slate-400'}>
                              {formatDate(post.dueDate)}
                            </span>
                            {dueDateInfo && (
                              <span className={`text-xs ${dueDateInfo.colorClass}`}>
                                {dueDateInfo.label}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </td>
                      {/* 등록일 */}
                      <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-500 text-xs">{formatDate(post.createdAt)}</td>
                      {/* 관리 */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(post); }}
                          className="min-h-[40px] min-w-[40px] h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 motion-reduce:transition-none transition-colors"
                          aria-label={`${post.title} 삭제`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 — 건수 왼쪽 / 페이지 번호 가운데 / 같은 줄 */}
        <div className="relative flex items-center justify-center px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          {/* 건수 + 페이지사이즈 (왼쪽 고정) */}
          <div className="absolute left-4 flex items-center gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              전체 {totalCount}건
              {totalCount > 0 && (
                <span> 중 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)}</span>
              )}
            </p>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            >
              <option value={10}>10건</option>
              <option value={20}>20건</option>
              <option value={50}>50건</option>
            </select>
          </div>
          {/* 페이지 번호 (가운데) */}
          <div className="flex items-center gap-1" role="navigation" aria-label="페이지네이션">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="min-h-[40px] min-w-[40px] h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed motion-reduce:transition-none transition-colors"
              aria-label="첫 페이지"
            >
              <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="min-h-[40px] min-w-[40px] h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed motion-reduce:transition-none transition-colors"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            {(() => {
              const pages: number[] = [];
              const start = Math.max(1, currentPage - 2);
              const end = Math.min(totalPages, currentPage + 2);
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  aria-current={p === currentPage ? 'page' : undefined}
                  className={`min-h-[40px] min-w-[40px] w-10 h-10 text-sm rounded-lg motion-reduce:transition-none transition-colors tabular-nums ${
                    p === currentPage
                      ? 'bg-primary text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              ));
            })()}
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="min-h-[40px] min-w-[40px] h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed motion-reduce:transition-none transition-colors"
              aria-label="다음 페이지"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="min-h-[40px] min-w-[40px] h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed motion-reduce:transition-none transition-colors"
              aria-label="마지막 페이지"
            >
              <ChevronsRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>

      {/* 생성 모달 */}
      <Modal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); resetForm(); }} size="lg">
        <ModalHeader title="수정사항 등록" />
        <ModalBody>
          <div className="space-y-4">
            {/* 제목 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                제목 <span className="text-red-500">*</span>
              </label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="수정사항 제목을 입력하세요"
              />
            </div>

            {/* 내용 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="수정사항 내용을 상세히 입력하세요"
                rows={6}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
              />
            </div>

            {/* 플랫폼 / 카테고리 / 우선순위 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">플랫폼</label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  <option value="web">Web</option>
                  <option value="app">App</option>
                  <option value="admin">Admin</option>
                  <option value="backend">Backend</option>
                  <option value="other">기타</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">카테고리</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  <option value="bug">버그</option>
                  <option value="feature">기능 요청</option>
                  <option value="improvement">개선</option>
                  <option value="design">디자인</option>
                  <option value="other">기타</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">우선순위</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  <option value="low">낮음</option>
                  <option value="medium">보통</option>
                  <option value="high">높음</option>
                  <option value="critical">긴급</option>
                </select>
              </div>
            </div>

            {/* 작성자 / 이메일 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  작성자 이름 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formAuthorName}
                  onChange={(e) => setFormAuthorName(e.target.value)}
                  placeholder="이름"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">작성자 이메일</label>
                <Input
                  type="email"
                  value={formAuthorEmail}
                  onChange={(e) => setFormAuthorEmail(e.target.value)}
                  placeholder="이메일 (선택)"
                />
              </div>
            </div>

            {/* 담당자 / 마감일 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">담당자</label>
                <Input
                  value={formAssignee}
                  onChange={(e) => setFormAssignee(e.target.value)}
                  placeholder="담당자 이름 (선택)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">마감일</label>
                <Input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* 파일 업로드 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                첨부파일 ({uploadedFiles.length}/5)
              </label>
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    이미지 또는 PDF를 업로드하세요 (최대 10MB)
                  </p>
                  <label className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors">
                    <Upload className="w-4 h-4" />
                    파일 선택
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading || uploadedFiles.length >= 5}
                    />
                  </label>
                </div>

                {/* 업로드된 파일 목록 */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {uploadedFiles.map((file, idx) => (
                      <div key={file.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          {file.fileType.startsWith('image/') ? (
                            <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                          )}
                          <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{file.fileName}</span>
                          <span className="text-xs text-slate-400 shrink-0">({(file.fileSize / 1024).toFixed(1)}KB)</span>
                        </div>
                        <button
                          onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isUploading && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <LoadingSpinner />
                    <span>업로드 중...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => { setIsCreateModalOpen(false); resetForm(); }}>
            취소
          </Button>
          <Button onClick={handleCreate} disabled={isSubmitting} className="bg-primary hover:bg-primary-dark text-white">
            {isSubmitting ? '등록 중...' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="게시글 삭제"
        description={`"${deleteTarget?.title}" 게시글을 삭제하시겠습니까?`}
        confirmText="삭제하기"
        cancelText="취소"
        variant="danger"
      />

      {/* 이미지 미리보기 팝업 */}
      <Modal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        size="full"
        className="overflow-hidden"
      >
        {previewImage && (
          <>
            {/* 상단 바 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[400px]">
                {previewImage.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  download={previewImage.name}
                  className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  다운로드
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            {/* 이미지 */}
            <div className="flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-[80vw] max-h-[75vh] object-contain rounded"
                onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
