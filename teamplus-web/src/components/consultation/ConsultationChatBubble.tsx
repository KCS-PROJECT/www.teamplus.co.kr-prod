'use client';

import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/hooks/useConsultations';
import { resolveImageSrc } from '@/lib/image-url';

/** 텍스트 전용 XSS 방어 — 모든 HTML 태그를 제거하고 순수 텍스트만 반환 */
function sanitizeText(content: string): string {
  if (typeof window === 'undefined') return content;
  return DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
}

// ─── Helpers ────────────────────────────────────────

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
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

// ─── Date Divider ───────────────────────────────────

interface DateDividerProps {
  date: string;
}

export function ConsultationDateDivider({ date }: DateDividerProps) {
  return (
    <div className="flex justify-center py-3">
      <span
        className={cn(
          'px-3 py-1 rounded-full',
          'bg-wline-2 dark:bg-rink-800',
          'text-xs font-medium',
          'text-wtext-3 dark:text-rink-300',
          'border border-wline-2 dark:border-rink-700/50'
        )}
      >
        {date}
      </span>
    </div>
  );
}

// ─── System Message ─────────────────────────────────

interface SystemMessageProps {
  message: ChatMessage;
}

export function ConsultationSystemMessage({ message }: SystemMessageProps) {
  return (
    <div className="flex justify-center py-2">
      <span
        className={cn(
          'px-3 py-1.5 rounded-lg',
          'bg-blue-50 dark:bg-blue-900/20',
          'text-xs font-medium',
          'text-blue-600 dark:text-blue-400',
          'flex items-center gap-1.5'
        )}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">info</span>
        {sanitizeText(message.content)}
      </span>
    </div>
  );
}

// ─── Chat Bubble ────────────────────────────────────

interface ConsultationChatBubbleProps {
  message: ChatMessage;
  className?: string;
}

export function ConsultationChatBubble({ message, className }: ConsultationChatBubbleProps) {
  // System message
  if (message.senderType === 'system' || message.type === 'system') {
    return <ConsultationSystemMessage message={message} />;
  }

  const isParent = message.senderType === 'parent';
  const isCoach = message.senderType === 'coach';

  // Parent messages: left-aligned
  if (isParent) {
    return (
      <div className={cn('flex items-end gap-2.5', className)}>
        {/* Avatar */}
        <div className="shrink-0">
          {resolveImageSrc(message.senderProfileImage) ? (
            <div className="w-9 h-9 rounded-full overflow-hidden border border-wline-2 dark:border-rink-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(message.senderProfileImage)}
                alt={message.senderName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center',
                'border border-wline-2 dark:border-rink-700',
                'text-xs font-bold',
                getAvatarColor(message.senderName)
              )}
            >
              {getInitials(message.senderName)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 items-start max-w-[72%]">
          {/* Sender name with role badge */}
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-xs font-medium text-wtext-2 dark:text-rink-100">
              {message.senderName}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300 font-medium">
              학부모
            </span>
          </div>

          {/* Bubble */}
          <div
            className={cn(
              'p-3 rounded-2xl rounded-tl-sm',
              'bg-white dark:bg-rink-700',
              'border border-wline dark:border-rink-700',
              'text-sm leading-relaxed',
              'text-wtext-1 dark:text-white'
            )}
          >
            {sanitizeText(message.content)}
          </div>

          {/* Timestamp */}
          <span className="text-[11px] text-wtext-3 dark:text-rink-300 ml-1">
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  // Coach messages: right-aligned
  if (isCoach) {
    return (
      <div className={cn('flex items-end gap-2.5 justify-end', className)}>
        <div className="flex flex-col gap-1 items-end max-w-[72%]">
          {/* Sender name with role badge */}
          <div className="flex items-center gap-1.5 mr-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ice-500/10 dark:bg-ice-500/20 text-ice-500 dark:text-blue-400 font-medium">
              코치
            </span>
            <span className="text-xs font-medium text-wtext-2 dark:text-rink-100">
              {message.senderName}
            </span>
          </div>

          {/* Bubble */}
          <div
            className={cn(
              'p-3 rounded-2xl rounded-tr-sm',
              'bg-ice-500 text-white',
              'text-sm leading-relaxed'
            )}
          >
            {sanitizeText(message.content)}
          </div>

          {/* Timestamp */}
          <span className="text-[11px] text-wtext-3 dark:text-rink-300 mr-1">
            {formatTime(message.createdAt)}
          </span>
        </div>

        {/* Avatar */}
        <div className="shrink-0">
          {resolveImageSrc(message.senderProfileImage) ? (
            <div className="w-9 h-9 rounded-full overflow-hidden border border-wline-2 dark:border-rink-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(message.senderProfileImage)}
                alt={message.senderName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center',
                'border border-wline-2 dark:border-rink-700',
                'text-xs font-bold',
                getAvatarColor(message.senderName)
              )}
            >
              {getInitials(message.senderName)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
