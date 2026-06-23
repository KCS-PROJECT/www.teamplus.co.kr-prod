/**
 * GET /api/logs/stream — Server-Sent Events 실시간 로그 push (v8.6 P5-3, 2026-05-20)
 *
 * Query: project, category (tail/route.ts와 동일)
 * 동작:
 *   1. 초기 100줄 즉시 전송
 *   2. fs.watch로 파일 변경 감지 → 새 라인만 즉시 push
 *   3. 클라이언트 연결 종료 시 watcher cleanup
 *
 * 인증: tail/route.ts와 동일 ADMIN/SYSTEM/OPER/DIRECTOR/ACADEMY_DIRECTOR
 *
 * 사용 (클라이언트):
 *   const es = new EventSource('/api/logs/stream?project=backend&category=system');
 *   es.onmessage = (ev) => console.log(JSON.parse(ev.data));
 */
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ALLOWED_ROLES = new Set([
  "ADMIN",
  "SYSTEM",
  "OPER",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
]);

const PROJECT_ROOTS = {
  backend: path.resolve(process.cwd(), "..", "teamplus-backend"),
  web: path.resolve(process.cwd(), "..", "teamplus-web"),
  admin: process.cwd(),
  home: path.resolve(process.cwd(), "..", "teamplus-home"),
} as const;

type Project = keyof typeof PROJECT_ROOTS;

const NORMAL_CATEGORIES = new Set([
  "access",
  "input",
  "output",
  "activity",
  "auth",
  "payment",
  "database",
  "system",
]);

const ERROR_CATEGORIES = new Set([
  "errors-server",
  "errors-transaction",
  "errors-client",
  "errors-auth",
  "errors-database",
  "errors-external",
]);

function formatKSTDate(date: Date = new Date()) {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", ...opts }).format(date);
  return {
    year: fmt({ year: "numeric" }),
    month: fmt({ month: "2-digit" }),
    day: fmt({ day: "2-digit" }),
  };
}

function resolveLogFile(project: Project, category: string): string | null {
  const root = PROJECT_ROOTS[project];
  const { year, month, day } = formatKSTDate();
  const datedDir = path.join(root, "log", year, month, day);

  if (NORMAL_CATEGORIES.has(category)) {
    return path.join(datedDir, `${category}.log`);
  }
  if (category === "errors" || category === "errors-_all") {
    return path.join(datedDir, "errors", "_all.jsonl");
  }
  if (ERROR_CATEGORIES.has(category)) {
    const sub = category.replace(/^errors-/, "");
    return path.join(datedDir, "errors", `${sub}.log`);
  }
  return null;
}

function checkAuth(
  req: NextRequest,
): { ok: true } | { ok: false; status: number; reason: string } {
  const token = req.cookies.get("teamplus_access_token")?.value;
  if (!token) return { ok: false, status: 401, reason: "NO_TOKEN" };
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, status: 401, reason: "MALFORMED_TOKEN" };
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as { exp?: number; userType?: string; role?: string };
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { ok: false, status: 401, reason: "TOKEN_EXPIRED" };
    }
    const role = payload.userType ?? payload.role;
    if (!role) return { ok: false, status: 401, reason: "NO_ROLE" };
    if (!ADMIN_ALLOWED_ROLES.has(role)) {
      return { ok: false, status: 403, reason: "INSUFFICIENT_ROLE" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, reason: "INVALID_TOKEN" };
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  // 인증 가드
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", reason: auth.reason },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "backend") as Project;
  const category = url.searchParams.get("category") ?? "system";

  if (!PROJECT_ROOTS[project]) {
    return NextResponse.json(
      { success: false, error: "INVALID_PROJECT" },
      { status: 400 },
    );
  }
  const filePath = resolveLogFile(project, category);
  if (!filePath) {
    return NextResponse.json(
      { success: false, error: "INVALID_CATEGORY" },
      { status: 400 },
    );
  }

  // SSE ReadableStream — fs.watch 기반 실시간 push
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastSize = 0;
      let closed = false;
      let watcher: fs.FSWatcher | null = null;
      let heartbeatTimer: NodeJS.Timeout | null = null;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* stream closed */
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        watcher?.close();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 1) 초기 — 파일 존재 확인 + 마지막 50줄 전송
      send("connected", { project, category, file: filePath });

      if (!fs.existsSync(filePath)) {
        send("warning", { message: "FILE_NOT_FOUND_YET", file: filePath });
      } else {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n").filter((l) => l.length > 0);
          const initial = lines.slice(-50);
          for (const line of initial) {
            send("line", { line });
          }
          lastSize = Buffer.byteLength(content, "utf-8");
        } catch (err) {
          send("error", { message: (err as Error).message });
        }
      }

      // 2) fs.watch — 변경 감지 시 마지막 size 이후 chunk만 push
      const watchDir = path.dirname(filePath);
      try {
        if (fs.existsSync(watchDir)) {
          watcher = fs.watch(watchDir, (eventType, filename) => {
            if (closed) return;
            if (filename && !filePath.endsWith(filename)) return;
            try {
              if (!fs.existsSync(filePath)) return;
              const stat = fs.statSync(filePath);
              if (stat.size <= lastSize) {
                // 파일이 회전됐을 가능성 (rotate 시 새 파일은 0byte로 시작)
                if (stat.size < lastSize) {
                  send("info", { message: "FILE_ROTATED" });
                  lastSize = 0;
                }
                return;
              }
              // delta만 read
              const fd = fs.openSync(filePath, "r");
              const buf = Buffer.alloc(stat.size - lastSize);
              fs.readSync(fd, buf, 0, buf.length, lastSize);
              fs.closeSync(fd);
              const chunk = buf.toString("utf-8");
              const newLines = chunk.split("\n").filter((l) => l.length > 0);
              for (const line of newLines) {
                send("line", { line });
              }
              lastSize = stat.size;
            } catch (err) {
              send("error", { message: (err as Error).message });
            }
          });
        }
      } catch (err) {
        send("error", { message: `WATCH_FAILED: ${(err as Error).message}` });
      }

      // 3) heartbeat — 30초마다 ping (프록시 idle timeout 회피)
      heartbeatTimer = setInterval(() => {
        send("ping", { ts: new Date().toISOString() });
      }, 30_000);

      // 4) 클라이언트 abort 시 cleanup
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // nginx 버퍼링 차단
    },
  });
}
