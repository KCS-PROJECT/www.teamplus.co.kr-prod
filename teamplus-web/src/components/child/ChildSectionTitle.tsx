'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * ChildSectionTitle - 섹션 제목 컴포넌트
 *
 * child 대시보드에서 반복되는 "이모지 + 제목 + 우측 부가 정보" 패턴.
 * 예: "내 뱃지 모음" + "3개 획득", "이번 주 출석" + "3일 연속!"
 *
 * WCAG AAA: text-lg+ font-black, 7:1 대비율 충족
 */

interface ChildSectionTitleProps {
  /** 섹션 제목 */
  title: string;
  /** 제목 앞 이모지 */
  emoji?: string;
  /** 우측 부가 텍스트 */
  rightText?: string;
  /** 우측 텍스트 색상 className (기본: text-amber-500) */
  rightTextColor?: string;
  /** 우측 이모지 (rightText 앞에 표시) */
  rightEmoji?: string;
  /** 우측 뱃지 스타일 표시 여부 */
  rightBadge?: boolean;
  /** 뱃지 배경 className */
  rightBadgeBg?: string;
  /** 제목 크기 (기본: lg) */
  size?: 'lg' | 'xl';
  /** 추가 className */
  className?: string;
}

export const ChildSectionTitle = memo(function ChildSectionTitle({
  title,
  emoji,
  rightText,
  rightTextColor = 'text-amber-500 dark:text-amber-400',
  rightEmoji,
  rightBadge = false,
  rightBadgeBg = 'bg-orange-50 dark:bg-orange-900/20',
  size = 'lg',
  className = '',
}: ChildSectionTitleProps) {
  const titleClass = size === 'xl' ? 'text-card-title-child' : 'text-card-section-child';
  const emojiSize = size === 'xl' ? 'text-2xl' : 'text-xl';

  const rightContent = rightText ? (
    rightBadge ? (
      <div className={cn('flex items-center gap-1 px-3 py-1 rounded-full', rightBadgeBg)}>
        {rightEmoji && <span className="text-base">{rightEmoji}</span>}
        {/* [WCAG AAA Task #4] text-card-emphasis-child(15-16) → text-card-title-child(17-18px+). */}
        <span className={cn('text-card-title-child font-black', rightTextColor)}>
          {rightText}
        </span>
      </div>
    ) : (
      <span className={cn('text-card-title-child', rightTextColor)}>
        {rightEmoji && <span className="mr-1">{rightEmoji}</span>}
        {rightText}
      </span>
    )
  ) : null;

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <h3
        className={cn(
          titleClass,
          'font-black flex items-center gap-2',
        )}
      >
        {emoji && <span className={emojiSize}>{emoji}</span>}
        {title}
      </h3>
      {rightContent}
    </div>
  );
});
