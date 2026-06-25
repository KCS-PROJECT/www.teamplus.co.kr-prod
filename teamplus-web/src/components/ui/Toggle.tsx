'use client';

import { cn } from '@/lib/utils';

interface ToggleProps {
  /** 토글 상태 */
  checked: boolean;
  /** 상태 변경 핸들러 */
  onChange: (checked: boolean) => void;
  /** 비활성화 */
  disabled?: boolean;
  /** 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 라벨 */
  label?: string;
  /** 설명 */
  description?: string;
  /** 클래스 */
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
  className,
}: ToggleProps) {
  const sizeStyles = {
    sm: {
      track: 'w-9 h-5',
      thumb: 'w-4 h-4',
      translate: 'translate-x-4',
    },
    md: {
      track: 'w-11 h-6',
      thumb: 'w-5 h-5',
      translate: 'translate-x-5',
    },
    lg: {
      track: 'w-14 h-7',
      thumb: 'w-6 h-6',
      translate: 'translate-x-7',
    },
  };

  const styles = sizeStyles[size];

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible-disabled',
        styles.track,
        checked
          ? 'bg-ice-500'
          : 'bg-wline dark:bg-rink-500',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-md ring-0',
          'transform transition duration-200 ease-in-out',
          styles.thumb,
          checked ? styles.translate : 'translate-x-0'
        )}
      />
    </button>
  );

  if (!label) {
    return toggle;
  }

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex-1 mr-4">
        <label className="text-sm font-semibold text-wtext-1 dark:text-white cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
            {description}
          </p>
        )}
      </div>
      {toggle}
    </div>
  );
}
