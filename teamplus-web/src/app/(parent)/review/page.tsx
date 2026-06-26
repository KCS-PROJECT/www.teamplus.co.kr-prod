'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ─── 별점 레이블 ───────────────────────────────────────
const RATING_LABELS: Record<number, string> = {
  1: '별로예요',
  2: '아쉬워요',
  3: '보통이에요',
  4: '좋았어요!',
  5: '최고예요!',
};

// ─── 별점 컴포넌트 ─────────────────────────────────────
function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2" role="radiogroup" aria-label="만족도 별점">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star}점 ${RATING_LABELS[star] ?? ''}`}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="p-1 rounded-w-pill transition-transform motion-reduce:transition-none active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
          >
            <Icon
              name={star <= active ? 'star' : 'star_border'}
              className={cn(
                'text-4xl transition-colors motion-reduce:transition-none',
                /* 별점 색은 의미색(amber) 유지 — calendar/SoT 색 스왑 대상 아님 */
                star <= active ? 'text-amber-400' : 'text-it-ink-300 dark:text-rink-500'
              )}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {active > 0 && (
        <p className="text-card-body font-semibold text-it-blue-600 dark:text-it-blue-300" aria-live="polite">
          {RATING_LABELS[active]}
        </p>
      )}
    </div>
  );
}

// ─── 사진 첨부 컴포넌트 ────────────────────────────────
function PhotoAttachment({
  photos,
  onAdd,
  onRemove,
}: {
  photos: string[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // SoT: UPLOAD_LIMITS.IMAGE.maxCount (15장) — 다중 사진 정책 통일 2026-05-16
  const MAX_PHOTOS = 15;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAdd(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[17px] font-extrabold text-it-ink-900 dark:text-white tracking-[-0.01em]">사진 첨부</span>
        <span className="text-card-meta text-it-ink-500 dark:text-wtext-4">최대 {MAX_PHOTOS}장</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {/* 추가 버튼 */}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-w-md border-[1.5px] border-dashed border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 flex flex-col items-center justify-center gap-1 hover:bg-it-blue-50 dark:hover:bg-it-blue-500/15 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
            aria-label="사진 추가"
          >
            <Icon name="add_a_photo" className="text-2xl text-it-ink-500 dark:text-wtext-4" aria-hidden="true" />
            <span className="text-[10px] text-it-ink-500 dark:text-wtext-4 tabular-nums">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </button>
        )}
        {/* 첨부된 사진들 */}
        {photos.map((src, i) => (
          <div key={i} className="relative w-20 h-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageSrc(src)}
              alt={`첨부 사진 ${i + 1}`}
              className="w-20 h-20 object-cover rounded-w-md"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-w-pill bg-it-ink-700 dark:bg-rink-500 flex items-center justify-center hover:bg-it-red-500 transition-colors motion-reduce:transition-none"
              aria-label={`사진 ${i + 1} 삭제`}
            >
              <Icon name="close" className="text-white text-card-meta" aria-hidden="true" />
            </button>
          </div>
        ))}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ─── 수업 정보 ─────────────────────────────────────────
// [ICETIMES flat 2026-06-25] 카드 박스 제거 → full-bleed 흰 섹션. 아이콘 슬롯은
//   it-fill 인셋. 코치·일정 메타는 it-blue 강조. /children HeroChildCard 와 동일 언어.
function ClassInfoCard({
  className: cls,
  coachName,
  date,
}: {
  className: string;
  coachName: string;
  date: string;
}) {
  return (
    <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-[14px] bg-it-fill dark:bg-rink-900 border border-it-line dark:border-it-blue-900 flex items-center justify-center shrink-0">
          <Icon name="sports_hockey" className="text-2xl text-it-ink-600 dark:text-wtext-4" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-card-emphasis font-bold text-it-ink-900 dark:text-white truncate">{cls}</h3>
          <p className="text-card-body text-it-blue-600 dark:text-it-blue-300 font-medium mt-0.5">
            {coachName} 코치 · {date} 진행
          </p>
        </div>
      </div>
    </section>
  );
}

interface ClassInfo {
  className: string;
  instructorName: string;
  startTime: string;
}

// ─── Inner Page (useSearchParams 분리) ─────────────────
function ReviewWriteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const classId = searchParams?.get('classId') ?? '';

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);

  const MAX_CHARS = 1000;
  const isFormValid = rating > 0;

  usePageReady(true);

  // [수정 2026-05-14 Task #11] App 상단바 미표시 회귀 해소.
  // 원인: showAppBar:false + <PageAppBar/> (forceNative 없음) → PageAppBar.tsx:234
  //       `if (isNative && !forceNative) return null` 로 Native 에서 헤더가 사라짐.
  //       Flutter Shell AppBar 도 꺼져 있으니 이중-부재 → 뒤로가기 동선 차단.
  // 조치: useNativeUI showAppBar:false 유지(이중 헤더 방지) + <PageAppBar forceNative/>
  //       단일 노출 패턴 (checkout · stickers · calendar 와 동일 표준).
  //       BottomNav 는 (parent) 레이아웃의 ParentBottomNav 가 그리므로
  //       useNativeUI showBottomNav 는 Native 만 끈다 (Web 은 표시 유지).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: true,
  });

  // 수업 정보 로드
  useEffect(() => {
    if (!classId) return;
    const loadClass = async () => {
      const { api } = await import('@/services/api-client');
      const clubsRes = await api.get<Array<{ id: string }>>('/teams/my/list');
      if (!clubsRes.success || !clubsRes.data?.[0]) return;
      const clubId = clubsRes.data[0].id;
      const res = await api.get<ClassInfo>(`/teams/${clubId}/classes/${classId}`);
      if (res.success && res.data) {
        setClassInfo(res.data);
      }
    };
    loadClass();
  }, [classId]);

  const handleAddPhotos = (files: FileList) => {
    // SoT: 15장 — UPLOAD_LIMITS.IMAGE.maxCount 와 동일
    const remaining = 15 - photos.length;
    const newPhotos: string[] = [];
    const count = Math.min(files.length, remaining);
    for (let i = 0; i < count; i++) {
      newPhotos.push(URL.createObjectURL(files[i]));
    }
    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { api } = await import('@/services/api-client');
      const response = await api.post('/reviews', {
        classId,
        rating,
        content: reviewText || undefined,
      });
      if (response.success) {
        router.back();
      } else if (response.error?.statusCode === 409) {
        setSubmitError('이미 해당 수업에 리뷰를 작성하셨습니다.');
      } else {
        setSubmitError(response.error?.message ?? MESSAGES.error.general);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MobileContainer hasBottomNav>
      {/* [Task #11 2026-05-14] forceNative — App/Web 동일 AppBar 단일 노출.
          Native 에서도 PageAppBar 가 렌더되어 "리뷰 작성" 타이틀 + 뒤로가기 노출. */}
      <PageAppBar title="리뷰 작성" forceNative />

      {/* ─── 본문 ──────────────────────────────────────── */}
      {/* [ICETIMES flat 2026-06-25] 회색 캔버스(bg-it-canvas) 위에 콘텐츠 블록을
          full-bleed 흰 섹션(bg-it-surface)으로 쌓는다. mt-2(8px) 회색 갭으로 분리.
          /children·/director-members 와 동일 flat 언어 (카드 박스·shadow 제거). */}
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30"
        role="main"
        aria-label="리뷰 작성 폼"
      >
        {/* 수업 정보 — flat 흰 섹션 */}
        <ClassInfoCard
          className={classInfo?.className ?? '수업 정보 불러오는 중...'}
          coachName={classInfo?.instructorName ?? '-'}
          date={classInfo
            ? new Date(classInfo.startTime).toLocaleDateString('ko-KR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
              }).replace(/\. /g, '.').replace(/\.$/, '')
            : '-'
          }
        />

        {/* 제출 오류 메시지 — flat 흰 섹션 내 경고 행 */}
        {submitError && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 px-4 py-3 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 border border-it-red-500/40" role="alert">
                <Icon name="error_outline" className="text-it-red-500 text-card-title shrink-0" aria-hidden="true" />
                <p className="text-card-body text-it-red-500 dark:text-it-red-100">{submitError}</p>
              </div>
            </div>
          </section>
        )}

        {/* 별점 — 필수 섹션 (flat 흰 섹션) */}
        <section
          className="mt-2 bg-it-surface dark:bg-it-blue-950"
          aria-labelledby="rating-heading"
        >
          <div className="px-5 py-5">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-it-blue-600 bg-it-blue-50 dark:bg-it-blue-500/15 dark:text-it-blue-300 px-2 py-1 rounded-[7px]">
                STEP 1 · 필수
              </span>
            </div>
            <h2
              id="rating-heading"
              className="text-card-title font-bold text-it-ink-900 dark:text-white text-center mt-3 mb-5"
            >
              만족도는 어떠셨나요?
            </h2>
            <StarRating value={rating} onChange={setRating} />
          </div>
        </section>

        {/* 상세 후기 — flat 흰 섹션 + 인셋 입력(it-fill) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950" aria-labelledby="review-heading">
          <div className="px-5 py-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 id="review-heading" className="text-[17px] font-extrabold text-it-ink-900 dark:text-white tracking-[-0.01em]">
                상세 후기
              </h2>
              <span className="text-[11px] font-bold text-it-ink-500 dark:text-wtext-4 px-2 py-0.5 rounded-[7px] bg-it-fill dark:bg-rink-900">
                선택
              </span>
            </div>
            <div className="relative">
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value.slice(0, MAX_CHARS))}
                placeholder="수업은 어떠셨나요? 코치님께 감사의 인사를 남겨보세요. 다른 회원들에게 큰 도움이 됩니다."
                rows={6}
                className="w-full px-4 py-3 pb-10 bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-card-body text-it-ink-900 dark:text-white placeholder-it-ink-400 dark:placeholder-rink-300 resize-none focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors motion-reduce:transition-none"
                aria-label="상세 후기 입력"
              />
              <span
                className="absolute bottom-3 right-4 text-card-meta text-it-ink-400 dark:text-wtext-4 tabular-nums"
                aria-live="polite"
              >
                {reviewText.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
          </div>
        </section>

        {/* 사진 첨부 — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <div className="px-5 py-5">
            <PhotoAttachment
              photos={photos}
              onAdd={handleAddPhotos}
              onRemove={handleRemovePhoto}
            />
          </div>
        </section>

        {/* 작성 안내 — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <div className="px-5 py-4">
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-[10px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <Icon name="info" className="text-it-blue-600 dark:text-it-blue-300 text-card-title" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-card-body font-bold text-it-ink-900 dark:text-white mb-1">
                  리뷰 작성 안내
                </p>
                <ul className="space-y-1 text-card-meta text-it-ink-500 dark:text-wtext-4">
                  <li className="flex items-start gap-1.5">
                    <span className="text-it-ink-300 dark:text-rink-500 mt-0.5" aria-hidden="true">•</span>
                    <span>수업당 1건만 작성할 수 있습니다.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-it-ink-300 dark:text-rink-500 mt-0.5" aria-hidden="true">•</span>
                    <span>부적절한 내용은 비공개 처리될 수 있습니다.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── 하단 제출 버튼 ─────────────────────────────── */}
      {/* [Task #11 2026-05-14] BottomNav 위 12px 부유 — `.bottom-fab-safe` 표준 유틸 적용.
          [W3.B 2026-05-18 / Task #2] 메인 UI 박스 벗어남 회귀 수정.
            이전: `max-w-md px-5` — 0번째 viewport 기준 fixed (max-w-md=448px) 이지만 자식
                  MobileContainer 가 `min(100%, var(--mobile-shell-width, 448px))` 으로 그려져
                  좌우 shadow-md 가 있으므로 polished viewport 폭에서 시각적 어긋남 발생.
            조치: `max-w-[var(--mobile-shell-width,28rem)] px-4` — MobileContainer 와 정확히 동일
                  shell width 변수 참조 + `px-4` (16px) 표준 패딩 (awards/edit·awards/create 동일).
                  → "리뷰 등록하기" 버튼이 항상 MobileContainer 박스 내부에 정렬. */}
      <div className="fixed bottom-fab-safe left-1/2 -translate-x-1/2 w-full max-w-[var(--mobile-shell-width,28rem)] px-4 z-40">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          className={cn(
            'w-full h-14 rounded-w-md font-bold text-card-emphasis transition-all motion-reduce:transition-none active:brightness-95 shadow-sh-1',
            isFormValid && !isSubmitting
              ? 'bg-it-blue-500 hover:bg-it-blue-600 text-white'
              : 'bg-it-fill dark:bg-rink-800 text-it-ink-400 dark:text-rink-300 cursor-not-allowed'
          )}
          aria-disabled={!isFormValid || isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-w-pill animate-spin motion-reduce:animate-none" />
              등록 중...
            </span>
          ) : (
            '리뷰 등록하기'
          )}
        </button>
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

// ─── Main Page ─────────────────────────────────────────
export default function ReviewWritePage() {
  return (
    <Suspense fallback={
      <MobileContainer hasBottomNav>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-wline border-t-primary rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    }>
      <ReviewWriteInner />
    </Suspense>
  );
}
