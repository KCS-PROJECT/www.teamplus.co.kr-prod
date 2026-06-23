"use client";

/**
 * 오프라인 상태 표시 컴포넌트
 *
 * 네트워크 연결이 끊겼을 때 사용자에게 알림을 표시합니다.
 * 온라인으로 복구되면 자동으로 숨겨집니다.
 *
 * 주의: Native App (Flutter WebView) 환경에서는 navigator.onLine이 신뢰할 수 없으므로
 * 이 컴포넌트가 자동으로 비활성화됩니다.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <OfflineIndicator />
 *       <MainContent />
 *     </>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { Icon } from "@/components/ui/Icon";

/**
 * Native App 환경인지 확인
 * FlutterBridge 또는 flutter_inappwebview 객체 존재 여부로 판단
 */
function checkIsNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  // flutter_inappwebview는 가장 먼저 주입됨
  if (typeof window.flutter_inappwebview !== "undefined") return true;

  // FlutterBridge 체크
  if (
    typeof window.FlutterBridge !== "undefined" &&
    window.FlutterBridge !== null
  )
    return true;

  // User Agent에 teamplusApp 또는 Flutter가 포함되어 있는지 체크
  const userAgent = window.navigator?.userAgent || "";
  if (userAgent.includes("teamplusApp") || userAgent.includes("wv"))
    return true;

  return false;
}

interface OfflineIndicatorProps {
  /** 표시 위치 */
  position?: "top" | "bottom";
  /** 온라인 복구 시 표시할 메시지 지속 시간 (ms) */
  onlineMessageDuration?: number;
  /** 대기 중인 요청 수 표시 여부 */
  showPendingCount?: boolean;
}

export function OfflineIndicator({
  position = "top",
  onlineMessageDuration = 3000,
  showPendingCount = true,
}: OfflineIndicatorProps) {
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(true); // 초기값 true로 설정 (깜빡임 방지)

  // Native 앱 환경 감지 (클라이언트 사이드에서만)
  useEffect(() => {
    // 즉시 체크
    setIsNativeApp(checkIsNativeApp());

    // FlutterBridge 주입 타이밍을 고려해 추가 체크
    const timer = setTimeout(() => {
      setIsNativeApp(checkIsNativeApp());
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  const handleOnline = useCallback(() => {
    if (wasOffline) {
      setShowOnlineMessage(true);
      setTimeout(() => {
        setShowOnlineMessage(false);
      }, onlineMessageDuration);
    }
    setWasOffline(false);
  }, [wasOffline, onlineMessageDuration]);

  const handleOffline = useCallback(() => {
    setWasOffline(true);
    setShowOnlineMessage(false);
  }, []);

  const { isOffline, pendingRequestCount } = useNetworkStatus({
    onOnline: handleOnline,
    onOffline: handleOffline,
  });

  // 초기 오프라인 상태 감지
  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
    }
  }, [isOffline]);

  // Native 앱 환경에서는 navigator.onLine이 신뢰할 수 없으므로 비활성화
  if (isNativeApp) {
    return null;
  }

  // 아무것도 표시할 필요 없으면 렌더링 안 함
  if (!isOffline && !showOnlineMessage) {
    return null;
  }

  const positionClasses =
    position === "top" ? "top-0 left-0 right-0" : "bottom-0 left-0 right-0";

  // 오프라인 상태
  if (isOffline) {
    return (
      <div
        className={`fixed ${positionClasses} z-50 px-4 py-3 bg-amber-500 text-white shadow-md animate-slide-down`}
        role="alert"
        aria-live="assertive"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <Icon name="wifi_off" className="text-xl" />
          <span className="font-medium">오프라인 상태입니다</span>
          {showPendingCount && pendingRequestCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-600 rounded-full text-sm">
              대기 중: {pendingRequestCount}
            </span>
          )}
          <span className="text-amber-100 text-sm ml-2">
            연결이 복구되면 자동으로 동기화됩니다
          </span>
        </div>
      </div>
    );
  }

  // 온라인 복구 메시지
  if (showOnlineMessage) {
    return (
      <div
        className={`fixed ${positionClasses} z-50 px-4 py-3 bg-green-500 text-white shadow-md animate-slide-down`}
        role="status"
        aria-live="polite"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <Icon name="wifi" className="text-xl" />
          <span className="font-medium">온라인 상태로 복구되었습니다</span>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * 네트워크 상태 배지 (작은 아이콘 형태)
 *
 * 헤더나 상태 표시줄에서 작은 아이콘으로 네트워크 상태를 표시합니다.
 */
export function NetworkStatusBadge() {
  const { isOnline, isOffline, pendingRequestCount } = useNetworkStatus();

  // 온라인이고 대기 중인 요청이 없으면 표시 안 함
  if (isOnline && pendingRequestCount === 0) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isOffline
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-400"
      }`}
      title={
        isOffline ? "오프라인 상태" : `대기 중인 요청: ${pendingRequestCount}`
      }
    >
      <Icon
        name={isOffline ? "wifi_off" : "sync"}
        className={`text-sm ${!isOffline && "animate-spin"}`}
      />
      {isOffline ? "오프라인" : pendingRequestCount}
    </div>
  );
}

/**
 * 오프라인 상태 시 컨텐츠를 대체하는 래퍼
 *
 * 오프라인 상태에서 특정 컨텐츠를 대체 메시지로 교체합니다.
 */
export function OfflineFallback({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isOffline } = useNetworkStatus();

  if (isOffline) {
    return (
      fallback || (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Icon name="wifi_off" className="text-4xl text-wtext-3 mb-4" />
          <h3 className="text-lg font-medium text-wtext-2 dark:text-rink-100 mb-2">
            오프라인 상태입니다
          </h3>
          <p className="text-wtext-3 dark:text-rink-300">
            이 기능을 사용하려면 인터넷 연결이 필요합니다.
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}

export default OfflineIndicator;
