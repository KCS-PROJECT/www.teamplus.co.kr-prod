/**
 * Bridge Error Handler Hook
 *
 * React 컴포넌트에서 Bridge Error Handler를 Toast와 연동합니다.
 *
 * @example
 * function App() {
 *   useBridgeErrorHandler(); // 최상위 컴포넌트에서 한 번만 호출
 *   return <MyApp />;
 * }
 */

import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { bridgeErrorHandler } from '@/services/bridge-error-handler';

/**
 * Bridge Error Handler를 Toast 시스템과 연동하는 훅
 *
 * ToastProvider 내부에서 한 번만 호출해야 합니다.
 * 일반적으로 최상위 레이아웃 컴포넌트에서 사용합니다.
 */
export function useBridgeErrorHandler(): void {
  const { toast } = useToast();

  useEffect(() => {
    // Toast 핸들러 등록
    bridgeErrorHandler.registerToastHandler({
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
    });

    // 클린업: 핸들러 해제
    return () => {
      bridgeErrorHandler.unregisterToastHandler();
    };
  }, [toast]);
}

export default useBridgeErrorHandler;
