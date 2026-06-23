/**
 * 환경 감지 유틸리티 (teamplus-admin)
 *
 * 애플리케이션이 실행되는 환경(Native App, Web Browser, Server)을 감지합니다.
 * Flutter 앱 내 WebView에서 실행될 때 UI 요소를 조건부로 표시하는 데 사용됩니다.
 */

/**
 * 앱 실행 환경 타입
 */
export type AppEnvironment = "native" | "web" | "server";

/**
 * User-Agent 기반 Native App 환경 감지
 * Flutter WebView의 커스텀 User-Agent에 'teamplusApp' 또는 'Flutter'가 포함되어 있으면 true
 * 이 방법은 JavaScript Bridge 주입 타이밍과 관계없이 즉시 감지 가능
 */
export function isNativeAppByUserAgent(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  return userAgent.includes("teamplusApp") || userAgent.includes("Flutter");
}

/**
 * Flutter InAppWebView 환경 여부 확인
 */
export function isFlutterInAppWebView(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof (window as unknown as Record<string, unknown>)
      .flutter_inappwebview !== "undefined"
  );
}

/**
 * 현재 앱 실행 환경 감지
 *
 * @returns 'native' | 'web' | 'server'
 *
 * - native: Flutter 앱 내 WebView 환경
 * - web: 일반 웹 브라우저 환경
 * - server: Node.js 서버 환경 (SSR/SSG)
 */
export function getAppEnvironment(): AppEnvironment {
  // SSR/Node.js 환경
  if (typeof window === "undefined") {
    return "server";
  }

  // Flutter Native App 환경 감지 (2가지 방법)
  // 1. User-Agent 기반 감지 (가장 빠름 - JavaScript 주입 전에도 동작)
  // 2. flutter_inappwebview 객체 존재 여부
  if (isNativeAppByUserAgent() || isFlutterInAppWebView()) {
    return "native";
  }

  // 일반 웹 브라우저 환경
  return "web";
}

/**
 * Native App 환경인지 확인
 */
export function isNativeApp(): boolean {
  return getAppEnvironment() === "native";
}

/**
 * Web Browser 환경인지 확인
 */
export function isWebBrowser(): boolean {
  return getAppEnvironment() === "web";
}

/**
 * Server(SSR) 환경인지 확인
 */
export function isServer(): boolean {
  return getAppEnvironment() === "server";
}

/**
 * Client Side 환경인지 확인 (native 또는 web)
 */
export function isClient(): boolean {
  return typeof window !== "undefined";
}

const environment = {
  getAppEnvironment,
  isNativeApp,
  isWebBrowser,
  isServer,
  isClient,
  isNativeAppByUserAgent,
  isFlutterInAppWebView,
};

export default environment;
