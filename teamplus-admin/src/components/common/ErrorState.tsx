'use client';

/**
 * ErrorState - 에러 + 재시도 공통 컴포넌트
 * AI 스타일 금지: gradient, blur 미사용
 */

import { AlertTriangle, RefreshCw, WifiOff, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ErrorType = 'generic' | 'network' | 'unauthorized' | 'not-found';

interface ErrorStateProps {
  /** 에러 타입 (아이콘/메시지 자동 결정) */
  type?: ErrorType;
  /** 커스텀 제목 */
  title?: string;
  /** 커스텀 설명 */
  message?: string;
  /** 재시도 핸들러 */
  onRetry?: () => void;
  /** 재시도 버튼 로딩 상태 */
  isRetrying?: boolean;
  /** 최소 높이 */
  minHeight?: number;
  /** 추가 클래스 */
  className?: string;
}

const ERROR_CONFIG: Record<
  ErrorType,
  {
    icon: typeof AlertTriangle;
    iconBg: string;
    iconColor: string;
    defaultTitle: string;
    defaultMessage: string;
  }
> = {
  generic: {
    icon: AlertTriangle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    defaultTitle: '오류가 발생했습니다',
    defaultMessage: '일시적인 오류가 발생했습니다. 다시 시도해주세요.',
  },
  network: {
    icon: WifiOff,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    defaultTitle: '네트워크 연결 오류',
    defaultMessage: '인터넷 연결을 확인하고 다시 시도해주세요.',
  },
  unauthorized: {
    icon: Lock,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    defaultTitle: '접근 권한이 없습니다',
    defaultMessage: '이 페이지에 접근할 권한이 없습니다.',
  },
  'not-found': {
    icon: AlertTriangle,
    iconBg: 'bg-slate-100 dark:bg-slate-700',
    iconColor: 'text-slate-500 dark:text-slate-400',
    defaultTitle: '데이터를 찾을 수 없습니다',
    defaultMessage: '요청한 데이터가 존재하지 않습니다.',
  },
};

export function ErrorState({
  type = 'generic',
  title,
  message,
  onRetry,
  isRetrying = false,
  minHeight = 300,
  className,
}: ErrorStateProps) {
  const config = ERROR_CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center px-6', className)}
      style={{ minHeight }}
    >
      <div className={cn('w-14 h-14 rounded-full flex items-center justify-center mb-4', config.iconBg)}>
        <Icon className={cn('w-7 h-7', config.iconColor)} />
      </div>

      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
        {title ?? config.defaultTitle}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
        {message ?? config.defaultMessage}
      </p>

      {onRetry && (
        <Button
          onClick={onRetry}
          disabled={isRetrying}
          variant="outline"
          className="gap-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
        >
          <RefreshCw className={cn('w-4 h-4', isRetrying && 'animate-spin')} />
          {isRetrying ? '재시도 중...' : '다시 시도'}
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
