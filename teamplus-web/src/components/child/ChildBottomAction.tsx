'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * ChildBottomAction - 하단 고정 액션 영역
 *
 * badges, checklist, gift, attendance-success 페이지에서
 * 공통적으로 사용되는 화면 하단 고정 CTA 영역.
 * 내부에 ChildBigButton을 배치하여 사용.
 *
 * WCAG AAA: safe-area-inset-bottom 대응, 충분한 패딩
 */

interface ChildBottomActionProps {
  /** 자식 요소 (ChildBigButton 등) */
  children: React.ReactNode;
  /** 배경 투명도 없이 솔리드 배경 사용 여부 */
  solid?: boolean;
  /** 상단 테두리 표시 여부 */
  showBorder?: boolean;
  /** 추가 className */
  className?: string;
}

export const ChildBottomAction = memo(function ChildBottomAction({
  children,
  solid = true,
  showBorder = true,
  className = '',
}: ChildBottomActionProps) {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 max-w-md mx-auto px-6 pb-8 pt-4 z-30',
        solid
          ? 'bg-white dark:bg-rink-900'
          : 'bg-white/95 dark:bg-rink-900/95',
        showBorder && 'border-t border-wline-2 dark:border-rink-800',
        className,
      )}
    >
      {children}
    </div>
  );
});
