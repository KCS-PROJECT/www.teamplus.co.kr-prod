'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import { uploadFile, toAbsoluteUrl } from '@/services/upload.service';
import { RichTextEditor } from '@/components/blog/RichTextEditor';
import { ActionToast, type ActionToastValue } from '@/components/common';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  FileText,
  Pin,
  Eye,
  EyeOff,
  Send,
  Calendar,
  ImagePlus,
  X,
  Loader2,
} from 'lucide-react';

// ===== 백엔드 계약 (teamplus-backend/src/blog) =====
type BlogCategory = 'NEWS' | 'GUIDE' | 'EVENT' | 'PRESS';
type BlogStatus = 'DRAFT' | 'PUBLISHED';

interface BlogListItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: BlogCategory;
  coverImageUrl?: string | null;
  status: BlogStatus;
  pinned: boolean;
  viewCount: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BlogDetail extends BlogListItem {
  content: string;
  authorId?: string | null;
}

interface BlogListResponse {
  items: BlogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const CATEGORY_META: Record<BlogCategory, { label: string; color: string }> = {
  NEWS: {
    label: '소식',
    color: 'bg-primary/5 dark:bg-primary/20 text-blue-700 dark:text-primary-light border-blue-200 dark:border-blue-700',
  },
  GUIDE: {
    label: '가이드',
    color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
  },
  EVENT: {
    label: '이벤트',
    color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  },
  PRESS: {
    label: '보도자료',
    color: 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  },
};

const CATEGORIES: BlogCategory[] = ['NEWS', 'GUIDE', 'EVENT', 'PRESS'];

// 서버 검증 실패(400) 응답에서 사용자 친화적 메시지 추출
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

// 리치텍스트 HTML 이 실제 내용이 있는지(빈 <p></p> 제외) 검사
const htmlToText = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

interface BlogFormData {
  title: string;
  summary: string;
  content: string;
  category: BlogCategory;
  coverImageUrl: string;
  status: BlogStatus;
  pinned: boolean;
}

const EMPTY_FORM: BlogFormData = {
  title: '',
  summary: '',
  content: '',
  category: 'NEWS',
  coverImageUrl: '',
  status: 'DRAFT',
  pinned: false,
};

const ITEMS_PER_PAGE = 6;

export default function BlogAdminPage() {
  const searchId = useId();
  const titleId = useId();
  const summaryId = useId();
  const categoryId = useId();
  const statusId = useId();

  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<BlogListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | BlogCategory>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<BlogFormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [actionMsg, setActionMsg] = useState<ActionToastValue>(null);

  const notify = useCallback((type: 'success' | 'error', text: string, ms = 3000) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), ms);
  }, []);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<BlogListResponse>('/blog/admin/list?pageSize=100');
      setPosts(res?.items ?? []);
    } catch (error) {
      console.error('[BlogAdminPage] 목록 조회 실패:', error);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory]);

  const filtered = posts.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      p.title.toLowerCase().includes(term) || p.summary.toLowerCase().includes(term);
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.status === 'PUBLISHED').length,
    draft: posts.filter((p) => p.status === 'DRAFT').length,
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = async (post: BlogListItem) => {
    setEditingId(post.id);
    setFormData({
      title: post.title,
      summary: post.summary,
      content: '',
      category: post.category,
      coverImageUrl: post.coverImageUrl ?? '',
      status: post.status,
      pinned: post.pinned,
    });
    setShowModal(true);
    // 목록에는 content 가 없으므로 상세를 별도 조회
    setIsLoadingDetail(true);
    try {
      const detail = await api.get<BlogDetail>(`/blog/admin/${post.id}`);
      setFormData((prev) => ({ ...prev, content: detail?.content ?? '' }));
    } catch (error) {
      console.error('[BlogAdminPage] 상세 조회 실패:', error);
      notify('error', '본문을 불러오지 못했습니다.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file, { category: 'IMAGE', refType: 'blog' });
      setFormData((prev) => ({ ...prev, coverImageUrl: toAbsoluteUrl(uploaded.url) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.';
      notify('error', message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    const title = formData.title.trim();
    const summary = formData.summary.trim();
    const contentText = htmlToText(formData.content);

    if (title.length < 2) return notify('error', '제목을 2자 이상 입력해주세요.');
    if (title.length > 200) return notify('error', '제목은 200자 이하로 입력해주세요.');
    if (summary.length < 2) return notify('error', '요약을 입력해주세요.');
    if (summary.length > 500) return notify('error', '요약은 500자 이하로 입력해주세요.');
    if (contentText.length < 1) return notify('error', '본문을 입력해주세요.');

    setIsSubmitting(true);
    try {
      const payload = {
        title,
        summary,
        content: formData.content,
        category: formData.category,
        coverImageUrl: formData.coverImageUrl || undefined,
        status: formData.status,
        pinned: formData.pinned,
      };

      if (editingId) {
        await api.patch<BlogDetail>(`/blog/${editingId}`, payload);
        notify('success', '수정되었습니다.');
      } else {
        await api.post<BlogDetail>('/blog', payload);
        notify('success', '등록되었습니다.');
      }
      setShowModal(false);
      setEditingId(null);
      setFormData(EMPTY_FORM);
      await loadPosts();
    } catch (error) {
      console.error('[BlogAdminPage] 저장 실패:', error);
      notify('error', extractServerErrorMessage(error, '저장에 실패했습니다. 다시 시도해주세요.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/blog/${id}`);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setDeletingId(null);
      notify('success', '삭제되었습니다.');
    } catch (error) {
      console.error('[BlogAdminPage] 삭제 실패:', error);
      notify('error', '삭제에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleTogglePublish = async (id: string) => {
    try {
      const res = await api.patch<{ id: string; status: BlogStatus; publishedAt: string | null }>(
        `/blog/${id}/publish`,
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: res.status, publishedAt: res.publishedAt } : p,
        ),
      );
    } catch (error) {
      console.error('[BlogAdminPage] 발행 토글 실패:', error);
      notify('error', '상태 변경에 실패했습니다.');
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="블로그 글을 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <ActionToast value={actionMsg} onClose={() => setActionMsg(null)} />

      <PageHeader title="블로그 관리" subtitle={`전체 ${posts.length}개의 글`} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniStatsCard title="전체 글" value={stats.total} icon={<FileText className="w-5 h-5" />} variant="primary" />
        <MiniStatsCard title="발행됨" value={stats.published} icon={<Send className="w-5 h-5" />} variant="success" />
        <MiniStatsCard title="임시저장" value={stats.draft} icon={<EyeOff className="w-5 h-5" />} variant="warning" />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 relative w-full sm:max-w-md">
          <label htmlFor={searchId} className="sr-only">블로그 검색</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <Input
            id={searchId}
            placeholder="제목, 요약으로 검색해주세요"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="블로그 검색"
            className="pl-10 h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="tablist" aria-label="카테고리 필터">
            {(['all', ...CATEGORIES] as const).map((cat) => (
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
                {cat === 'all' ? '전체' : CATEGORY_META[cat].label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="gap-2 h-11 bg-primary hover:bg-primary-dark text-white"
            aria-label="새 글 작성"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">글 작성</span>
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {paginated.map((post) => (
          <Card
            key={post.id}
            className={`bg-white dark:bg-slate-800 border overflow-hidden ${
              post.pinned ? 'border-amber-300 dark:border-amber-600' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="p-4 sm:p-5 flex items-start gap-4">
              {/* Cover thumbnail */}
              <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 relative">
                {post.coverImageUrl ? (
                  // 백엔드 업로드 이미지(외부 오리진)라 next/image 최적화 대신 일반 img 사용
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.coverImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                    <ImagePlus className="w-6 h-6" aria-hidden="true" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge variant="outline" className={`${CATEGORY_META[post.category].color} border text-xs`}>
                    {CATEGORY_META[post.category].label}
                  </Badge>
                  {post.pinned && (
                    <Badge variant="outline" className="border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 text-xs">
                      <Pin className="w-3 h-3 mr-1" />고정
                    </Badge>
                  )}
                  {post.status === 'DRAFT' ? (
                    <Badge variant="outline" className="border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs">
                      <EyeOff className="w-3 h-3 mr-1" />임시저장
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 text-xs">
                      <Eye className="w-3 h-3 mr-1" />발행됨
                    </Badge>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(post)}
                  className="text-left text-base font-semibold text-slate-900 dark:text-white mb-1 hover:text-primary transition-colors motion-reduce:transition-none line-clamp-1"
                  aria-label={`${post.title} 수정`}
                >
                  {post.title}
                </button>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">{post.summary}</p>

                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(post.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {post.viewCount}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePublish(post.id)}
                  className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                    post.status === 'PUBLISHED'
                      ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-green-600 dark:text-green-400'
                      : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-400 dark:text-slate-500'
                  }`}
                  title={post.status === 'PUBLISHED' ? '발행 취소' : '발행하기'}
                  aria-label={post.status === 'PUBLISHED' ? '발행 취소' : '발행하기'}
                  aria-pressed={post.status === 'PUBLISHED'}
                >
                  {post.status === 'PUBLISHED' ? <Eye className="w-4 h-4" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(post)}
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center hover:bg-primary/5 dark:hover:bg-primary/20 rounded-lg transition-colors motion-reduce:transition-none"
                  title="수정"
                  aria-label="글 수정"
                >
                  <Edit2 className="w-4 h-4 text-blue-600 dark:text-primary-light" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingId(post.id)}
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                  title="삭제"
                  aria-label="글 삭제"
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
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
          ))}
        </div>
      )}

      {paginated.length === 0 && (
        <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {searchTerm || filterCategory !== 'all' ? '검색 결과가 없습니다.' : '등록된 블로그 글이 없습니다.'}
          </p>
        </Card>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingId(null); }} size="xl">
        <ModalHeader title={editingId ? '블로그 글 수정' : '새 블로그 글 작성'} />
        <ModalBody scrollable maxHeight="70vh">
          <div className="space-y-4">
            {/* Cover */}
            <div>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">커버 이미지</span>
              <div className="flex items-center gap-3">
                <div className="w-28 h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 relative flex items-center justify-center">
                  {formData.coverImageUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={formData.coverImageUrl} alt="커버 미리보기" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, coverImageUrl: '' }))}
                        className="absolute top-1 right-1 w-6 h-6 inline-flex items-center justify-center rounded-full bg-black/60 text-white"
                        aria-label="커버 이미지 제거"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <ImagePlus className="w-6 h-6 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  )}
                </div>
                <label className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {isUploading ? '업로드 중...' : '이미지 선택'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    disabled={isUploading}
                    onChange={handleCoverUpload}
                  />
                </label>
              </div>
            </div>

            {/* Title */}
            <div>
              <label htmlFor={titleId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                제목 <span className="text-red-500">*</span>
              </label>
              <Input
                id={titleId}
                placeholder="글 제목 (2~200자)"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                maxLength={200}
                className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
              />
            </div>

            {/* Summary */}
            <div>
              <label htmlFor={summaryId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                요약 <span className="text-red-500">*</span>
              </label>
              <textarea
                id={summaryId}
                placeholder="목록 카드에 노출될 한두 문장 요약 (최대 500자)"
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-y"
              />
            </div>

            {/* Category + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={categoryId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">카테고리</label>
                <select
                  id={categoryId}
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as BlogCategory })}
                  className="w-full h-11 px-3 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={statusId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">발행 상태</label>
                <select
                  id={statusId}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as BlogStatus })}
                  className="w-full h-11 px-3 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                >
                  <option value="DRAFT">임시저장 (비공개)</option>
                  <option value="PUBLISHED">발행 (공개)</option>
                </select>
              </div>
            </div>

            {/* Content */}
            <div>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                본문 <span className="text-red-500">*</span>
              </span>
              {isLoadingDetail ? (
                <div className="min-h-[380px] rounded-lg border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 본문 불러오는 중...
                </div>
              ) : (
                <RichTextEditor
                  value={formData.content}
                  onChange={(html) => setFormData((prev) => ({ ...prev, content: html }))}
                />
              )}
            </div>

            {/* Pinned */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="blogPinned"
                checked={formData.pinned}
                onChange={(e) => setFormData({ ...formData, pinned: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
              />
              <label htmlFor="blogPinned" className="text-sm text-slate-700 dark:text-slate-300">상단 고정</label>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            onClick={() => { setShowModal(false); setEditingId(null); }}
            variant="outline"
            className="flex-1 h-11 border-slate-200 dark:border-slate-600"
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
            disabled={isSubmitting || isUploading || isLoadingDetail}
          >
            {isSubmitting ? '저장 중...' : editingId ? '수정하기' : '저장하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && handleDelete(deletingId)}
        title="글을 삭제하시겠습니까?"
        description="이 작업은 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
      />
    </div>
  );
}
