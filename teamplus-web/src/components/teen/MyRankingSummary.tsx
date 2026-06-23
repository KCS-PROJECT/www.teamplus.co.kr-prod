'use client';

interface MyRankingSummaryProps {
  /** 현재 순위 */
  currentRank: number;
  /** 점수 */
  score: number;
  /** 전체 인원 */
  totalUsers: number;
  className?: string;
}

/**
 * 내 랭킹 통계 요약 카드
 * 순위 / 포인트 / 상위 퍼센트를 3분할 레이아웃으로 표시
 */
export function MyRankingSummary({
  currentRank,
  score,
  totalUsers,
  className = '',
}: MyRankingSummaryProps) {
  const percentile =
    totalUsers > 0
      ? Math.round((1 - (currentRank - 1) / totalUsers) * 100)
      : null;

  return (
    <div
      className={`bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-4 ${className}`}
    >
      <p className="text-xs font-semibold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-3">
        내 랭킹
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl font-bold text-ice-500">
            {currentRank}위
          </span>
          <span className="text-[11px] text-wtext-3 dark:text-rink-300">
            순위
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl font-bold text-wtext-1 dark:text-white">
            {score.toLocaleString()}
          </span>
          <span className="text-[11px] text-wtext-3 dark:text-rink-300">
            포인트
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl font-bold text-wtext-1 dark:text-white">
            {percentile !== null ? `상위 ${percentile}%` : '-'}
          </span>
          <span className="text-[11px] text-wtext-3 dark:text-rink-300">
            전체 {totalUsers}명
          </span>
        </div>
      </div>
    </div>
  );
}
