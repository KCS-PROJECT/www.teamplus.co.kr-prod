'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from './Avatar';
import { resolveImageSrc } from '@/lib/image-url';

/**
 * MessageBubble Component - TEAMPLUS Chat Design System
 * Design 7 Principles Applied:
 * - No gradients, solid primary color for outgoing
 * - Clean shadow-sm/md styling
 * - Human-made design feel with subtle hover effects
 */

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  isRead?: boolean;
  type: 'text' | 'image';
  imageUrl?: string;
}

interface MessageBubbleProps {
  message: Message;
  type: 'incoming' | 'outgoing';
  senderName?: string;
  senderAvatar?: string;
  showAvatar?: boolean;
  showSenderName?: boolean;
  className?: string;
}

export function MessageBubble({
  message,
  type,
  senderName,
  senderAvatar,
  showAvatar = true,
  showSenderName = true,
  className,
}: MessageBubbleProps) {
  const isIncoming = type === 'incoming';
  const isImage = message.type === 'image';

  if (isIncoming) {
    return (
      <div className={cn('flex items-end gap-3 group', className)}>
        {/* Avatar */}
        {showAvatar && (
          <Avatar
            src={senderAvatar}
            name={senderName || '사용자'}
            size="md"
          />
        )}

        <div className="flex flex-col gap-1 items-start max-w-[75%]">
          {/* Sender Name */}
          {showSenderName && senderName && (
            <span className="text-card-meta text-wtext-3 dark:text-rink-300 ml-1 font-medium">
              {senderName}
            </span>
          )}

          {/* Message Bubble */}
          {isImage && resolveImageSrc(message.imageUrl) ? (
            <div className="rounded-2xl rounded-tl-sm overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(message.imageUrl)}
                alt="첨부 이미지"
                width={480}
                height={300}
                className="max-w-full h-auto object-cover"
                style={{ maxHeight: '300px' }}
              />
            </div>
          ) : (
            <div
              className={cn(
                'p-3.5 rounded-2xl rounded-tl-sm',
                'bg-wline-2 dark:bg-rink-800',
                'text-card-body leading-relaxed',
                'text-wtext-1 dark:text-white',
                'shadow-sm group-hover:shadow-md transition-shadow'
              )}
            >
              {message.content}
            </div>
          )}

          {/* Timestamp */}
          <span className="text-[11px] text-wtext-3 ml-1">
            {message.timestamp}
          </span>
        </div>
      </div>
    );
  }

  // Outgoing Message
  return (
    <div className={cn('flex items-end gap-3 justify-end group', className)}>
      <div className="flex flex-col gap-1 items-end max-w-[80%]">
        {/* Message Bubble */}
        {isImage && resolveImageSrc(message.imageUrl) ? (
          <div
            className={cn(
              'p-1 rounded-2xl rounded-tr-sm overflow-hidden',
              'bg-ice-500 shadow-md'
            )}
          >
            <div className="bg-wline-2 dark:bg-rink-800 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(message.imageUrl)}
                alt="첨부 이미지"
                width={256}
                height={300}
                className="w-48 sm:w-64 h-auto object-cover"
                style={{ maxHeight: '300px' }}
              />
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'p-3.5 rounded-2xl rounded-tr-sm',
              'bg-ice-500 hover:bg-ice-700',
              'text-sm leading-relaxed text-white',
              'shadow-md',
              'transition-colors'
            )}
          >
            {message.content}
          </div>
        )}

        {/* Read Status & Timestamp */}
        <div className="flex items-center gap-1 mr-1">
          {message.isRead && (
            <span className="text-[11px] text-ice-500 dark:text-blue-400 font-medium">
              읽음
            </span>
          )}
          <span className="text-[11px] text-wtext-3">
            {message.timestamp}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * ImageMessage Component
 * Placeholder for image messages when URL is not available
 */
export function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-48 sm:w-64 aspect-video',
        'bg-wline dark:bg-rink-700',
        'rounded-xl flex items-center justify-center',
        className
      )}
    >
      <Icon name="image" className="text-3xl text-wtext-3" />
    </div>
  );
}

/**
 * TypingIndicator Component
 * Shows when the other user is typing
 */
export function TypingIndicator({
  senderName,
  senderAvatar,
}: {
  senderName?: string;
  senderAvatar?: string;
}) {
  return (
    <div className="flex items-end gap-3">
      <Avatar
        src={senderAvatar}
        name={senderName || '사용자'}
        size="md"
      />
      <div className="flex flex-col gap-1 items-start">
        {senderName && (
          <span className="text-card-meta text-wtext-3 dark:text-rink-300 ml-1 font-medium">
            {senderName}
          </span>
        )}
        <div className="p-3.5 rounded-2xl rounded-tl-sm bg-wline-2 dark:bg-rink-800 shadow-sm">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-wtext-4 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-wtext-4 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-wtext-4 animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ReadReceipt Component
 * Shows delivery/read status with icons
 */
export function ReadReceipt({
  status,
}: {
  status: 'sent' | 'delivered' | 'read';
}) {
  return (
    <span className="flex items-center text-[11px]">
      {status === 'read' ? (
        <span className="text-ice-500 dark:text-blue-400 font-medium">읽음</span>
      ) : status === 'delivered' ? (
        <Icon name="done_all" className="text-wtext-3 text-sm" />
      ) : (
        <Icon name="done" className="text-wtext-3 text-sm" />
      )}
    </span>
  );
}
