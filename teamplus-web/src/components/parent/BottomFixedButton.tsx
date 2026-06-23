'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

/**
 * BottomFixedButton - 하단 고정 CTA 버튼 영역
 *
 * children, review, report, skill-report 등
 * 하단에 고정된 주요 액션 버튼을 표시하는 패턴입니다.
 */
interface BottomFixedButtonProps {
  /** 버튼 레이블 */
  label: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** Material Symbols 아이콘명 (선택) */
  icon?: string;
  /** 비활성 상태 */
  disabled?: boolean;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** 로딩 중 표시할 텍스트 */
  loadingText?: string;
  /** 추가 className (버튼) */
  buttonClassName?: string;
  /** 추가 className (컨테이너) */
  className?: string;
  /** 보조 버튼 (좌측에 표시) */
  secondaryAction?: ReactNode;
}

export function BottomFixedButton({
  label,
  onClick,
  icon,
  disabled = false,
  isLoading = false,
  loadingText,
  buttonClassName = '',
  className = '',
  secondaryAction,
}: BottomFixedButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-20 px-5 pb-safe-bottom pt-3',
        'bg-white dark:bg-rink-900 border-t border-wline-2 dark:border-rink-800',
        className
      )}
    >
      <div className="max-w-md mx-auto flex gap-3">
        {secondaryAction}
        <button
          type="button"
          onClick={onClick}
          disabled={isDisabled}
          className={cn(
            'flex-1 h-14 rounded-2xl font-bold text-base transition-all active:brightness-95',
            'flex items-center justify-center gap-2',
            isDisabled
              ? 'bg-wline-2 dark:bg-rink-800 text-wtext-3 dark:text-rink-300 cursor-not-allowed'
              : 'bg-ice-500 hover:bg-ice-700 text-white',
            buttonClassName
          )}
          aria-disabled={isDisabled}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              {loadingText ?? label}
            </span>
          ) : (
            <>
              {icon && (
                <Icon name={icon} className="text-[20px]" aria-hidden="true" />
              )}
              <span>{label}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
