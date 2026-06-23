'use client';

import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

/**
 * ClassPaymentEmpty (B1a) — 학부모 메인 대시보드 수업 미등록 hero empty state
 *
 * 가변형(fluid) 리팩토링 (2026-05-07):
 *   - 모든 inline style 픽셀 고정값을 Tailwind 점진형 + clamp() 로 마이그레이션
 *   - 320px ~ 768px 사이 모든 viewport 에서 자연스럽게 유동
 *   - 한국어 단어 보호: break-keep, whitespace-nowrap (분리되면 안 되는 토큰만)
 *   - SVG 일러스트: aspect-ratio 유지하며 max-width 기반 fluid
 *
 * 구조:
 *   1) Promo strip      "첫 수업 등록하고 1만 포인트 받기" + 혜택 버튼
 *   2) View toggle row  카드/리스트 토글 + 이용내역/결제·계좌관리 chips (opacity-50 비활성)
 *   3) Top CTA          "팀플러스 처음이신가요?" border-ice-500 outline
 *   4) Hero card        좌(white surface + 폰+스케이트 일러스트) / 우(rink-800 strip + "추가하기")
 *   5) 수업 추천 섹션   카드 1개 (코치 + 등록 버튼) — recommendedClass prop 있을 때만
 */

interface RecommendedClass {
  title: string;
  coachName: string;
  venueName: string;
  schedule: string;
  ageRange: string;
}

export interface ClassPaymentEmptyProps {
  childName?: string;
  pointReward?: number;
  onGetStartedClick?: () => void;
  onAddClick?: () => void;
  onActionClick?: () => void;
  recommendedClass?: RecommendedClass | null;
  onRecommendedRegisterClick?: () => void;
  className?: string;
}

function formatRewardManUnit(value: number): string {
  if (value <= 0) return '0';
  const inMan = value / 10000;
  if (Number.isInteger(inMan)) {
    return `${inMan.toLocaleString('ko-KR')}만`;
  }
  return `${inMan.toFixed(1)}만`;
}

export function ClassPaymentEmpty({
  childName = '우리 아이',
  pointReward = 10000,
  onGetStartedClick,
  onAddClick,
  onActionClick,
  recommendedClass = null,
  onRecommendedRegisterClick,
  className,
}: ClassPaymentEmptyProps) {
  const rewardLabel = formatRewardManUnit(pointReward);

  return (
    <section
      className={cn('w-full', className)}
      aria-label={MESSAGES.wallet.empty.ariaLabel}
    >
      {/* 1) Promo strip — "첫 수업 등록하고 N 포인트 받기" */}
      <div className="px-3 sm:px-5 pt-3">
        <div className="flex items-center gap-2 sm:gap-2.5 bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-full px-3 sm:px-3.5 py-2 sm:py-2.5">
          <div className="flex-1 min-w-0 text-wtext-2 dark:text-rink-100 font-semibold text-[12px] sm:text-[13px] tracking-[-0.02em] break-keep">
            {MESSAGES.wallet.empty.promoPrefix}{' '}
            <span className="text-flame-500 font-extrabold font-num whitespace-nowrap">
              {rewardLabel} 포인트
            </span>{' '}
            <span className="whitespace-nowrap">{MESSAGES.wallet.empty.promoSuffix}</span>
          </div>

          <svg
            viewBox="0 0 40 36"
            aria-hidden
            className="hidden sm:block shrink-0 w-8 h-7"
          >
            <rect x="6" y="8" width="28" height="20" rx="4" fill="var(--c-flame-100)" />
            <path
              d="M14 18 L20 22 L28 14"
              stroke="var(--c-flame-500)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>

          <button
            type="button"
            onClick={onActionClick}
            className="shrink-0 text-white font-extrabold border-0 font-sans rounded-full text-[10px] sm:text-[11px] tracking-[-0.02em] h-7 sm:h-8 w-9 sm:w-10"
            style={{ background: 'var(--c-rink-900)' }}
          >
            {MESSAGES.wallet.empty.promoBenefitButton}
          </button>
        </div>
      </div>

      {/* 2) View toggle row — opacity-50 비활성 표시 */}
      <div className="px-3 sm:px-5 pt-3 flex items-center gap-2">
        <div
          className="flex border border-wline dark:border-rink-700 overflow-hidden opacity-50 rounded-lg shrink-0"
          aria-hidden
        >
          <span
            className="grid place-items-center w-8 h-8"
            style={{ background: 'var(--c-text-1)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <rect x="1" y="2" width="14" height="5" rx="1" fill="#fff" />
              <rect x="1" y="9" width="14" height="5" rx="1" fill="#fff" opacity="0.5" />
            </svg>
          </span>
          <span
            className="grid place-items-center w-8 h-8"
            style={{ background: 'var(--c-surface)' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              stroke="var(--c-text-3)"
              strokeWidth="1.5"
            >
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
            </svg>
          </span>
        </div>

        <div className="flex-1 min-w-0" />

        {[MESSAGES.wallet.pay.historyChip, MESSAGES.wallet.pay.manageChip].map((label) => (
          <span
            key={label}
            className="bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-4 dark:text-rink-300 font-semibold opacity-50 inline-flex items-center h-8 px-2.5 sm:px-3.5 rounded-full text-[11px] sm:text-[12px] whitespace-nowrap shrink-0"
            aria-hidden
          >
            {label}
          </span>
        ))}
      </div>

      {/* 3) Top CTA — "팀플러스 처음이신가요?" */}
      <div className="px-3 sm:px-5 pt-3.5">
        <button
          type="button"
          onClick={onGetStartedClick}
          className="w-full flex items-center bg-wsurface dark:bg-rink-800 text-ice-600 dark:text-ice-300 font-extrabold rounded-[14px] h-12 sm:h-14 px-4 sm:px-[18px] text-[14px] sm:text-[15px] tracking-[-0.02em] break-keep gap-1"
          style={{ border: '1.5px solid var(--c-ice-500)' }}
        >
          <span className="truncate">{MESSAGES.wallet.empty.cta}</span>
          <span className="truncate">{MESSAGES.wallet.empty.ctaHighlight}</span>
          <span className="flex-1" />
          <svg
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.4"
            fill="none"
            aria-hidden
            className="w-4 h-4 shrink-0"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>

      {/* 4) Hero empty state card — split (white surface + responsive strip) */}
      <div className="px-3 sm:px-5 pt-3">
        <div className="flex shadow-sh-3 rounded-[18px] overflow-hidden">
          {/* 좌측 — 텍스트 + 일러스트 */}
          <div className="flex-1 min-w-0 bg-wsurface dark:bg-rink-800 flex flex-col gap-2.5 px-4 py-5 sm:px-5 sm:py-6">
            <div className="text-ice-600 dark:text-ice-300 font-bold text-[12px] sm:text-[13px] tracking-[-0.02em] break-keep">
              {MESSAGES.wallet.empty.heroLabel(childName)}
            </div>
            <div className="text-wtext-1 dark:text-white font-extrabold text-[clamp(17px,5vw,22px)] tracking-[-0.03em] leading-[1.3] break-keep">
              <span className="font-medium">{MESSAGES.wallet.empty.heroHeadlinePrefix}</span>{' '}
              <span className="whitespace-pre-line">
                {MESSAGES.wallet.empty.heroHeadlineSuffix}
              </span>
            </div>

            {/* 일러스트: 폰 + 스케이트 부츠 + sparkle (aspect-ratio 유지) */}
            <div
              className="grid place-items-center mt-2 w-full"
              style={{ aspectRatio: '200 / 130' }}
              aria-hidden
            >
              <svg viewBox="0 0 200 130" className="w-full h-full" aria-hidden>
                <ellipse
                  cx="100"
                  cy="115"
                  rx="70"
                  ry="6"
                  fill="var(--c-rink-100)"
                  opacity="0.6"
                />
                <rect x="50" y="22" width="62" height="92" rx="9" fill="var(--c-rink-800)" />
                <rect x="55" y="29" width="52" height="78" rx="3" fill="var(--c-surface)" />
                <rect x="62" y="38" width="38" height="6" rx="2" fill="var(--c-ice-100)" />
                <rect x="62" y="50" width="28" height="5" rx="2" fill="var(--c-line)" />
                <rect x="62" y="60" width="38" height="20" rx="3" fill="var(--c-ice-50)" />
                <circle cx="68" cy="70" r="4" fill="var(--c-ice-500)" />
                <rect x="76" y="66" width="20" height="3" rx="1" fill="var(--c-ice-300)" />
                <rect x="76" y="72" width="14" height="3" rx="1" fill="var(--c-ice-200)" />
                <g transform="translate(108 60)">
                  <path
                    d="M0 30 Q0 12 14 10 L34 8 Q44 8 48 16 L52 32 L52 38 L0 38 Z"
                    fill="var(--c-flame-500)"
                  />
                  <path
                    d="M0 38 L52 38 L50 44 Q48 46 44 46 L4 46 Q0 46 0 42 Z"
                    fill="var(--c-rink-900)"
                  />
                  <path
                    d="M2 50 L52 50"
                    stroke="var(--c-rink-900)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M14 14 L40 12 M16 20 L42 18 M18 26 L44 24"
                    stroke="var(--c-surface)"
                    strokeWidth="1.2"
                    opacity="0.6"
                  />
                </g>
                <circle cx="160" cy="40" r="3" fill="var(--c-sun-500)" />
                <path
                  d="M160 30 L160 36 M160 44 L160 50 M150 40 L156 40 M164 40 L170 40"
                  stroke="var(--c-sun-500)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* 우측 — Side strip (가변: 좁은 화면 64px, sm+ 78px) */}
          <button
            type="button"
            onClick={onAddClick}
            className="bg-rink-800 dark:bg-rink-900 text-white flex flex-col items-center justify-center gap-2 px-1.5 border-0 shrink-0 w-16 sm:w-[78px]"
            aria-label={MESSAGES.wallet.empty.addAction}
          >
            <span
              className="grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full"
              style={{ border: '1.5px solid rgba(255,255,255,0.6)' }}
              aria-hidden
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                stroke="#fff"
                strokeWidth="2.4"
                fill="none"
              >
                <line x1="12" y1="6" x2="12" y2="18" />
                <line x1="6" y1="12" x2="18" y2="12" />
              </svg>
            </span>
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[-0.02em]">
              {MESSAGES.wallet.empty.addAction}
            </span>
          </button>
        </div>
      </div>

      {/* 5) 수업 추천 섹션 (recommendedClass 있을 때만) */}
      {recommendedClass && (
        <>
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
            <div className="font-extrabold text-wtext-1 dark:text-white text-[15px] sm:text-[16px] tracking-[-0.02em] break-keep min-w-0 truncate">
              {MESSAGES.wallet.empty.recommendTitle}
            </div>
            <span
              className="text-wtext-3 dark:text-rink-300 font-semibold text-[11px] sm:text-[12px] shrink-0"
              aria-hidden
            >
              {MESSAGES.wallet.empty.recommendMore}
            </span>
          </div>

          <div className="px-3 sm:px-5">
            <div className="flex items-center bg-wsurface dark:bg-rink-800 shadow-sh-1 rounded-[14px] gap-3 px-3 sm:px-4 py-3 sm:py-3.5">
              <div
                className="grid place-items-center bg-flame-100 dark:bg-flame-500/20 rounded-[10px] shrink-0 w-12 h-12 sm:w-14 sm:h-14"
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  stroke="var(--c-flame-500)"
                  strokeWidth="2"
                  fill="none"
                  className="w-6 h-6 sm:w-7 sm:h-7"
                >
                  <path d="M3 18 L18 6 Q22 4 22 8 Q22 12 18 12" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center bg-flame-100 dark:bg-flame-500/20 text-flame-500 font-bold h-[18px] px-1.5 rounded-full text-[10px] tracking-[-0.02em] whitespace-nowrap">
                  {recommendedClass.ageRange}
                </span>
                <div className="text-wtext-1 dark:text-white font-bold truncate text-[13px] sm:text-[14px] mt-1.5 tracking-[-0.02em]">
                  {recommendedClass.title}
                </div>
                <div className="text-wtext-3 dark:text-rink-300 truncate text-[10px] sm:text-[11px] mt-0.5">
                  {`${recommendedClass.coachName} · ${recommendedClass.venueName} · ${recommendedClass.schedule}`}
                </div>
              </div>

              <button
                type="button"
                onClick={onRecommendedRegisterClick}
                className="bg-ice-500 text-white font-bold border-0 font-sans h-8 px-3 sm:px-3.5 rounded-full text-[11px] sm:text-[12px] shrink-0"
              >
                {MESSAGES.wallet.empty.recommendRegister}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="h-20" aria-hidden />
    </section>
  );
}
