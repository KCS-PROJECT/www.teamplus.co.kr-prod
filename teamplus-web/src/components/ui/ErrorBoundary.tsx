'use client';

import React, { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from './Button';
import { Icon } from './Icon';
import { devError } from '@/lib/logger';

/**
 * Error Boundary Component - TEAMPLUS Design System
 *
 * React 컴포넌트 트리에서 발생하는 JavaScript 에러를 포착하고
 * 사용자에게 친절한 에러 UI를 표시합니다.
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // 또는 기본 UI 사용
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 커스텀 에러 UI */
  fallback?: ReactNode;
  /** 에러 발생 시 콜백 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 에러 리포팅 여부 (기본: true) */
  reportError?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError, reportError = true } = this.props;

    // 에러 콜백 호출
    onError?.(error, errorInfo);

    // 개발 환경에서 에러 로깅
    if (process.env.NODE_ENV === 'development') {
      devError('ErrorBoundary caught an error:', error);
      devError('Error info:', errorInfo);
    }

    // 프로덕션 에러 리포팅 (Sentry 연동)
    if (reportError && process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        extra: {
          componentStack: errorInfo.componentStack,
        },
        tags: {
          source: 'ErrorBoundary',
        },
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // 커스텀 fallback이 있으면 사용
      if (fallback) {
        return fallback;
      }

      // 기본 에러 UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <Icon
              name="error"
              className="text-red-600 dark:text-red-400 text-3xl"
              decorative={false}
              ariaLabel="오류 발생"
            />
          </div>

          <h2 className="text-lg font-semibold text-wtext-1 dark:text-white mb-2">
            문제가 발생했습니다
          </h2>

          <p className="text-sm text-wtext-2 dark:text-rink-300 mb-6 max-w-md">
            죄송합니다. 페이지를 불러오는 중 오류가 발생했습니다.
            {process.env.NODE_ENV === 'development' && error && (
              <span className="block mt-2 font-mono text-xs text-red-600 dark:text-red-400">
                {error.message}
              </span>
            )}
          </p>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={this.handleRetry}
            >
              다시 시도
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              페이지 새로고침
            </Button>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * 에러 바운더리 래퍼 함수형 컴포넌트
 * React hooks와 함께 사용할 때 유용
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

export default ErrorBoundary;
