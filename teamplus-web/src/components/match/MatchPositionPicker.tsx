'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { MatchPosition } from './MatchPositionChip';

interface MatchPositionPickerProps {
  value: MatchPosition | '';
  onChange: (next: MatchPosition) => void;
  /** GK 옵션 포함 여부 */
  includeGoalie?: boolean;
  className?: string;
}

const OPTIONS: Array<{
  value: MatchPosition;
  label: string;
  sub: string;
  icon: string;
}> = [
  { value: 'FW', label: 'FW', sub: '포워드', icon: 'sports_hockey' },
  { value: 'DF', label: 'DF', sub: '디펜스', icon: 'shield' },
  { value: 'MF', label: 'MF', sub: '미드필더', icon: 'bolt' },
  { value: 'GK', label: 'GK', sub: '골리', icon: 'pan_tool' },
];

/**
 * 포지션 선택 바텀시트의 그리드 버튼 영역.
 *
 * 신청 플로우(payment 페이지)에서 포지션을 선택할 때 사용.
 * 버튼 자체에 애니메이션은 없고, 선택 상태만 primary 하이라이트.
 */
export function MatchPositionPicker({
  value,
  onChange,
  includeGoalie = true,
  className,
}: MatchPositionPickerProps) {
  const options = includeGoalie
    ? OPTIONS
    : OPTIONS.filter((option) => option.value !== 'GK');

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={cn(
              'relative flex flex-col items-center gap-3 p-5 rounded-2xl transition-colors motion-reduce:transition-none',
              selected
                ? 'bg-ice-500 text-white border-2 border-ice-500 shadow-md'
                : 'bg-wbg dark:bg-rink-800 border-2 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500/60'
            )}
          >
            {selected && (
              <span
                className="absolute top-2 right-2 w-5 h-5 bg-white text-ice-500 rounded-full flex items-center justify-center"
                aria-hidden
              >
                <Icon name="check" className="text-sm" />
              </span>
            )}
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center',
                selected
                  ? 'bg-white/20'
                  : 'bg-white dark:bg-rink-900 text-wtext-3 dark:text-rink-300'
              )}
            >
              <Icon name={option.icon} className="text-2xl" />
            </div>
            <div className="text-center">
              <p className={cn('text-xl font-black leading-none', selected ? 'text-white' : 'text-wtext-2 dark:text-rink-100')}>
                {option.label}
              </p>
              <p className={cn('mt-1 text-[11px] font-medium', selected ? 'text-white/80' : 'text-wtext-3 dark:text-rink-300')}>
                {option.sub}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
