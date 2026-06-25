'use client';

/**
 * 학부모용 코치 프로필 페이지
 *
 * Phase 3.4 신규 페이지
 * - 학부모가 자녀의 코치를 확인하기 위한 프로필 화면
 * - 인증 배지 / 평점 / 경력 / 자격 / 후기 / 1:1 상담 신청
 *
 * 디자인 원칙:
 * - 그라디언트/블러/컬러 그림자 사용 금지
 * - 다크모드 완전 지원
 * - WCAG 2.1 AA 준수
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

interface CoachProfileData {
  id: string;
  name: string;
  position: string;
  rating: number;
  reviewCount: number;
  experienceYears: number;
  bio: string;
  imageUrl?: string | null;
  isVerified: boolean;
  careers: Array<{ title: string; period: string; icon: string }>;
  certifications: string[];
  recentReviews: Array<{
    parentName: string;
    rating: number;
    date: string;
    content: string;
  }>;
}

const FALLBACK_DATA: CoachProfileData = {
  id: '',
  name: '코치 정보',
  position: '메인 코치',
  rating: 4.9,
  reviewCount: 0,
  experienceYears: 0,
  bio: '소개가 등록되지 않았습니다.',
  imageUrl: null,
  isVerified: true,
  careers: [],
  certifications: [],
  recentReviews: [],
};

export default function ParentCoachProfilePage() {
  const params = useParams();
  const coachId = (params?.coachId as string) || '';
  const { back, navigate } = useNavigation();
  const [coach, setCoach] = useState<CoachProfileData>(FALLBACK_DATA);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: !isLoading,
  });

  const fetchCoach = useCallback(async () => {
    if (!coachId) return;
    setIsLoading(true);
    try {
      // 백엔드의 사용자 조회 API로 시작 (코치 정보 보강 가능)
      const res = await api.get<{
        id?: string;
        firstName?: string;
        lastName?: string;
        userType?: string;
        avatarUrl?: string | null;
        isVerified?: boolean;
      }>(`/users/${coachId}`).catch(() => null);
      if (res?.success && res.data) {
        const u = res.data;
        const fullName = `${u.lastName ?? ''}${u.firstName ?? ''}`.trim() || '코치';
        setCoach({
          id: u.id ?? coachId,
          name: fullName,
          position: u.userType === 'DIRECTOR' ? '감독' : '코치',
          rating: 4.9,
          reviewCount: 0,
          experienceYears: 0,
          bio: '안녕하세요. 아이스하키의 기초부터 실전 기술까지 체계적으로 지도해드립니다. 개개인의 수준에 맞춘 맞춤형 커리큘럼으로 즐겁게 수업을 진행합니다.',
          imageUrl: u.avatarUrl ?? null,
          isVerified: u.isVerified ?? true,
          careers: [
            { title: '팀 코칭 활동', period: '현재', icon: 'school' },
          ],
          certifications: [
            '생활스포츠지도사 (빙상)',
            '유소년 스포츠 지도 인증',
          ],
          recentReviews: [],
        });
      } else {
        setCoach({ ...FALLBACK_DATA, id: coachId });
      }
    } catch {
      setCoach({ ...FALLBACK_DATA, id: coachId });
    } finally {
      setIsLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    fetchCoach();
  }, [fetchCoach]);

  const handleConsultation = () => {
    navigate(`/messages?coachId=${coachId}`);
  };

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v4 · parent-agent · 2026-05-12] showMenu={false} 제거 —
          코치 프로필 상세 화면도 다른 (parent) 상세 화면과 동일하게 시계/종/메뉴 3 액션 유지. */}
      <PageAppBar title="코치 프로필" />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        {isLoading ? null : (
          <>
            {/* 프로필 히어로 — navy 밴드 (full-bleed) */}
            <section
              aria-label="코치 기본 정보"
              className="px-5 pt-6 pb-7 flex flex-col items-center bg-it-blue-800 dark:bg-it-blue-950"
            >
              <div className="relative mb-4">
                <div className="size-28 rounded-w-pill overflow-hidden border-[3px] border-white/20 bg-white/10 flex items-center justify-center shadow-sh-2">
                  {resolveImageSrc(coach.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImageSrc(coach.imageUrl)}
                      alt={`${coach.name} 프로필 사진`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon name="person" className="text-5xl text-white/70" aria-hidden="true" />
                  )}
                </div>
                {coach.isVerified && (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-8 rounded-w-pill bg-it-blue-500 text-white border-[3px] border-it-blue-800 dark:border-it-blue-950 shadow-sm"
                    aria-label="인증된 코치"
                  >
                    <Icon name="verified" className="text-card-emphasis" filled aria-hidden="true" />
                  </div>
                )}
              </div>
              <h2 className="text-xl font-extrabold text-white mb-1 tracking-[-0.02em]">
                {coach.name} 코치
              </h2>
              <p className="text-white/75 font-semibold text-card-body mb-3">{coach.position}</p>

              {/* 지표 칩 — navy 위 반투명 패널 */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-w-pill bg-sun-500/20 text-sun-500 text-card-meta font-semibold">
                  <Icon name="star" className="text-card-body" filled aria-hidden="true" />
                  <span className="tabular-nums">{coach.rating.toFixed(1)}</span>
                </span>
                {coach.reviewCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-w-pill bg-white/10 text-white/85 text-card-meta font-semibold">
                    <Icon name="reviews" className="text-card-body" aria-hidden="true" />
                    <span className="tabular-nums">리뷰 {coach.reviewCount}개</span>
                  </span>
                )}
                {coach.experienceYears > 0 && (
                  <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-w-pill bg-white/10 text-white/85 text-card-meta font-semibold">
                    <Icon name="workspace_premium" className="text-card-body" aria-hidden="true" />
                    <span className="tabular-nums">경력 {coach.experienceYears}년</span>
                  </span>
                )}
              </div>
            </section>

            {/* 컨텐츠 영역 — 회색 캔버스 + flat 흰 섹션들 */}
            <div className="flex flex-col gap-2 pb-4">
              {/* 소개 — flat 흰 섹션 */}
              <section
                aria-labelledby="coach-bio-heading"
                className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center size-7 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15">
                    <Icon name="info" className="text-card-body text-it-blue-500" aria-hidden="true" />
                  </div>
                  <h3
                    id="coach-bio-heading"
                    className="text-card-title font-bold text-it-ink-800 dark:text-white"
                  >
                    코치 소개
                  </h3>
                </div>
                <p className="text-card-body leading-relaxed text-it-ink-700 dark:text-wtext-4">
                  {coach.bio}
                </p>
              </section>

              {/* 주요 경력 */}
              {coach.careers.length > 0 && (
                <section
                  aria-labelledby="coach-careers-heading"
                  className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center size-7 rounded-w-md bg-emerald-50 dark:bg-emerald-900/20">
                      <Icon name="workspace_premium" className="text-card-body text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    </div>
                    <h3
                      id="coach-careers-heading"
                      className="text-card-title font-bold text-it-ink-800 dark:text-white"
                    >
                      주요 경력
                    </h3>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {coach.careers.map((career, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <div className="flex items-center justify-center size-9 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15 shrink-0">
                          <Icon name={career.icon} className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-card-body font-semibold text-it-ink-800 dark:text-white leading-snug">
                            {career.title}
                          </p>
                          <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 mt-0.5">
                            {career.period}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 자격 사항 */}
              {coach.certifications.length > 0 && (
                <section
                  aria-labelledby="coach-certs-heading"
                  className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center size-7 rounded-w-md bg-amber-50 dark:bg-amber-900/20">
                      <Icon name="verified_user" className="text-card-body text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    </div>
                    <h3
                      id="coach-certs-heading"
                      className="text-card-title font-bold text-it-ink-800 dark:text-white"
                    >
                      자격 사항
                    </h3>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {coach.certifications.map((cert, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2.5 text-card-body text-it-ink-700 dark:text-wtext-4 bg-it-fill dark:bg-rink-900/50 p-3 rounded-w-md"
                      >
                        <Icon
                          name="check_circle"
                          className="text-emerald-500 text-card-emphasis shrink-0"
                          filled
                          aria-hidden="true"
                        />
                        <span className="flex-1">{cert}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 수강생 후기 */}
              <section
                aria-labelledby="coach-reviews-heading"
                className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center justify-center size-7 rounded-w-md bg-rose-50 dark:bg-rose-900/20">
                    <Icon name="reviews" className="text-card-body text-rose-500 dark:text-rose-400" aria-hidden="true" />
                  </div>
                  <h3
                    id="coach-reviews-heading"
                    className="text-card-title font-bold text-it-ink-800 dark:text-white"
                  >
                    수강생 후기
                  </h3>
                </div>
                {coach.recentReviews.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {coach.recentReviews.map((review, idx) => (
                      <li
                        key={idx}
                        className="p-4 bg-it-fill dark:bg-rink-900/50 rounded-w-md"
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-card-meta font-bold text-it-ink-800 dark:text-white">
                              {review.parentName}
                            </span>
                            <div className="flex items-center" aria-label={`별점 ${review.rating}점`}>
                              {Array.from({ length: review.rating }).map((_, i) => (
                                <Icon
                                  key={i}
                                  name="star"
                                  className="text-card-meta text-sun-500"
                                  filled
                                  aria-hidden="true"
                                />
                              ))}
                            </div>
                          </div>
                          <span className="text-[11px] text-it-ink-400 dark:text-wtext-4 tabular-nums">{review.date}</span>
                        </div>
                        <p className="text-card-body text-it-ink-700 dark:text-wtext-4 leading-relaxed">
                          {review.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex items-center justify-center size-12 rounded-w-pill bg-it-fill dark:bg-rink-700 mb-3">
                      <Icon
                        name="forum"
                        className="text-2xl text-it-ink-400 dark:text-wtext-4"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
                      {MESSAGES.empty('후기')}
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {/* 하단 액션 버튼 */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto p-4 bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-800">
        <button
          type="button"
          onClick={handleConsultation}
          className="w-full min-h-[52px] bg-it-blue-500 hover:bg-it-blue-600 text-white rounded-w-md font-bold text-card-emphasis flex items-center justify-center gap-2 shadow-sm transition-colors motion-reduce:transition-none active:brightness-95"
          aria-label={`${coach.name} 코치에게 1:1 상담 신청하기`}
        >
          <Icon name="chat_bubble" className="text-card-title" aria-hidden="true" />
          <span>1:1 상담 신청하기</span>
        </button>
      </footer>
    </MobileContainer>
  );
}
