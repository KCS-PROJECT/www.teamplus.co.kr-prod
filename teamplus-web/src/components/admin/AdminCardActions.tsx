'use client';

import { Icon } from '@/components/ui/Icon';

interface CardAction {
  /** 버튼 레이블 */
  label: string;
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 버튼 variant */
  variant?: 'default' | 'primary' | 'danger';
  /** 비활성화 여부 */
  disabled?: boolean;
}

interface AdminCardActionsProps {
  /** 액션 버튼 배열 */
  actions: CardAction[];
  /** 레이아웃 방향 */
  layout?: 'row' | 'divided';
  /** 추가 CSS 클래스 */
  className?: string;
}

const ACTION_STYLES = {
  default:
    'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-500',
  primary:
    'bg-ice-500 text-white hover:bg-ice-700 shadow-sm',
  danger:
    'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400',
};

/**
 * Admin 카드 내부 액션 버튼 그룹
 *
 * match-manage(신청자/수정/삭제), tournament-manage(수정/삭제/상세) 등
 * 카드 하단에 배치되는 액션 버튼 그룹.
 *
 * @example
 * // row 레이아웃 (기본)
 * <AdminCardActions
 *   actions={[
 *     { label: '신청자', icon: 'person', onClick: handleManage },
 *     { label: '수정', icon: 'edit', onClick: handleEdit },
 *     { label: '삭제', icon: 'delete', onClick: handleDelete, variant: 'danger' },
 *   ]}
 * />
 *
 * // divided 레이아웃 (border-t 구분선 포함)
 * <AdminCardActions
 *   layout="divided"
 *   actions={[
 *     { label: '수정', icon: 'edit', onClick: handleEdit },
 *     { label: '미리보기', icon: 'visibility', onClick: handlePreview },
 *   ]}
 * />
 */
export function AdminCardActions({
  actions,
  layout = 'row',
  className = '',
}: AdminCardActionsProps) {
  if (layout === 'divided') {
    return (
      <div
        className={`flex border-t border-wline-2 dark:border-rink-700 ${className}`}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            disabled={action.disabled}
            className="flex-1 py-2.5 text-xs font-semibold text-wtext-3 dark:text-rink-300 hover:text-ice-500 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Icon name={action.icon} className="text-[16px]" />
            {action.label}
          </button>
        ))}
      </div>
    );
  }

  // row layout (기본)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          disabled={action.disabled}
          className={`flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors active:brightness-95 disabled:opacity-50 ${
            ACTION_STYLES[action.variant ?? 'default']
          }`}
        >
          <Icon name={action.icon} className="text-lg" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

export type { CardAction };
