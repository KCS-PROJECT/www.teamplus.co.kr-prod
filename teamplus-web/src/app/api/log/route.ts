/**
 * POST /api/log — 클라이언트 활동 로그 수집 엔드포인트
 *
 * `src/lib/activity-collector.ts` 가 5초 주기 / 25개 batch 로
 * `{ events: ActivityEvent[] }` 를 전송한다. 각 이벤트를 카테고리별로
 * `serverLogger` 에 기록한다 (JSON Lines 파일 append).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverLogger } from "@/lib/server-log/server-logger";
import type { LogLevel } from "@/lib/server-log/file-path.util";

// fs.appendFileSync 사용 → Node.js 런타임 필수 (Edge 불가), 정적 최적화 비활성
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClientLogEvent {
  ts?: string;
  category?: "access" | "activity" | "auth" | "system" | "error";
  level?: LogLevel;
  action?: string;
  message?: string;
  url?: string;
  resource?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { events?: ClientLogEvent[] };
    const events = Array.isArray(body?.events) ? body.events : [];

    for (const ev of events) {
      const level: LogLevel = ev.level ?? "info";
      const message = ev.message ?? ev.action ?? "client-activity";
      const ctx = {
        action: ev.action,
        url: ev.url,
        resource: ev.resource,
        status: ev.status,
        durationMs: ev.durationMs,
        userId: ev.userId,
        sessionId: ev.sessionId,
        requestId: ev.requestId,
        clientTs: ev.ts,
        ...ev.meta,
      };

      switch (ev.category) {
        case "access":
          serverLogger.access(level, message, ctx);
          break;
        case "auth":
          serverLogger.authLog(level, message, ctx);
          break;
        case "error":
          serverLogger.error(message, ev.error, ctx);
          break;
        case "system":
          serverLogger.system(level, message, ctx);
          break;
        case "activity":
        default:
          serverLogger.activity(level, message, ctx);
          break;
      }
    }

    return NextResponse.json({ ok: true, count: events.length });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
