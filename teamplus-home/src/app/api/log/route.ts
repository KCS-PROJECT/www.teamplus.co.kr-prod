/**
 * POST /api/log — 클라이언트 활동 수집 Route Handler (v8.6, 2026-05-20)
 *
 * activity-collector가 5초 또는 25개 batch로 전송하는 ActivityEvent를 받아
 * - 서버 파일 (log/YYYY/MM/DD/*.log)에 카테고리별 기록
 * - 백엔드 /api/v1/logs/activity로 forward (실패 시 swallow — 로컬 파일은 안전망)
 *
 * 사용자 추적 가드: rate limit 60req/min/IP는 후속 P5에서 미들웨어로 추가
 */
import { NextRequest, NextResponse } from "next/server";
import { serverLogger } from "@/lib/server-log/server-logger";
import {
  checkRateLimit,
  extractClientIp,
} from "@/lib/server-log/rate-limit";

export const runtime = "nodejs"; // Edge runtime은 fs 사용 불가 — Node.js runtime 명시
export const dynamic = "force-dynamic"; // ISR 캐시 차단

interface ClientLogEvent {
  ts: string; // ISO timestamp (클라이언트 발생 시점)
  category?: string; // "access" | "activity" | "auth" | "system" | "error"
  level?: string; // "trace" | "debug" | "info" | "warn" | "error" | "fatal"
  action?: string; // PAGE_VIEW | CLICK | API_CALL | ERROR | LOGIN | LOGOUT
  message?: string;
  url?: string; // 페이지 경로
  resource?: string; // API URL · 클릭 대상 ID
  status?: number; // HTTP status
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // === v8.6 P5-1 Rate Limit — 60 req/min/IP ===
  const ip = extractClientIp(req);
  const rl = checkRateLimit(`log:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMIT_EXCEEDED", retryAfterSec: rl.retryAfterSec },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
        },
      },
    );
  }

  let events: ClientLogEvent[] = [];

  try {
    const body = (await req.json().catch(() => ({}))) as
      | { events?: ClientLogEvent[] }
      | ClientLogEvent[];
    events = Array.isArray(body) ? body : body.events ?? [];
  } catch (err) {
    serverLogger.errorAs("client", "[/api/log] body parse 실패", err as Error, {
      url: "/api/log",
      method: "POST",
    });
    return NextResponse.json({ success: false, error: "INVALID_BODY" }, { status: 400 });
  }

  if (events.length === 0) {
    return NextResponse.json({ success: true, accepted: 0 });
  }

  // 메타 (UA) — IP는 rate limit 단계에서 이미 추출됨
  const userAgent = req.headers.get("user-agent") ?? undefined;

  for (const ev of events) {
    try {
      const ctx = {
        ts: ev.ts,
        userId: ev.userId,
        sessionId: ev.sessionId,
        requestId: ev.requestId,
        action: ev.action,
        url: ev.url,
        resource: ev.resource,
        status: ev.status,
        durationMs: ev.durationMs,
        meta: ev.meta,
        ip,
        userAgent,
        clientCategory: ev.category,
      };

      if (ev.error || ev.category === "error" || (ev.status && ev.status >= 400)) {
        // 클라이언트 에러는 분류 (4xx → client, 5xx → server, network/unknown → server)
        serverLogger.error(
          ev.message ?? `[CLIENT_ERROR] ${ev.action ?? "ERROR"} ${ev.url ?? ""}`,
          ev.error,
          ctx,
        );
      } else if (ev.action === "API_CALL") {
        // API 호출은 access 카테고리
        serverLogger.access(
          (ev.level as any) ?? "info",
          ev.message ?? `${ev.action} ${ev.resource ?? ev.url ?? ""}`,
          ctx,
        );
      } else {
        // 그 외 활동은 activity 카테고리
        serverLogger.activity(
          (ev.level as any) ?? "info",
          ev.message ?? `${ev.action ?? "EVENT"} ${ev.resource ?? ev.url ?? ""}`,
          ctx,
        );
      }
    } catch (err) {
      // 개별 이벤트 실패가 batch 전체를 깨지 않도록
      serverLogger.errorAs(
        "client",
        "[/api/log] 이벤트 기록 실패",
        err as Error,
        { eventSample: ev },
      );
    }
  }

  // (선택) 백엔드로 forward — 백엔드 DB(UserActivityLog)에 영속화
  // 실패해도 로컬 파일은 이미 기록됐으므로 swallow
  const forwardUrl =
    process.env.NEXT_PUBLIC_API_URL ?? process.env.BACKEND_URL ?? null;
  if (forwardUrl) {
    void fetch(`${forwardUrl.replace(/\/$/, "")}/logs/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events, source: "web", ip, userAgent }),
    }).catch(() => {
      /* swallow — 로컬 파일은 안전망 */
    });
  }

  return NextResponse.json(
    { success: true, accepted: events.length },
    {
      headers: {
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
      },
    },
  );
}
