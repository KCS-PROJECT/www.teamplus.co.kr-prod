'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { AcademyPromotion, LessonType } from '@/hooks/usePromotions';

interface PromotionCardProps {
  promotion: AcademyPromotion;
  onPress?: (promotion: AcademyPromotion) => void;
  className?: string;
}

const LESSON_TYPE_ICON: Record<LessonType, string> = {
  PRIVATE: 'person',
  GROUP: 'groups',
  GAME_LESSON: 'sports_hockey',
  FUN: 'celebration',
};

function getStatusInfo(p: AcademyPromotion) {
  if (!p.isActive) {
    return {
      label: MESSAGES.promotion.statusInactive,
      tone: 'inactive' as const,
    };
  }
  const now = Date.now();
  const start = p.startDate ? new Date(p.startDate).getTime() : null;
  const end = p.endDate ? new Date(p.endDate).getTime() : null;
  if (start && now < start) {
    return { label: MESSAGES.promotion.statusScheduled, tone: 'scheduled' as const };
  }
  if (end && now > end) {
    return { label: MESSAGES.promotion.statusEnded, tone: 'ended' as const };
  }
  return { label: MESSAGES.promotion.statusActive, tone: 'active' as const };
}

/**
 * PromotionCard - 오픈클래스 광고 카드
 *
 * - Primary color · solid bg only
 * - AI slop 없음 (gradient/blur/colored shadow 0)
 * - 다크모드 pair 전수 적용
 */
export function PromotionCard({ promotion, onPress, className }: PromotionCardProps) {
  const status = useMemo(() => getStatusInfo(promotion), [promotion]);
  const lessonTypeLabel = MESSAGES.promotion.lessonType[promotion.lessonType];
  const coach = promotion.coach?.coachProfiles?.[0];
  const coachName = coach ? `${coach.lastName}${coach.firstName} 코치` : null;

  return (
    <button
      type="button"
      onClick={() => onPress?.(promotion)}
      className={cn(
        'w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700',
        'p-4 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700',
        'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
        className,
      )}
      aria-label={`${promotion.title} 광고`}
    >
      {/* 상단: 제목 + 상태 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-ice-500"
            aria-label={`레슨 유형 ${lessonTypeLabel}`}
          >
            <Icon
              name={LESSON_TYPE_ICON[promotion.lessonType]}
              className="text-[13px]"
              aria-hidden="true"
            />
            {lessonTypeLabel}
          </span>
          <span
            className={cn(
              'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium',
              status.tone === 'active' &&
                'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
              status.tone === 'scheduled' &&
                'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
              status.tone === 'ended' &&
                'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300',
              status.tone === 'inactive' &&
                'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300',
            )}
          >
            {status.label}
          </span>
        </div>
      </div>

      <h3 className="text-[15px] font-bold text-wtext-1 dark:text-white leading-snug mb-1.5 line-clamp-2">
        {promotion.title}
      </h3>

      {/* 본문 요약 */}
      <p className="text-xs text-wtext-2 dark:text-rink-100 leading-relaxed line-clamp-2 mb-3">
        {promotion.content}
      </p>

      {/* 메타 정보 */}
      <div className="flex flex-col gap-1 text-xs text-wtext-3 dark:text-rink-300">
        {promotion.scheduleInfo && (
          <div className="flex items-center gap-1.5">
            <Icon name="schedule" className="text-sm shrink-0" aria-hidden="true" />
            <span className="truncate">{promotion.scheduleInfo}</span>
          </div>
        )}
        {promotion.priceInfo && (
          <div className="flex items-center gap-1.5">
            <Icon name="payments" className="text-sm shrink-0" aria-hidden="true" />
            <span className="truncate">{promotion.priceInfo}</span>
          </div>
        )}
        {promotion.venueInfo && (
          <div className="flex items-center gap-1.5">
            <Icon name="place" className="text-sm shrink-0" aria-hidden="true" />
            <span className="truncate">{promotion.venueInfo}</span>
          </div>
        )}
      </div>

      {/* 하단: 코치 · 조회수 */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-wline-2 dark:border-rink-700 text-[11px] text-wtext-3 dark:text-rink-300">
        <span className="flex items-center gap-1">
          {coachName ? (
            <>
              <Icon name="person" className="text-[13px]" aria-hidden="true" />
              {coachName}
            </>
          ) : (
            <span aria-hidden="true">&nbsp;</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="visibility" className="text-[13px]" aria-hidden="true" />
          {MESSAGES.promotion.viewCount(promotion.viewCount)}
        </span>
      </div>
    </button>
  );
}

export default PromotionCard;
