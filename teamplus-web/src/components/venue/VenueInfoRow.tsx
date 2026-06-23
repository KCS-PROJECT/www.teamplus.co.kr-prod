'use client';

/**
 * VenueInfoRow — 구장 상세 정보의 단일 행
 * - 아이콘 + 라벨 + 보조 텍스트 + 선택적 액션 버튼
 * - 목업: 주소(복사 버튼), 전화, 영업시간
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface VenueInfoRowProps {
  icon: string;
  primary: string;
  secondary?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function VenueInfoRow({
  icon,
  primary,
  secondary,
  action,
  className,
}: VenueInfoRowProps) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className="w-6 shrink-0 flex justify-center pt-0.5">
        <Icon
          name={icon}
          className="text-[22px] text-ice-500 dark:text-blue-300"
          aria-hidden="true"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-wtext-1 dark:text-white leading-snug">
          {primary}
        </p>
        {secondary ? (
          <div className="mt-1 text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-2 flex-wrap">
            {secondary}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default VenueInfoRow;
