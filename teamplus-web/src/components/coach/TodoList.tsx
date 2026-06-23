'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';

export interface TodoItem {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  href: string;
}

export interface TodoListProps {
  items: TodoItem[];
}

/**
 * TodoList - 코치 대시보드 할 일 목록
 *
 * 디자인 시안 v3: 아이콘(배경색) + 제목 + 설명 + chevron_right
 * border 기반 카드 (shadow 없음), dark mode 전면 적용
 */
export const TodoList = memo(function TodoList({ items }: TodoListProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <NavLink
          key={index}
          href={item.href}
          className="flex items-center justify-between rounded-xl bg-white dark:bg-rink-800 p-4 border border-gray-200 dark:border-rink-700 active:brightness-95 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center">
              <Icon name={item.icon} className={`text-2xl ${item.iconColor}`} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[15px] font-black text-wtext-1 dark:text-white">{item.title}</p>
              <p className="text-xs font-bold text-gray-600 dark:text-rink-300">{item.description}</p>
            </div>
          </div>
          <Icon name="chevron_right" className="text-gray-400 dark:text-rink-300" aria-hidden="true" />
        </NavLink>
      ))}
    </div>
  );
});
