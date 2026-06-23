'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * ChecklistItem - 아동 전용 체크리스트 아이템
 *
 * checklist 페이지에서 사용되는 큰 터치 타겟의 체크 아이템.
 * 체크 시 흐리게 + 취소선 + 체크마크 오버레이 표시.
 *
 * WCAG AAA: 전체 카드가 터치 타겟 (min-h 충족),
 * 체크 상태 시각/텍스트 이중 표시
 */

interface ChecklistItemProps {
  /** 아이템 ID */
  id: number;
  /** 아이템 이름 */
  name: string;
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 아이콘 배경색 className */
  iconBg: string;
  /** 아이콘 색상 className */
  iconColor: string;
  /** 체크 여부 */
  checked: boolean;
  /** 토글 핸들러 */
  onToggle: (id: number) => void;
}

export const ChecklistItem = memo(function ChecklistItem({
  id,
  name,
  icon,
  iconBg,
  iconColor,
  checked,
  onToggle,
}: ChecklistItemProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className={cn(
        'relative flex flex-col items-center p-5 rounded-2xl border-2 transition-all duration-200 active:scale-95',
        checked
          ? 'bg-wline-2 dark:bg-rink-800/50 border-transparent opacity-60'
          : 'bg-white dark:bg-rink-800 border-transparent shadow-sm hover:shadow-md',
      )}
      role="checkbox"
      aria-checked={checked}
      aria-label={`${name} ${checked ? '준비 완료' : '준비 필요'}`}
    >
      {/* 체크마크 오버레이 */}
      {checked && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/5 dark:bg-black/20 rounded-2xl"
          aria-hidden="true"
        >
          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
            <Icon name="check" className="text-white text-3xl font-bold" />
          </div>
        </div>
      )}

      {/* 아이콘 영역 */}
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-colors',
          checked ? 'bg-wline dark:bg-rink-700' : iconBg,
        )}
      >
        <Icon
          name={icon}
          className={cn(
            'text-4xl',
            checked ? 'text-wtext-3' : iconColor,
          )}
          aria-hidden="true"
        />
      </div>

      {/* 아이템 이름 */}
      <span
        className={cn(
          'text-card-title-child font-bold transition-colors',
          checked && '!text-wtext-3 dark:!text-rink-300 line-through',
        )}
      >
        {name}
      </span>
    </button>
  );
});
