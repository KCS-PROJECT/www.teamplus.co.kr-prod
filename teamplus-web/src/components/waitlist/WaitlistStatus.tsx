'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { WaitlistStatusInfo } from '@/types/waitlist';

/**
 * WaitlistStatus - 대기자 현황 카드
 * TEAMPLUS Design System
 *
 * Design 7 Principles:
 * - 솔리드 컬러 프로그레스바 (gradient 금지)
 * - shadow-card / shadow-md만 사용
 * - messages.ts 상수 사용
 * - 한글 버튼 레이블
 */

interface WaitlistStatusProps {
  info: WaitlistStatusInfo;
  onCancel?: () => void;
  onConfirm?: () => void;
  loading?: boolean;
  className?: string;
}

export function WaitlistStatus({
  info,
  onCancel,
  onConfirm,
  loading = false,
  className,
}: WaitlistStatusProps) {
  const {
    className: classTitle,
    capacity,
    enrolled,
    isFull,
    myPosition,
    totalWaiting,
    myStatus,
    confirmDeadline,
  } = info;

  const enrollmentPercent = Math.min((enrolled / capacity) * 100, 100);
  const isPromoted = myStatus === 'PROMOTED';

  return (
    <Card variant="default" padding="md" className={className}>
      {/* 수업 정보 + 정원 상태 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-wtext-1 dark:text-white">
            {classTitle}
          </h3>
          <p className="text-sm text-wtext-3 dark:text-rink-300 mt-0.5">
            정원 {enrolled}/{capacity}
            {isFull && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                마감
              </span>
            )}
          </p>
        </div>
        {myPosition && !isPromoted && (
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-ice-500">
              {myPosition}
            </span>
            <span className="text-xs text-wtext-3 dark:text-rink-300">
              번째 대기
            </span>
          </div>
        )}
      </div>

      {/* 정원 프로그레스바 */}
      <div className="mb-3">
        <div className="w-full bg-wline-2 dark:bg-rink-700 h-2 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isFull ? 'bg-red-500 dark:bg-red-400' : 'bg-ice-500'
            )}
            style={{ width: `${enrollmentPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-xs text-wtext-3 dark:text-rink-300">
          <span>등록 {enrolled}명</span>
          <span>대기 {totalWaiting}명</span>
        </div>
      </div>

      {/* 승격 알림 */}
      {isPromoted && (
        <div className="mb-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-start gap-2">
            <Icon
              name="celebration"
              className="text-emerald-600 dark:text-emerald-400 text-[20px] shrink-0 mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                대기가 해소되었습니다!
              </p>
              {confirmDeadline && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {confirmDeadline}까지 확인해주세요.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 대기 위치 안내 (대기 중일 때) */}
      {myPosition && !isPromoted && (
        <div className="mb-3 p-3 rounded-lg bg-wbg dark:bg-rink-800">
          <div className="flex items-center gap-2">
            <Icon
              name="hourglass_top"
              className="text-wtext-3 dark:text-rink-300 text-[18px]"
            />
            <p className="text-sm text-wtext-2 dark:text-rink-300">
              {MESSAGES.waitlist.position(myPosition)}
            </p>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        {isPromoted && onConfirm && (
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={onConfirm}
            loading={loading}
          >
            등록 확인하기
          </Button>
        )}
        {myStatus === 'WAITING' && onCancel && (
          <Button
            variant="ghost"
            size="md"
            fullWidth
            className="border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100"
            onClick={onCancel}
            loading={loading}
          >
            대기 취소하기
          </Button>
        )}
      </div>
    </Card>
  );
}
