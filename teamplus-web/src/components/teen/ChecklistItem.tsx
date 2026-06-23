'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface ChecklistItemData {
  id: number;
  name: string;
  icon: string;
  bgColor: string;
  color: string;
  checked: boolean;
}

interface ChecklistItemProps {
  item: ChecklistItemData;
  onToggle: (id: number) => void;
}

/**
 * 체크리스트 아이템 컴포넌트 (준비물 챙기기용)
 * 터치로 체크/언체크 토글, 체크 시 오버레이 + 취소선 표시
 */
export function ChecklistItem({ item, onToggle }: ChecklistItemProps) {
  return (
    <button
      onClick={() => onToggle(item.id)}
      className={cn(
        'relative flex flex-col items-center p-5 rounded-[2rem] border-2 transition-all duration-200 active:scale-95',
        item.checked
          ? 'bg-wline-2 dark:bg-rink-800/50 border-transparent opacity-60'
          : 'bg-white dark:bg-rink-800 border-transparent shadow-md'
      )}
      aria-pressed={item.checked}
      aria-label={`${item.name} ${item.checked ? '체크됨' : '미체크'}`}
    >
      {/* 체크 완료 오버레이 */}
      {item.checked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/5 dark:bg-black/20 rounded-[2rem]">
          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-md">
            <Icon name="check" className="text-white text-3xl font-bold" />
          </div>
        </div>
      )}

      {/* 아이콘 */}
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-colors',
          item.checked
            ? 'bg-wline dark:bg-rink-700 grayscale'
            : item.bgColor
        )}
      >
        <Icon
          name={item.icon}
          className={cn(
            'text-4xl',
            item.checked ? 'text-wtext-3' : item.color
          )}
          aria-hidden="true"
        />
      </div>

      {/* 이름 */}
      <span
        className={cn(
          'text-lg font-bold transition-colors',
          item.checked
            ? 'text-wtext-3 dark:text-rink-300 line-through'
            : 'text-wtext-1 dark:text-white'
        )}
      >
        {item.name}
      </span>
    </button>
  );
}
