'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import type { Academy } from '@/hooks/useAcademy';

interface AcademyCardProps {
  academy: Academy;
  onPress?: (academy: Academy) => void;
  className?: string;
}

/**
 * AcademyCard - 오픈클래스 카드 컴포넌트
 *
 * 디자인 시스템 준수:
 * - Primary #1E3FAE
 * - AI 스타일 금지 (그라디언트/블러/컬러 그림자 없음)
 * - 다크모드 지원
 * - WCAG 2.1 AA 접근성
 */
export function AcademyCard({ academy, onPress, className }: AcademyCardProps) {
  const memberCount = academy._count?.members ?? 0;
  const coachCount = academy._count?.coaches ?? 0;
  const classCount = academy._count?.classes ?? 0;

  return (
    <button
      type="button"
      onClick={() => onPress?.(academy)}
      className={cn(
        'w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700',
        'p-4 transition-colors hover:bg-wbg dark:hover:bg-rink-700',
        'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
        className
      )}
      aria-label={`${academy.name} 오픈클래스`}
    >
      {/* 상단: 이름 + 상태 배지 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {resolveImageSrc(academy.imageUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(academy.imageUrl)}
              alt={`${academy.name} 로고`}
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center shrink-0">
              <Icon name="school" className="text-lg text-ice-500" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-wtext-1 dark:text-white truncate">
              {academy.name}
            </h3>
            {academy.region && (
              <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
                {academy.region}
              </p>
            )}
          </div>
        </div>

        <span
          className={cn(
            'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium',
            academy.isActive
              ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
              : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
          )}
        >
          {academy.isActive ? '운영중' : '비활성'}
        </span>
      </div>

      {/* 하단: 멤버수, 코치수, 수업수 */}
      <div className="flex items-center gap-4 text-xs text-wtext-3 dark:text-rink-300">
        <span className="flex items-center gap-1">
          <Icon name="group" className="text-sm" />
          {MESSAGES.academy.memberCount(memberCount)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="sports" className="text-sm" />
          {MESSAGES.academy.coachCount(coachCount)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="class" className="text-sm" />
          {MESSAGES.academy.classCount(classCount)}
        </span>
      </div>
    </button>
  );
}

export default AcademyCard;
