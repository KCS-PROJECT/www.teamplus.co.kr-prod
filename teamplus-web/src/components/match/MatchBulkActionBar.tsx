'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { useNativeUI } from '@/hooks/useNativeUI';

interface MatchBulkActionBarProps {
  /** 현재 선택된 신청자 수 */
  selectedCount: number;
  /** 선택 가능한 전체 대기 신청자 수 */
  totalCount: number;
  onSelectAll: () => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  isProcessing?: boolean;
  className?: string;
}

/**
 * 매치 신청자 관리 페이지의 sticky 하단 툴바.
 *
 * HTML 목업 "매치 신청자 관리"의 일괄 액션 바 반영:
 * - 좌측: 전체 선택 체크박스 + 선택 카운트
 * - 우측: 일괄 거절(outline) + 일괄 승인(primary) 버튼
 * - 선택 0명 시 버튼 비활성화
 *
 * [2026-05-18 BUG FIX]
 * BulkActionBar(shared)와 동일 패턴 적용 — mount 중 BottomNav 자동 hide.
 * BottomNav가 있는 매치 관리 페이지에서도 시각적으로 안전하게 표시 보장.
 * AppBar/BottomNav 자체는 건드리지 않음 (useNativeUI 통한 native 제어만).
 */
export function MatchBulkActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onBulkApprove,
  onBulkReject,
  isProcessing = false,
  className,
}: MatchBulkActionBarProps) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const hasSelection = selectedCount > 0;

  // [2026-05-18] 액션 바가 떠 있는 동안 BottomNav 숨김. unmount 시 자동 복원.
  // BulkActionBar shared 컴포넌트와 동일 패턴.
  useNativeUI({
    showBottomNav: false,
    restoreOnUnmount: true,
  });

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-700',
        // safe-area + 12px (홈 인디케이터 보호)
        'pb-[calc(env(safe-area-inset-bottom,0px)+12px)]',
        className,
      )}
    >
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* 전체 선택 */}
        <button
          type="button"
          onClick={onSelectAll}
          disabled={totalCount === 0 || isProcessing}
          className="flex items-center gap-2 text-sm font-bold text-wtext-2 dark:text-rink-100 disabled:opacity-40"
          aria-pressed={allSelected}
        >
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
              allSelected
                ? 'bg-ice-500 border-ice-500'
                : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-800'
            )}
          >
            {allSelected && (
              <Icon name="check" className="text-white text-sm" />
            )}
          </span>
          <span className="whitespace-nowrap">
            {hasSelection
              ? MESSAGES.match.applicants.selectedCount(selectedCount)
              : MESSAGES.match.applicants.selectAll}
          </span>
        </button>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBulkReject}
            disabled={!hasSelection || isProcessing}
            className="inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <Icon name="close" className="text-base" />
            {MESSAGES.match.applicants.bulkReject}
          </button>
          <button
            type="button"
            onClick={onBulkApprove}
            disabled={!hasSelection || isProcessing}
            className="inline-flex items-center gap-1 h-10 px-4 rounded-lg bg-ice-500 text-white text-sm font-bold hover:bg-ice-700 disabled:opacity-40 transition-colors"
          >
            {isProcessing ? (
              <Icon name="progress_activity" className="animate-spin text-base" />
            ) : (
              <Icon name="done_all" className="text-base" />
            )}
            {MESSAGES.match.applicants.bulkApprove}
          </button>
        </div>
      </div>
    </div>
  );
}
