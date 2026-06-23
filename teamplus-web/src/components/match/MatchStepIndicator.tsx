'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface MatchStep {
  label: string;
}

interface MatchStepIndicatorProps {
  /** 현재 활성 스텝(1-based) */
  currentStep: number;
  /** 전체 스텝 목록 (보통 3개) */
  steps: MatchStep[];
  className?: string;
}

/**
 * 매치 결제/신청 플로우에서 사용하는 1-2-3 스텝 인디케이터.
 *
 * HTML 목업 "매치 참가비 결제 확인"의 스텝 디자인 재현:
 * - 대기 스텝: 회색 원 + 번호
 * - 현재 스텝: Primary 원 + 그림자
 * - 완료 스텝: Primary 원 + 체크 아이콘
 *
 * AI 스타일 금지 원칙을 준수합니다(솔리드 컬러 + shadow-sm).
 */
export function MatchStepIndicator({
  currentStep,
  steps,
  className,
}: MatchStepIndicatorProps) {
  return (
    <ol
      className={cn('flex items-center justify-between px-2', className)}
      aria-label="진행 단계"
    >
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const state: StepState =
          stepNumber < currentStep
            ? 'done'
            : stepNumber === currentStep
              ? 'current'
              : 'pending';

        return (
          <li
            key={step.label}
            className="flex flex-1 items-center"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <StepCell index={stepNumber} label={step.label} state={state} />
            {index < steps.length - 1 && (
              <span
                className={cn(
                  'h-px flex-1 mx-2',
                  stepNumber < currentStep
                    ? 'bg-ice-500'
                    : 'bg-wline dark:bg-rink-700'
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

type StepState = 'done' | 'current' | 'pending';

function StepCell({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: StepState;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
          state === 'done' && 'bg-ice-500 text-white shadow-sm',
          state === 'current' &&
            'bg-ice-500 text-white shadow-sm ring-4 ring-ice-500/15',
          state === 'pending' &&
            'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
        )}
      >
        {state === 'done' ? (
          <Icon name="check" className="text-base" />
        ) : (
          index
        )}
      </span>
      <span
        className={cn(
          'text-xs font-semibold',
          state === 'pending'
            ? 'text-wtext-3 dark:text-rink-300'
            : 'text-wtext-1 dark:text-white'
        )}
      >
        {label}
      </span>
    </div>
  );
}
