'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * CoachClassCard - 코치 수업 카드
 *
 * 사용처: coach-schedules, classes-organize, classes-manage
 * 패턴: 수업명 + 시간 + 코치명 + 정원 + 액션 버튼
 */
export interface CoachClassCardProps {
  /** 수업 ID */
  id: string;
  /** 수업명 */
  className: string;
  /** 코치/강사 이름 */
  instructorName?: string;
  /** 정원 */
  capacity?: number;
  /** 현재 수강인원 */
  enrolled?: number;
  /** 시작 시간 (표시용 문자열, 예: '14:00') */
  startTime: string;
  /** 종료 시간 (표시용 문자열, 예: '15:30') */
  endTime: string;
  /** 날짜 (선택, 예: '1월 15일') */
  date?: string;
  /** 장소 (선택) */
  location?: string;
  /** 상태 배지 텍스트 */
  statusLabel?: string;
  /** 상태 배지 스타일 클래스 */
  statusClassName?: string;
  /** 주 액션 버튼 라벨 */
  primaryAction?: string;
  /** 주 액션 클릭 핸들러 */
  onPrimaryAction?: () => void;
  /** 보조 액션 버튼 라벨 */
  secondaryAction?: string;
  /** 보조 액션 클릭 핸들러 */
  onSecondaryAction?: () => void;
  /** 추가 className */
  className_?: string;
}

export const CoachClassCard = memo(function CoachClassCard({
  className: classTitle,
  instructorName,
  capacity,
  enrolled,
  startTime,
  endTime,
  date,
  location,
  statusLabel,
  statusClassName,
  primaryAction,
  onPrimaryAction,
  secondaryAction,
  onSecondaryAction,
  className_,
}: CoachClassCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl p-4',
        'border border-wline-2 dark:border-rink-700',
        'hover:border-wline dark:hover:border-rink-700 transition-colors',
        className_
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1 min-w-0 pr-2">
          <h3 className="text-base font-bold text-wtext-1 dark:text-white truncate">
            {classTitle}
          </h3>
          <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1">
            <Icon name="schedule" className="text-[14px]" aria-hidden="true" />
            <span>
              {date ? `${date} \u00B7 ` : ''}
              {startTime} - {endTime}
            </span>
          </p>
          {instructorName && (
            <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1">
              <Icon name="person" className="text-[14px]" aria-hidden="true" />
              <span>{instructorName}</span>
            </p>
          )}
          {location && (
            <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1">
              <Icon name="location_on" className="text-[14px]" aria-hidden="true" />
              <span>{location}</span>
            </p>
          )}
          {capacity !== undefined && (
            <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1">
              <Icon name="group" className="text-[14px]" aria-hidden="true" />
              <span>
                {enrolled !== undefined ? `${enrolled}/${capacity}명` : `정원 ${capacity}명`}
              </span>
            </p>
          )}
        </div>

        {statusLabel && (
          <span
            className={cn(
              'shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full',
              statusClassName ?? 'text-ice-500 bg-ice-500/10 border border-ice-500/10'
            )}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-wline-2 dark:border-rink-700/50 pt-3">
          {secondaryAction && (
            <Button variant="secondary" size="sm" onClick={onSecondaryAction}>
              {secondaryAction}
            </Button>
          )}
          {primaryAction && (
            <Button size="sm" onClick={onPrimaryAction}>
              {primaryAction}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
