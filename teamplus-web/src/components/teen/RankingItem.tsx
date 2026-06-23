'use client';

interface RankingItemProps {
  /** 순위 (1부터 시작) */
  rank: number;
  /** 표시 이름 */
  name: string;
  /** 점수 또는 레벨 */
  score: number | string;
  /** 점수 접미사 (기본: '점') */
  scoreSuffix?: string;
  /** 현재 사용자 여부 (강조 표시) */
  isCurrentUser?: boolean;
  /** 추가 정보 (예: 레벨) */
  subtitle?: string;
  /** 마지막 아이템 여부 (하단 테두리 제거용) */
  isLast?: boolean;
}

const MEDALS = ['', '🥈', '🥉'];

/**
 * 랭킹 리스트에서 각 항목을 표시하는 컴포넌트
 * 1~3위는 메달 이모지, 4위 이하는 숫자 표시
 * 현재 사용자는 배경색 강조
 */
export function RankingItem({
  rank,
  name,
  score,
  scoreSuffix = '점',
  isCurrentUser = false,
  subtitle,
  isLast = false,
}: RankingItemProps) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        !isLast ? 'border-b border-wline-2 dark:border-rink-700' : ''
      } ${isCurrentUser ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
    >
      {/* 순위 표시 */}
      <span className="text-xl w-8 text-center flex-shrink-0">
        {medal ?? (
          <span className="text-sm font-bold text-wtext-3 dark:text-rink-300">
            {rank}
          </span>
        )}
      </span>

      {/* 이름 + 서브타이틀 */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm font-bold ${
            isCurrentUser
              ? 'text-ice-500'
              : 'text-wtext-1 dark:text-white'
          }`}
        >
          {name}
          {isCurrentUser && (
            <span className="text-xs font-medium text-ice-500 ml-1">(나)</span>
          )}
        </span>
        {subtitle && (
          <p className="text-xs text-wtext-3 dark:text-rink-300">
            {subtitle}
          </p>
        )}
      </div>

      {/* 점수 */}
      <span className="text-sm font-bold text-wtext-3 dark:text-rink-300 tabular-nums flex-shrink-0">
        {score}
        {scoreSuffix}
      </span>
    </div>
  );
}
