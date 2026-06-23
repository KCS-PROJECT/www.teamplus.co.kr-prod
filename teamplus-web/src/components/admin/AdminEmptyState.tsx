'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

interface AdminEmptyStateProps {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 빈 상태 메시지 (MESSAGES.empty() 권장) */
  message?: string;
  /** 항목 이름 (MESSAGES.empty()에 전달) */
  itemName?: string;
  /** 보조 메시지 (옵션) */
  description?: string;
  /** 액션 버튼 텍스트 (옵션) */
  actionLabel?: string;
  /** 액션 버튼 클릭 핸들러 */
  onAction?: () => void;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 빈 상태 컴포넌트
 *
 * 데이터가 없을 때 아이콘 + 메시지를 표시.
 * 거의 모든 admin 리스트 페이지에서 사용되는 공통 패턴.
 *
 * @example
 * // 기본 사용 (MESSAGES.empty 자동 적용)
 * <AdminEmptyState icon="person_off" itemName="회원" />
 *
 * // 커스텀 메시지
 * <AdminEmptyState icon="sports_hockey" message="등록된 매치가 없습니다" />
 *
 * // 액션 버튼 포함
 * <AdminEmptyState
 *   icon="campaign"
 *   itemName="공지사항"
 *   actionLabel="공지 등록하기"
 *   onAction={() => router.push('/notices/create')}
 * />
 */
export function AdminEmptyState({
  icon,
  message,
  itemName,
  description,
  actionLabel,
  onAction,
  className = '',
}: AdminEmptyStateProps) {
  const displayMessage = message ?? (itemName ? MESSAGES.empty(itemName) : '데이터가 없습니다.');

  return (
    <div className={`flex flex-col items-center justify-center py-20 ${className}`}>
      <div className="w-16 h-16 rounded-full bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-4">
        <Icon
          name={icon}
          className="text-3xl text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm font-medium text-wtext-3 dark:text-rink-300 text-center">
        {displayMessage}
      </p>
      {description && (
        <p className="text-xs text-wtext-3 dark:text-rink-300 mt-1 text-center">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-5 py-2.5 bg-ice-500 hover:bg-ice-700 text-white text-sm font-bold rounded-xl transition-colors active:brightness-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
