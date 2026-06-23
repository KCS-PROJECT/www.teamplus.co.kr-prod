'use client';

import { cn } from '@/lib/utils';
import { Icon } from './Icon';

/**
 * Stepper Component - TEAMPLUS Design System
 * 결제 플로우 등 다단계 프로세스에 사용
 * WCAG 2.1 AA 준수:
 * - ARIA 속성 (aria-current, aria-label)
 * - 명확한 시각적 상태 표시
 * - 스크린 리더 지원
 */

interface Step {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number; // 0-indexed
  className?: string;
  variant?: 'default' | 'compact' | 'vertical';
  onStepClick?: (stepIndex: number) => void;
  allowClickNavigation?: boolean;
}

export function Stepper({
  steps,
  currentStep,
  className,
  variant = 'default',
  onStepClick,
  allowClickNavigation = false,
}: StepperProps) {
  const handleStepClick = (index: number) => {
    if (allowClickNavigation && onStepClick && index < currentStep) {
      onStepClick(index);
    }
  };

  if (variant === 'vertical') {
    return (
      <nav aria-label="진행 단계" className={cn('w-full', className)}>
        <ol className="relative flex flex-col gap-2">
          {steps.map((step, index) => {
            const status = index < currentStep ? 'completed' : index === currentStep ? 'current' : 'upcoming';
            const isClickable = allowClickNavigation && index < currentStep;

            return (
              <li key={step.id} className="relative">
                <div
                  className={cn(
                    'flex items-start gap-4 p-3 rounded-lg transition-colors',
                    isClickable && 'cursor-pointer hover:bg-wbg dark:hover:bg-rink-800',
                    status === 'current' && 'bg-ice-500/5'
                  )}
                  onClick={() => handleStepClick(index)}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleStepClick(index);
                    }
                  }}
                >
                  {/* Step Number/Icon */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors',
                      status === 'completed' && 'bg-success text-white',
                      status === 'current' && 'bg-ice-500 text-white',
                      status === 'upcoming' && 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                    )}
                    aria-current={status === 'current' ? 'step' : undefined}
                  >
                    {status === 'completed' ? (
                      <Icon name="check" className="text-lg" />
                    ) : step.icon ? (
                      <Icon name={step.icon} className="text-lg" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        status === 'current' && 'text-ice-500',
                        status === 'completed' && 'text-wtext-1 dark:text-white',
                        status === 'upcoming' && 'text-wtext-3 dark:text-rink-300'
                      )}
                    >
                      {step.label}
                    </p>
                    {step.description && (
                      <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'absolute left-[1.19rem] top-[3.25rem] w-0.5 h-4',
                      index < currentStep ? 'bg-success' : 'bg-wline dark:bg-rink-700'
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  if (variant === 'compact') {
    return (
      <nav aria-label="진행 단계" className={cn('w-full', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-wtext-1 dark:text-white">
            {steps[currentStep]?.label}
          </span>
          <span className="text-sm text-wtext-3 dark:text-rink-300">
            {currentStep + 1} / {steps.length}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                index <= currentStep ? 'bg-ice-500' : 'bg-wline dark:bg-rink-700'
              )}
              aria-current={index === currentStep ? 'step' : undefined}
              aria-label={`${step.label} ${index < currentStep ? '(완료)' : index === currentStep ? '(진행 중)' : ''}`}
            />
          ))}
        </div>
      </nav>
    );
  }

  // Default horizontal stepper
  return (
    <nav aria-label="진행 단계" className={cn('w-full', className)}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const status = index < currentStep ? 'completed' : index === currentStep ? 'current' : 'upcoming';
          const isClickable = allowClickNavigation && index < currentStep;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className={cn('flex items-center', !isLast && 'flex-1')}
            >
              {/* Step Indicator */}
              <div
                className={cn(
                  'flex flex-col items-center',
                  isClickable && 'cursor-pointer'
                )}
                onClick={() => handleStepClick(index)}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleStepClick(index);
                  }
                }}
              >
                {/* Circle */}
                <div
                  className={cn(
                    // WCAG 2.1: 최소 44px 터치 타겟
                    'w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm transition-all',
                    'border-2',
                    status === 'completed' && 'bg-success border-success text-white',
                    status === 'current' && 'bg-ice-500 border-ice-500 text-white shadow-md',
                    status === 'upcoming' && 'bg-white dark:bg-rink-800 border-wline dark:border-rink-700 text-wtext-3 dark:text-rink-300',
                    isClickable && 'hover:border-ice-500/50'
                  )}
                  aria-current={status === 'current' ? 'step' : undefined}
                >
                  {status === 'completed' ? (
                    <Icon name="check" className="text-lg" />
                  ) : step.icon ? (
                    <Icon name={step.icon} className="text-lg" />
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center max-w-[80px] truncate',
                    status === 'current' && 'text-ice-500 font-semibold',
                    status === 'completed' && 'text-wtext-2 dark:text-rink-100',
                    status === 'upcoming' && 'text-wtext-3 dark:text-rink-300'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div className="flex-1 px-2">
                  <div
                    className={cn(
                      'h-0.5 w-full transition-colors',
                      index < currentStep ? 'bg-success' : 'bg-wline dark:bg-rink-700'
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Progress Stepper (simplified percentage-based)
interface ProgressStepperProps {
  current: number;
  total: number;
  label?: string;
  className?: string;
  showPercentage?: boolean;
}

export function ProgressStepper({
  current,
  total,
  label,
  className,
  showPercentage = true,
}: ProgressStepperProps) {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className={cn('w-full', className)} role="progressbar" aria-valuenow={current} aria-valuemin={0} aria-valuemax={total} aria-label={label || '진행률'}>
      <div className="flex items-center justify-between mb-2">
        {label && (
          <span className="text-sm font-medium text-wtext-2 dark:text-rink-100">
            {label}
          </span>
        )}
        <span className="text-sm text-wtext-3 dark:text-rink-300">
          {showPercentage ? `${percentage}%` : `${current}/${total}`}
        </span>
      </div>
      <div className="h-2 bg-wline dark:bg-rink-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-ice-500 transition-all duration-300 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
