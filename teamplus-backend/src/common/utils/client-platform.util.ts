/**
 * client-platform.util — X-Client-Platform 헤더를 감사 로그용 클라이언트 구분값으로 정규화.
 *
 *   admin(5002) → 'admin' · web(5001) → 'web' · Flutter 앱(ios/android/flutter) → 'app'
 *   그 외/미상 → 'unknown'
 */
export type AuditPlatform = "web" | "admin" | "app" | "unknown";

export function normalizeAuditPlatform(raw?: string | null): AuditPlatform {
  const v = (raw ?? "").toString().toLowerCase().trim();
  if (v === "admin") return "admin";
  if (v === "web") return "web";
  if (v === "app" || v === "flutter" || v === "ios" || v === "android") {
    return "app";
  }
  return "unknown";
}
