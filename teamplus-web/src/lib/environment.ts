/**
 * 환경 감지 유틸리티
 *
 * 애플리케이션이 실행되는 환경(Native App, Web Browser, Server)을 감지합니다.
 * 하이브리드 앱에서 API 호출 방식과 토큰 저장 방식을 결정하는 데 사용됩니다.
 *
 * @example
 * import { getAppEnvironment, isNativeApp, isWebBrowser } from '@/lib/environment';
 *
 * if (isNativeApp()) {
 *   // Flutter Bridge를 통한 API 호출
 * } else {
 *   // Axios를 통한 직접 API 호출
 * }
 */

import { devLog } from "@/lib/logger";

/**
 * 앱 실행 환경 타입
 */
export type AppEnvironment = "native" | "web" | "server";

// Note: FlutterBridge 타입은 native-bridge.ts에서 이미 선언되어 있음
// 여기서는 window 객체의 존재 여부만 확인

/**
 * Flutter Bridge 사용 가능 여부 확인
 * FlutterBridge.auth가 있으면 인증 관련 기능 사용 가능
 */
export function isFlutterBridgeAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof window.FlutterBridge !== "undefined" &&
    window.FlutterBridge !== null &&
    typeof window.FlutterBridge.auth !== "undefined"
  );
}

/**
 * Flutter InAppWebView 환경 여부 확인
 */
export function isFlutterInAppWebView(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return typeof window.flutter_inappwebview !== "undefined";
}

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
 * 현재 앱 실행 환경 감지
 *
 * @returns 'native' | 'web' | 'server'
 *
 * - native: Flutter 앱 내 WebView 환경 (Bridge 사용 가능)
 * - web: 일반 웹 브라우저 환경 (Axios 사용)
 * - server: Node.js 서버 환경 (SSR/SSG)
 */
export function getAppEnvironment(): AppEnvironment {
  // SSR/Node.js 환경
  if (typeof window === "undefined") {
    return "server";
  }

  // Flutter Native App 환경 감지 (3가지 방법)
  // 1. User-Agent 기반 감지 (가장 빠름 - JavaScript 주입 전에도 동작)
  // 2. FlutterBridge 객체 존재 여부
  // 3. flutter_inappwebview 객체 존재 여부
  if (
    isNativeAppByUserAgent() ||
    isFlutterBridgeAvailable() ||
    isFlutterInAppWebView()
  ) {
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

/**
 * 환경 정보 로깅 (개발용)
 */
export function logEnvironment(): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const env = getAppEnvironment();
  devLog("[Environment]", {
    environment: env,
    isNativeApp: isNativeApp(),
    isWebBrowser: isWebBrowser(),
    isServer: isServer(),
    hasFlutterBridge: isFlutterBridgeAvailable(),
    hasInAppWebView: isFlutterInAppWebView(),
  });
}

/**
 * 환경 정보 로그 출력 (알림/메뉴 버튼 클릭 시 호출)
 * @param source 클릭 소스 (예: 'notification', 'menu', 'settings')
 * @param pageName 현재 페이지 이름 (예: 'parent', 'coach', 'admin')
 */
export function logEnvironmentInfo(source: string, pageName: string): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const env = getAppEnvironment();
  const timestamp = new Date().toISOString();
  const userAgent =
    typeof window !== "undefined" ? window.navigator.userAgent : "unknown";
  const isFlutterWebView =
    userAgent.includes("teamplusApp") || userAgent.includes("Flutter");

  const logData = {
    timestamp,
    source,
    page: pageName,
    environment: env,
    isNative: isNativeApp(),
    isWeb: isWebBrowser(),
    hasFlutterBridge: isFlutterBridgeAvailable(),
    hasInAppWebView: isFlutterInAppWebView(),
    isFlutterWebView,
    userAgent: userAgent.substring(0, 100),
  };

  // 콘솔 로그 출력 (개발/프로덕션 모두)
  devLog(
    `\n🔍 [ENV LOG] ${source.toUpperCase()} clicked on ${pageName} page\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📱 환경: ${env === "native" ? "🟢 Native App (Flutter)" : "🌐 Web Browser"}\n` +
      `📄 페이지: ${pageName}\n` +
      `🕐 시간: ${timestamp}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 상세 정보:\n` +
      `  • isNativeApp(): ${logData.isNative}\n` +
      `  • isWebBrowser(): ${logData.isWeb}\n` +
      `  • hasFlutterBridge: ${logData.hasFlutterBridge}\n` +
      `  • hasInAppWebView: ${logData.hasInAppWebView}\n` +
      `  • isFlutterWebView: ${logData.isFlutterWebView}\n` +
      `  • User-Agent: ${logData.userAgent}...\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  );

  // 구조화된 로그 데이터도 출력
  devLog("[ENV LOG DATA]", logData);
}

const environment = {
  getAppEnvironment,
  isNativeApp,
  isWebBrowser,
  isServer,
  isClient,
  isFlutterBridgeAvailable,
  isFlutterInAppWebView,
  logEnvironment,
  logEnvironmentInfo,
};

export default environment;
