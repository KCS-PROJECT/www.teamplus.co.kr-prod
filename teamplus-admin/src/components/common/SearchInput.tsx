'use client';

/**
 * SearchInput - 검색 입력 + 디바운스 공통 컴포넌트
 * AI 스타일 금지: gradient, blur 미사용
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  /** 현재 검색어 */
  value?: string;
  /** 변경 핸들러 (디바운스 적용) */
  onChange: (value: string) => void;
  /** 플레이스홀더 */
  placeholder?: string;
  /** 디바운스 지연 시간 (ms, 기본 300) */
  debounceMs?: number;
  /** 입력 필드 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 비활성화 */
  disabled?: boolean;
  /** 추가 클래스 */
  className?: string;
  /** 자동 포커스 */
  autoFocus?: boolean;
}

const sizeConfig = {
  sm: {
    input: 'h-8 pl-8 pr-8 text-sm',
    icon: 'w-3.5 h-3.5 left-2.5',
    clear: 'w-3.5 h-3.5 right-2',
  },
  md: {
    input: 'h-10 pl-10 pr-10 text-sm',
    icon: 'w-4 h-4 left-3',
    clear: 'w-4 h-4 right-3',
  },
  lg: {
    input: 'h-12 pl-12 pr-12',
    icon: 'w-5 h-5 left-3.5',
    clear: 'w-5 h-5 right-3.5',
  },
};

export function SearchInput({
  value: controlledValue,
  onChange,
  placeholder = '검색...',
  debounceMs = 300,
  size = 'md',
  disabled = false,
  className,
  autoFocus = false,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(controlledValue ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfg = sizeConfig[size];

  // controlled value sync
  useEffect(() => {
    if (controlledValue !== undefined && controlledValue !== localValue) {
      setLocalValue(controlledValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange('');
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={cn('relative', className)}>
      <Search
        className={cn(
          'absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none',
          cfg.icon
        )}
      />
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'w-full rounded-lg border border-slate-200 dark:border-slate-600',
          'bg-white dark:bg-slate-800',
          'text-slate-900 dark:text-white',
          'placeholder-slate-400 dark:placeholder-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
          cfg.input
        )}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors',
            cfg.clear
          )}
          aria-label="검색어 지우기"
        >
          <X className="w-full h-full" />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
