'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { NavLink } from '@/components/ui/NavLink';
import { useNavigation } from '@/components/ui/NavLink';
import { useParams } from 'next/navigation';
import { api } from '@/services/api-client';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { resolveImageSrc } from '@/lib/image-url';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

interface Career {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

interface Certification {
  id: string;
  name: string;
}

interface Review {
  id: string;
  author: string;
  date: string;
  rating: number;
  content: string;
  images?: string[];
}

interface CoachDetail {
  id: string;
  name: string;
  avatar?: string;
  specialty: string;
  badge: string;
  quote: string;
  careers: Career[];
  certifications: Certification[];
  rating: number;
  reviewCount: number;
  reviewHighlight: string;
  reviews: Review[];
}


type TabType = 'career' | 'reviews';

function StarRating({ rating, size = 18 }: { rating: number; size?: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className="flex text-sun-500">
      {[...Array(5)].map((_, i) => (
        <Icon
          key={i}
          name="star"
          filled={i < fullStars || (i === fullStars && hasHalfStar)}
          className={`text-[${size}px] ${i >= fullStars && !hasHalfStar ? 'opacity-50' : ''}`}
        />
      ))}
    </div>
  );
}

function CareerItem({ career }: { career: Career }) {
  return (
    <div className="flex gap-4 items-start group">
      <div className="flex-shrink-0 w-10 h-10 rounded-w-md bg-it-fill dark:bg-rink-800 flex items-center justify-center text-it-ink-500 group-hover:text-it-blue-500 group-hover:bg-it-blue-50 transition-colors motion-reduce:transition-none">
        <Icon name={career.icon} />
      </div>
      <div className="flex-1 pt-1">
        <p className="text-it-ink-800 dark:text-white font-semibold text-card-body">{career.title}</p>
        <p className="text-it-ink-500 dark:text-rink-300 text-card-meta mt-0.5">{career.subtitle}</p>
      </div>
    </div>
  );
}

function CertificationItem({ certification }: { certification: Certification }) {
  return (
    <li className="bg-it-fill dark:bg-rink-800/50 rounded-w-md p-3 flex items-center gap-3 border border-it-line dark:border-rink-800">
      <Icon name="check_circle" className="text-it-blue-500 text-xl" />
      <span className="text-card-body font-medium text-it-ink-800 dark:text-rink-100">
        {certification.name}
      </span>
    </li>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-it-line dark:border-rink-700">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center text-card-meta font-bold text-it-ink-500 dark:text-rink-100">
            {review.author}
          </div>
          <div className="flex flex-col">
            <span className="text-card-meta font-bold text-it-ink-800 dark:text-white">
              {review.author} 회원님
            </span>
            <span className="text-card-meta text-it-ink-400">{review.date}</span>
          </div>
        </div>
        <div className="flex text-sun-500">
          {[...Array(review.rating)].map((_, i) => (
            <Icon key={i} name="star" filled className="text-[14px]" />
          ))}
        </div>
      </div>
      <p className="text-card-body text-it-ink-800 dark:text-rink-100 leading-relaxed">{review.content}</p>
    </div>
  );
}

export default function CoachDetailPage() {
  const { back } = useNavigation();
  const params = useParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('career');
  const [coach, setCoach] = useState<CoachDetail | null>(null);

  usePageReady(coach !== null);

  // [AppBar 보장 2026-05-12] iPhone/Android 실기/시뮬에서 AppBar safe-area 가
  //   항상 보이도록 Native AppBar 활성. Web 환경에서는 DOM PageAppBar 가 자동 표시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '코치 프로필',
    showBackButton: false,
    showBottomNav: true,
  });

  const coachId = (params?.id ?? '') as string;
  // cuid 형식 검증: /coach/menu 같은 reserved-word 라우트 충돌 시 API 호출 차단
  const isValidCoachId = /^c[a-z0-9]{20,30}$/.test(coachId);

  const loadCoach = useCallback(async () => {
    if (!coachId || !isValidCoachId) return;
    const res = await api.get<{
      id: string; firstName?: string; lastName?: string; name?: string;
      avatarUrl?: string | null; specialty?: string; bio?: string;
      careers?: { id: string; title: string; subtitle?: string }[];
      certifications?: { id: string; name: string }[];
      rating?: number; reviewCount?: number;
      reviews?: { id: string; author?: string; rating: number; content: string; createdAt?: string }[];
    }>(`/coaches/${coachId}`);
    if (res.success && res.data) {
      const d = res.data;
      const name = d.name ?? `${d.lastName ?? ''}${d.firstName ?? ''}`;
      setCoach({
        id: d.id,
        name,
        avatar: d.avatarUrl ?? undefined,
        specialty: d.specialty ?? '',
        badge: '',
        quote: d.bio ?? '',
        careers: (d.careers ?? []).map((c, i) => ({
          id: c.id ?? String(i),
          icon: 'work_history',
          title: c.title,
          subtitle: c.subtitle ?? '',
        })),
        certifications: d.certifications ?? [],
        rating: d.rating ?? 0,
        reviewCount: d.reviewCount ?? 0,
        reviewHighlight: '',
        reviews: (d.reviews ?? []).map((r) => ({
          id: r.id,
          author: r.author ?? '회원',
          date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR') : '',
          rating: r.rating,
          content: r.content,
        })),
      });
    }
  }, [coachId, isValidCoachId]);

  useEffect(() => { void loadCoach(); }, [loadCoach]);

  if (!coach) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="코치 프로필" showBack={false} />

      {/* Main Content */}
      <main className="flex-1 pb-30 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* Profile Hero Section — navy 밴드 full-bleed */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-7 pb-8 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="w-28 h-28 rounded-w-pill p-1 bg-white/15">
              <div className="w-full h-full rounded-w-pill bg-white/10 flex items-center justify-center overflow-hidden">
                {resolveImageSrc(coach.avatar) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(coach.avatar)}
                    alt={coach.name}
                    className="w-full h-full object-cover rounded-w-pill"
                  />
                ) : (
                  <Icon name="person" className="text-4xl text-white/70" />
                )}
              </div>
            </div>
            <div className="absolute bottom-1 right-1 bg-it-blue-500 text-white rounded-w-pill p-1.5 border-2 border-it-blue-800 dark:border-it-blue-950">
              <Icon name="verified" className="text-[16px] block" />
            </div>
          </div>

          <h2 className="text-[22px] font-extrabold text-white mb-2 tracking-[-0.01em]">
            {coach.name} 코치
          </h2>

          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {coach.specialty && (
              <span className="px-3 py-1 bg-white/15 text-white rounded-w-pill text-card-meta font-bold tracking-wide">
                {coach.specialty}
              </span>
            )}
            {coach.badge && (
              <span className="px-3 py-1 bg-white/10 text-white/80 rounded-w-pill text-card-meta font-medium">
                {coach.badge}
              </span>
            )}
          </div>

          {coach.quote && (
            <p className="text-white/70 text-card-body leading-relaxed max-w-[280px] whitespace-pre-line">
              {coach.quote}
            </p>
          )}
        </section>

        {/* Sticky Tabs — it-blue underline */}
        <div className="sticky top-14 z-40 mt-2 bg-it-surface dark:bg-it-blue-950 border-b border-it-line dark:border-rink-800">
          <div className="flex" role="tablist" aria-label="코치 상세 정보 탭">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'career'}
              aria-controls="coach-tab-panel-career"
              id="coach-tab-career"
              onClick={() => setActiveTab('career')}
              className={`flex-1 relative py-4 text-card-body font-medium transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none ${
                activeTab === 'career'
                  ? 'font-bold text-it-blue-500'
                  : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-800 dark:hover:text-rink-100'
              }`}
            >
              약력 및 경력
              <div
                className={`absolute bottom-0 left-0 w-full h-0.5 bg-it-blue-500 transition-transform motion-reduce:transition-none duration-300 ${
                  activeTab === 'career' ? 'scale-x-100' : 'scale-x-0'
                }`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reviews'}
              aria-controls="coach-tab-panel-reviews"
              id="coach-tab-reviews"
              onClick={() => setActiveTab('reviews')}
              className={`flex-1 relative py-4 text-card-body font-medium transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none ${
                activeTab === 'reviews'
                  ? 'font-bold text-it-blue-500'
                  : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-800 dark:hover:text-rink-100'
              }`}
            >
              수강생 리뷰
              <span
                className="ml-1 text-card-meta bg-it-fill dark:bg-rink-800 text-it-ink-600 dark:text-rink-100 px-1.5 py-0.5 rounded-w-pill"
                aria-label={`리뷰 ${coach.reviewCount}건`}
              >
                {coach.reviewCount}
              </span>
              <div
                className={`absolute bottom-0 left-0 w-full h-0.5 bg-it-blue-500 transition-transform motion-reduce:transition-none duration-300 ${
                  activeTab === 'reviews' ? 'scale-x-100' : 'scale-x-0'
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Tab Content — flat 흰 섹션 */}
        {activeTab === 'career' && (
          <div
            id="coach-tab-panel-career"
            role="tabpanel"
            aria-labelledby="coach-tab-career"
            className="bg-it-surface dark:bg-it-blue-950 px-5 py-6 space-y-8"
          >
            {/* Career Section */}
            <section>
              <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-4 flex items-center gap-2">
                <Icon name="history_edu" filled className="text-it-blue-500" />
                주요 경력
              </h3>
              <div className="space-y-4">
                {coach.careers.map((career) => (
                  <CareerItem key={career.id} career={career} />
                ))}
              </div>
            </section>

            <div className="h-px bg-it-line dark:bg-rink-800 w-full" />

            {/* Certifications Section */}
            <section>
              <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-4 flex items-center gap-2">
                <Icon name="verified_user" filled className="text-it-blue-500" />
                자격 및 수료
              </h3>
              <ul className="grid grid-cols-1 gap-3" role="list" aria-label="자격 및 수료 목록">
                {coach.certifications.map((cert) => (
                  <CertificationItem key={cert.id} certification={cert} />
                ))}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'reviews' && (
          <section
            id="coach-tab-panel-reviews"
            role="tabpanel"
            aria-labelledby="coach-tab-reviews"
            className="bg-it-surface dark:bg-it-blue-950"
          >
            {/* Review Summary — navy 강조 밴드 */}
            <div className="bg-it-blue-50 dark:bg-it-blue-900/30 px-5 py-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-extrabold text-it-ink-800 dark:text-white tabular-nums">
                  {coach.rating}
                </span>
                <StarRating rating={coach.rating} />
                <span className="text-card-meta text-it-ink-500 font-medium mt-1">
                  전체 리뷰 {coach.reviewCount}개
                </span>
              </div>
              {coach.reviewHighlight && (
                <>
                  <div className="h-10 w-px bg-it-blue-200 dark:bg-it-blue-700 mx-4" />
                  <div className="flex-1">
                    <p className="text-card-body font-medium text-it-ink-800 dark:text-rink-100 leading-snug whitespace-pre-line">
                      {coach.reviewHighlight}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Review List — hairline 행 */}
            <ul className="list-none" role="list" aria-label={`수강생 리뷰 ${coach.reviews.length}건`}>
              {coach.reviews.map((review) => (
                <li key={review.id} role="listitem">
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 fixed-center-x p-4 pb-6 bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-800 pt-4 z-40">
        <NavLink href={`/chat/coach-${coach.id}`} aria-label={`${coach.name} 코치에게 1:1 상담 메시지 보내기`}>
          <button type="button" className="w-full bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold py-4 rounded-w-md shadow-sh-2 active:brightness-95 transition-all motion-reduce:transition-none flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 focus:outline-none">
            <Icon name="chat_bubble" aria-hidden="true" />
            1:1 상담하기
          </button>
        </NavLink>
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
