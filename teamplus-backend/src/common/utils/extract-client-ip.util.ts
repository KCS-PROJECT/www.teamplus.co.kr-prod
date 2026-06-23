import type { Request } from "express";

/**
 * 호출자 IP 추출 — Reverse Proxy(ALB·Nginx·Cloudflare) 환경 대응 공통 유틸.
 *
 * 우선순위:
 *   1. `X-Forwarded-For` 헤더의 첫 번째 토큰 (프록시 체인에서 가장 원본에 가까운 클라이언트)
 *   2. `X-Real-IP` 헤더 (Nginx 등에서 단일 IP로 전달)
 *   3. `req.ip` (Express `trust proxy` 활성화 시 XFF 자동 처리 결과)
 *   4. `req.socket.remoteAddress` (소켓 레벨 최종 fallback)
 *
 * 결과 IP는 ApiLifecycleContext.clientIp 및 AuditLog.ipAddress 등에 사용된다.
 * 검증되지 않은 사용자 입력이므로 로깅/감사 외 보안 결정에 신뢰해서는 안 된다.
 */
export function extractClientIp(req: Request): string | undefined {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(xff) && xff.length > 0 && typeof xff[0] === "string") {
    const first = xff[0].trim();
    if (first) return first;
  }

  const xRealIp = req.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.length > 0) {
    return xRealIp.trim();
  }

  if (req.ip) return req.ip;

  return req.socket?.remoteAddress ?? undefined;
}
