'use client';

import { Icon } from '@/components/ui/Icon';

interface ActionButton {
  /** 버튼 레이블 */
  label: string;
  /** Material Symbols 아이콘 이름 (옵션) */
  icon?: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 버튼 variant */
  variant?: 'primary' | 'secondary' | 'danger';
  /** flex 비율 (기본: 1) */
  flex?: number;
  /** 비활성화 여부 */
  disabled?: boolean;
}

interface AdminActionBarProps {
  /** 액션 버튼 배열 */
  actions: ActionButton[];
  /** 표시 여부 (기본: true) */
  visible?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

const VARIANT_STYLES = {
  primary:
    'bg-ice-500 text-white shadow-md hover:bg-ice-700',
  secondary:
    'bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700',
  danger:
    'bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
};

/**
 * Admin 하단 고정 액션 바 컴포넌트
 *
 * match-manage(미리보기/등록), members(거절/승인) 등에서
 * 선택 상태에 따라 하단에 나타나는 복수 액션 버튼 바.
 *
 * @example
 * // 일괄 승인/거절 바
 * <AdminActionBar
 *   visible={selectedIds.size > 0}
 *   actions={[
 *     { label: '일괄 거절', icon: 'block', onClick: handleBulkReject, variant: 'danger' },
 *     { label: `일괄 승인 (${selectedIds.size})`, icon: 'check_circle', onClick: handleBulkApprove, variant: 'primary', flex: 2 },
 *   ]}
 * />
 *
 * // 폼 하단 바
 * <AdminActionBar
 *   actions={[
 *     { label: '미리보기', onClick: handlePreview, variant: 'secondary' },
 *     { label: '등록하기', icon: 'check', onClick: handleSubmit, variant: 'primary', flex: 2 },
 *   ]}
 * />
 */
export function AdminActionBar({
  actions,
  visible = true,
  className = '',
}: AdminActionBarProps) {
  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 px-5 pt-5 pb-safe-8 bg-white/90 dark:bg-rink-900/90 border-t border-wline-2 dark:border-rink-800 pointer-events-none ${className}`}
    >
      <div className="flex gap-3 pointer-events-auto">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            disabled={action.disabled}
            style={{ flex: action.flex ?? 1 }}
            className={`flex items-center justify-center gap-2 h-12 rounded-xl text-[15px] font-bold transition-colors active:brightness-95 disabled:opacity-50 ${
              VARIANT_STYLES[action.variant ?? 'secondary']
            }`}
          >
            {action.icon && <Icon name={action.icon} className="text-[20px]" />}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { ActionButton };
