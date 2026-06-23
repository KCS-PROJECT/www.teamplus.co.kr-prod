'use client';

import { cn } from '@/lib/utils';

/**
 * AttendanceProgressBar - 출석률 프로그레스 바
 *
 * 출석률 수치에 따라 색상이 자동으로 결정됩니다.
 * - 90% 이상: 초록색 (bg-green-500)
 * - 70% 이상: 브랜드 파란색 (bg-ice-500)
 * - 50% 이상: 노란색 (bg-yellow-500)
 * - 50% 미만: 빨간색 (bg-red-500)
 */
interface AttendanceProgressBarProps {
  /** 출석률 (0~100) */
  rate: number;
  /** 애니메이션 활성화 여부 */
  isAnimated?: boolean;
  /** 바 높이 className (기본: h-2.5) */
  heightClass?: string;
  /** 접근성 라벨 */
  label?: string;
  /** 추가 className */
  className?: string;
}

function getAttendanceColor(rate: number): string {
  if (rate >= 90) return 'bg-green-500';
  if (rate >= 70) return 'bg-ice-500';
  if (rate >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function AttendanceProgressBar({
  rate,
  isAnimated = true,
  heightClass = 'h-2.5',
  label,
  className = '',
}: AttendanceProgressBarProps) {
  const clampedRate = Math.max(0, Math.min(100, rate));

  return (
    <div
      className={cn(
        'relative w-full bg-wline-2 dark:bg-rink-700 rounded-full overflow-hidden',
        heightClass,
        className
      )}
      role="progressbar"
      aria-valuenow={clampedRate}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `출석률 ${clampedRate}%`}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-1000 ease-out',
          getAttendanceColor(clampedRate)
        )}
        style={{ width: isAnimated ? `${clampedRate}%` : '0%' }}
      />
    </div>
  );
}

export { getAttendanceColor };
