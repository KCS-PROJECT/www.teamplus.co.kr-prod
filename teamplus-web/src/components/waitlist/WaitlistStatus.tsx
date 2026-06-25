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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 Card 박스 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → flat 흰 타일 + it-* 토큰, 프로그레스 it-blue/it-red 적용.
   *   (현재 /waitlist 화면만 전달.)
   */
  iceTheme?: boolean;
}

export function WaitlistStatus({
  info,
  onCancel,
  onConfirm,
  loading = false,
  className,
  iceTheme = false,
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

  // ICETIMES flat — 카드 박스 제거. flat 흰 타일(부모 회색 캔버스 위) + it-* 토큰.
  if (iceTheme) {
    return (
      <div className={cn('rounded-w-md bg-it-surface dark:bg-it-blue-950 border border-it-line dark:border-it-blue-900 p-4', className)}>
        {/* 수업 정보 + 정원 상태 */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
              {classTitle}
            </h3>
            <p className="text-[13.5px] text-it-ink-500 dark:text-rink-300 mt-0.5">
              정원 <span className="font-num tabular-nums">{enrolled}/{capacity}</span>
              {isFull && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-w-pill text-[11px] font-bold bg-it-red-500/10 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300">
                  마감
                </span>
              )}
            </p>
          </div>
          {myPosition && !isPromoted && (
            <div className="flex flex-col items-end">
              <span className="text-2xl font-extrabold font-num tabular-nums text-it-blue-500">
                {myPosition}
              </span>
              <span className="text-[12px] text-it-ink-400 dark:text-rink-300">
                번째 대기
              </span>
            </div>
          )}
        </div>

        {/* 정원 프로그레스바 */}
        <div className="mb-3">
          <div className="w-full bg-it-fill dark:bg-it-blue-900 h-2 rounded-w-pill overflow-hidden">
            <div
              className={cn(
                'h-full rounded-w-pill transition-all duration-500 motion-reduce:transition-none',
                isFull ? 'bg-it-red-500' : 'bg-it-blue-500'
              )}
              style={{ width: `${enrollmentPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[12px] text-it-ink-500 dark:text-rink-300">
            <span>등록 <span className="font-num tabular-nums">{enrolled}</span>명</span>
            <span>대기 <span className="font-num tabular-nums">{totalWaiting}</span>명</span>
          </div>
        </div>

        {/* 승격 알림 */}
        {isPromoted && (
          <div className="mb-3 p-3 rounded-w-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-start gap-2">
              <Icon
                name="celebration"
                className="text-emerald-600 dark:text-emerald-400 text-[20px] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="text-[13.5px] font-bold text-emerald-700 dark:text-emerald-300">
                  대기가 해소되었습니다!
                </p>
                {confirmDeadline && (
                  <p className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {confirmDeadline}까지 확인해주세요.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 대기 위치 안내 (대기 중일 때) */}
        {myPosition && !isPromoted && (
          <div className="mb-3 p-3 rounded-w-md bg-it-fill dark:bg-it-blue-900/40">
            <div className="flex items-center gap-2">
              <Icon
                name="hourglass_top"
                className="text-it-ink-400 dark:text-rink-300 text-[18px]"
                aria-hidden="true"
              />
              <p className="text-[13.5px] text-it-ink-600 dark:text-rink-300">
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
              className="border-[1.5px] border-it-line-strong dark:border-it-blue-900 text-it-ink-600 dark:text-rink-100"
              onClick={onCancel}
              loading={loading}
            >
              대기 취소하기
            </Button>
          )}
        </div>
      </div>
    );
  }

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
