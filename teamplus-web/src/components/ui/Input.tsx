'use client';

import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  forwardRef,
  useState,
  useId,
} from 'react';

// InputBase - 간단한 input 래퍼 컴포넌트
const InputBase = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ ...props }, ref) => {
  return <input ref={ref} {...props} />;
});
InputBase.displayName = 'InputBase';

// TextareaBase - 간단한 textarea 래퍼 컴포넌트
const TextareaBase = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ ...props }, ref) => {
  return <textarea ref={ref} {...props} />;
});
TextareaBase.displayName = 'TextareaBase';

// SelectBase - 간단한 select 래퍼 컴포넌트
const SelectBase = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ children, ...props }, ref) => {
  return <select ref={ref} {...props}>{children}</select>;
});
SelectBase.displayName = 'SelectBase';

/**
 * Input Component - TEAMPLUS Design System
 * Design 7 Principles Applied:
 * - Clean borders without gradient
 * - Solid focus states
 * - Consistent styling with form elements
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  /** Accessible id - auto-generated if not provided */
  inputId?: string;
  /** ICETIMES 시안 스킨(하우머치 스타일). false(기본)면 기존 디자인 1:1 보존. */
  iceTheme?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, icon, error, helperText, type, required, inputId, id, iceTheme = false, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    // WCAG 접근성: label-input 연결을 위한 id 생성
    // useId()는 서버/클라이언트 간 일관된 ID를 생성하여 hydration 불일치 방지
    const generatedId = useId();
    const fieldId = inputId || id || generatedId;
    const errorId = error ? `${fieldId}-error` : undefined;
    const helperId = helperText ? `${fieldId}-helper` : undefined;

    // ── ICETIMES 시안: 컨테이너(border+fill)가 input/아이콘을 감싸는 구조 ──
    // height 52(login)/50(signup) 는 className 으로 컨테이너에 전달.
    if (iceTheme) {
      return (
        <div className="w-full">
          {label && (
            <label
              htmlFor={fieldId}
              className="inline-flex gap-1 text-[13.5px] font-bold text-it-ink-700 dark:text-it-ink-200 mb-[7px]"
            >
              {label}
              {required && <span className="text-it-red-500" aria-hidden="true">*</span>}
            </label>
          )}
          <div
            className={cn(
              'flex items-center gap-2.5 h-[50px] px-3.5',
              'bg-it-fill dark:bg-it-ink-800 rounded-w-md',
              'border-[1.5px] border-it-line-strong dark:border-it-ink-700',
              'focus-within:border-it-blue-500',
              'transition-colors duration-150',
              error && 'border-it-red-400 focus-within:border-it-red-400',
              props.disabled && 'opacity-60 cursor-not-allowed',
              className,
            )}
          >
            {icon && (
              <Icon name={icon} className="text-it-ink-400 shrink-0" aria-hidden="true" />
            )}
            <InputBase
              ref={ref}
              id={fieldId}
              type={isPassword && showPassword ? 'text' : type}
              autoComplete={props.autoComplete || (isPassword ? 'current-password' : undefined)}
              aria-invalid={!!error}
              aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
              aria-required={required}
              className={cn(
                'flex-1 min-w-0 h-full bg-transparent border-none outline-none',
                'text-[15.5px] font-semibold text-it-ink-800 dark:text-white',
                'placeholder-it-ink-400 dark:placeholder-it-ink-300',
                props.disabled && 'cursor-not-allowed',
              )}
              {...props}
            />
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="shrink-0 inline-flex items-center justify-center text-it-ink-400 hover:text-it-ink-600 dark:hover:text-it-ink-200 transition-colors min-w-[24px] min-h-[24px]"
                tabIndex={0}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
              </button>
            )}
          </div>
          {error && (
            <p id={errorId} className="mt-1.5 text-[12.5px] font-medium text-it-red-500 flex items-center gap-1" role="alert">
              <Icon name="error" className="text-[16px]" aria-hidden="true" />
              {error}
            </p>
          )}
          {helperText && !error && (
            <p id={helperId} className="mt-1.5 text-[12.5px] font-medium text-it-ink-400 dark:text-it-ink-300">
              {helperText}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={fieldId}
            className="block text-sm font-semibold text-wtext-2 dark:text-rink-100 mb-2"
          >
            {label}
            {required && <span className="text-error ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Icon
                name={icon}
                className="text-wtext-3 group-focus-within:text-ice-500 transition-colors duration-200"
              />
            </div>
          )}
          <InputBase
            ref={ref}
            id={fieldId}
            type={isPassword && showPassword ? 'text' : type}
            autoComplete={props.autoComplete || (isPassword ? 'current-password' : undefined)}
            aria-invalid={!!error}
            aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
            aria-required={required}
            className={cn(
              // WCAG 2.1: 최소 44px 터치 타겟
              'block w-full h-12 min-h-[48px] bg-white dark:bg-rink-800',
              'border border-wline dark:border-rink-700 rounded-lg',
              'text-wtext-1 dark:text-white text-[15px]',
              'placeholder-wtext-3 dark:placeholder-rink-300',
              'focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20',
              'transition-all duration-200',
              icon ? 'pl-12' : 'pl-4',
              isPassword ? 'pr-12' : 'pr-4',
              error && 'border-error focus:border-error focus:ring-error/20',
              props.disabled && 'bg-wbg dark:bg-rink-900 cursor-not-allowed opacity-60',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer text-wtext-3 hover:text-wtext-2 dark:hover:text-rink-100 transition-colors min-w-[44px] min-h-[44px]"
              tabIndex={0}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-2 text-sm text-error flex items-center gap-1" role="alert">
            <Icon name="error" className="text-[16px]" aria-hidden="true" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-2 text-sm text-wtext-3 dark:text-rink-300">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea Component - TEAMPLUS Design System
 */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  inputId?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, required, inputId, id, ...props }, ref) => {
    // WCAG 접근성: label-input 연결을 위한 id 생성
    // useId()는 서버/클라이언트 간 일관된 ID를 생성하여 hydration 불일치 방지
    const generatedId = useId();
    const fieldId = inputId || id || generatedId;
    const errorId = error ? `${fieldId}-error` : undefined;
    const helperId = helperText ? `${fieldId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={fieldId}
            className="block text-sm font-semibold text-wtext-2 dark:text-rink-100 mb-2"
          >
            {label}
            {required && <span className="text-error ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <TextareaBase
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
          aria-required={required}
          className={cn(
            'block w-full p-4 bg-white dark:bg-rink-800',
            'border border-wline dark:border-rink-700 rounded-lg',
            'text-wtext-1 dark:text-white text-[15px]',
            'placeholder-wtext-3 dark:placeholder-rink-300',
            'focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20',
            'transition-all duration-200 resize-none',
            'min-h-[120px]',
            error && 'border-error focus:border-error focus:ring-error/20',
            props.disabled && 'bg-wbg dark:bg-rink-900 cursor-not-allowed opacity-60',
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-2 text-sm text-error flex items-center gap-1" role="alert">
            <Icon name="error" className="text-[16px]" aria-hidden="true" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-2 text-sm text-wtext-3 dark:text-rink-300">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

/**
 * Select Component - TEAMPLUS Design System
 */
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  inputId?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, placeholder, error, helperText, required, inputId, id, ...props }, ref) => {
    // WCAG 접근성: label-input 연결을 위한 id 생성
    // useId()는 서버/클라이언트 간 일관된 ID를 생성하여 hydration 불일치 방지
    const generatedId = useId();
    const fieldId = inputId || id || generatedId;
    const errorId = error ? `${fieldId}-error` : undefined;
    const helperId = helperText ? `${fieldId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={fieldId}
            className="block text-sm font-semibold text-wtext-2 dark:text-rink-100 mb-2"
          >
            {label}
            {required && <span className="text-error ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          <SelectBase
            ref={ref}
            id={fieldId}
            aria-invalid={!!error}
            aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
            aria-required={required}
            className={cn(
              // WCAG 2.1: 최소 44px 터치 타겟
              'block w-full h-12 min-h-[48px] px-4 bg-white dark:bg-rink-800',
              'border border-wline dark:border-rink-700 rounded-lg',
              'text-wtext-1 dark:text-white text-[15px]',
              'focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20',
              'transition-all duration-200',
              'appearance-none cursor-pointer',
              'pr-10',
              error && 'border-error focus:border-error focus:ring-error/20',
              props.disabled && 'bg-wbg dark:bg-rink-900 cursor-not-allowed opacity-60',
              !props.value && 'text-wtext-3',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </SelectBase>
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <Icon name="expand_more" className="text-wtext-3" aria-hidden="true" />
          </div>
        </div>
        {error && (
          <p id={errorId} className="mt-2 text-sm text-error flex items-center gap-1" role="alert">
            <Icon name="error" className="text-[16px]" aria-hidden="true" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-2 text-sm text-wtext-3 dark:text-rink-300">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

/**
 * Checkbox Component - TEAMPLUS Design System
 */
interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, ...props }, ref) => {
    return (
      <label className={cn(
        'flex items-start gap-3 cursor-pointer group',
        props.disabled && 'cursor-not-allowed opacity-60',
        className
      )}>
        <div className="relative flex items-center justify-center mt-0.5">
          <InputBase
            ref={ref}
            type="checkbox"
            className={cn(
              'w-5 h-5 rounded border-2 border-wline dark:border-rink-700',
              'bg-white dark:bg-rink-800',
              'checked:bg-ice-500 checked:border-ice-500',
              'focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:ring-offset-2',
              'transition-all duration-200 cursor-pointer',
              'appearance-none'
            )}
            {...props}
          />
          <Icon
            name="check"
            className="absolute text-white text-[14px] pointer-events-none opacity-0 peer-checked:opacity-100"
          />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-wtext-1 dark:text-white group-hover:text-ice-500 transition-colors">
            {label}
          </span>
          {description && (
            <span className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
              {description}
            </span>
          )}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

/**
 * SearchInput Component - TEAMPLUS Design System
 * Specialized input for search functionality
 */
interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, ...props }, ref) => {
    return (
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Icon
            name="search"
            className="text-wtext-3 group-focus-within:text-ice-500 transition-colors duration-200"
          />
        </div>
        <InputBase
          ref={ref}
          type="search"
          value={value}
          className={cn(
            'block w-full py-3 pl-12 pr-10 bg-wbg dark:bg-rink-800',
            'border border-wline dark:border-rink-700 rounded-full',
            'text-wtext-1 dark:text-white text-[15px]',
            'placeholder-wtext-3 dark:placeholder-rink-300',
            'focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 focus:bg-white dark:focus:bg-rink-800',
            'transition-all duration-200',
            className
          )}
          {...props}
        />
        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer text-wtext-3 hover:text-wtext-2 dark:hover:text-rink-100 transition-colors"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

/**
 * FormGroup Component - TEAMPLUS Design System
 * Container for grouping form elements
 */
interface FormGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function FormGroup({ children, className }: FormGroupProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {children}
    </div>
  );
}
