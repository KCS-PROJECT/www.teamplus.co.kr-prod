'use client';

/**
 * BulkActionBar - TEAMPLUS Shared Component
 * 일괄 선택 시 하단에 나타나는 액션 바. 선택 건수 표시 + 일괄 동작 버튼.
 * 사용 화면: /admin/members (일괄 승인/거절), /matches/[id]/applicants (일괄 처리),
 *           /director-approvals (회원 승인/거절)
 *
 * [2026-05-18 BUG FIX]
 * - 기존 fixed bottom-0 + pb-safe-3 만으로는 BottomNav (60px + safe-area, z-40) 와
 *   시각적으로 같은 영역을 차지하여 일괄 버튼이 가려졌다.
 * - 해결: 액션 바 표시 중에는 useNativeUI({showBottomNav:false})로 BottomNav를 hide,
 *         unmount 시 자동 복원 (restoreOnUnmount). 사용자 컨텍스트("선택 작업 중")와도 정합.
 * - selectedCount<=0 일 때 inner 컴포넌트 자체를 unmount 시키기 위해 wrapper 분리.
 */

import { cn } from '@/lib/utils';
import { useNativeUI } from '@/hooks/useNativeUI';

/** 액션 바 버튼 정의 */
export interface BulkAction {
  /** 버튼 레이블 (한글: "일괄 승인", "일괄 거절" 등) */
  label: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 버튼 색상 변형 */
  variant: 'primary' | 'danger';
}

export interface BulkActionBarProps {
  /** 현재 선택된 항목 수 */
  selectedCount: number;
  /** 액션 버튼 목록 */
  actions: BulkAction[];
  /** 선택 해제 핸들러 */
  onClear: () => void;
  /** 추가 className */
  className?: string;
}

const VARIANT_STYLES: Record<BulkAction['variant'], string> = {
  primary: 'bg-ice-500 text-white hover:bg-ice-700 active:brightness-95 focus:ring-ice-500/40',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:brightness-95 focus:ring-red-400/40',
};

/**
 * 일괄 선택 액션 바 (Wrapper)
 *
 * `selectedCount<=0` 일 때 BulkActionBarInner 자체를 unmount 하여
 * useNativeUI 정리(=BottomNav 복원)가 자연스럽게 일어나도록 한다.
 */
export function BulkActionBar(props: BulkActionBarProps) {
  if (props.selectedCount <= 0) return null;
  return <BulkActionBarInner {...props} />;
}

function BulkActionBarInner({
  selectedCount,
  actions,
  onClear,
  className,
}: BulkActionBarProps) {
  // [2026-05-18] 액션 바가 떠 있는 동안 BottomNav 숨김. unmount 시 자동 복원.
  useNativeUI({
    showBottomNav: false,
    restoreOnUnmount: true,
  });

  return (
    <div
      role="toolbar"
      aria-label={`${selectedCount}건 선택됨 — 일괄 작업`}
      className={cn(
        // [BUG FIX 2026-05-19 W3 #3] z-index 상향 (z-50 → z-[60]) — Web RoleBottomNav (z-40),
        //   다른 fixed overlay 위에 항상 명확히 표시되도록 보장. 일부 stacking context 환경에서
        //   z-50 이 가려지는 회귀 차단.
        'fixed bottom-0 left-0 right-0 z-[60]',
        'bg-white dark:bg-rink-800',
        'border-t border-wline dark:border-rink-700',
        // safe-area + 12px (홈 인디케이터/네비게이션 영역 보호)
        'px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]',
        'shadow-[0_-2px_8px_rgba(0,0,0,0.06)]',
        'animate-in slide-in-from-bottom-2 duration-200',
        className,
      )}
    >
      <div className="mx-auto max-w-lg flex items-center justify-between gap-3">
        {/* 선택 정보 + 해제 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-wtext-1 dark:text-white">
            {selectedCount}건 선택
          </span>
          <button
            type="button"
            onClick={onClear}
            aria-label="선택 해제"
            className={cn(
              'text-xs text-wtext-3 dark:text-rink-300 underline',
              'hover:text-wtext-2 dark:hover:text-rink-100',
              'focus:outline-none focus:ring-2 focus:ring-ice-500/40 rounded',
            )}
          >
            해제
          </button>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={cn(
                'h-10 px-5 rounded-lg text-sm font-semibold',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2',
                VARIANT_STYLES[action.variant],
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BulkActionBar;
