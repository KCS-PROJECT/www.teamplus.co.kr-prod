'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { ExploreClassItem } from '@/services/class-explore.service';

/**
 * ExploreClassCard — 전국 수업 찾기 목록 카드.
 *
 * [2026-08-04] 기존 통합검색(`/search?type=classes`)은 수업명·강사명만 보여줘서
 *   발견은 되지만 "등록할지" 판단할 수 없었다. 이 카드는 장소·일정·가격·잔여석까지
 *   한 화면에 담아 그 격차를 메우는 것이 목적이다.
 *
 * 디자인: gradient·backdrop-blur·컬러 그림자 금지. 토큰만 사용.
 */

const TRAINING_TYPE_LABEL: Record<string, string> = {
  regular: '정규',
  lesson: '레슨',
  spot: '1회',
};

function formatWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 요일별 시간이 모두 같으면 "월·수·금 17:00-18:30", 다르면 요일만 나열. */
function formatSchedule(
  daySchedules: ExploreClassItem['daySchedules'],
): string | null {
  if (daySchedules.length === 0) return null;
  const days = daySchedules.map((d) => d.dayOfWeek).join('·');
  const first = daySchedules[0];
  const sameTime = daySchedules.every(
    (d) => d.startTime === first.startTime && d.endTime === first.endTime,
  );
  return sameTime ? `${days} ${first.startTime}-${first.endTime}` : days;
}

function formatPrice(price: ExploreClassItem['price']): string {
  if (!price) return MESSAGES.class.explore.priceUndecided;
  return price.feeType === 'MONTHLY_FIXED'
    ? MESSAGES.class.explore.monthly(formatWon(price.min))
    : MESSAGES.class.explore.perSession(formatWon(price.min));
}

function formatSeats(item: ExploreClassItem): string {
  if (item.remainingSeats === null) return MESSAGES.class.explore.seatsUnlimited;
  if (item.remainingSeats === 0) return MESSAGES.class.explore.seatsFull;
  return MESSAGES.class.explore.remainingSeats(item.remainingSeats);
}

interface ExploreClassCardProps {
  item: ExploreClassItem;
  onPress: (item: ExploreClassItem) => void;
}

function ExploreClassCardBase({ item, onPress }: ExploreClassCardProps) {
  const schedule = formatSchedule(item.daySchedules);
  const typeLabel = item.trainingType
    ? TRAINING_TYPE_LABEL[item.trainingType]
    : null;
  const isFull = item.remainingSeats === 0;

  return (
    <button
      type="button"
      onClick={() => onPress(item)}
      className={cn(
        'w-full text-left py-4 transition-colors motion-reduce:transition-none',
        'active:bg-it-fill dark:active:bg-rink-700/50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded-w-md',
      )}
      aria-label={`${item.className} 자세히 보기`}
    >
      {/* 제목 + 유형 배지 */}
      <div className="flex items-start gap-2">
        <h3 className="flex-1 min-w-0 text-[16px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white truncate">
          {item.className}
        </h3>
        {typeLabel && (
          <span className="shrink-0 inline-flex items-center h-6 px-2 rounded-w-pill text-[12px] font-bold bg-it-blue-500/10 text-it-blue-500 dark:bg-it-blue-500/20">
            {typeLabel}
          </span>
        )}
      </div>

      {/* 팀/아카데미 */}
      {item.owner && (
        <p className="mt-1 text-[14px] font-bold text-it-ink-600 dark:text-wtext-4 truncate">
          {item.owner.name}
        </p>
      )}

      {/* 지역 · 장소 — [2026-08-04] 지역(시군구 포함)을 앞에 굵게 둔다.
          전국 목록이라 "어디서 하는 수업인지" 가 가장 먼저 읽혀야 타지역 오등록을 막는다. */}
      {(item.regionLabel || item.venue) && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-it-ink-500 dark:text-wtext-4">
          <Icon name="place" className="text-[16px] shrink-0" aria-hidden="true" />
          <span className="truncate">
            {item.regionLabel && (
              <span className="font-bold text-it-ink-700 dark:text-white">
                {item.regionLabel}
              </span>
            )}
            {item.venue?.name && `${item.regionLabel ? ' · ' : ''}${item.venue.name}`}
          </span>
        </p>
      )}

      {/* 일정 */}
      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-it-ink-500 dark:text-wtext-4">
        <Icon name="calendar_month" className="text-[16px] shrink-0" aria-hidden="true" />
        <span className="truncate">
          {schedule ?? MESSAGES.class.explore.scheduleUndecided}
        </span>
      </p>

      {/* 가격 + 잔여석 */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-[15px] font-extrabold font-num tabular-nums text-it-ink-800 dark:text-white">
          {formatPrice(item.price)}
        </span>
        <span
          className={cn(
            'text-[12px] font-bold',
            isFull
              ? 'text-it-ink-400 dark:text-wtext-4'
              : 'text-it-blue-500',
          )}
        >
          {formatSeats(item)}
        </span>
      </div>
    </button>
  );
}

export const ExploreClassCard = memo(ExploreClassCardBase);
