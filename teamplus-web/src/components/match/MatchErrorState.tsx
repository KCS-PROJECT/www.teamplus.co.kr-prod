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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰 톤(아이콘/본문/재시도 버튼).
   */
  iceTheme?: boolean;
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
  iceTheme = false,
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
        className={cn(
          'text-5xl',
          iceTheme ? 'text-it-ink-300 dark:text-it-ink-500' : 'text-wtext-4 dark:text-rink-500'
        )}
      />
      <p
        className={cn(
          'text-sm',
          iceTheme ? 'text-it-ink-500 dark:text-it-ink-300' : 'text-wtext-3 dark:text-rink-300'
        )}
      >
        {message ?? MESSAGES.error.general}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none',
            iceTheme
              ? 'text-it-blue-500 border-[1.5px] border-it-line-strong rounded-w-md hover:bg-it-fill dark:border-it-blue-900 dark:hover:bg-it-blue-900/40'
              : 'text-ice-500 border border-ice-500 rounded-lg hover:bg-ice-500/5'
          )}
        >
          {MESSAGES.common.retry}
        </button>
      )}
    </div>
  );
}
