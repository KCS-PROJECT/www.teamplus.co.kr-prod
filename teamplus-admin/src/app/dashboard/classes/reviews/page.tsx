'use client';

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Star, Search, Trash2, Eye, EyeOff, RefreshCw, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ClassReview {
  id: string;
  userName: string;
  className: string;
  instructorName: string;
  rating: number;
  content?: string;
  images: string[];
  isVisible: boolean;
  createdAt: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const RATING_LABELS: Record<number, string> = {
  1: '별로예요',
  2: '아쉬워요',
  3: '보통이에요',
  4: '좋았어요',
  5: '최고예요',
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`별점 ${rating}점`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-600'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function ClassReviewsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [reviews, setReviews] = useState<ClassReview[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [selectedReview, setSelectedReview] = useState<ClassReview | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  const fetchReviews = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await api.get<Record<string, unknown>>('/reviews', {
        params: { page, limit: 20 },
      });
      const reviewData = (res.data ?? (Array.isArray(res) ? res : [])) as ClassReview[];
      const paginationData = res.pagination as PaginationInfo | undefined ?? null;
      setReviews(reviewData);
      setPagination(paginationData);
      setCurrentPage(page);
    } catch {
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews(1);
  }, [fetchReviews]);

  const toggleVisibility = async (id: string, current: boolean) => {
    try {
      await api.patch(`/reviews/${id}/visibility`, { isVisible: !current });
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isVisible: !current } : r)),
      );
      if (selectedReview?.id === id) {
        setSelectedReview((prev) => prev ? { ...prev, isVisible: !current } : null);
      }
    } catch {
      setActionMsg({ type: 'error', text: MESSAGES.review.visibilityError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const deleteReview = async (id: string) => {
    try {
      await api.delete(`/reviews/${id}`);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      if (selectedReview?.id === id) setSelectedReview(null);
    } catch {
      setActionMsg({ type: 'error', text: MESSAGES.review.deleteError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const filtered = reviews.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      r.userName.toLowerCase().includes(q) ||
      r.className.toLowerCase().includes(q) ||
      r.instructorName.toLowerCase().includes(q);
    const matchesRating = ratingFilter === 'all' || r.rating === Number(ratingFilter);
    return matchesSearch && matchesRating;
  });

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '0.0';

  const hiddenCount = reviews.filter((r) => !r.isVisible).length;

  if (isLoading) {
    return <LoadingSpinner message="수업 리뷰를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            actionMsg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{actionMsg.text}</span>
        </div>
      )}

      <PageHeader
        title="수업 리뷰 관리"
        description="학부모가 작성한 수업 리뷰를 확인하고 공개 또는 비공개를 관리합니다."
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">전체 리뷰</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums text-slate-900 dark:text-white">
            {pagination?.total ?? reviews.length}
            <span className="ml-1 text-sm font-medium text-slate-500 dark:text-slate-400">건</span>
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">평균 별점</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-black tabular-nums text-slate-900 dark:text-white">{avgRating}</p>
            <p className="text-sm font-medium text-slate-400">/ 5.0</p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">비공개 리뷰</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
              <EyeOff className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums text-slate-900 dark:text-white">
            {hiddenCount}
            <span className="ml-1 text-sm font-medium text-slate-500 dark:text-slate-400">건</span>
          </p>
        </Card>
      </div>

      {/* 필터 */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="회원명, 수업명, 코치명으로 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="별점 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 별점</SelectItem>
                <SelectItem value="5">5점</SelectItem>
                <SelectItem value="4">4점</SelectItem>
                <SelectItem value="3">3점</SelectItem>
                <SelectItem value="2">2점</SelectItem>
                <SelectItem value="1">1점</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => fetchReviews(currentPage)} aria-label="새로고침">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>

      {/* 리뷰 목록 */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-16 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">등록된 리뷰가 없습니다.</p>
          </Card>
        )}
        {filtered.map((review) => (
          <Card key={review.id} className={`p-5 transition-opacity motion-reduce:transition-none ${!review.isVisible ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {review.userName}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {review.className}
                  </Badge>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{review.instructorName} 코치</span>
                  {!review.isVisible && (
                    <Badge variant="secondary" className="bg-slate-100 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      비공개
                    </Badge>
                  )}
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <StarDisplay rating={review.rating} />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {RATING_LABELS[review.rating]}
                  </span>
                </div>
                {review.content ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {review.content}
                  </p>
                ) : (
                  <p className="text-xs italic text-slate-400 dark:text-slate-500">내용 없음 (별점만 등록)</p>
                )}
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedReview(review)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors motion-reduce:transition-none hover:bg-slate-100 hover:text-primary dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-primary"
                  aria-label="상세 보기"
                  title="상세 보기"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleVisibility(review.id, review.isVisible)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors motion-reduce:transition-none hover:bg-slate-100 hover:text-primary dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-primary"
                  aria-label={review.isVisible ? '숨기기' : '공개로 전환'}
                  title={review.isVisible ? '숨기기' : '공개'}
                >
                  {review.isVisible ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ id: review.id, action: 'delete' })}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-rose-500 transition-colors motion-reduce:transition-none hover:bg-rose-50 dark:hover:bg-rose-900/20"
                  aria-label="리뷰 신고 또는 삭제"
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            {confirmAction?.id === review.id && confirmAction.action === 'delete' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-900/20">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                <span className="flex-1 text-sm font-semibold text-rose-700 dark:text-rose-300">정말 삭제하시겠습니까?</span>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => { void deleteReview(review.id); setConfirmAction(null); }}
                  className="inline-flex h-9 items-center rounded-md bg-rose-600 px-3 text-xs font-bold text-white transition-colors motion-reduce:transition-none hover:bg-rose-700"
                >
                  삭제하기
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => fetchReviews(currentPage - 1)}
          >
            이전
          </Button>
          <span className="px-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            {currentPage} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pagination.totalPages}
            onClick={() => fetchReviews(currentPage + 1)}
          >
            다음
          </Button>
        </div>
      )}

      {/* 상세 다이얼로그 */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>리뷰 상세</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-base font-bold text-slate-900 dark:text-white">{selectedReview.userName}</p>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {selectedReview.className} · {selectedReview.instructorName} 코치
                  </p>
                </div>
                <StarDisplay rating={selectedReview.rating} />
              </div>
              <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {RATING_LABELS[selectedReview.rating]}
                </p>
                {selectedReview.content ? (
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {selectedReview.content}
                  </p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500">상세 후기 없음</p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                <span className="text-slate-400 dark:text-slate-500">
                  작성일: {new Date(selectedReview.createdAt).toLocaleDateString('ko-KR')}
                </span>
                <Badge variant={selectedReview.isVisible ? 'outline' : 'secondary'}>
                  {selectedReview.isVisible ? '공개' : '비공개'}
                </Badge>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => toggleVisibility(selectedReview.id, selectedReview.isVisible)}
                >
                  {selectedReview.isVisible ? '비공개로 전환' : '공개로 전환'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction({ id: selectedReview.id, action: 'deleteDialog' })}
                >
                  삭제
                </Button>
              </div>
              {confirmAction?.id === selectedReview.id && confirmAction.action === 'deleteDialog' && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-900/20">
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  <span className="flex-1 text-sm font-semibold text-rose-700 dark:text-rose-300">정말 삭제하시겠습니까?</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmAction(null)}
                    className="h-9 text-xs"
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { void deleteReview(selectedReview.id); setConfirmAction(null); }}
                    className="h-9 bg-rose-600 text-xs text-white hover:bg-rose-700"
                  >
                    삭제하기
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
