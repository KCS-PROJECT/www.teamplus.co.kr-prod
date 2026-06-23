'use client';

interface InfoRowProps {
  /** 라벨 텍스트 */
  label: string;
  /** 값 텍스트 */
  value: string;
  /** 레이아웃 변형: 'between' (기본, flex justify-between) | 'grid' (25%:75% 그리드) */
  variant?: 'between' | 'grid';
}

/**
 * 라벨-값 정보 행 컴포넌트
 * 팀 상세 정보, 대회 상세 정보 등에서 공통으로 사용됩니다.
 *
 * @example
 * // 기본 (flex between)
 * <InfoRow label="홈 링크" value="강릉 아이스아레나" />
 *
 * // 그리드 레이아웃
 * <InfoRow label="장소" value="강릉 아이스아레나" variant="grid" />
 */
export function InfoRow({ label, value, variant = 'between' }: InfoRowProps) {
  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-[25%_1fr] gap-x-4 border-t border-wline dark:border-rink-700 py-4 first:border-t-0">
        <p className="text-sm font-medium text-wtext-3 dark:text-rink-300">
          {label}
        </p>
        <p className="text-sm font-medium text-wtext-1 dark:text-rink-100">
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-wtext-3 dark:text-rink-300 text-sm font-medium">
        {label}
      </span>
      <span className="font-bold text-wtext-1 dark:text-white text-sm">
        {value}
      </span>
    </div>
  );
}
