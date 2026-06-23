'use client';

interface ProgressBarProps {
  /** 현재 진행률 (0~100) */
  percent: number;
  /** 진행률 바 높이 클래스 (기본: 'h-4') */
  heightClassName?: string;
  /** 진행률 바 색상 클래스 (기본: 'bg-ice-500') */
  barClassName?: string;
  /** 트랙 배경 색상 클래스 */
  trackClassName?: string;
  /** 애니메이션 적용 여부 (기본: true) */
  animated?: boolean;
  className?: string;
}

/**
 * 진행률 표시 바 컴포넌트
 * stickers(스티커 수집), checklist(준비물 체크) 등에서 공통 사용
 */
export function ProgressBar({
  percent,
  heightClassName = 'h-4',
  barClassName = 'bg-ice-500',
  trackClassName = 'bg-wline dark:bg-rink-700',
  animated = true,
  className = '',
}: ProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={`${heightClassName} w-full ${trackClassName} rounded-full overflow-hidden p-1 ${className}`}
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`진행률 ${clampedPercent}%`}
    >
      <div
        className={`h-full ${barClassName} rounded-full ${
          animated ? 'transition-all duration-700 ease-out motion-reduce:transition-none' : ''
        }`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}
