/**
 * TEAMPLUS 공통 환경 감지 유틸리티
 * Web, Admin에서 공통으로 사용하는 환경 감지 함수
 */

export type AppEnvironment = "native" | "web" | "server";

/** Flutter InAppWebView 환경 여부 확인 */
export function isFlutterInAppWebView(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as Record<string, unknown>).flutter_inappwebview !==
    "undefined"
  );
}

/** User-Agent 기반 Native App 환경 감지 */
export function isNativeAppByUserAgent(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false;
  const userAgent = navigator.userAgent;
  return userAgent.includes("teamplusApp") || userAgent.includes("Flutter");
}

/** 현재 앱 실행 환경 감지 */
export function getAppEnvironment(): AppEnvironment {
  if (typeof window === "undefined") return "server";
  if (isNativeAppByUserAgent() || isFlutterInAppWebView()) return "native";
  return "web";
}

/** Native App 환경인지 확인 */
export function isNativeApp(): boolean {
  return getAppEnvironment() === "native";
}

/** Web Browser 환경인지 확인 */
export function isWebBrowser(): boolean {
  return getAppEnvironment() === "web";
}

/** Server(SSR) 환경인지 확인 */
export function isServer(): boolean {
  return getAppEnvironment() === "server";
}

/** Client Side 환경인지 확인 (native 또는 web) */
export function isClient(): boolean {
  return typeof window !== "undefined";
}
