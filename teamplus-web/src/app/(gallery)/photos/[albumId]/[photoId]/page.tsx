'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { openShareSheet } from '@/lib/share';
import { api } from '@/services/api-client';
import { ReportModal } from '@/components/moderation/ReportModal';
import { useFullscreen } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

interface PhotoComment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

interface Photo {
  id: string;
  url: string;
  thumbnail: string;
  caption: string;
  likes: number;
  isLiked: boolean;
  comments: PhotoComment[];
  uploadedAt: string;
  uploadedBy: string;
  uploaderId: string;
}

export default function PhotoViewerPage() {
  const params = useParams();
  const { back } = useNavigation();
  const { toast } = useToast();
  const albumId = (params?.albumId as string) || '';
  const photoId = (params?.photoId as string) || '';

  // Native AppBar/BottomNav/StatusBar 모두 숨김 (몰입형 갤러리 뷰)
  // [appbar-harness-v2 SPEC §5 Step E] '의도된 비AppBar' — 풀스크린 사진 뷰어. PageAppBar 미적용은
  //   team-lead 가 허용한 예외 (Task #6 instruction). 페이지는 자체 dark 오버레이 헤더(line 254)와
  //   safe-area-inset-top 패딩으로 시스템 statusBar 영역과 자연스럽게 어울리도록 설계됨.
  useFullscreen();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // v18 (2026-05-20, audit §4 C #5): 현재 사진 데이터 도착 후 ready.
  // 빈 photos 배열로 시작하므로 첫 데이터 도착 + activeIndex 매칭 전까지 hide 금지.
  const currentPhotoReady = photos.length > 0 && !!photos[activeIndex];
  usePageReady(currentPhotoReady);
  const [showControls, setShowControls] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [newComment, setNewComment] = useState('');

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!albumId) return;
    const load = async () => {
      const res = await api.get<{
        id: string;
        photos?: {
          id: string; imageUrl?: string; url?: string; thumbnail?: string;
          caption?: string; likesCount?: number; likes?: number; isLiked?: boolean;
          comments?: { id: string; author?: string; authorName?: string; content: string; createdAt?: string }[];
          uploadedAt?: string; createdAt?: string;
          uploadedBy?: string; uploaderName?: string;
          uploaderId?: string;
          uploader?: { id: string; firstName?: string; lastName?: string };
        }[];
      }>(`/gallery/albums/${albumId}`);
      if (res.success && res.data) {
        const mapped: Photo[] = (res.data.photos ?? []).map((p) => ({
          id: p.id,
          url: p.imageUrl ?? p.url ?? '',
          thumbnail: p.thumbnail ?? p.imageUrl ?? p.url ?? '',
          caption: p.caption ?? '',
          likes: p.likesCount ?? (typeof p.likes === 'number' ? p.likes : 0),
          isLiked: p.isLiked ?? false,
          comments: (p.comments ?? []).map((c) => ({
            id: c.id,
            author: c.author ?? c.authorName ?? '회원',
            content: c.content,
            createdAt: c.createdAt ? new Date(c.createdAt).toLocaleString('ko-KR') : '',
          })),
          uploadedAt: p.uploadedAt ?? (p.createdAt ? new Date(p.createdAt).toLocaleDateString('ko-KR') : ''),
          uploadedBy:
            p.uploadedBy ??
            p.uploaderName ??
            (p.uploader ? `${p.uploader.lastName ?? ''}${p.uploader.firstName ?? ''}`.trim() : '') ??
            '',
          uploaderId: p.uploaderId ?? p.uploader?.id ?? '',
        }));
        setPhotos(mapped);
        const idx = mapped.findIndex((p) => p.id === photoId);
        const startIdx = idx >= 0 ? idx : 0;
        setActiveIndex(startIdx);
        setIsLiked(mapped[startIdx]?.isLiked ?? false);
        setLikeCount(mapped[startIdx]?.likes ?? 0);
      }
    };
    void load();
  }, [albumId, photoId]);

  const currentPhoto = photos[activeIndex];
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < photos.length - 1;

  // Auto-hide controls
  useEffect(() => {
    if (showControls && !showComments) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [showControls, showComments]);

  // Update like state when photo changes
  useEffect(() => {
    setIsLiked(photos[activeIndex]?.isLiked ?? false);
    setLikeCount(photos[activeIndex]?.likes ?? 0);
  }, [activeIndex, photos]);

  const handleBack = useCallback(() => {
    back();
  }, [back]);

  const toggleControls = useCallback(() => {
    if (!showComments) {
      setShowControls((prev) => !prev);
    }
  }, [showComments]);

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      setActiveIndex((prev) => prev - 1);
      setShowControls(true);
    }
  }, [hasPrev]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setActiveIndex((prev) => prev + 1);
      setShowControls(true);
    }
  }, [hasNext]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartX.current || !touchEndX.current) return;

    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0 && hasNext) {
        goToNext();
      } else if (diff < 0 && hasPrev) {
        goToPrev();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  }, [hasNext, hasPrev, goToNext, goToPrev]);

  const handleLike = useCallback(() => {
    setIsLiked((prev) => !prev);
    setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
  }, [isLiked]);

  const handleShare = useCallback(() => {
    openShareSheet({
      title: currentPhoto?.caption || '사진 공유',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
  }, [currentPhoto]);

  const handleDownload = useCallback(async () => {
    if (!currentPhoto) return;
    try {
      const response = await fetch(currentPhoto.url, { mode: 'cors' });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `photo-${currentPhoto.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast.success(MESSAGES.gallery.photoSaved);
    } catch {
      // CORS 제한 시 새 탭 열기로 폴백
      window.open(currentPhoto.url, '_blank');
    }
  }, [currentPhoto, toast]);

  const handleSubmitComment = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      toast.success(MESSAGES.gallery.commentPosted);
      setNewComment('');
    }
  }, [newComment, toast]);

  const toggleComments = useCallback(() => {
    setShowComments((prev) => !prev);
    setShowControls(true);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') {
        if (showComments) {
          setShowComments(false);
        } else {
          handleBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, handleBack, showComments]);

  if (!currentPhoto) {
    return (
      <div
        className="min-h-screen bg-black flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-white text-base">사진을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="사진 뷰어"
    >
      {/* Header */}
      <header
        className={cn(
          'absolute top-0 left-0 right-0 z-30 transition-opacity motion-reduce:transition-none duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className="bg-black/50 px-4 py-3"
          style={{
            paddingTop:
              'calc(0.75rem + var(--safe-area-inset-top, env(safe-area-inset-top, 2.25rem)))',
          }}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              aria-label="사진 뷰어 닫기"
              className="p-2 -ml-2 rounded-w-pill hover:bg-white/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white"
            >
              <Icon name="close" className="text-white text-2xl" aria-hidden="true" />
            </button>

            <div
              className="text-center"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-white/80 text-card-body font-medium">
                {activeIndex + 1} / {photos.length}
              </span>
            </div>

            <button
              type="button"
              aria-label="사진 신고하기"
              onClick={() =>
                currentPhoto?.uploaderId
                  ? setShowReport(true)
                  : toast.error(MESSAGES.error.general)
              }
              className="p-2 -mr-2 rounded-w-pill hover:bg-white/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white"
            >
              <Icon name="flag" className="text-white text-2xl" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Image Area */}
      <div
        className="flex-1 relative flex items-center justify-center"
        onClick={toggleControls}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Previous Button */}
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            aria-label="이전 사진 보기"
            className={cn(
              'absolute left-2 z-20 p-2 rounded-w-pill bg-black/30 hover:bg-black/50 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white',
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <Icon name="chevron_left" className="text-white text-3xl" aria-hidden="true" />
          </button>
        )}

        {/* Image */}
        <div className="relative w-full h-full">
          <Image
            src={currentPhoto.url}
            alt={currentPhoto.caption || '사진'}
            fill
            className="object-contain"
            priority
            sizes="100vw"
          />
        </div>

        {/* Next Button */}
        {hasNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            aria-label="다음 사진 보기"
            className={cn(
              'absolute right-2 z-20 p-2 rounded-w-pill bg-black/30 hover:bg-black/50 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white',
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <Icon name="chevron_right" className="text-white text-3xl" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Bottom Controls */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-30 transition-opacity motion-reduce:transition-none duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="bg-black/50 px-4 py-6 pb-8">
          {/* Caption */}
          {currentPhoto.caption && (
            <p className="text-white text-card-body mb-4 line-clamp-2">
              {currentPhoto.caption}
            </p>
          )}

          {/* Photo Info */}
          <div className="flex items-center gap-2 text-white/60 text-card-meta mb-4">
            <span>{currentPhoto.uploadedBy}</span>
            <span className="w-1 h-1 rounded-w-pill bg-white/40" />
            <span>{currentPhoto.uploadedAt}</span>
          </div>

          {/* Action Buttons */}
          <div
            className="flex items-center justify-around"
            role="toolbar"
            aria-label="사진 동작"
          >
            <button
              type="button"
              onClick={handleLike}
              aria-label={isLiked ? '좋아요 취소하기' : '좋아요 표시하기'}
              aria-pressed={isLiked}
              className="flex flex-col items-center gap-1 px-4 py-2 group min-h-[56px] min-w-[56px] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white rounded-lg"
            >
              <Icon
                name="favorite"
                filled={isLiked}
                className={cn(
                  'text-2xl transition-colors motion-reduce:transition-none',
                  isLiked ? 'text-red-500' : 'text-white group-hover:text-red-400'
                )}
                aria-hidden="true"
              />
              <span className="text-white/80 text-card-meta font-medium">{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={toggleComments}
              aria-label={`댓글 보기, ${currentPhoto.comments.length}개`}
              aria-expanded={showComments}
              className="flex flex-col items-center gap-1 px-4 py-2 group min-h-[56px] min-w-[56px] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white rounded-lg"
            >
              <Icon
                name="chat_bubble"
                className="text-white text-2xl group-hover:text-ice-500 transition-colors motion-reduce:transition-none"
                aria-hidden="true"
              />
              <span className="text-white/80 text-card-meta font-medium">
                {currentPhoto.comments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label="사진 공유하기"
              className="flex flex-col items-center gap-1 px-4 py-2 group min-h-[56px] min-w-[56px] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white rounded-lg"
            >
              <Icon
                name="share"
                className="text-white text-2xl group-hover:text-ice-500 transition-colors motion-reduce:transition-none"
                aria-hidden="true"
              />
              <span className="text-white/80 text-card-meta font-medium">공유</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              aria-label="사진 저장하기"
              className="flex flex-col items-center gap-1 px-4 py-2 group min-h-[56px] min-w-[56px] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white rounded-lg"
            >
              <Icon
                name="download"
                className="text-white text-2xl group-hover:text-ice-500 transition-colors motion-reduce:transition-none"
                aria-hidden="true"
              />
              <span className="text-white/80 text-card-meta font-medium">저장</span>
            </button>
          </div>
        </div>
      </div>

      {/* Thumbnail Navigation */}
      <div
        className={cn(
          'absolute bottom-32 left-0 right-0 z-20 px-4 transition-opacity motion-reduce:transition-none duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className="flex gap-1 overflow-x-auto hide-scrollbar py-2 justify-center"
          role="tablist"
          aria-label="사진 썸네일 목록"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(index);
              }}
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`${index + 1}번째 사진으로 이동`}
              className={cn(
                'relative w-12 h-12 flex-shrink-0 rounded overflow-hidden transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white',
                index === activeIndex
                  ? 'ring-2 ring-white scale-110'
                  : 'opacity-50 hover:opacity-80'
              )}
            >
              <Image
                src={photo.thumbnail || photo.url}
                alt=""
                fill
                className="object-cover"
                sizes="48px"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Comments Panel */}
      {showComments && (
        <div
          className="absolute inset-0 z-40 bg-black/80"
          onClick={toggleComments}
          role="dialog"
          aria-modal="true"
          aria-label="사진 댓글"
        >
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] bg-white dark:bg-rink-900 rounded-t-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Comments Header */}
            <div className="sticky top-0 bg-white dark:bg-rink-900 border-b border-wline dark:border-rink-700 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-wtext-1 dark:text-white">
                  댓글 {currentPhoto.comments.length}
                </h3>
                <button
                  type="button"
                  onClick={toggleComments}
                  aria-label="댓글 패널 닫기"
                  className="p-1 rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ice-500"
                >
                  <Icon name="close" className="text-wtext-2 dark:text-rink-300" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Comments List */}
            <div className="overflow-y-auto max-h-[calc(70vh-120px)] p-4">
              {currentPhoto.comments.length === 0 ? (
                <div className="text-center py-8">
                  <Icon
                    name="chat_bubble_outline"
                    className="text-4xl text-wtext-4 dark:text-rink-500 mb-2"
                  />
                  <p className="text-wtext-3 dark:text-rink-300 text-card-body">
                    아직 댓글이 없습니다.
                  </p>
                  <p className="text-wtext-3 dark:text-rink-300 text-card-meta mt-1">
                    첫 번째 댓글을 남겨보세요!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentPhoto.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-w-pill bg-wline dark:bg-rink-700 flex items-center justify-center flex-shrink-0">
                        <Icon
                          name="person"
                          size={18}
                          className="text-wtext-3 dark:text-rink-300 text-[18px]"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-card-body text-wtext-1 dark:text-white">
                            {comment.author}
                          </span>
                          <span className="text-card-meta text-wtext-3 dark:text-rink-300">
                            {comment.createdAt}
                          </span>
                        </div>
                        <p className="text-card-body text-wtext-2 dark:text-rink-100">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comment Input */}
            <div className="sticky bottom-0 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-700 p-4">
              <form onSubmit={handleSubmitComment} className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={MESSAGES.placeholders.enterComment}
                  aria-label="댓글 입력"
                  maxLength={500}
                  className="flex-1 px-4 py-2.5 bg-wline-2 dark:bg-rink-800 rounded-w-pill text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim()}
                  className="p-2.5 bg-ice-500 text-white rounded-w-pill disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ice-500/90 transition-colors motion-reduce:transition-none"
                >
                  <Icon name="send" size={20} className="text-[20px]" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Swipe Indicator (mobile) */}
      <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-20 pointer-events-none md:hidden">
        <div
          className={cn(
            'flex gap-1.5 transition-opacity motion-reduce:transition-none duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          {photos.map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-1.5 h-1.5 rounded-w-pill transition-all motion-reduce:transition-none',
                index === activeIndex
                  ? 'bg-white w-4'
                  : 'bg-white/40'
              )}
            />
          ))}
        </div>
      </div>

      {/* UGC 미디어 신고 모달 */}
      {showReport && currentPhoto?.uploaderId && (
        <ReportModal
          reportedId={currentPhoto.uploaderId}
          targetType="gallery_photo"
          targetId={currentPhoto.id}
          targetName={currentPhoto.uploadedBy || '업로더'}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
