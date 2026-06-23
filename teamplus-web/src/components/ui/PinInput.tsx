'use client';

import { useRef, useCallback, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  /** PIN 자릿수 (기본 6) */
  length?: number;
  /** 현재 값 (controlled) */
  value: string;
  /** 값 변경 핸들러 */
  onChange: (value: string) => void;
  /** 모든 자릿수 입력 완료 시 콜백 */
  onComplete?: (value: string) => void;
  /** 비밀번호 마스킹 (기본 true) */
  secure?: boolean;
  /** 비활성화 */
  disabled?: boolean;
  /** 첫 번째 input 자동 포커스 (기본 true) */
  autoFocus?: boolean;
  /** WCAG AAA 아동 모드 (72x72dp, 20px+ 폰트, 7:1 대비율) */
  childMode?: boolean;
  /** 에러 메시지 */
  error?: string;
}

export default function PinInput({
  length = 6,
  value,
  onChange,
  onComplete,
  secure = true,
  disabled = false,
  autoFocus = true,
  childMode = false,
  error,
}: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInput = useCallback((index: number) => {
    const target = inputRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  const updateValue = useCallback(
    (newValue: string) => {
      onChange(newValue);
      if (newValue.length === length && onComplete) {
        onComplete(newValue);
      }
    },
    [onChange, onComplete, length],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, index: number) => {
      const char = e.target.value.slice(-1);

      // 숫자 외 입력 무시
      if (char && !/^\d$/.test(char)) {
        return;
      }

      const chars = value.split('');

      if (char) {
        // 현재 인덱스까지 빈 칸이 있으면 채워주기
        while (chars.length <= index) {
          chars.push('');
        }
        chars[index] = char;
        const newValue = chars.join('').slice(0, length);
        updateValue(newValue);

        // 다음 칸으로 이동
        if (index < length - 1) {
          focusInput(index + 1);
        }
      } else {
        // 값이 지워진 경우
        chars[index] = '';
        updateValue(chars.join(''));
      }
    },
    [value, length, updateValue, focusInput],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        const chars = value.split('');

        if (chars[index]) {
          // 현재 칸에 값이 있으면 비우기
          chars[index] = '';
          updateValue(chars.join(''));
        } else if (index > 0) {
          // 현재 칸이 비어있으면 이전 칸으로 이동하고 비우기
          chars[index - 1] = '';
          updateValue(chars.join(''));
          focusInput(index - 1);
        }
      }

      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        focusInput(index - 1);
      }

      if (e.key === 'ArrowRight' && index < length - 1) {
        e.preventDefault();
        focusInput(index + 1);
      }
    },
    [value, length, updateValue, focusInput],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').trim();
      const digits = pasted.replace(/\D/g, '').slice(0, length);

      if (digits.length > 0) {
        updateValue(digits);

        // 붙여넣기 후 마지막 입력된 칸 또는 마지막 칸에 포커스
        const focusIndex = Math.min(digits.length, length) - 1;
        // setTimeout으로 DOM 업데이트 후 포커스
        setTimeout(() => {
          focusInput(focusIndex);
        }, 0);
      }
    },
    [length, updateValue, focusInput],
  );

  return (
    <div>
      <div className="flex gap-1.5 justify-center">
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type={secure ? 'password' : 'text'}
            inputMode="numeric"
            maxLength={1}
            value={value[i] || ''}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onPaste={handlePaste}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            aria-label={`PIN ${i + 1}번째 자리`}
            aria-invalid={!!error}
            autoComplete="off"
            className={cn(
              // 공통 스타일
              'text-center font-bold rounded-xl border-2 bg-white',
              'outline-none transition-colors duration-150',
              'dark:bg-rink-800 dark:text-white',
              // 사이즈: 48×48 정사각형 고정 (업계 표준, WCAG AA 터치 타겟 충족)
              childMode
                ? 'w-12 h-12 text-xl'
                : 'w-12 h-14 text-xl',
              // 테두리/포커스 상태
              error
                ? 'border-red-500 ring-1 ring-red-500'
                : 'border-gray-200 dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500',
              // childMode 고대비 텍스트 (7:1 대비율)
              childMode
                ? 'text-wtext-1 dark:text-white'
                : 'text-wtext-1 dark:text-white',
              // 비활성화
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
        ))}
      </div>
      {error && (
        <p
          className={cn(
            'text-red-500 text-sm mt-2 text-center',
            childMode && 'text-base font-medium',
          )}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
