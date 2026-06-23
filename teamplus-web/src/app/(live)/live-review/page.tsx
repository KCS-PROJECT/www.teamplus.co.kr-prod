'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { usePageReady } from '@/hooks/usePageReady';

interface ClassInfo {
  id: string;
  name: string;
  coachName: string;
  coachImage: string;
  date: string;
}

// 폴백 데이터 (classId 없거나 API 실패 시)
const fallbackClassInfo: ClassInfo = {
  id: 'class-001',
  name: '1:1 PT 맞춤형 수업',
  coachName: '김철수 코치',
  coachImage:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAP1mmsc8nzSTgbII77K9Ud-Wh2dtLn6XFL88Wjrr6-AdfPw6oigU2X6vYVnpEN2rKA7xxmcJTGixga93qC9lk6rwwwSKIB8TYF1xdEt-NMAIpTEHc7GFXuZA5cbZOYZ8vVNqYYc0m3NnRuuCKFZ9bYaj7fbJhy2K4Y8GEu0aZjMb6ePdOVKFJxcaBwVQ74iJz47_Za5rx4ldxVHJ42qGt4890z9ZcO3uXqknmb0XO1l1lFIeNWNf02gvdcJ00eqc3riJ1kvYgSH0w',
  date: '2023.10.24 진행',
};

const ratingLabels: Record<number, string> = {
  1: '별로예요',
  2: '그저 그래요',
  3: '괜찮아요',
  4: '좋았어요!',
  5: '최고예요!',
};

export default function ReviewWritePage() {
  const { back } = useNavigation();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState(4);
  const [reviewText, setReviewText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 수업 정보 상태
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [isLoadingClass, setIsLoadingClass] = useState(true);
  const [classLoadError, setClassLoadError] = useState(false);

  // v18 (2026-05-20, audit §4 C #6): isLoadingClass 도착 후 ready — 이중 로더 race 차단.
  usePageReady(!isLoadingClass);

  // 네이티브 UI 설정
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    appBarTitle: '수업 후기 작성',
  });

  // SoT: UPLOAD_LIMITS.IMAGE.maxCount (15장) — 다중 사진 정책 통일 2026-05-16
  const maxPhotos = 15;
  const maxTextLength = 1000;

  // searchParams에서 classId 추출 후 API 호출
  useEffect(() => {
    const classId = searchParams?.get('classId');

    if (!classId) {
      // classId 없으면 폴백 데이터 사용
      setClassInfo(fallbackClassInfo);
      setIsLoadingClass(false);
      return;
    }

    let cancelled = false;

    const fetchClassInfo = async () => {
      setIsLoadingClass(true);
      setClassLoadError(false);

      try {
        const response = await api.get<ClassInfo>(`/classes/${classId}`);

        if (cancelled) return;

        if (response.success && response.data) {
          setClassInfo(response.data);
        } else {
          setClassLoadError(true);
        }
      } catch {
        if (!cancelled) {
          setClassLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingClass(false);
        }
      }
    };

    fetchClassInfo();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleStarClick = (star: number) => {
    setRating(star);
  };

  const handlePhotoAdd = () => {
    if (photos.length >= maxPhotos) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length && photos.length + i < maxPhotos; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotos((prev) => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }

    // Reset input
    e.target.value = '';
  };

  const handlePhotoRemove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (isSubmitting || !classInfo) return;

    setIsSubmitting(true);
    try {
      const payload: {
        classId: string;
        rating: number;
        content?: string;
        images?: string[];
      } = {
        classId: classInfo.id,
        rating,
      };

      if (reviewText.trim()) {
        payload.content = reviewText.trim();
      }

      if (photos.length > 0) {
        payload.images = photos;
      }

      const response = await api.post('/reviews', payload);

      if (response.success) {
        toast.success(MESSAGES.review.created);
        back();
      } else {
        const errorMessage = response.error?.message ?? MESSAGES.review.createError;
        toast.error(errorMessage);
      }
    } catch {
      toast.error(MESSAGES.review.createError);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 수업 정보 로딩 중
  if (isLoadingClass) {
    return (
      <MobileContainer hasBottomNav={false}>
        {/* [appbar-harness-v4] 로딩 상태에서도 우측 3 액션(시계/종/메뉴) 통일성 유지 */}
        <PageAppBar title="리뷰 작성" />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Icon name="progress_activity" className="text-4xl text-wtext-3 dark:text-rink-300 animate-spin motion-reduce:animate-none" />
          <p className="text-wtext-3 dark:text-rink-300 text-card-body">{MESSAGES.loading.waitMessage}</p>
        </div>
      </MobileContainer>
    );
  }

  // 수업 정보 로드 실패
  if (classLoadError || !classInfo) {
    return (
      <MobileContainer hasBottomNav={false}>
        {/* [appbar-harness-v4] 에러 상태에서도 우측 3 액션(시계/종/메뉴) 통일성 유지 */}
        <PageAppBar title="리뷰 작성" />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Icon name="error_outline" className="text-4xl text-red-500" />
          <p className="text-wtext-2 dark:text-rink-100 text-card-body">{MESSAGES.review.loadError}</p>
          <button
            onClick={() => back()}
            className="mt-2 px-4 py-2 text-card-body font-medium text-white bg-ice-500 rounded-lg hover:bg-ice-500/90 transition-colors motion-reduce:transition-none"
          >
            돌아가기
          </button>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="리뷰 작성" />

      {/* Content Wrapper */}
      <main className="flex flex-col px-5 pt-6 gap-8 pb-30">
        {/* Class Summary Card */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-4 bg-wline-2 dark:bg-rink-700 p-4 rounded-2xl border border-wline dark:border-rink-700 shadow-sm">
            <div
              className="bg-center bg-no-repeat aspect-square bg-cover rounded-xl w-14 h-14 shrink-0 shadow-inner"
              style={{ backgroundImage: `url('${classInfo.coachImage}')` }}
            />
            <div className="flex flex-col justify-center gap-0.5">
              <p className="text-wtext-1 dark:text-white text-card-emphasis font-semibold leading-normal line-clamp-1">
                {classInfo.name}
              </p>
              <p className="text-wtext-3 dark:text-rink-300 text-card-body font-normal leading-normal line-clamp-1">
                {classInfo.coachName} - {classInfo.date}
              </p>
            </div>
          </div>
        </section>

        {/* Rating Section */}
        <section className="flex flex-col items-center gap-4 py-2">
          <h3 className="text-card-section text-wtext-1 dark:text-white tracking-tight leading-tight text-center">
            만족도는 어떠셨나요?
          </h3>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleStarClick(star)}
                className="group p-1 transition-transform motion-reduce:transition-none active:brightness-95 hover:scale-110"
              >
                <Icon
                  name="star"
                  className={cn(
                    'text-[40px]',
                    star <= rating
                      ? 'text-amber-400'
                      : 'text-wtext-3 dark:text-rink-500'
                  )}
                  filled={star <= rating}
                />
              </button>
            ))}
          </div>
          <p className="text-card-body font-medium text-ice-500">{ratingLabels[rating]}</p>
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-wline-2 dark:bg-rink-700" />

        {/* Review Text Input */}
        <section className="flex flex-col gap-3">
          <label
            className="text-card-body font-semibold text-wtext-1 dark:text-white ml-1"
            htmlFor="review-text"
          >
            상세 후기{' '}
            <span className="text-wtext-3 dark:text-rink-300 font-normal ml-1">(선택)</span>
          </label>
          <div className="relative group">
            <textarea
              id="review-text"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value.slice(0, maxTextLength))}
              className="w-full resize-none rounded-xl text-wtext-1 dark:text-white focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500 border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 min-h-[160px] placeholder:text-wtext-3 dark:placeholder:text-wtext-3 p-4 text-card-emphasis font-normal leading-relaxed shadow-sm transition-all motion-reduce:transition-none"
              placeholder="수업은 어떠셨나요? 코치님께 감사의 인사를 남겨보세요. 다른 회원들에게 큰 도움이 됩니다."
            />
            {/* Character Count */}
            <div className="absolute bottom-4 right-4 text-card-meta text-wtext-3 dark:text-rink-300 pointer-events-none">
              {reviewText.length.toLocaleString()} / {maxTextLength.toLocaleString()}
            </div>
          </div>
        </section>

        {/* Photo Attachment */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between ml-1">
            <span className="text-card-body font-semibold text-wtext-1 dark:text-white">사진 첨부</span>
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">최대 {maxPhotos}장</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {/* Add Button */}
            <button
              onClick={handlePhotoAdd}
              disabled={photos.length >= maxPhotos}
              className={cn(
                'flex flex-col items-center justify-center shrink-0 w-20 h-20 rounded-xl border border-dashed border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800 text-wtext-3 dark:text-rink-300 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none',
                photos.length >= maxPhotos && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Icon name="add_a_photo" className="text-2xl" />
              <span className="text-[10px] mt-1 font-medium">
                {photos.length}/{maxPhotos}
              </span>
            </button>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Added Photos */}
            {photos.map((photo, index) => (
              <div key={index} className="relative shrink-0 w-20 h-20 group">
                <button
                  onClick={() => handlePhotoRemove(index)}
                  className="absolute -top-1.5 -right-1.5 z-10 bg-rink-900 dark:bg-wline-2 text-white dark:text-wtext-1 rounded-w-pill p-0.5 shadow-md hover:bg-red-500 dark:hover:bg-red-500 dark:hover:text-white transition-colors motion-reduce:transition-none"
                >
                  <Icon name="close" className="text-card-body flex" />
                </button>
                <div
                  className="w-full h-full rounded-xl bg-cover bg-center border border-wline dark:border-rink-700 overflow-hidden"
                  style={{ backgroundImage: `url('${photo}')` }}
                />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom Fixed Action Button */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-700 p-4 px-5 pb-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={cn(
            'w-full bg-ice-500 hover:bg-ice-500/90 text-white font-bold text-card-emphasis py-4 rounded-xl shadow-md transition-all motion-reduce:transition-none active:brightness-95 flex items-center justify-center gap-2',
            isSubmitting && 'opacity-70 cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            <>
              <Icon name="progress_activity" className="text-xl animate-spin motion-reduce:animate-none" />
              <span>{MESSAGES.review.submitting}</span>
            </>
          ) : (
            <span>리뷰 등록하기</span>
          )}
        </button>
      </div>
    </MobileContainer>
  );
}
