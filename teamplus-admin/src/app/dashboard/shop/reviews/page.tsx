'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
import { Star, Search, Eye, MessageSquare, Trash2, Check, X, ImageIcon } from 'lucide-react';
import { api } from '@/services/api-client';

interface Review {
  id: string;
  userId: string;
  userName: string;
  productId: string;
  productName: string;
  orderId?: string;
  rating: number;
  title?: string;
  content: string;
  images: string[];
  isVerified: boolean;
  isVisible: boolean;
  helpfulCount: number;
  adminReply?: string;
  repliedAt?: string;
  createdAt: string;
}

interface ApiReview {
  id: string;
  userName: string;
  className: string;
  instructorName?: string;
  rating: number;
  content: string;
  images: string[];
  isVisible: boolean;
  createdAt: string;
}

interface ApiReviewResponse {
  data: ApiReview[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

function mapApiReview(r: ApiReview): Review {
  return {
    id: r.id,
    userId: '',
    userName: r.userName,
    productId: '',
    productName: r.className,
    rating: r.rating,
    content: r.content,
    images: r.images ?? [],
    isVerified: false,
    isVisible: r.isVisible,
    helpfulCount: 0,
    createdAt: new Date(r.createdAt).toLocaleDateString('ko-KR'),
  };
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  const loadReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<ApiReviewResponse>('/reviews?limit=100');
      setReviews((res.data ?? []).map(mapApiReview));
    } catch (error) {
      console.error('[ReviewsPage] 리뷰 목록 로드 실패:', error);
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const filteredReviews = reviews.filter((review) => {
    const matchesSearch =
      review.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRating =
      ratingFilter === 'all' || review.rating === parseInt(ratingFilter);
    const matchesVisibility =
      visibilityFilter === 'all' ||
      (visibilityFilter === 'visible' && review.isVisible) ||
      (visibilityFilter === 'hidden' && !review.isVisible);
    return matchesSearch && matchesRating && matchesVisibility;
  });

  const handleViewDetail = (review: Review) => {
    setSelectedReview(review);
    setIsDetailOpen(true);
  };

  const handleOpenReply = (review: Review) => {
    setSelectedReview(review);
    setReplyContent(review.adminReply || '');
    setIsReplyOpen(true);
  };

  const handleSaveReply = async () => {
    if (!selectedReview) return;
    setIsReplyOpen(false);
    loadReviews();
  };

  const handleToggleVisibility = async (review: Review) => {
    try {
      await api.patch(`/reviews/${review.id}/visibility`, { isVisible: !review.isVisible });
      loadReviews();
    } catch (error) {
      console.error('[ReviewsPage] 공개 여부 변경 실패:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/reviews/${id}`);
      setConfirmAction(null);
      loadReviews();
    } catch (error) {
      console.error('[ReviewsPage] 리뷰 삭제 실패:', error);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300 dark:text-slate-600'
            }`}
          />
        ))}
      </div>
    );
  };

  const getAverageRating = () => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
  };

  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((review) => {
      distribution[review.rating as keyof typeof distribution]++;
    });
    return distribution;
  };

  const distribution = getRatingDistribution();

  if (isLoading) {
    return <LoadingSpinner message="리뷰 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="리뷰 관리"
        description="고객 리뷰를 관리하고 답변합니다."
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="text-sm text-slate-500 dark:text-slate-400">전체 리뷰</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{reviews.length.toLocaleString()}<span className="text-sm font-semibold ml-1">개</span></div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="text-sm text-slate-500 dark:text-slate-400">평균 평점</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{getAverageRating()}</span>
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" aria-hidden="true" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="text-sm text-slate-500 dark:text-slate-400">답변 대기</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {reviews.filter((r) => !r.adminReply).length.toLocaleString()}<span className="text-sm font-semibold ml-1">개</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="text-sm text-slate-500 dark:text-slate-400">비공개 리뷰</div>
          <div className="text-2xl font-bold text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {reviews.filter((r) => !r.isVisible).length.toLocaleString()}<span className="text-sm font-semibold ml-1">개</span>
          </div>
        </div>
      </div>

      {/* 평점 분포 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-white">평점 분포</h3>
        <div className="space-y-2.5">
          {[5, 4, 3, 2, 1].map((rating) => (
            <div key={rating} className="flex items-center gap-3">
              <span className="w-14 text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">{rating}점</span>
              <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-all duration-500 motion-reduce:transition-none"
                  style={{
                    width: `${reviews.length > 0 ? (distribution[rating as keyof typeof distribution] / reviews.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="w-14 text-sm text-slate-600 dark:text-slate-300 text-right tabular-nums font-medium">
                {distribution[rating as keyof typeof distribution].toLocaleString()}개
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="작성자, 상품명, 내용 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="평점" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 평점</SelectItem>
            <SelectItem value="5">5점</SelectItem>
            <SelectItem value="4">4점</SelectItem>
            <SelectItem value="3">3점</SelectItem>
            <SelectItem value="2">2점</SelectItem>
            <SelectItem value="1">1점</SelectItem>
          </SelectContent>
        </Select>
        <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="공개상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="visible">공개</SelectItem>
            <SelectItem value="hidden">비공개</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 리뷰 테이블 */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">작성자</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">상품</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">평점</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">내용</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">작성일</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    등록된 리뷰가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredReviews.map((review) => (
                  <tr key={review.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{review.userName}</span>
                        {review.isVerified && (
                          <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                            구매인증
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{review.productName}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center">
                        {renderStars(review.rating)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="max-w-xs mx-auto">
                        {review.title && (
                          <p className="font-medium text-sm truncate text-slate-900 dark:text-white">{review.title}</p>
                        )}
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{review.content}</p>
                        <div className="flex items-center justify-center gap-2 mt-1">
                          {review.images.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                              <ImageIcon className="h-3 w-3" />
                              {review.images.length}
                            </span>
                          )}
                          {review.adminReply && (
                            <Badge variant="outline" className="text-xs dark:border-slate-600 dark:text-slate-400">답변완료</Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {review.isVisible ? (
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">공개</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 dark:text-slate-400 dark:border-slate-600">비공개</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{review.createdAt}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(review)}
                          title="상세보기"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenReply(review)}
                          title="답변하기"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleVisibility(review)}
                          title={review.isVisible ? '비공개로 변경' : '공개로 변경'}
                        >
                          {review.isVisible ? (
                            <X className="h-4 w-4 text-slate-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmAction({ id: review.id, action: 'delete' })}
                          className="text-red-500 hover:text-red-700"
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {confirmAction?.id === review.id && (
                        <div className="flex items-center gap-2 mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <span className="text-xs text-red-700 dark:text-red-400">삭제된 리뷰는 복구할 수 없습니다.</span>
                          <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-6 text-xs">취소</Button>
                          <Button size="sm" onClick={() => handleDelete(review.id)} className="h-6 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 리뷰 상세 다이얼로그 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>리뷰 상세</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">{selectedReview.userName}</span>
                  {selectedReview.isVerified && (
                    <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                      구매인증
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">{selectedReview.createdAt}</span>
              </div>

              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">상품</p>
                <p className="font-medium text-slate-900 dark:text-white">{selectedReview.productName}</p>
                {selectedReview.orderId && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">주문번호: {selectedReview.orderId}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {renderStars(selectedReview.rating)}
                <span className="text-sm text-slate-500 dark:text-slate-400">{selectedReview.rating}점</span>
              </div>

              {selectedReview.title && (
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{selectedReview.title}</p>
                </div>
              )}

              <div>
                <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{selectedReview.content}</p>
              </div>

              {selectedReview.images.length > 0 && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">첨부 이미지</p>
                  <div className="flex gap-2">
                    {selectedReview.images.map((img, idx) => (
                      <div
                        key={idx}
                        className="w-20 h-20 bg-slate-100 dark:bg-slate-700 rounded flex items-center justify-center"
                      >
                        <ImageIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-sm text-slate-500 dark:text-slate-400">
                도움이 됨: {selectedReview.helpfulCount}명
              </div>

              {selectedReview.adminReply && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">관리자 답변</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{selectedReview.adminReply}</p>
                  {selectedReview.repliedAt && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{selectedReview.repliedAt}</p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 답변 다이얼로그 */}
      <Dialog open={isReplyOpen} onOpenChange={setIsReplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>관리자 답변</DialogTitle>
            <DialogDescription>
              고객 리뷰에 대한 답변을 작성합니다.
            </DialogDescription>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-slate-900 dark:text-white">{selectedReview.userName}</span>
                  <div className="flex items-center gap-1">
                    {renderStars(selectedReview.rating)}
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{selectedReview.content}</p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">답변 내용</label>
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="답변을 입력하세요..."
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReplyOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveReply}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
