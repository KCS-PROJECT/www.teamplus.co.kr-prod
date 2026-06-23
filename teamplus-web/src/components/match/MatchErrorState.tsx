'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface MatchErrorStateProps {
  /** 에러 메시지. 기본값: 일반 오류 메시지 */
  message?: string;
  /** "다시 시도" 버튼 클릭 핸들러. 제공되지 않으면 버튼이 표시되지 않습니다 */
  onRetry?: () => void;
  /** 추가 커스텀 클래스 */
  className?: string;
  /** 아이콘 이름 (기본: error_outline) */
  iconName?: string;
}

/**
 * 매치 도메인 공통 에러 상태 컴포넌트.
 *
 * matches 페이지 3곳(list / [id] / [id]/applicants)에서
 * 동일한 에러 UI를 공유하기 위해 Phase 7 Repair Loop에서 추출했습니다.
 *
 * 사용 예:
 * ```tsx
 * <MatchErrorState
 *   message={error ?? MESSAGES.match.error.loadFailed}
 *   onRetry={loadData}
 * />
 * ```
 */
export function MatchErrorState({
  message,
  onRetry,
  className,
  iconName = 'error_outline',
}: MatchErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      <Icon
        name={iconName}
        className="text-5xl text-wtext-4 dark:text-rink-500"
      />
      <p className="text-sm text-wtext-3 dark:text-rink-300">
        {message ?? MESSAGES.error.general}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-ice-500 border border-ice-500 rounded-lg hover:bg-ice-500/5 transition-colors"
        >
          {MESSAGES.common.retry}
        </button>
      )}
    </div>
  );
}
