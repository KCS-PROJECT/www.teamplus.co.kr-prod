'use client';

import React, { memo } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * PriorityTaskCard - 우선 처리 항목 카드
 *
 * 아이콘 + 제목 + 설명 + 화살표 레이아웃.
 * 복수 아이템을 카드 형태로 묶어 표시.
 *
 * Design Rules:
 * - 솔리드 컬러, hover 전환 효과
 */
export interface PriorityTask {
  /** 아이콘명 */
  icon: string;
  /** 아이콘 배경 색상 */
  iconBg: string;
  /** 아이콘 텍스트 색상 */
  iconColor: string;
  /** 제목 */
  title: string;
  /** 부제목 */
  subtitle: string;
  /** 이동 경로 */
  href?: string;
  /** 클릭 핸들러 */
  onClick?: () => void;
}

export interface PriorityTaskCardProps {
  /** 섹션 제목 */
  title?: string;
  /** 전체보기 링크 */
  viewAllHref?: string;
  /** 할 일 목록 */
  tasks: PriorityTask[];
  /** 추가 className */
  className?: string;
}

export const PriorityTaskCard = memo(function PriorityTaskCard({
  title,
  viewAllHref,
  tasks,
  className,
}: PriorityTaskCardProps) {
  if (tasks.length === 0) return null;

  return (
    <div className={className}>
      {/* 헤더 */}
      {(title || viewAllHref) && (
        <div className="flex justify-between items-center mb-3">
          {title && (
            <h3 className="font-bold text-lg text-wtext-1 dark:text-white tracking-tight">
              {title}
            </h3>
          )}
          {viewAllHref && (
            <NavLink
              href={viewAllHref}
              className="text-xs font-bold text-ice-500 uppercase"
            >
              전체 보기
            </NavLink>
          )}
        </div>
      )}

      {/* 할 일 목록 */}
      <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden">
        {tasks.map((task, index) => {
          const content = (
            <div
              className={cn(
                'p-4 flex items-center gap-4',
                'hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors',
                'active:brightness-95',
                index < tasks.length - 1 && 'border-b border-wline-2 dark:border-rink-700',
              )}
              role={task.onClick ? 'button' : undefined}
              tabIndex={task.onClick ? 0 : undefined}
              onClick={task.onClick}
              onKeyDown={task.onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); task.onClick?.(); } } : undefined}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                  task.iconBg,
                )}
              >
                <Icon name={task.icon} className={cn('text-xl', task.iconColor)} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-wtext-1 dark:text-white truncate">
                  {task.title}
                </p>
                <p className="text-xs text-wtext-3 dark:text-rink-300 truncate">
                  {task.subtitle}
                </p>
              </div>
              <Icon
                name="chevron_right"
                className="text-wtext-3 dark:text-rink-300 text-xl shrink-0"
                aria-hidden="true"
              />
            </div>
          );

          if (task.href) {
            return (
              <NavLink key={index} href={task.href}>
                {content}
              </NavLink>
            );
          }

          return <div key={index}>{content}</div>;
        })}
      </div>
    </div>
  );
});
