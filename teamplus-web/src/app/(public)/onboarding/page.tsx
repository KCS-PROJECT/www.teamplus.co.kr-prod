'use client';

import { useState, type ReactNode } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

interface OnboardingSlide {
  illustration: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}

// SVG 일러스트 — currentColor 로 ice-500 토큰 상속
function ClassIllustration() {
  return (
    <svg
      viewBox="0 0 280 280"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full h-full text-ice-500"
    >
      {/* Calendar 베이스 */}
      <rect x="48" y="68" width="184" height="160" rx="20" fill="currentColor" opacity="0.08" />
      <rect x="48" y="68" width="184" height="44" rx="20" fill="currentColor" opacity="0.22" />
      <rect x="48" y="100" width="184" height="12" fill="currentColor" opacity="0.22" />

      {/* Calendar 헤더 도트 */}
      <circle cx="68" cy="90" r="4" fill="white" />
      <circle cx="84" cy="90" r="4" fill="white" />
      <circle cx="100" cy="90" r="4" fill="white" />

      {/* 그리드 도트 */}
      <g fill="currentColor" opacity="0.35">
        <circle cx="76" cy="138" r="4" />
        <circle cx="108" cy="138" r="4" />
        <circle cx="140" cy="138" r="4" />
        <circle cx="172" cy="138" r="4" />
        <circle cx="204" cy="138" r="4" />
        <circle cx="76" cy="170" r="4" />
        <circle cx="108" cy="170" r="4" />
        <circle cx="172" cy="170" r="4" />
        <circle cx="204" cy="170" r="4" />
        <circle cx="76" cy="202" r="4" />
        <circle cx="108" cy="202" r="4" />
        <circle cx="140" cy="202" r="4" />
      </g>

      {/* 선택된 수업 일정 */}
      <circle cx="140" cy="170" r="16" fill="currentColor" />
      <text
        x="140"
        y="175"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="700"
        fontFamily="inherit"
      >
        15
      </text>

      {/* 하키 스틱 */}
      <g transform="translate(196 28) rotate(22)">
        <rect x="0" y="0" width="7" height="84" rx="3.5" fill="currentColor" />
        <path d="M0 80 Q -10 92 -20 92 L -20 102 L 7 102 L 7 80 Z" fill="currentColor" />
      </g>

      {/* 퍽(Puck) */}
      <ellipse cx="72" cy="46" rx="22" ry="7" fill="currentColor" opacity="0.85" />
      <ellipse cx="72" cy="44" rx="22" ry="7" fill="currentColor" />
    </svg>
  );
}

function ProgressIllustration() {
  return (
    <svg
      viewBox="0 0 280 280"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full h-full text-ice-500"
    >
      {/* 카드 */}
      <rect x="40" y="56" width="200" height="180" rx="20" fill="currentColor" opacity="0.08" />

      {/* 헤더 — 아바타 + 라벨 */}
      <circle cx="68" cy="86" r="14" fill="currentColor" opacity="0.35" />
      <rect x="92" y="78" width="84" height="7" rx="3.5" fill="currentColor" opacity="0.35" />
      <rect x="92" y="91" width="56" height="6" rx="3" fill="currentColor" opacity="0.18" />

      {/* 막대 차트 — 좌→우 점진적 성장 */}
      <rect x="64" y="184" width="16" height="36" rx="4" fill="currentColor" opacity="0.30" />
      <rect x="92" y="164" width="16" height="56" rx="4" fill="currentColor" opacity="0.50" />
      <rect x="120" y="142" width="16" height="78" rx="4" fill="currentColor" opacity="0.70" />
      <rect x="148" y="120" width="16" height="100" rx="4" fill="currentColor" />
      <rect x="176" y="148" width="16" height="72" rx="4" fill="currentColor" opacity="0.55" />
      <rect x="204" y="132" width="16" height="88" rx="4" fill="currentColor" opacity="0.85" />

      {/* 체크 뱃지 */}
      <g transform="translate(206 38)">
        <circle cx="0" cy="0" r="24" fill="currentColor" />
        <path
          d="M -9 -1 L -3 6 L 9 -8"
          stroke="white"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* 사이드 도트 */}
      <g fill="currentColor" opacity="0.35">
        <circle cx="46" cy="48" r="3" />
        <circle cx="246" cy="220" r="4" />
        <circle cx="56" cy="246" r="3" />
      </g>
    </svg>
  );
}

function PaymentIllustration() {
  return (
    <svg
      viewBox="0 0 280 280"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full h-full text-ice-500"
    >
      {/* 뒤쪽 카드 */}
      <g transform="rotate(-8 140 150)">
        <rect x="60" y="100" width="160" height="100" rx="14" fill="currentColor" opacity="0.22" />
      </g>

      {/* 앞쪽 카드 */}
      <g transform="translate(60 86) rotate(6 80 50)">
        <rect x="0" y="0" width="160" height="100" rx="14" fill="currentColor" />
        {/* IC 칩 */}
        <rect x="20" y="30" width="24" height="18" rx="4" fill="white" opacity="0.55" />
        <rect x="22" y="34" width="20" height="2" fill="currentColor" opacity="0.4" />
        <rect x="22" y="40" width="20" height="2" fill="currentColor" opacity="0.4" />
        {/* 카드 번호 */}
        <rect x="20" y="62" width="40" height="6" rx="2" fill="white" opacity="0.75" />
        <rect x="68" y="62" width="32" height="6" rx="2" fill="white" opacity="0.5" />
        <rect x="20" y="80" width="60" height="4" rx="2" fill="white" opacity="0.4" />
        {/* 로고 도트 (Mastercard 스타일) */}
        <circle cx="138" cy="24" r="7" fill="white" opacity="0.7" />
        <circle cx="128" cy="24" r="7" fill="white" opacity="0.4" />
      </g>

      {/* 결제 코인 */}
      <g transform="translate(208 56)">
        <circle cx="0" cy="0" r="22" fill="currentColor" />
        <text
          x="0"
          y="7"
          textAnchor="middle"
          fill="white"
          fontSize="22"
          fontWeight="800"
          fontFamily="inherit"
        >
          P
        </text>
      </g>

      {/* 스파클 */}
      <g fill="currentColor" opacity="0.5">
        <circle cx="58" cy="58" r="4" />
        <circle cx="232" cy="208" r="5" />
        <circle cx="46" cy="220" r="3" />
        <circle cx="252" cy="120" r="3" />
      </g>
    </svg>
  );
}

const slides: OnboardingSlide[] = [
  {
    illustration: <ClassIllustration />,
    eyebrow: '수업·예약',
    title: '수업을 쉽게 예약해요',
    description: '캘린더에서 원하는 수업을\n바로 신청하고 확정하세요.',
  },
  {
    illustration: <ProgressIllustration />,
    eyebrow: '진도·메모',
    title: '진도를 한눈에 확인해요',
    description: '주간 출석과 평가 리포트를\n한 화면에서 살펴보세요.',
  },
  {
    illustration: <PaymentIllustration />,
    eyebrow: '결제·관리',
    title: '결제도 간편하게',
    description: '수업료 결제와 크레딧 관리를\n앱에서 바로 처리하세요.',
  },
];

export default function OnboardingPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { navigate } = useNavigation();
  const [currentSlide, setCurrentSlide] = useState(0);

  // [appbar-harness-v3 분류 D] 의도적 풀스크린 (온보딩 인트로).
  //   showAppBar:false + showStatusBar:true 명시 — 본문이 status-bar 영역 침범 안 함.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // 온보딩 마지막 단계 '시작하기' — 회원가입으로 진입 (사용자 요구 2026-05-27).
      //   '건너뛰기'(handleSkip)는 기존대로 로그인으로 유지.
      navigate('/signup');
    }
  };

  const handleSkip = () => {
    navigate('/login');
  };

  const handleDotClick = (index: number) => {
    setCurrentSlide(index);
  };

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  return (
    <MobileContainer hasBottomNav={false} className="bg-wbg dark:bg-puck">
      <main className="relative flex h-full w-full flex-col justify-between overflow-hidden">
      {/* Skip Button */}
      <div className="absolute top-0 right-0 z-10 w-full pt-4 px-6 flex justify-end">
        <button
          onClick={handleSkip}
          className="text-wtext-3 dark:text-rink-300 text-card-body font-medium hover:text-ice-500 transition-colors motion-reduce:transition-none"
        >
          건너뛰기
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-6 pt-16 pb-6">
        {/* Illustration Area */}
        <div className="w-full max-w-[320px] aspect-square relative mb-10">
          {/* Decorative Background Ring */}
          <div className="absolute inset-0 bg-ice-500/10 dark:bg-ice-500/15 rounded-w-pill transform scale-95 translate-y-2" />

          {/* SVG 일러스트 컨테이너 */}
          <div
            key={currentSlide}
            className="relative w-full h-full bg-wsurface dark:bg-rink-800 rounded-w-2xl shadow-sh-2 overflow-hidden border border-wline dark:border-rink-700 flex items-center justify-center p-6 animate-[fade-in_0.45s_ease-out] motion-reduce:animate-none"
          >
            {slide.illustration}
          </div>
        </div>

        {/* Text Content */}
        <div
          key={`text-${currentSlide}`}
          className="flex flex-col items-center text-center space-y-3 max-w-xs mx-auto animate-[slide-up_0.5s_ease-out] motion-reduce:animate-none"
        >
          <span className="text-ice-500 text-card-meta font-bold tracking-[0.18em] uppercase">
            {slide.eyebrow}
          </span>
          <h1 className="text-wtext-1 dark:text-white text-w-h2 font-extrabold leading-tight tracking-tight">
            {slide.title}
          </h1>
          <p className="text-wtext-3 dark:text-rink-300 text-card-emphasis font-normal leading-relaxed whitespace-pre-line">
            {slide.description}
          </p>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="w-full px-6 pb-10 pt-4 bg-wbg dark:bg-puck">
        {/* Page Indicators — 클릭으로 슬라이드 점프 */}
        <div
          className="flex justify-center items-center gap-2 mb-8"
          role="tablist"
          aria-label="온보딩 페이지"
        >
          {slides.map((s, index) => {
            const active = index === currentSlide;
            return (
              <button
                key={index}
                type="button"
                role="tab"
                aria-label={`${index + 1}단계 ${s.eyebrow}`}
                aria-selected={active}
                onClick={() => handleDotClick(index)}
                className={`h-2 rounded-w-pill transition-all motion-reduce:transition-none duration-300 ${
                  active
                    ? 'w-10 bg-ice-500'
                    : 'w-2 bg-wline dark:bg-rink-700 hover:bg-wline-2 dark:hover:bg-rink-600'
                }`}
              />
            );
          })}
        </div>

        {/* Primary Button */}
        <Button onClick={handleNext} fullWidth size="lg" className="gap-2">
          <span>{isLast ? '시작하기' : '다음'}</span>
          <Icon name={isLast ? 'check' : 'arrow_forward'} className="text-xl" />
        </Button>
      </div>

      {/* 슬라이드 전환 애니메이션 */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      </main>
    </MobileContainer>
  );
}
