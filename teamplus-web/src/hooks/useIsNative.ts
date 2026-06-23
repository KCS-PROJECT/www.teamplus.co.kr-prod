"use client";

import { useState, useEffect, useCallback } from "react";
import { devLog } from "@/lib/logger";

/**
 * 환경 감지 함수들 (동기적으로 실행)
 */

/** User-Agent 기반 Native 감지 (가장 빠르고 신뢰할 수 있음) */
function checkUserAgent(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  return ua.includes("teamplusApp") || ua.includes("Flutter");
}

/** FlutterBridge 객체 존재 확인 */
function checkFlutterBridge(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    typeof window.FlutterBridge !== "undefined" &&
    window.FlutterBridge !== null &&
    typeof window.FlutterBridge.auth !== "undefined"
  );
}

/** flutter_inappwebview 객체 존재 확인 */
function checkInAppWebView(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return typeof window.flutter_inappwebview !== "undefined";
}

/** 모든 방법으로 Native 환경 확인 */
function detectNativeEnvironment(): boolean {
  // 1. User-Agent (가장 빠르고 신뢰할 수 있음 - JS 주입 전에도 작동)
  if (checkUserAgent()) {
    return true;
  }
  // 2. FlutterBridge 객체 (JS 주입 후 사용 가능)
  if (checkFlutterBridge()) {
    return true;
  }
  // 3. flutter_inappwebview 객체
  if (checkInAppWebView()) {
    return true;
  }
  return false;
}

/**
 * 클라이언트 환경에서 즉시 실행되는 초기 감지
 * SSR에서는 null 반환
 */
function getInitialNativeState(): boolean | null {
  if (typeof window === "undefined") {
    return null; // SSR
  }
  // 클라이언트에서는 즉시 User-Agent 확인
  return checkUserAgent();
}

/**
 * useIsNative Hook
 *
 * Flutter 네이티브 앱 환경을 안정적으로 감지하는 훅.
 *
 * 핵심 개선사항:
 * 1. 클라이언트에서 즉시 User-Agent 확인 (useState 초기값)
 * 2. SSR에서는 isReady=false로 렌더링 대기
 * 3. Bridge 주입 지연에 대비한 재시도 메커니즘
 *
 * @returns { isNative: boolean | null, isReady: boolean }
 * - isNative: 네이티브 환경 여부 (null은 SSR)
 * - isReady: 환경 감지 완료 여부
 *
 * @example
 * const { isNative, isReady } = useIsNative();
 * if (!isReady || isNative) return null; // 네이티브에서 헤더 숨김
 */
export function useIsNative(): { isNative: boolean | null; isReady: boolean } {
  // 클라이언트에서는 즉시 User-Agent로 초기값 설정
  const [isNative, setIsNative] = useState<boolean | null>(() =>
    getInitialNativeState(),
  );
  const [isReady, setIsReady] = useState<boolean>(() => {
    // 클라이언트에서 User-Agent로 이미 native 감지되면 즉시 ready
    if (typeof window !== "undefined" && checkUserAgent()) {
      return true;
    }
    return false;
  });

  const performDetection = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const native = detectNativeEnvironment();

    if (process.env.NODE_ENV === "development") {
      devLog("[useIsNative] 환경 감지 결과:", {
        isNative: native,
        userAgent: checkUserAgent(),
        flutterBridge: checkFlutterBridge(),
        inAppWebView: checkInAppWebView(),
        ua: navigator.userAgent.substring(0, 80),
      });
    }

    setIsNative(native);
    setIsReady(true);
  }, []);

  useEffect(() => {
    // SSR 환경에서는 실행하지 않음
    if (typeof window === "undefined") {
      return;
    }

    // User-Agent로 이미 native로 판정된 경우, 추가 확인 불필요
    if (isNative === true && isReady === true) {
      return;
    }

    // 즉시 한 번 감지 실행
    performDetection();

    // Bridge 주입 지연에 대비한 재확인 (User-Agent가 false인 경우만)
    // Bridge가 늦게 주입될 수 있으므로 몇 번 더 확인
    if (!checkUserAgent()) {
      const timeouts = [50, 150, 300];
      const timers = timeouts.map((delay, index) =>
        setTimeout(() => {
          if (detectNativeEnvironment()) {
            if (process.env.NODE_ENV === "development") {
              devLog(`[useIsNative] Bridge 감지됨 (${delay}ms 후)`);
            }
            setIsNative(true);
            setIsReady(true);
          } else if (index === timeouts.length - 1) {
            // 마지막 재시도 후에도 미감지 → Web 환경 확정
            setIsNative(false);
            setIsReady(true);
          }
        }, delay),
      );

      return () => {
        timers.forEach(clearTimeout);
      };
    }
  }, [isNative, isReady, performDetection]);

  return { isNative, isReady };
}

export default useIsNative;
