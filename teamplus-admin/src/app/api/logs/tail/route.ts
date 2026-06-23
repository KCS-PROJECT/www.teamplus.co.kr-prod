/**
 * GET /api/logs/tail — 4개 프로젝트 통합 로그 tail API (v8.6, 2026-05-20)
 *
 * Query params:
 *   - project: 'backend' | 'web' | 'admin' | 'home'
 *   - category: 'access' | 'input' | 'output' | 'activity' | 'auth' | 'payment' | 'database' | 'system'
 *               | 'errors' | 'errors-server' | 'errors-transaction' | 'errors-client' | 'errors-auth'
 *               | 'errors-database' | 'errors-external'
 *   - lines: number (default 100, max 5000)
 *   - from: ISO timestamp (이 시점 이후의 라인만 반환 — polling 시 증분 가져오기)
 *
 * 보안: 미들웨어에서 ADMIN/SYSTEM 권한만 허용 (별도 가드 필요)
 */
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
 * v8.6 (2026-05-20) — 인증 가드
 * middleware.ts가 /api/* 를 제외하므로 직접 JWT 쿠키 검증
 * 운영 SoT: admin/src/middleware.ts의 ADMIN_ALLOWED_ROLES와 동일 정책
 * ============================================================ */
const ADMIN_ALLOWED_ROLES = new Set([
  "ADMIN",
  "SYSTEM",
  "OPER",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
]);

function checkAuth(
  req: NextRequest,
): { ok: true; role: string } | { ok: false; status: number; reason: string } {
  const token = req.cookies.get("teamplus_access_token")?.value;
  if (!token) return { ok: false, status: 401, reason: "NO_TOKEN" };

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, status: 401, reason: "MALFORMED_TOKEN" };
    }
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
    return { ok: true, role };
  } catch {
    return { ok: false, status: 401, reason: "INVALID_TOKEN" };
  }
}

// 4개 프로젝트 절대 경로 (같은 서버에 배포된 모노레포 기준)
const PROJECT_ROOTS = {
  backend: path.resolve(process.cwd(), "..", "teamplus-backend"),
  web: path.resolve(process.cwd(), "..", "teamplus-web"),
  admin: process.cwd(), // admin 자신
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

function formatKSTDate(date: Date = new Date()): {
  year: string;
  month: string;
  day: string;
} {
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  // === v8.6 인증 가드 — 미인증/권한부족 즉시 차단 ===
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
  const lines = Math.min(
    parseInt(url.searchParams.get("lines") ?? "100", 10) || 100,
    5000,
  );
  const fromTs = url.searchParams.get("from"); // ISO timestamp 또는 null

  if (!PROJECT_ROOTS[project]) {
    return NextResponse.json(
      { success: false, error: "INVALID_PROJECT", validProjects: Object.keys(PROJECT_ROOTS) },
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

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({
      success: true,
      project,
      category,
      file: filePath,
      exists: false,
      lines: [],
    });
  }

  try {
    // 파일 끝에서 lines개만 읽기 (대용량 파일 안전)
    const content = await fs.promises.readFile(filePath, "utf-8");
    let allLines = content.split("\n").filter((l) => l.length > 0);

    // from 필터 — JSON line에 ts/time 필드 있으면 그 이후만
    if (fromTs) {
      const fromMs = Date.parse(fromTs);
      if (!Number.isNaN(fromMs)) {
        allLines = allLines.filter((line) => {
          try {
            const obj = JSON.parse(line);
            const ts = obj.time ?? obj.ts;
            if (!ts) return true;
            return Date.parse(String(ts)) > fromMs;
          } catch {
            return true; // JSON 파싱 실패한 라인은 포함
          }
        });
      }
    }

    const tailLines = allLines.slice(-lines);
    return NextResponse.json({
      success: true,
      project,
      category,
      file: filePath,
      exists: true,
      total: allLines.length,
      returned: tailLines.length,
      lines: tailLines,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "READ_FAILED",
        detail: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
