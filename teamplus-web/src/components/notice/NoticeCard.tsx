'use client';

import { MESSAGES } from '@/lib/messages';

interface NoticeCardProps {
  id: string;
  type: 'NOTICE' | 'EVENT';
  title: string;
  content?: string;
  date: string;
  pinned?: boolean;
  isExpired?: boolean;
  onClick?: () => void;
}

export default function NoticeCard({
  id,
  type,
  title,
  content,
  date,
  pinned = false,
  isExpired = false,
  onClick,
}: NoticeCardProps) {
  if (pinned) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/20 rounded-xl p-4 flex items-start gap-3 relative overflow-hidden group"
        role="article"
        aria-label={`고정 공지: ${title}`}
      >
        <div className="flex-shrink-0 mt-0.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800/30 text-ice-500">
            <span className="material-symbols-outlined text-lg">push_pin</span>
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
              {MESSAGES.notice.badge.important}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{date}</span>
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight mb-1 group-hover:text-ice-500 transition-colors">
            {title}
          </h3>
          {content && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
              {content}
            </p>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors ${
        isExpired ? 'opacity-80' : ''
      }`}
      role="article"
      aria-label={`${type === 'NOTICE' ? '공지' : '이벤트'}: ${title}`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
              {type === 'NOTICE' ? MESSAGES.notice.badge.notice : MESSAGES.notice.badge.event}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{date}</span>
          </div>
          <h3
            className={`text-base font-medium text-gray-900 dark:text-white ${
              isExpired ? 'line-through decoration-gray-400 text-gray-500 dark:text-gray-400' : ''
            }`}
          >
            {title}
            {isExpired && <span className="text-xs text-gray-400 ml-2">{MESSAGES.notice.badge.expired}</span>}
          </h3>
        </div>
        {!isExpired && (
          <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-xl flex-shrink-0">
            chevron_right
          </span>
        )}
      </div>
    </button>
  );
}
