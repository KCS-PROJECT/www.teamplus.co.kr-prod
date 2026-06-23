'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import type { Consultation } from '@/hooks/useConsultations';
import { resolveImageSrc } from '@/lib/image-url';

// ─── Helpers ────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
    'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
    'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ─── ConsultationListItem ───────────────────────────

interface ConsultationListItemProps {
  consultation: Consultation;
  isSelected: boolean;
  onSelect: (consultation: Consultation) => void;
}

export function ConsultationListItem({
  consultation,
  isSelected,
  onSelect,
}: ConsultationListItemProps) {
  const {
    studentName,
    parentName,
    coachName,
    lastMessage,
    lastMessageAt,
    unreadCount,
    studentProfileImage,
    isOnline,
    className: lessonName,
    status,
  } = consultation;

  return (
    <button
      type="button"
      onClick={() => onSelect(consultation)}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-xl transition-colors motion-reduce:transition-none text-left',
        'active:brightness-95',
        isSelected
          ? 'bg-ice-500/5 dark:bg-ice-500/10'
          : 'bg-white dark:bg-rink-800 hover:bg-wbg dark:hover:bg-rink-700'
      )}
      aria-current={isSelected ? 'true' : undefined}
    >
      {/* Profile Image */}
      <div className="relative shrink-0">
        {resolveImageSrc(studentProfileImage) ? (
          <div className="w-11 h-11 rounded-full overflow-hidden border border-wline-2 dark:border-rink-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageSrc(studentProfileImage)}
              alt={studentName}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className={cn(
              'w-11 h-11 rounded-full flex items-center justify-center',
              'border border-wline-2 dark:border-rink-700',
              'text-sm font-bold',
              getAvatarColor(studentName)
            )}
          >
            {getInitials(studentName)}
          </div>
        )}

        {/* Online indicator */}
        {isOnline && (
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-rink-800"
            aria-label="온라인"
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Student + Time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-wtext-1 dark:text-white truncate">
              {studentName}
            </span>
            {status === 'CLOSED' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300 font-medium shrink-0">
                종료
              </span>
            )}
            {status === 'ARCHIVED' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300 font-medium shrink-0">
                보관
              </span>
            )}
          </div>
          <span className="text-[11px] text-wtext-3 dark:text-rink-300 shrink-0">
            {formatRelativeTime(lastMessageAt)}
          </span>
        </div>

        {/* Row 2: Parent + Coach */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-wtext-3 dark:text-rink-300 truncate">
            {parentName}
          </span>
          <span className="text-xs text-wtext-3 dark:text-rink-300 truncate">
            {coachName}
          </span>
          {lessonName && (
            <>
              <span className="text-xs text-ice-500 dark:text-blue-400 truncate">
                {lessonName}
              </span>
            </>
          )}
        </div>

        {/* Row 3: Last message preview */}
        <p className="text-xs text-wtext-3 dark:text-rink-300 mt-1 truncate leading-relaxed">
          {lastMessage}
        </p>
      </div>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <div className="shrink-0 mt-1">
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full',
              'bg-red-500 text-white text-[11px] font-bold'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </div>
      )}
    </button>
  );
}
