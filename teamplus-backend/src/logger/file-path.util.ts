/**
 * File Path Utility for TEAMPLUS File Logging System (v8.6, 2026-05-20)
 *
 * 사용자 요구사항 반영:
 * 1. 일단위 파일 (YYYY-MM-DD, KST 기준 자정 회전)
 * 2. 오류 카테고리 세분화 (서버/거래/클라이언트/인증/DB/외부)
 * 3. 파일/디렉토리 자동 생성 + 권한 부여 (0755/0644)
 * 4. 통합 인덱스(_index.jsonl) + 매니페스트(manifest.json) — 분석 용이
 * 5. current/ 심볼릭 링크 — tail 편의
 *
 * 외부 의존성 0: Node 표준 fs/path/process만 사용
 */

import * as fs from "fs";
import * as path from "path";

/* ============================================================
 * 1. 타입 정의
 * ============================================================ */

/** 일반 로그 카테고리 */
export type LogCategory =
  | "access" // HTTP 요청/응답 요약 (method·url·status·duration·requestId)
  | "input" // HTTP request body / query / params (사용자 요구 v8.6)
  | "output" // HTTP response body / error (사용자 요구 v8.6)
  | "activity" // 사용자 활동 (PAGE_VIEW·CLICK·API_CALL)
  | "auth" // 인증 이벤트 (LOGIN·LOGOUT·TOKEN_REFRESH·AUTH_FAIL)
  | "payment" // 결제 트랜잭션 (KG이니시스·webhook·멱등성 키)
  | "database" // Slow query·DB 에러 (1초 초과만)
  | "system"; // 부팅/종료/스케줄러/cron

/** 오류 서브카테고리 — 사용자 강조 요구사항 */
export type ErrorCategory =
  | "server" // 5xx · 내부 예외 · 시스템 크래시
  | "transaction" // 결제 · 크레딧 · $transaction 실패
  | "client" // 4xx 사용자 오류
  | "auth" // 로그인 실패 · 토큰 갱신 실패
  | "database" // Prisma P2002 · P2025 · P2003
  | "external"; // KG이니시스 · Alimtalk · NICE · PASS 실패

/** 로그 종류 — 일반 카테고리 또는 오류 카테고리 */
export type LogKind =
  | { type: "normal"; category: LogCategory }
  | { type: "error"; category: ErrorCategory };

/* ============================================================
 * 2. 상수
 * ============================================================ */

/** 디렉토리/파일 권한 (사용자 강조 요구사항) */
export const DIR_MODE = 0o755;
export const FILE_MODE = 0o644;

/** 모든 일반 카테고리 (자동 초기화에 사용) */
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

/** 모든 오류 카테고리 */
export const ALL_ERROR_CATEGORIES: ErrorCategory[] = [
  "server",
  "transaction",
  "client",
  "auth",
  "database",
  "external",
];

/* ============================================================
 * 3. 날짜 유틸 (KST 기준 일단위)
 * ============================================================ */

const KST_TIMEZONE = "Asia/Seoul";

/** Date → "YYYY-MM-DD" (KST) */
export function formatDate(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // en-CA: YYYY-MM-DD
}

/** Date → "YYYY" (KST) */
export function formatYear(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
  });
  return fmt.format(date);
}

/** Date → "MM" (KST) */
export function formatMonth(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    month: "2-digit",
  });
  return fmt.format(date);
}

/* ============================================================
 * 4. 경로 계산
 * ============================================================ */

/**
 * 프로젝트 로그 루트 — 환경변수 LOG_ROOT 우선,
 * 기본값은 process.cwd() + '/log' (사용자 지시 단수형 'log')
 */
export function getLogRoot(): string {
  if (process.env.LOG_ROOT && process.env.LOG_ROOT.trim() !== "") {
    return path.resolve(process.env.LOG_ROOT);
  }
  return path.join(process.cwd(), "log");
}

/** "DD" 형식 (KST) — 일자 디렉토리 명 */
export function formatDay(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    day: "2-digit",
  });
  return fmt.format(date);
}

/** log/YYYY/MM 디렉토리 절대경로 (월 단위) */
export function getMonthDir(date: Date = new Date()): string {
  return path.join(getLogRoot(), formatYear(date), formatMonth(date));
}

/**
 * log/YYYY/MM/DD 디렉토리 절대경로 (일 단위)
 * - v8.6 추가: 사용자 요구로 일자 디렉토리 한 단계 추가
 * - 매일 자정에 새 디렉토리 자동 생성 (ensureDir 통해 권한 0755 자동 부여)
 */
export function getDateDir(date: Date = new Date()): string {
  return path.join(getMonthDir(date), formatDay(date));
}

/** 오류 카테고리 전용 하위 디렉토리: log/YYYY/MM/DD/errors */
export function getErrorsDateDir(date: Date = new Date()): string {
  return path.join(getDateDir(date), "errors");
}

/**
 * 일자별 로그 파일 절대경로
 * - v8.6 변경: 디렉토리가 이미 일자 정보를 가지므로 파일명에서 일자 prefix 제거
 * - 결과 예: log/2026/05/20/access.log · log/2026/05/20/errors/transaction.log
 */
export function getLogPath(kind: LogKind, date: Date = new Date()): string {
  if (kind.type === "normal") {
    return path.join(getDateDir(date), `${kind.category}.log`);
  }
  return path.join(getErrorsDateDir(date), `${kind.category}.log`);
}

/** 모든 오류 통합 인덱스 파일 (jsonl) — 일자 디렉토리 내 */
export function getAllErrorsPath(date: Date = new Date()): string {
  return path.join(getErrorsDateDir(date), `_all.jsonl`);
}

/** 오류 카테고리별 카운트 요약 (json) — 일자 디렉토리 내 */
export function getErrorsSummaryPath(date: Date = new Date()): string {
  return path.join(getErrorsDateDir(date), `summary.json`);
}

/** 통합 인덱스 (전 카테고리, 한 줄당 1 entry) */
export function getGlobalIndexPath(): string {
  return path.join(getLogRoot(), "_index.jsonl");
}

/** 매니페스트 (일자·카테고리별 메타) */
export function getManifestPath(): string {
  return path.join(getLogRoot(), "manifest.json");
}

/** current/ 심볼릭 링크 디렉토리 */
export function getCurrentDir(): string {
  return path.join(getLogRoot(), "current");
}

/** current/<category>.log 또는 current/errors/<category>.log */
export function getCurrentLinkPath(kind: LogKind): string {
  if (kind.type === "normal") {
    return path.join(getCurrentDir(), `${kind.category}.log`);
  }
  return path.join(getCurrentDir(), "errors", `${kind.category}.log`);
}

/* ============================================================
 * 5. 자동 생성 + 권한 부여 (사용자 강조 요구사항)
 * ============================================================ */

/**
 * 디렉토리 자동 생성 (없으면 0755 권한으로 재귀 생성)
 * - mkdirSync recursive 옵션은 상위 디렉토리 mode 적용 안되는 경우가 있어
 *   재귀 후 chmod로 보정
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
  }
  // 권한 드리프트 보정 (이미 있어도 0755 보장)
  try {
    fs.chmodSync(dirPath, DIR_MODE);
  } catch {
    /* 권한 부여 실패는 치명적 아님 — 로그 출력은 caller가 결정 */
  }
}

/**
 * 파일 자동 생성 (없으면 0644 권한으로 touch)
 * - 디렉토리가 없으면 함께 생성
 * - 이미 있으면 append 가능한 상태로 보장
 */
export function ensureFile(filePath: string): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);

  if (!fs.existsSync(filePath)) {
    // 'a' 모드로 열어 즉시 닫음 (없으면 생성, 있어도 안전)
    const fd = fs.openSync(filePath, "a", FILE_MODE);
    fs.closeSync(fd);
  }
  // 권한 드리프트 보정
  try {
    fs.chmodSync(filePath, FILE_MODE);
  } catch {
    /* 무시 */
  }
}

/**
 * 일단위 파일 패스를 계산하면서 동시에 생성·권한 보정까지 수행
 * — Pino transport·multistream 등에서 사용
 */
export function resolveLogPath(kind: LogKind, date: Date = new Date()): string {
  const filePath = getLogPath(kind, date);
  ensureFile(filePath);
  return filePath;
}

/**
 * 모든 카테고리 파일을 미리 생성 (lazy init 대신 부팅 시 일괄)
 * — 분석 도구가 첫 호출 전에도 파일 존재 가정 가능
 */
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

  // errors-summary.json은 빈 객체가 아닌 {} 로 초기화
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
 * 6. 심볼릭 링크 (current/) — tail 편의
 * ============================================================ */

/**
 * 단일 카테고리에 대해 current/<category>.log → YYYY/MM/YYYY-MM-DD-<category>.log 갱신
 * - 기존 링크/파일 있으면 unlink 후 재생성
 * - Windows에서 symlink 실패 가능 — 그 경우 fall back으로 빈 파일 유지
 */
export function updateCurrentSymlink(
  kind: LogKind,
  date: Date = new Date(),
): void {
  const linkPath = getCurrentLinkPath(kind);
  const targetPath = getLogPath(kind, date);

  // 타겟이 없으면 먼저 생성
  ensureFile(targetPath);
  ensureDir(path.dirname(linkPath));

  try {
    if (
      fs.existsSync(linkPath) ||
      fs.lstatSync(linkPath, { throwIfNoEntry: false } as fs.StatSyncOptions)
    ) {
      fs.unlinkSync(linkPath);
    }
  } catch {
    /* 무시 */
  }

  try {
    fs.symlinkSync(targetPath, linkPath, "file");
  } catch (err) {
    // symlink 권한 실패 (Windows·일부 컨테이너) — 일반 파일로 폴백
    // 단, 이 경우 tail은 직접 YYYY/MM/ 파일을 봐야 함
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      ensureFile(linkPath);
    }
  }
}

/** 모든 카테고리 심볼릭 링크 일괄 갱신 — 자정 회전 또는 부팅 시 호출 */
export function updateAllCurrentSymlinks(date: Date = new Date()): void {
  for (const cat of ALL_NORMAL_CATEGORIES) {
    updateCurrentSymlink({ type: "normal", category: cat }, date);
  }
  for (const cat of ALL_ERROR_CATEGORIES) {
    updateCurrentSymlink({ type: "error", category: cat }, date);
  }
  // 통합 인덱스도 current/_all-errors.jsonl 링크
  try {
    const linkPath = path.join(getCurrentDir(), "errors", "_all.jsonl");
    const targetPath = getAllErrorsPath(date);
    ensureFile(targetPath);
    if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
    fs.symlinkSync(targetPath, linkPath, "file");
  } catch {
    /* 무시 */
  }
}

/* ============================================================
 * 7. HTTP 상태 / 에러 클래스 → 오류 카테고리 분류
 *    (사용자 강조: 서버오류·거래오류·모든 오류를 쉽게 분석)
 * ============================================================ */

/**
 * 에러 메타로부터 오류 카테고리 자동 판정
 * @param meta { status?, prismaCode?, externalSource?, transactionScope?, exceptionName? }
 */
export function classifyError(meta: {
  status?: number;
  prismaCode?: string;
  externalSource?: string;
  transactionScope?: string;
  exceptionName?: string;
}): ErrorCategory {
  // 1. 외부 API 어댑터 명시되면 우선
  if (meta.externalSource) return "external";

  // 2. 거래(transaction) 범위 명시되면 우선
  if (meta.transactionScope) return "transaction";

  // 3. Prisma 에러 코드
  if (meta.prismaCode && /^P\d{4}$/.test(meta.prismaCode)) {
    return "database";
  }

  // 4. 인증 관련 예외 이름
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

  // 5. HTTP status
  if (meta.status !== undefined) {
    if (meta.status >= 500) return "server";
    if (meta.status >= 400 && meta.status < 500) return "client";
  }

  // 기본: 서버 오류로 분류 (분류 실패 = 안전 측 = 운영자가 보게)
  return "server";
}

/* ============================================================
 * 8. 매니페스트 갱신 (분석 도구가 빠른 메타 조회)
 * ============================================================ */

interface ManifestEntry {
  date: string; // YYYY-MM-DD
  category: string; // category 이름
  type: "normal" | "error";
  path: string; // 상대경로
  bytes?: number;
  lines?: number;
  updatedAt: string; // ISO
}

interface Manifest {
  version: number;
  updatedAt: string;
  entries: Record<string, ManifestEntry>;
}

/** 매니페스트 읽기 (없으면 빈 객체) */
export function readManifest(): Manifest {
  const p = getManifestPath();
  ensureDir(getLogRoot());
  if (!fs.existsSync(p)) {
    return { version: 1, updatedAt: new Date().toISOString(), entries: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Manifest;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: {} };
  }
}

/* ============================================================
 * 9. 10MB 자체 회전 (v8.6 P6 — 2026-05-20)
 *    pino-roll → SonicBoom 전환으로 잃은 rotation 기능 자체 구현
 * ============================================================ */

/** 회전 정책 기본값 — 사용자 요구사항 명시 */
export const ROTATE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const ROTATE_MAX_BACKUPS = 5;

/**
 * 단일 파일 회전 — 사이즈 초과 시 .log → .log.1, .log.1 → .log.2 ...
 * - 가장 오래된 .log.{maxBackups+1} 또는 .log.5는 삭제
 * - 회전 후 새 .log 파일을 0바이트로 생성 (권한 0644)
 * - 회전 성공 시 true, 미회전(사이즈 미달 등)이면 false 반환
 */
export function rotateIfExceeded(
  filePath: string,
  maxBytes: number = ROTATE_MAX_BYTES,
  maxBackups: number = ROTATE_MAX_BACKUPS,
): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return false;

    // 1) 가장 오래된 백업(.log.maxBackups) 삭제
    const oldest = `${filePath}.${maxBackups}`;
    if (fs.existsSync(oldest)) {
      try {
        fs.unlinkSync(oldest);
      } catch {
        /* 무시 */
      }
    }

    // 2) .log.N → .log.(N+1) (역순으로 이동해야 덮어쓰기 안전)
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

    // 3) 현재 .log → .log.1
    try {
      fs.renameSync(filePath, `${filePath}.1`);
    } catch {
      return false;
    }

    // 4) 새 .log 파일 생성 (0바이트, 권한 0644)
    ensureFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 일자별 디렉토리 안의 모든 카테고리 파일 + _all.jsonl 회전 검사
 * - 회전 발생한 파일 개수 반환
 * - NestJS @Cron 또는 server-logger의 매 N회 write 카운터에서 호출
 */
export function rotateAllIfExceeded(
  date: Date = new Date(),
  maxBytes: number = ROTATE_MAX_BYTES,
  maxBackups: number = ROTATE_MAX_BACKUPS,
): {
  rotated: string[];
  total: number;
} {
  const rotated: string[] = [];

  // 일반 카테고리
  for (const cat of ALL_NORMAL_CATEGORIES) {
    const fp = getLogPath({ type: "normal", category: cat }, date);
    if (rotateIfExceeded(fp, maxBytes, maxBackups)) rotated.push(fp);
  }
  // 오류 카테고리
  for (const cat of ALL_ERROR_CATEGORIES) {
    const fp = getLogPath({ type: "error", category: cat }, date);
    if (rotateIfExceeded(fp, maxBytes, maxBackups)) rotated.push(fp);
  }
  // 통합 인덱스
  const allPath = getAllErrorsPath(date);
  if (rotateIfExceeded(allPath, maxBytes, maxBackups)) rotated.push(allPath);

  // 글로벌 _index.jsonl (전 카테고리 메타 인덱스)
  const globalPath = getGlobalIndexPath();
  if (rotateIfExceeded(globalPath, maxBytes, maxBackups))
    rotated.push(globalPath);

  return { rotated, total: rotated.length };
}

/** 매니페스트 단일 entry 갱신 */
export function updateManifestEntry(
  kind: LogKind,
  date: Date = new Date(),
): void {
  const manifest = readManifest();
  const day = formatDate(date);
  const key = `${day}-${kind.type}-${kind.category}`;
  const filePath = getLogPath(kind, date);

  let bytes = 0;
  try {
    bytes = fs.statSync(filePath).size;
  } catch {
    bytes = 0;
  }

  manifest.entries[key] = {
    date: day,
    category: kind.category,
    type: kind.type,
    path: path.relative(getLogRoot(), filePath),
    bytes,
    updatedAt: new Date().toISOString(),
  };
  manifest.updatedAt = new Date().toISOString();

  ensureFile(getManifestPath());
  fs.writeFileSync(getManifestPath(), JSON.stringify(manifest, null, 2), {
    mode: FILE_MODE,
  });
}
