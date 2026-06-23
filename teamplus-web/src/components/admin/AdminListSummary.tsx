'use client';

interface AdminListSummaryProps {
  /** 목록 제목 (예: "대회 목록", "월별 정산 내역") */
  title: string;
  /** 총 건수 */
  totalCount: number;
  /** 건수 단위 (기본: '건') */
  unit?: string;
  /** 우측 보조 텍스트 (옵션, 정렬 기준 등) */
  rightText?: string;
  /** 우측 액션 버튼 렌더 (옵션) */
  rightAction?: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 목록 요약 바 컴포넌트
 *
 * 리스트 상단에 "제목 | 총 N건" 형태로 표시.
 * tournament-manage, match-manage, settlements, coach-manage 등에서 공통 사용.
 *
 * @example
 * <AdminListSummary title="대회 목록" totalCount={filteredTournaments.length} />
 *
 * <AdminListSummary
 *   title="코치 목록"
 *   totalCount={coaches.length}
 *   unit="명"
 *   rightText="최근 등록순"
 * />
 */
export function AdminListSummary({
  title,
  totalCount,
  unit = '건',
  rightText,
  rightAction,
  className = '',
}: AdminListSummaryProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2 className="text-base font-bold text-wtext-1 dark:text-white">
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {rightText && (
          <span className="text-xs font-medium text-ice-500">{rightText}</span>
        )}
        {rightAction}
        <span className="text-xs text-wtext-3 dark:text-rink-300">
          {totalCount.toLocaleString()}{unit}
        </span>
      </div>
    </div>
  );
}
