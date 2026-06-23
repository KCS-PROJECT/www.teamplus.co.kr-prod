'use client';

import { ReactNode, useEffect, useState } from 'react';
import { isNativeApp, isClient } from '@/lib/environment';
import { cn } from '@/lib/utils';

/**
 * NativeAwareLayout - 네이티브 환경 인식 레이아웃
 *
 * 하이브리드 앱에서 네이티브(Flutter) 환경인지 웹 브라우저인지 감지하여
 * 적절한 UI를 렌더링합니다.
 *
 * - Native 환경: body 영역만 노출 (헤더/바텀네비는 Flutter에서 제공)
 * - Web 환경: 웹용 헤더/바텀네비 포함
 *
 * Design 7 Principles:
 * - No gradients, no blur effects
 * - Solid backgrounds only
 * - Human-made design feel
 */

interface NativeAwareLayoutProps {
  children: ReactNode;
  /** 웹 환경에서 표시할 헤더 컴포넌트 */
  webHeader?: ReactNode;
  /** 웹 환경에서 표시할 바텀 네비게이션 */
  webBottomNav?: ReactNode;
  /** 하단 네비게이션이 있는지 여부 (패딩 계산용) */
  hasBottomNav?: boolean;
  /** 추가 클래스명 */
  className?: string;
  /** body 영역 클래스명 */
  bodyClassName?: string;
  /** 스크롤 가능 여부 */
  scrollable?: boolean;
  /** 배경색 (기본: slate-50) */
  bgColor?: 'white' | 'slate-50' | 'slate-100';
}

export function NativeAwareLayout({
  children,
  webHeader,
  webBottomNav,
  hasBottomNav = true,
  className,
  bodyClassName,
  scrollable = true,
  bgColor = 'slate-50',
}: NativeAwareLayoutProps) {
  const [isNative, setIsNative] = useState<boolean | null>(null);

  useEffect(() => {
    // 클라이언트에서만 환경 감지
    if (isClient()) {
      setIsNative(isNativeApp());
    }
  }, []);

  // SSR 또는 초기 로딩 시 - 기본 렌더링 (깜빡임 방지)
  if (isNative === null) {
    return (
      <div
        className={cn(
          'min-h-screen',
          bgColor === 'white' && 'bg-white dark:bg-rink-900',
          bgColor === 'slate-50' && 'bg-wbg dark:bg-rink-900',
          bgColor === 'slate-100' && 'bg-wline-2 dark:bg-rink-900',
          className
        )}
      >
        <main
          className={cn(
            'flex-1',
            scrollable && 'overflow-y-auto',
            hasBottomNav && 'pb-24',
            bodyClassName
          )}
        >
          {children}
        </main>
      </div>
    );
  }

  // Native 환경 - body 영역만 노출 (헤더/네비는 Flutter에서 제공)
  if (isNative) {
    return (
      <div
        className={cn(
          'min-h-screen',
          bgColor === 'white' && 'bg-white dark:bg-rink-900',
          bgColor === 'slate-50' && 'bg-wbg dark:bg-rink-900',
          bgColor === 'slate-100' && 'bg-wline-2 dark:bg-rink-900',
          className
        )}
      >
        <main
          className={cn(
            'flex-1',
            scrollable && 'overflow-y-auto',
            bodyClassName
          )}
        >
          {children}
        </main>
      </div>
    );
  }

  // Web 환경 - 웹용 헤더/바텀네비 포함
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col',
        bgColor === 'white' && 'bg-white dark:bg-rink-900',
        bgColor === 'slate-50' && 'bg-wbg dark:bg-rink-900',
        bgColor === 'slate-100' && 'bg-wline-2 dark:bg-rink-900',
        className
      )}
    >
      {/* 웹용 헤더 */}
      {webHeader}

      {/* 메인 콘텐츠 영역 */}
      <main
        className={cn(
          'flex-1',
          scrollable && 'overflow-y-auto',
          hasBottomNav && 'pb-24',
          bodyClassName
        )}
      >
        {children}
      </main>

      {/* 웹용 바텀 네비게이션 */}
      {webBottomNav}
    </div>
  );
}

/**
 * useNativeEnvironment - 네이티브 환경 감지 훅
 *
 * 컴포넌트에서 직접 네이티브 환경을 감지해야 할 때 사용
 */
export function useNativeEnvironment() {
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isClient()) {
      setIsNative(isNativeApp());
      setIsLoading(false);
    }
  }, []);

  return {
    isNative,
    isWeb: isNative === false,
    isLoading,
  };
}

/**
 * NativeOnly - 네이티브 환경에서만 렌더링
 */
export function NativeOnly({ children }: { children: ReactNode }) {
  const { isNative, isLoading } = useNativeEnvironment();

  if (isLoading || !isNative) {
    return null;
  }

  return <>{children}</>;
}

/**
 * WebOnly - 웹 환경에서만 렌더링
 */
export function WebOnly({ children }: { children: ReactNode }) {
  const { isWeb, isLoading } = useNativeEnvironment();

  if (isLoading || !isWeb) {
    return null;
  }

  return <>{children}</>;
}
