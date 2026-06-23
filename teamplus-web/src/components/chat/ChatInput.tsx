'use client';

import { useRef, useEffect, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/chat/Avatar';

/**
 * ChatInput Component - TEAMPLUS Chat Design System
 * Design 7 Principles Applied:
 * - Solid colors, no gradients
 * - Clean focus states with ring
 * - Human-made design feel
 */

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttachment?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxRows?: number;
  className?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onAttachment,
  placeholder = '메시지를 입력하세요...',
  disabled = false,
  maxRows = 5,
  className,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const lineHeight = 24; // leading-6 = 1.5rem = 24px
      const maxHeight = lineHeight * maxRows;
      textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    }
  }, [value, maxRows]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend();
      }
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <footer
      className={cn(
        'flex-none',
        'bg-white dark:bg-rink-900',
        'border-t border-wline-2 dark:border-rink-800',
        // 키보드 표시 시 자동으로 위로 올라가도록 keyboard-inset + safe-area-inset 폴백 사용
        // (SCREEN_METRICS SoT — Android WebView 의 env() 0px 문제 회피)
        'p-2 sm:p-4 pb-keyboard-safe',
        className
      )}
    >
      <div className="flex items-end gap-2">
        {/* Attachment Button - 44px touch target for mobile accessibility */}
        {onAttachment && (
          <button
            onClick={onAttachment}
            disabled={disabled}
            className={cn(
              'flex-none w-11 h-11',
              'rounded-full flex items-center justify-center',
              'text-wtext-3',
              'hover:text-ice-500 dark:hover:text-white',
              'hover:bg-wline-2 dark:hover:bg-rink-800',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="파일 첨부"
          >
            <Icon name="add_circle" className="text-2xl" />
          </button>
        )}

        {/* Input Field */}
        <div
          className={cn(
            'flex-1',
            'bg-wline-2 dark:bg-rink-800',
            'rounded-3xl',
            'border border-transparent',
            'focus-within:border-ice-500/30 dark:focus-within:border-ice-500/50',
            'focus-within:bg-white dark:focus-within:bg-rink-900',
            'focus-within:ring-4 focus-within:ring-ice-500/5',
            'transition-all duration-200',
            'flex items-center',
            'min-h-[44px] px-4 py-2'
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'w-full bg-transparent border-none p-0',
              'text-sm sm:text-base',
              'text-wtext-1 dark:text-white',
              'placeholder-wtext-3',
              'focus:ring-0 focus:outline-none',
              'resize-none',
              'leading-6',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{ minHeight: '24px' }}
            aria-label="메시지 입력"
          />
        </div>

        {/* Send Button - 44px touch target for mobile accessibility */}
        <button
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            'flex-none w-11 h-11',
            'rounded-full',
            'bg-ice-500 hover:bg-ice-700',
            'shadow-md',
            'text-white',
            'flex items-center justify-center',
            'transition-all transform active:brightness-95',
            'disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed'
          )}
          aria-label="메시지 전송"
        >
          <Icon name="send" className="text-xl ml-0.5" />
        </button>
      </div>
    </footer>
  );
}

/**
 * ChatHeader Component
 * Header for chat screen with back button and user info
 */
interface ChatHeaderProps {
  name: string;
  status?: string;
  isOnline?: boolean;
  avatarUrl?: string;
  onBack?: () => void;
  onMore?: () => void;
  className?: string;
}

export function ChatHeader({
  name,
  status,
  isOnline,
  avatarUrl,
  onBack,
  onMore,
  className,
}: ChatHeaderProps) {
  return (
    <header
      className={cn(
        'flex-none z-50',
        // Design 7: NO backdrop-blur, solid background only
        'bg-white dark:bg-rink-900',
        'border-b border-wline-2 dark:border-rink-800',
        'transition-colors duration-200',
        className
      )}
    >
      <div className="px-4 h-14 flex items-center justify-between">
        {/* Back Button - 44px touch target for mobile accessibility */}
        {onBack && (
          <button
            onClick={onBack}
            className={cn(
              'w-11 h-11 flex items-center justify-center -ml-2',
              'rounded-full',
              'hover:bg-wline-2 dark:hover:bg-rink-800',
              'transition-colors',
              'text-wtext-1 dark:text-white'
            )}
            aria-label="뒤로 가기"
          >
            <Icon name="arrow_back_ios_new" className="text-2xl" />
          </button>
        )}

        {/* Profile Info */}
        <div className="flex-1 flex flex-col items-center justify-center mx-2">
          <div className="flex items-center gap-2">
            <Avatar src={avatarUrl} name={name} size="sm" isOnline={isOnline} />
            <span className="text-card-title text-wtext-1 dark:text-white leading-tight">
              {name}
            </span>
            {isOnline !== undefined && (
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  'ring-2 ring-white dark:ring-rink-900',
                  isOnline ? 'bg-green-500' : 'bg-wtext-4'
                )}
                aria-label={isOnline ? '온라인' : '오프라인'}
              />
            )}
          </div>
          {status && (
            <span className="text-xs text-wtext-3 dark:text-rink-300 font-medium leading-none mt-0.5">
              {status}
            </span>
          )}
        </div>

        {/* More Options - 44px touch target for mobile accessibility */}
        {onMore && (
          <button
            onClick={onMore}
            className={cn(
              'w-11 h-11 flex items-center justify-center -mr-2',
              'rounded-full',
              'hover:bg-wline-2 dark:hover:bg-rink-800',
              'transition-colors',
              'text-wtext-1 dark:text-white'
            )}
            aria-label="더보기"
          >
            <Icon name="menu" />
          </button>
        )}
      </div>
    </header>
  );
}
