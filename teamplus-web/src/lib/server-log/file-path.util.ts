/**
 * File Path Utility — teamplus-web 통합 로깅 시스템 (v8.6, 2026-05-20)
 *
 * Backend(teamplus-backend/src/logger/file-path.util.ts)와 동일한 카테고리·구조.
 * Node 표준 fs/path만 사용 — 외부 의존성 0.
 *
 * @server-only — Next.js Route Handler·middleware·server component에서만 import 가능
 */
import * as fs from "fs";
import * as path from "path";

/* ============================================================
 * 1. 타입 정의 (backend와 동일)
 * ============================================================ */

export type LogCategory =
  | "access"
  | "input"
  | "output"
  | "activity"
  | "auth"
  | "payment"
  | "database"
  | "system";

export type ErrorCategory =
  | "server"
  | "transaction"
  | "client"
  | "auth"
  | "database"
  | "external";

export type LogKind =
  | { type: "normal"; category: LogCategory }
  | { type: "error"; category: ErrorCategory };

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/* ============================================================
 * 2. 상수
 * ============================================================ */

export const DIR_MODE = 0o755;
export const FILE_MODE = 0o644;

export const ALL_NORMAL_CATEGORIES: LogCategory[] = [
  "access",
  "input",
  "output",
  "activity",
  "auth",
  "payment",
  "database",
  "system",
];

export const ALL_ERROR_CATEGORIES: ErrorCategory[] = [
  "server",
  "transaction",
  "client",
  "auth",
  "database",
  "external",
];

const KST_TIMEZONE = "Asia/Seoul";

/* ============================================================
 * 3. KST 날짜 유틸
 * ============================================================ */

export function formatDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatYear(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
  }).format(date);
}

export function formatMonth(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    month: "2-digit",
  }).format(date);
}

export function formatDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    day: "2-digit",
  }).format(date);
}

/* ============================================================
 * 4. 경로 계산
 * ============================================================ */

/** LOG_ROOT 환경변수 우선, 기본값은 process.cwd() + '/log' */
export function getLogRoot(): string {
  if (process.env.LOG_ROOT && process.env.LOG_ROOT.trim() !== "") {
    return path.resolve(process.env.LOG_ROOT);
  }
  return path.join(process.cwd(), "log");
}

export function getMonthDir(date: Date = new Date()): string {
  return path.join(getLogRoot(), formatYear(date), formatMonth(date));
}

export function getDateDir(date: Date = new Date()): string {
  return path.join(getMonthDir(date), formatDay(date));
}

export function getErrorsDateDir(date: Date = new Date()): string {
  return path.join(getDateDir(date), "errors");
}

export function getLogPath(kind: LogKind, date: Date = new Date()): string {
  if (kind.type === "normal") {
    return path.join(getDateDir(date), `${kind.category}.log`);
  }
  return path.join(getErrorsDateDir(date), `${kind.category}.log`);
}

export function getAllErrorsPath(date: Date = new Date()): string {
  return path.join(getErrorsDateDir(date), "_all.jsonl");
}

export function getErrorsSummaryPath(date: Date = new Date()): string {
  return path.join(getErrorsDateDir(date), "summary.json");
}

export function getGlobalIndexPath(): string {
  return path.join(getLogRoot(), "_index.jsonl");
}

export function getManifestPath(): string {
  return path.join(getLogRoot(), "manifest.json");
}

export function getCurrentDir(): string {
  return path.join(getLogRoot(), "current");
}

export function getCurrentLinkPath(kind: LogKind): string {
  if (kind.type === "normal") {
    return path.join(getCurrentDir(), `${kind.category}.log`);
  }
  return path.join(getCurrentDir(), "errors", `${kind.category}.log`);
}

/* ============================================================
 * 5. 자동 생성 + 권한 부여
 * ============================================================ */

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
  }
  try {
    fs.chmodSync(dirPath, DIR_MODE);
  } catch {
    /* 권한 보정 실패 무시 */
  }
}

export function ensureFile(filePath: string): void {
  ensureDir(path.dirname(filePath));
  // broken symlink 방어: stat()은 target까지 follow, lstat()은 link 자체만 검사.
  // target 도달 실패 + link 자체 존재 = 깨진 symlink → 제거 후 정상 파일로 재생성.
  // (다른 사용자 머신 경로를 가리키는 symlink가 git으로 동기화될 때 발생)
  let exists = false;
  try {
    fs.statSync(filePath);
    exists = true;
  } catch {
    try {
      fs.lstatSync(filePath);
      fs.unlinkSync(filePath);
    } catch {
      /* 정말 없음 */
    }
  }
  if (!exists) {
    const fd = fs.openSync(filePath, "a", FILE_MODE);
    fs.closeSync(fd);
  }
  try {
    fs.chmodSync(filePath, FILE_MODE);
  } catch {
    /* 무시 */
  }
}

export function ensureAllCategoryFiles(date: Date = new Date()): void {
  ensureDir(getLogRoot());
  ensureDir(getDateDir(date));
  ensureDir(getErrorsDateDir(date));
  ensureDir(getCurrentDir());
  ensureDir(path.join(getCurrentDir(), "errors"));

  for (const cat of ALL_NORMAL_CATEGORIES) {
    ensureFile(getLogPath({ type: "normal", category: cat }, date));
  }
  for (const cat of ALL_ERROR_CATEGORIES) {
    ensureFile(getLogPath({ type: "error", category: cat }, date));
  }
  ensureFile(getAllErrorsPath(date));
  ensureFile(getGlobalIndexPath());

  const summaryPath = getErrorsSummaryPath(date);
  if (!fs.existsSync(summaryPath)) {
    fs.writeFileSync(
      summaryPath,
      JSON.stringify({ date: formatDate(date), categories: {} }, null, 2),
      { mode: FILE_MODE },
    );
  }
}

/* ============================================================
 * 6. current/ 심볼릭 링크
 * ============================================================ */

export function updateCurrentSymlink(
  kind: LogKind,
  date: Date = new Date(),
): void {
  const linkPath = getCurrentLinkPath(kind);
  const targetPath = getLogPath(kind, date);
  ensureFile(targetPath);
  ensureDir(path.dirname(linkPath));

  // existsSync()는 깨진 symlink에 false를 반환하므로 lstat()으로 link 자체 존재를 검사
  try {
    fs.lstatSync(linkPath);
    fs.unlinkSync(linkPath);
  } catch {
    /* 없으면 무시 */
  }

  try {
    fs.symlinkSync(targetPath, linkPath, "file");
  } catch {
    /* symlink 실패 (Windows·일부 환경) — 폴백 */
    ensureFile(linkPath);
  }
}

export function updateAllCurrentSymlinks(date: Date = new Date()): void {
  for (const cat of ALL_NORMAL_CATEGORIES) {
    updateCurrentSymlink({ type: "normal", category: cat }, date);
  }
  for (const cat of ALL_ERROR_CATEGORIES) {
    updateCurrentSymlink({ type: "error", category: cat }, date);
  }
  try {
    const linkPath = path.join(getCurrentDir(), "errors", "_all.jsonl");
    const targetPath = getAllErrorsPath(date);
    ensureFile(targetPath);
    // 깨진 symlink 포함 정리: existsSync 대신 lstat
    try {
      fs.lstatSync(linkPath);
      fs.unlinkSync(linkPath);
    } catch {
      /* 없으면 무시 */
    }
    fs.symlinkSync(targetPath, linkPath, "file");
  } catch {
    /* 무시 */
  }
}

/* ============================================================
 * 7. 오류 카테고리 자동 분류
 * ============================================================ */

/* ============================================================
 * 10MB 자체 회전 (v8.6 P6 — 2026-05-20)
 * Backend와 동일 구현 — 4 프로젝트 일관성
 * ============================================================ */

export const ROTATE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const ROTATE_MAX_BACKUPS = 5;

export function rotateIfExceeded(
  filePath: string,
  maxBytes: number = ROTATE_MAX_BYTES,
  maxBackups: number = ROTATE_MAX_BACKUPS,
): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return false;

    const oldest = `${filePath}.${maxBackups}`;
    if (fs.existsSync(oldest)) {
      try {
        fs.unlinkSync(oldest);
      } catch {
        /* 무시 */
      }
    }

    for (let i = maxBackups - 1; i >= 1; i--) {
      const from = `${filePath}.${i}`;
      const to = `${filePath}.${i + 1}`;
      if (fs.existsSync(from)) {
        try {
          fs.renameSync(from, to);
        } catch {
          /* 무시 */
        }
      }
    }

    try {
      fs.renameSync(filePath, `${filePath}.1`);
    } catch {
      return false;
    }
    ensureFile(filePath);
    return true;
  } catch {
    return false;
  }
}

export function rotateAllIfExceeded(
  date: Date = new Date(),
  maxBytes: number = ROTATE_MAX_BYTES,
  maxBackups: number = ROTATE_MAX_BACKUPS,
): { rotated: string[]; total: number } {
  const rotated: string[] = [];
  for (const cat of ALL_NORMAL_CATEGORIES) {
    const fp = getLogPath({ type: "normal", category: cat }, date);
    if (rotateIfExceeded(fp, maxBytes, maxBackups)) rotated.push(fp);
  }
  for (const cat of ALL_ERROR_CATEGORIES) {
    const fp = getLogPath({ type: "error", category: cat }, date);
    if (rotateIfExceeded(fp, maxBytes, maxBackups)) rotated.push(fp);
  }
  const allPath = getAllErrorsPath(date);
  if (rotateIfExceeded(allPath, maxBytes, maxBackups)) rotated.push(allPath);
  const globalPath = getGlobalIndexPath();
  if (rotateIfExceeded(globalPath, maxBytes, maxBackups)) rotated.push(globalPath);
  return { rotated, total: rotated.length };
}

/* ============================================================
 * 오류 카테고리 자동 분류
 * ============================================================ */

export function classifyError(meta: {
  status?: number;
  prismaCode?: string;
  externalSource?: string;
  transactionScope?: string;
  exceptionName?: string;
}): ErrorCategory {
  if (meta.externalSource) return "external";
  if (meta.transactionScope) return "transaction";
  if (meta.prismaCode && /^P\d{4}$/.test(meta.prismaCode)) return "database";

  const exName = meta.exceptionName?.toLowerCase() ?? "";
  if (
    exName.includes("unauthorized") ||
    exName.includes("auth") ||
    exName.includes("jwt") ||
    exName.includes("token") ||
    exName.includes("lockout")
  ) {
    return "auth";
  }

  if (meta.status !== undefined) {
    if (meta.status >= 500) return "server";
    if (meta.status >= 400 && meta.status < 500) return "client";
  }

  return "server";
}
