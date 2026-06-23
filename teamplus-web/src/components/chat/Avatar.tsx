'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

/**
 * Avatar Component - TEAMPLUS Chat Design System
 * Design 7 Principles Applied:
 * - Solid colors, no gradients
 * - Clean shadow styling
 * - Human-made design feel
 */

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  badge?: string;
  badgeColor?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-14 h-14',
};

const onlineDotSizes = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-3.5 h-3.5',
};

const sizePixels = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 56,
};

const badgeFontSizes = {
  sm: 'text-[8px]',
  md: 'text-[9px]',
  lg: 'text-[10px]',
  xl: 'text-[11px]',
};

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400' },
    { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400' },
    { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400' },
    { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400' },
    { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-600 dark:text-rose-400' },
    { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-600 dark:text-cyan-400' },
    { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-600 dark:text-indigo-400' },
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({
  src,
  name,
  size = 'md',
  isOnline,
  badge,
  badgeColor = 'bg-ice-500',
  className,
}: AvatarProps) {
  const initials = getInitials(name);
  const colors = getAvatarColor(name);

  // 백엔드 상대 경로(`/uploads/...`) 를 표시용 절대 URL 로 정규화 — 페이지 호스트 ≠ 백엔드 호스트
  // 환경(예: 안드로이드 실기기 LAN IP) 에서 이미지 404 가 되는 회귀 차단.
  const resolvedSrc = resolveImageSrc(src);

  // src 가 바뀌면 에러 상태 리셋 (이전 실패 유지 방지)
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [resolvedSrc]);
  const showImage = Boolean(resolvedSrc) && !imageFailed;

  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Avatar Circle */}
      <div
        className={cn(
          'relative rounded-full flex items-center justify-center overflow-hidden',
          'shadow-sm border border-wline-2 dark:border-rink-700',
          sizeClasses[size],
          !showImage && colors.bg
        )}
      >
        {showImage && resolvedSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolvedSrc}
            alt={name}
            width={sizePixels[size]}
            height={sizePixels[size]}
            className="w-full h-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span
            className={cn(
              'font-bold select-none',
              colors.text,
              size === 'sm' && 'text-xs',
              size === 'md' && 'text-sm',
              size === 'lg' && 'text-base',
              size === 'xl' && 'text-lg'
            )}
          >
            {initials}
          </span>
        )}
      </div>

      {/* Online Status Indicator */}
      {isOnline !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full',
            'ring-2 ring-white dark:ring-rink-900',
            onlineDotSizes[size],
            isOnline ? 'bg-green-500' : 'bg-wtext-4'
          )}
          aria-label={isOnline ? '온라인' : '오프라인'}
        />
      )}

      {/* Badge (Role indicator) */}
      {badge && (
        <span
          className={cn(
            'absolute -bottom-1 left-1/2 -translate-x-1/2',
            'px-1.5 py-0.5 rounded-full',
            'font-bold text-white whitespace-nowrap',
            'shadow-sm',
            badgeFontSizes[size],
            badgeColor
          )}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

/**
 * AvatarGroup Component
 * For displaying multiple avatars in a stack
 */
interface AvatarGroupProps {
  avatars: Array<{ src?: string; name: string }>;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = 'md',
  className,
}: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visibleAvatars.map((avatar, index) => (
        <Avatar
          key={index}
          src={avatar.src}
          name={avatar.name}
          size={size}
          className="ring-2 ring-white dark:ring-rink-900"
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            'rounded-full flex items-center justify-center',
            'bg-wline dark:bg-rink-700',
            'ring-2 ring-white dark:ring-rink-900',
            'text-card-meta font-bold text-wtext-2 dark:text-rink-100',
            sizeClasses[size]
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
