'use client';

import { Icon } from '@/components/ui/Icon';

interface AdminFloatingActionProps {
  /** 버튼 레이블 */
  label: string;
  /** Material Symbols 아이콘 이름 */
  icon?: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 버튼 variant */
  variant?: 'full-width' | 'pill' | 'fab';
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 하단 고정 액션 버튼 컴포넌트
 *
 * coach-manage, tournament-manage, match-manage, popup 등에서
 * 페이지 하단에 고정되는 주요 액션 버튼.
 *
 * @example
 * // 전폭 버튼
 * <AdminFloatingAction
 *   label="신규 코치 등록"
 *   icon="person_add"
 *   onClick={() => {}}
 * />
 *
 * // pill 스타일
 * <AdminFloatingAction
 *   variant="pill"
 *   label="새 팝업 등록"
 *   icon="add_photo_alternate"
 *   onClick={() => {}}
 * />
 *
 * // FAB (아이콘만)
 * <AdminFloatingAction
 *   variant="fab"
 *   label="추가"
 *   icon="add"
 *   onClick={() => {}}
 * />
 */
export function AdminFloatingAction({
  label,
  icon,
  onClick,
  variant = 'full-width',
  disabled = false,
  className = '',
}: AdminFloatingActionProps) {
  if (variant === 'fab') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`fixed bottom-24 right-4 w-14 h-14 bg-ice-500 rounded-full shadow-md flex items-center justify-center text-white z-30 hover:bg-ice-700 transition-colors active:brightness-95 disabled:opacity-50 ${className}`}
        aria-label={label}
      >
        {icon && <Icon name={icon} className="text-[28px]" />}
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center z-50 pointer-events-none">
        <button
          onClick={onClick}
          disabled={disabled}
          className={`pointer-events-auto bg-ice-500 text-white shadow-md rounded-full h-14 pl-6 pr-8 flex items-center gap-2 hover:bg-ice-700 active:brightness-95 transition-colors disabled:opacity-50 ${className}`}
        >
          {icon && <Icon name={icon} className="text-2xl" />}
          <span className="text-base font-bold">{label}</span>
        </button>
      </div>
    );
  }

  // full-width (기본)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-md mx-auto px-5 pt-5 pb-safe-8 pointer-events-auto">
        <button
          onClick={onClick}
          disabled={disabled}
          className={`w-full h-14 rounded-2xl bg-ice-500 text-white font-bold shadow-md hover:bg-ice-700 transition-colors flex items-center justify-center gap-2 active:brightness-95 disabled:opacity-50 ${className}`}
        >
          {icon && <Icon name={icon} className="text-xl" />}
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
