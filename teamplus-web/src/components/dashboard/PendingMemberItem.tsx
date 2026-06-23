'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { resolveImageSrc } from '@/lib/image-url';

export interface PendingMemberItemProps {
  name: string;
  className: string;
  schedule: string;
  avatarUrl?: string;
  onApprove?: () => void;
  onReject?: () => void;
}

export const PendingMemberItem = memo(function PendingMemberItem({
  name,
  className: classLevel,
  schedule,
  avatarUrl,
  onApprove,
  onReject,
}: PendingMemberItemProps) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-wline dark:bg-rink-700 overflow-hidden flex items-center justify-center">
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
            <Icon name="person" className="text-wtext-3" />
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-wtext-1 dark:text-white">{name}</p>
          <p className="text-xs text-wtext-3 dark:text-rink-300">
            {classLevel} • {schedule}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onReject}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-wline-2 dark:bg-rink-700 text-wtext-3 hover:text-red-500 transition-colors"
          aria-label="거절"
        >
          <Icon name="close" className="text-xl" />
        </button>
        <button
          onClick={onApprove}
          className="flex h-8 w-14 items-center justify-center rounded-lg bg-ice-500 text-white hover:bg-ice-700 transition-colors"
        >
          <span className="text-xs font-bold">승인</span>
        </button>
      </div>
    </div>
  );
});
