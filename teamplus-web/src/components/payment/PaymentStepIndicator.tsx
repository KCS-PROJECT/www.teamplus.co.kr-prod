'use client';

import { Icon } from '@/components/ui/Icon';

/**
 * Payment Step Indicator — 결제 4단계 진행 표시 (v2, 2026-05-11)
 *
 * 개선 사항 (사용자 피드백 → frontend-design + clarify):
 *   1. 컬러 정책 통일 — emerald-500 (완료) → ice-500 단일 브랜드 컬러.
 *      DESIGN.md §"단일 인디고 #2f5fff + 다크 슬레이트" SoT 준수.
 *   2. 시각 무게 감소 — active ring-4 → ring-2 슬림화 (대시보드/카드 ring 토큰과 일치).
 *   3. 중복 제거 — 기존 `StepHeadline` 의 ① 뱃지 + "Step 2" 영문 텍스트는
 *      stepper 자체가 동일 정보를 표시하므로 제거. 헤드라인은 단일 설명문만 노출.
 *   4. Tone & Manner — "Step N" 영문 → "N/4단계" 한글 minimal 보조 텍스트.
 *
 * SPEC: 화면 캡쳐 분석 (`/payment/options/`) → 정보 3중 중복 + 영문 혼용 + 브랜드 컬러 위반.
 */

export interface PaymentStep {
  number: number;
  label: string;
  description: string;
}

export const PAYMENT_STEPS: PaymentStep[] = [
  { number: 1, label: '수업 선택', description: '원하시는 수업을 선택해주세요' },
  { number: 2, label: '정보 확인', description: '신청 정보를 확인해주세요' },
  { number: 3, label: '결제 수단', description: '결제 수단을 선택해주세요' },
  { number: 4, label: '결제 완료', description: '결제가 완료되었습니다' },
];

interface PaymentStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  variant?: 'default' | 'compact';
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일(ice-500) 1:1 보존(타 화면 회귀 0).
   *   true 시 활성/완료 동그라미·라인·라벨을 it-blue 토큰으로 정합. 구조는 동일.
   *   (결제 화면 stepper 호출처에서만 전달.)
   */
  iceTheme?: boolean;
}

export function PaymentStepIndicator({
  currentStep,
  variant = 'default',
  iceTheme = false,
}: PaymentStepIndicatorProps) {
  const isCompact = variant === 'compact';

  // ── 토큰 분기 (iceTheme=false 경로 원본 1:1 보존) ──────────────────────────
  const accentBg = iceTheme ? 'bg-it-blue-500' : 'bg-ice-500';
  const accentText = iceTheme ? 'text-it-blue-500' : 'text-ice-500';
  const activeRing = iceTheme ? 'ring-2 ring-it-blue-500/30' : 'ring-2 ring-ice-500/30';
  const bgLine = iceTheme ? 'bg-it-line dark:bg-rink-700' : 'bg-wline dark:bg-rink-700';
  const idleCircle = iceTheme
    ? 'bg-it-surface dark:bg-rink-800 border border-it-line dark:border-rink-700 text-it-ink-400 dark:text-wtext-4'
    : 'bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-3 dark:text-wtext-4';
  const completedLabel = iceTheme
    ? 'text-it-ink-600 dark:text-rink-200'
    : 'text-wtext-2 dark:text-rink-200';
  const idleLabel = iceTheme
    ? 'text-it-ink-400 dark:text-rink-400'
    : 'text-wtext-4 dark:text-rink-400';

  // ── 라인 구조 (2026-05-11 v3) ─────────────────────────────────────────────
  //
  // 이전 (v2): 각 <li> 내부 absolute 라인 → li 폭이 라벨 길이에 따라 가변이라
  //   step 간 라인이 양쪽 동그라미에 정확히 닿지 않았음. step 1 완료 동그라미 직후
  //   "라인 끊김 → 다시 이어짐" 시각적 결함 발생.
  //
  // 현재 (v3): <ol> 직속 자식으로 단일 progress 라인을 그림. grid-cols-N 으로
  //   동그라미를 정확히 균등 분배 → 첫 동그라미 중심 ~ currentStep 동그라미 중심까지
  //   1줄 연속 ice-500 라인. li 가 source-order 후행이라 자동으로 동그라미가 라인 끝을
  //   가림 → visually 끊김 0. window resize 시에도 calc() 로 자동 재계산.
  //
  // 위치 계산 (grid-cols-N + px-2):
  //   - column 폭   : (100% - 16px) / N  (16px = px-2 좌우 합)
  //   - 첫 동그라미 중심 (left) : 8px + column-폭 / 2 = calc(8px + (100% - 16px) / (2*N))
  //   - step 간 거리           : column-폭 = calc((100% - 16px) / N)
  //   - active 라인 width      : step 간 거리 × (currentStep - 1)
  // ──────────────────────────────────────────────────────────────────────
  const stepCount = PAYMENT_STEPS.length;
  const lineLeft = `calc(8px + (100% - 16px) / ${2 * stepCount})`;
  const lineEnd = `calc(8px + (100% - 16px) / ${2 * stepCount} + (100% - 16px) * ${stepCount - 1} / ${stepCount})`;
  const activeWidth = `calc((100% - 16px) * ${currentStep - 1} / ${stepCount})`;
  const dotTopOffset = isCompact ? '14px' : '18px'; // 동그라미 반지름

  return (
    <nav
      aria-label="결제 진행 단계"
      className="w-full"
    >
      {/* Grid container — 4개 column 균등 분배 (justify-between 의 가변 li 폭 문제 해결) */}
      <ol className="relative grid items-center px-2" style={{ gridTemplateColumns: `repeat(${stepCount}, 1fr)` }}>
        {/* Background line — 첫 동그라미 중심 ~ 마지막 동그라미 중심 (정확한 baseline) */}
        <div
          className={`absolute h-px ${bgLine}`}
          style={{
            top: dotTopOffset,
            left: lineLeft,
            right: `calc(100% - (${lineEnd}))`,
          }}
          aria-hidden="true"
        />

        {/* Active progress line — 첫 동그라미 중심부터 currentStep 동그라미 중심까지 1줄 연속 */}
        <div
          className={`absolute h-px ${accentBg} transition-[width] motion-reduce:transition-none duration-300 ease-out`}
          style={{
            top: dotTopOffset,
            left: lineLeft,
            width: activeWidth,
          }}
          aria-hidden="true"
        />

        {PAYMENT_STEPS.map((step) => {
          const isCompleted = step.number < currentStep;
          const isActive = step.number === currentStep;

          return (
            <li
              key={step.number}
              className="relative flex flex-col items-center"
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Circle — 단일 브랜드 컬러 (ice-500) · 완료=fill+check · 현재=fill+숫자+slim ring · 미완료=outline.
                  z-10 으로 라인 양 끝을 자연스럽게 가림. */}
              <div
                className={`
                  relative z-10 flex items-center justify-center rounded-full
                  transition-all motion-reduce:transition-none duration-300 ease-out transform-gpu
                  ${isCompact ? 'size-7' : 'size-9'}
                  ${
                    isCompleted
                      ? `${accentBg} text-white`
                      : isActive
                        ? `${accentBg} text-white ${activeRing}`
                        : idleCircle
                  }
                `}
              >
                {isCompleted ? (
                  <Icon
                    name="check"
                    className={isCompact ? 'text-sm' : 'text-base'}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className={`font-bold tabular-nums ${isCompact ? 'text-xs' : 'text-sm'}`}
                  >
                    {step.number}
                  </span>
                )}
                <span className="sr-only">
                  {isCompleted
                    ? `${step.label} 완료`
                    : isActive
                      ? `${step.label} 현재 단계`
                      : `${step.label} 대기 중`}
                </span>
              </div>

              {/* Label — active 만 ice-500 강조, 완료·미완료는 동일 muted (시각 무게 균등화) */}
              <span
                className={`
                  mt-2 font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-300
                  ${isCompact ? 'text-[10px]' : 'text-xs'}
                  ${
                    isActive
                      ? `${accentText} font-bold`
                      : isCompleted
                        ? completedLabel
                        : idleLabel
                  }
                `}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Step Headline — 각 단계의 메인 설명 (v2 minimal)
 *
 * 변경 (2026-05-11):
 *   - 제거: ① 뱃지 + "Step 2" 영문 텍스트 (stepper 와 정보 중복).
 *   - 추가: "2/4단계 · 정보 확인" 한 줄 보조 텍스트 (한글, tabular-nums).
 *   - 헤드라인 weight 23 → 24 (text-2xl 유지) · tracking-tight · leading 정돈.
 */
interface StepHeadlineProps {
  currentStep: 1 | 2 | 3 | 4;
  customDescription?: string;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일(ice-500/wtext) 1:1 보존(회귀 0).
   *   true 시 보조 텍스트·제목을 it-blue/it-ink 토큰으로 정합. 구조·문구 동일.
   */
  iceTheme?: boolean;
}

export function StepHeadline({ currentStep, customDescription, iceTheme = false }: StepHeadlineProps) {
  const step = PAYMENT_STEPS[currentStep - 1];

  if (iceTheme) {
    return (
      <header className="mb-6">
        <p className="mb-2 text-xs font-semibold text-it-ink-500 dark:text-rink-300 tracking-wide tabular-nums">
          <span className="text-it-blue-500">{currentStep}</span>
          <span className="text-it-ink-400 dark:text-rink-400">/{PAYMENT_STEPS.length}단계</span>
          <span className="mx-1.5 text-it-ink-300 dark:text-rink-500">·</span>
          <span className="text-it-ink-600 dark:text-rink-100">{step.label}</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-snug text-it-ink-900 dark:text-white">
          {customDescription || step.description}
        </h1>
      </header>
    );
  }

  return (
    <header className="mb-6">
      <p className="mb-2 text-xs font-semibold text-wtext-3 dark:text-rink-300 tracking-wide tabular-nums">
        <span className="text-ice-500">{currentStep}</span>
        <span className="text-wtext-4 dark:text-rink-400">/{PAYMENT_STEPS.length}단계</span>
        <span className="mx-1.5 text-wtext-4 dark:text-rink-500">·</span>
        <span className="text-wtext-2 dark:text-rink-100">{step.label}</span>
      </p>
      <h1 className="text-2xl font-bold tracking-tight leading-snug text-wtext-1 dark:text-white">
        {customDescription || step.description}
      </h1>
    </header>
  );
}

/**
 * Completed Step Indicator — 결제 완료 시 전체 단계 완료 표시
 *   (변경 없음 — 이미 ice-500 단일 브랜드 컬러 정책 준수).
 */
export function CompletedStepIndicator() {
  return (
    <div className="w-full">
      {/* Step circles with all completed - 가운데 정렬 */}
      <div className="relative flex items-center justify-center">
        {/* Container for steps with fixed spacing */}
        <div className="flex items-center">
          {PAYMENT_STEPS.map((step, index) => {
            const isLast = index === PAYMENT_STEPS.length - 1;
            const isFirst = index === 0;

            return (
              <div key={step.number} className="flex items-center">
                {/* Line before circle (except first) */}
                {!isFirst && (
                  <div className="w-12 h-px bg-ice-500" aria-hidden="true" />
                )}

                {/* Step item */}
                <div className="flex flex-col items-center">
                  {/* Circle - all completed with Primary Blue.
                      ring-offset 제거 (2026-05-11) — 라인 연결 자연스러움 보장,
                      PaymentStepIndicator 와 동일 정책. */}
                  <div
                    className={`
                      flex items-center justify-center size-8 rounded-full
                      bg-ice-500 text-white
                      ${isLast ? 'ring-2 ring-ice-500/30' : ''}
                    `}
                  >
                    <Icon name="check" className="text-sm font-bold" aria-hidden="true" />
                  </div>

                  {/* Label */}
                  <span
                    className={`
                      mt-2 text-[10px] font-medium whitespace-nowrap
                      ${isLast ? 'text-ice-500 font-bold' : 'text-wtext-3 dark:text-rink-300'}
                    `}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PaymentStepIndicator;
