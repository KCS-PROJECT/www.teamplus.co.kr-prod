'use client';

import React, { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

/**
 * TransactionItem - 최근 결제/거래 목록 아이템
 *
 * 아바타 + 이름 + 설명 + 금액 + 시간 레이아웃.
 *
 * Design Rules:
 * - 솔리드 컬러, 다크모드 지원
 * - active:scale 터치 피드백
 */
export interface TransactionItemProps {
  /** 사용자 이름 */
  name: string;
  /** 거래 설명 (예: "1개월 회원권 · 결제 완료") */
  description: string;
  /** 거래 금액 (포맷된 문자열, 예: "+150,000원") */
  amount: string;
  /** 거래 시간 (예: "10:30 AM") */
  time: string;
  /** 아바타 URL */
  avatarUrl?: string;
  /** 상태 표시 (예: "수령 대기") */
  statusLabel?: string;
  /** 상태 색상 */
  statusColor?: string;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 className */
  className?: string;
}

export const TransactionItem = memo(function TransactionItem({
  name,
  description,
  amount,
  time,
  avatarUrl,
  statusLabel,
  statusColor = 'text-ice-500',
  onClick,
  className,
}: TransactionItemProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg',
        'bg-white dark:bg-rink-800 p-4 shadow-sm',
        'border border-wline-2 dark:border-rink-700',
        'active:scale-[0.99] transition-transform',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center gap-4 min-w-0">
        {/* 아바타 — XSS 방지: img 태그 사용 (CSS url() 인젝션 방지) */}
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
          {resolveImageSrc(avatarUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(avatarUrl)}
              alt={name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <Icon name="person" className="text-wtext-3 text-xl" aria-hidden="true" />
          )}
        </div>

        {/* 정보 */}
        <div className="flex flex-col min-w-0">
          <p className="text-base font-semibold text-wtext-1 dark:text-white truncate">
            {name}
          </p>
          {statusLabel ? (
            <p className={cn('text-xs font-medium mt-0.5 flex items-center gap-1', statusColor)}>
              <span className={cn('inline-block w-1.5 h-1.5 rounded-full', statusColor.replace('text-', 'bg-'))} />
              {statusLabel}
            </p>
          ) : (
            <p className="text-xs font-medium text-wtext-3 dark:text-rink-300 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* 금액 + 시간 */}
      <div className="flex flex-col items-end shrink-0 ml-3">
        <span className="text-sm font-bold text-wtext-1 dark:text-white">{amount}</span>
        <span className="text-card-meta text-wtext-3 dark:text-rink-300 mt-1">{time}</span>
      </div>
    </div>
  );
});
