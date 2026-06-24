'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * ChildInfoCard - 자녀 정보 요약 카드
 *
 * 프로필 이모지, 이름, 학년, 출석률, 다음 수업, 잔여 결제권 등
 * 자녀 한 명의 핵심 정보를 카드 형태로 보여줍니다.
 */
interface ChildInfoCardProps {
  /** 프로필 이모지 */
  profileEmoji: string;
  /** 자녀 이름 */
  name: string;
  /** 학년 (예: '초등 3학년') */
  grade: string;
  /** 출석률 (0~100) */
  attendanceRate: number;
  /** 다음 수업명 */
  nextClass?: string;
  /** 다음 수업 시간 */
  nextClassTime?: string;
  /** 잔여 결제권 */
  remainingCredits?: number;
  /** 카드 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 className */
  className?: string;
}

export function ChildInfoCard({
  profileEmoji,
  name,
  grade,
  attendanceRate,
  nextClass,
  nextClassTime,
  remainingCredits,
  onClick,
  className = '',
}: ChildInfoCardProps) {
  const Wrapper = onClick ? 'button' : 'article';

  return (
    <Wrapper
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={cn(
        // 2026-05-16: 다크모드 대비 7:1 재검증 — rink-800 → rink-700 (배경 대비↑),
        //   border 도 rink-600 으로 한 단계 밝게 하여 카드 경계 가시성 확보.
        'w-full bg-white dark:bg-rink-700 rounded-xl p-5 shadow-sm border border-wline-2 dark:border-rink-600',
        'active:brightness-95 transition-colors text-left',
        className
      )}
    >
      {/* 프로필 영역 */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-2xl"
          aria-hidden="true"
        >
          {profileEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-wtext-1 dark:text-white truncate">
            {name}
          </h3>
          {/* 2026-05-16: 다크모드 보조 텍스트 대비 강화 (rink-300 → rink-200) */}
          <p className="text-xs text-wtext-3 dark:text-rink-200">{grade}</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <Icon
            name="check_circle"
            className="text-sm text-ice-500"
            aria-hidden="true"
          />
          <span className="text-sm font-bold text-ice-500 tabular-nums">
            {attendanceRate}%
          </span>
        </div>
      </div>

      {/* 다음 수업 — 2026-05-16: dark 내부 표면 rink-800/60 으로 카드(rink-700)와 위계 분리 */}
      {nextClass && (
        <div className="flex items-center gap-2.5 mb-3 p-2.5 rounded-lg bg-wbg dark:bg-rink-800/60">
          <div className="w-8 h-8 rounded-lg bg-ice-500/10 flex items-center justify-center">
            <Icon
              name="sports_hockey"
              className="text-ice-500 text-base"
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-wtext-1 dark:text-white truncate">
              {nextClass}
            </p>
            {nextClassTime && (
              <p className="text-xs text-wtext-3 dark:text-rink-200">
                {nextClassTime}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 결제권 — 2026-05-16: 다크 구분선 rink-600 으로 한 단계 밝게 */}
      {remainingCredits !== undefined && (
        <div className="flex items-center gap-2 pt-3 border-t border-wline-2 dark:border-rink-600">
          <Icon
            name="confirmation_number"
            className="text-sm text-wtext-3 dark:text-rink-200"
            aria-hidden="true"
          />
          <span className="text-xs text-wtext-3 dark:text-rink-200">
            잔여 결제권
          </span>
          <span
            className={cn(
              'text-sm font-bold ml-auto tabular-nums',
              remainingCredits > 3
                ? 'text-ice-500'
                : remainingCredits > 0
                ? 'text-amber-500'
                : 'text-red-500'
            )}
          >
            {remainingCredits}회
          </span>
        </div>
      )}
    </Wrapper>
  );
}
