#!/usr/bin/env tsx
/**
 * 4-Platform UPLOAD_LIMITS SoT Guard — Phase 5.2 SPEC §8
 *
 * Backend `CATEGORY_RULES`, Web `UPLOAD_LIMITS`, Admin `UPLOAD_LIMITS`, App `UploadCategory`
 * 4개 출처의 카테고리·maxSize·확장자가 일치하는지 정적 검사한다.
 *
 * 정책:
 *   - 모든 카테고리(IMAGE/AVATAR/DOCUMENT/VIDEO/ATTACHMENT)의 maxSize 는 5MB(=5 * 1024 * 1024).
 *   - Backend = Web = Admin 의 maxSize 가 100% 일치해야 한다.
 *   - App(Flutter) 은 카테고리 enum 만 보유 (사이즈는 서버 검증) — enum 존재 여부만 확인.
 *
 * 실행:
 *   npm run check:upload-limits
 *   exit 1 = 불일치, exit 0 = 정상
 *
 * CI 가드:
 *   GitHub Actions / Jenkins 에서 PR 단계 호출 → upload SoT 위반 즉시 차단.
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// ===== 경로 설정 =====

const PROJECT_ROOT = resolve(__dirname, "../../");

const BACKEND_FILE = join(PROJECT_ROOT, "teamplus-backend/src/files/files.service.ts");
const WEB_FILE = join(PROJECT_ROOT, "teamplus-web/src/types/file.ts");
const ADMIN_FILE = join(PROJECT_ROOT, "teamplus-admin/src/services/upload.service.ts");
const APP_FILE = join(
  PROJECT_ROOT,
  "teamplus-app/lib/core/storage/file_storage_service.dart",
);

const CATEGORIES = ["IMAGE", "AVATAR", "DOCUMENT", "VIDEO", "ATTACHMENT"] as const;
type Category = (typeof CATEGORIES)[number];

const EXPECTED_MAX_SIZE = 5 * 1024 * 1024; // 5MB

// ===== 유틸 =====

interface PlatformResult {
  /** 카테고리별 maxSize. null = 추출 실패 또는 미정의 */
  sizes: Partial<Record<Category, number | null>>;
  /** 카테고리별 확장자 화이트리스트. null = 추출 실패 */
  extensions: Partial<Record<Category, string[] | null>>;
}

function readFileSafe(path: string, label: string): string | null {
  if (!existsSync(path)) {
    console.error(`❌ [${label}] 파일이 존재하지 않음: ${path}`);
    return null;
  }
  try {
    return readFileSync(path, "utf8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ [${label}] 파일 읽기 실패: ${msg}`);
    return null;
  }
}

/**
 * "5 * 1024 * 1024" / "5_242_880" / "5242880" 형식의 maxSize 값을 평가.
 * 안전한 화이트리스트 정규식 매칭만 허용 (eval 사용 안함).
 */
function evaluateSizeExpression(expr: string): number | null {
  const cleaned = expr.replace(/\s+/g, "").replace(/_/g, "");
  // Case 1: 단순 정수 — "5242880"
  if (/^\d+$/.test(cleaned)) {
    return parseInt(cleaned, 10);
  }
  // Case 2: "A*B*C" 형태 곱셈 — "5*1024*1024"
  if (/^\d+(\*\d+)+$/.test(cleaned)) {
    const parts = cleaned.split("*").map((n) => parseInt(n, 10));
    return parts.reduce((acc, n) => acc * n, 1);
  }
  return null;
}

/**
 * Backend CATEGORY_RULES 파싱
 *
 * 패턴:
 *   IMAGE: {
 *     mimes: [...],
 *     maxSize: 5 * 1024 * 1024,
 *     extHints: [".jpg", ".jpeg", ...],
 *   },
 */
function parseBackend(content: string): PlatformResult {
  const result: PlatformResult = { sizes: {}, extensions: {} };

  // CATEGORY_RULES 블록 찾기
  const blockMatch = content.match(
    /const\s+CATEGORY_RULES\s*:[\s\S]*?=\s*\{([\s\S]*?)\n\}\s*;/m,
  );
  if (!blockMatch) return result;
  const block = blockMatch[1];

  for (const cat of CATEGORIES) {
    const catRegex = new RegExp(
      `${cat}\\s*:\\s*\\{([\\s\\S]*?)\\}\\s*,`,
      "m",
    );
    const catMatch = block.match(catRegex);
    if (!catMatch) {
      result.sizes[cat] = null;
      result.extensions[cat] = null;
      continue;
    }
    const body = catMatch[1];

    // maxSize
    const sizeMatch = body.match(/maxSize\s*:\s*([^,\n]+)/);
    result.sizes[cat] = sizeMatch
      ? evaluateSizeExpression(sizeMatch[1])
      : null;

    // extHints (앞에 점이 붙음)
    const extMatch = body.match(/extHints\s*:\s*\[([\s\S]*?)\]/);
    if (extMatch) {
      const exts = Array.from(extMatch[1].matchAll(/"\.([a-z0-9]+)"/g)).map(
        (m) => m[1].toLowerCase(),
      );
      result.extensions[cat] = exts;
    } else {
      result.extensions[cat] = null;
    }
  }

  return result;
}

/**
 * Web/Admin UPLOAD_LIMITS 파싱
 *
 * 패턴:
 *   IMAGE: {
 *     maxSize: 5 * 1024 * 1024,
 *     ...
 *     acceptExtensions: ['jpg', 'jpeg', ...],
 *     ...
 *   },
 */
function parseTsUploadLimits(content: string): PlatformResult {
  const result: PlatformResult = { sizes: {}, extensions: {} };

  const blockMatch = content.match(
    /UPLOAD_LIMITS\s*:[^=]*=\s*\{([\s\S]*?)\n\}\s*as\s+const\s*;/m,
  );
  if (!blockMatch) return result;
  const block = blockMatch[1];

  for (const cat of CATEGORIES) {
    const catRegex = new RegExp(
      `${cat}\\s*:\\s*\\{([\\s\\S]*?)\\}\\s*,`,
      "m",
    );
    const catMatch = block.match(catRegex);
    if (!catMatch) {
      result.sizes[cat] = null;
      result.extensions[cat] = null;
      continue;
    }
    const body = catMatch[1];

    // maxSize
    const sizeMatch = body.match(/maxSize\s*:\s*([^,\n]+)/);
    result.sizes[cat] = sizeMatch
      ? evaluateSizeExpression(sizeMatch[1])
      : null;

    // acceptExtensions (Web/Admin 은 점 없는 소문자 확장자)
    const extMatch = body.match(/acceptExtensions\s*:\s*\[([\s\S]*?)\]/);
    if (extMatch) {
      const exts = Array.from(
        extMatch[1].matchAll(/['"]([a-z0-9]+)['"]/g),
      ).map((m) => m[1].toLowerCase());
      result.extensions[cat] = exts;
    } else {
      result.extensions[cat] = null;
    }
  }

  return result;
}

/**
 * App(Flutter) UploadCategory enum 파싱
 *
 * 패턴:
 *   enum UploadCategory {
 *     image('IMAGE'),
 *     avatar('AVATAR'),
 *     ...
 *   }
 *
 * 사이즈는 클라이언트에 없음 (서버 검증) → 카테고리 존재 여부만 확인.
 */
function parseAppCategories(content: string): { categories: Category[] } {
  const found: Category[] = [];
  for (const cat of CATEGORIES) {
    const regex = new RegExp(`['"]${cat}['"]`);
    if (regex.test(content)) {
      found.push(cat);
    }
  }
  return { categories: found };
}

// ===== 검증 로직 =====

interface Mismatch {
  category: Category;
  field: "maxSize" | "extensions" | "categoryMissing";
  message: string;
  detail: Record<string, unknown>;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "(미확인)";
  return `${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)}MB)`;
}

function compareSizes(
  backend: PlatformResult,
  web: PlatformResult,
  admin: PlatformResult,
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  for (const cat of CATEGORIES) {
    const b = backend.sizes[cat];
    const w = web.sizes[cat];
    const a = admin.sizes[cat];

    // 추출 실패 처리
    if (b === null || w === null || a === null || b === undefined || w === undefined || a === undefined) {
      mismatches.push({
        category: cat,
        field: "maxSize",
        message: `[${cat}] maxSize 추출 실패 — 정규식 매칭 실패 또는 미정의`,
        detail: { backend: b, web: w, admin: a },
      });
      continue;
    }

    // 기대값 일치 확인
    if (b !== EXPECTED_MAX_SIZE || w !== EXPECTED_MAX_SIZE || a !== EXPECTED_MAX_SIZE) {
      mismatches.push({
        category: cat,
        field: "maxSize",
        message: `[${cat}] maxSize 가 정책(5MB)과 불일치`,
        detail: {
          expected: formatBytes(EXPECTED_MAX_SIZE),
          backend: formatBytes(b),
          web: formatBytes(w),
          admin: formatBytes(a),
        },
      });
      continue;
    }

    // 3개 출처 상호 일치 확인 (이미 EXPECTED 와 같지만 명시적 가드)
    if (b !== w || w !== a) {
      mismatches.push({
        category: cat,
        field: "maxSize",
        message: `[${cat}] maxSize 불일치 (Backend/Web/Admin)`,
        detail: {
          backend: formatBytes(b),
          web: formatBytes(w),
          admin: formatBytes(a),
        },
      });
    }
  }

  return mismatches;
}

function compareExtensions(
  backend: PlatformResult,
  web: PlatformResult,
  admin: PlatformResult,
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  for (const cat of CATEGORIES) {
    const b = backend.extensions[cat];
    const w = web.extensions[cat];
    const a = admin.extensions[cat];

    if (!b || !w || !a) {
      mismatches.push({
        category: cat,
        field: "extensions",
        message: `[${cat}] 확장자 추출 실패`,
        detail: { backend: b, web: w, admin: a },
      });
      continue;
    }

    const bSet = new Set(b);
    const wSet = new Set(w);
    const aSet = new Set(a);

    const allEqual =
      bSet.size === wSet.size &&
      wSet.size === aSet.size &&
      [...bSet].every((e) => wSet.has(e) && aSet.has(e));

    if (!allEqual) {
      mismatches.push({
        category: cat,
        field: "extensions",
        message: `[${cat}] 확장자 화이트리스트 불일치`,
        detail: {
          backend: [...bSet].sort(),
          web: [...wSet].sort(),
          admin: [...aSet].sort(),
        },
      });
    }
  }

  return mismatches;
}

function compareAppCategories(app: { categories: Category[] }): Mismatch[] {
  const mismatches: Mismatch[] = [];
  const appSet = new Set(app.categories);
  for (const cat of CATEGORIES) {
    if (!appSet.has(cat)) {
      mismatches.push({
        category: cat,
        field: "categoryMissing",
        message: `[${cat}] Flutter App UploadCategory enum 에 누락`,
        detail: { found: app.categories },
      });
    }
  }
  return mismatches;
}

// ===== Main =====

function main(): void {
  console.log("🔍 4-Platform UPLOAD_LIMITS SoT Guard — 시작\n");
  console.log(`   Backend: ${BACKEND_FILE}`);
  console.log(`   Web:     ${WEB_FILE}`);
  console.log(`   Admin:   ${ADMIN_FILE}`);
  console.log(`   App:     ${APP_FILE}\n`);

  const backendContent = readFileSafe(BACKEND_FILE, "Backend");
  const webContent = readFileSafe(WEB_FILE, "Web");
  const adminContent = readFileSafe(ADMIN_FILE, "Admin");
  const appContent = readFileSafe(APP_FILE, "App");

  if (!backendContent || !webContent || !adminContent || !appContent) {
    console.error("\n❌ 한 개 이상의 SoT 파일을 읽지 못해 종료합니다.");
    process.exit(1);
  }

  const backend = parseBackend(backendContent);
  const web = parseTsUploadLimits(webContent);
  const admin = parseTsUploadLimits(adminContent);
  const app = parseAppCategories(appContent);

  const sizeMismatches = compareSizes(backend, web, admin);
  const extMismatches = compareExtensions(backend, web, admin);
  const appMismatches = compareAppCategories(app);

  // 카테고리별 요약 출력
  console.log("📊 카테고리별 maxSize:");
  for (const cat of CATEGORIES) {
    const b = backend.sizes[cat];
    const w = web.sizes[cat];
    const a = admin.sizes[cat];
    const status =
      b === EXPECTED_MAX_SIZE && w === EXPECTED_MAX_SIZE && a === EXPECTED_MAX_SIZE
        ? "✅"
        : "❌";
    console.log(
      `   ${status} [${cat.padEnd(10)}] backend=${formatBytes(b ?? null)} · web=${formatBytes(w ?? null)} · admin=${formatBytes(a ?? null)}`,
    );
  }

  console.log("\n📊 카테고리별 확장자 일치 여부:");
  for (const cat of CATEGORIES) {
    const mismatch = extMismatches.find((m) => m.category === cat);
    console.log(`   ${mismatch ? "❌" : "✅"} [${cat}]`);
  }

  console.log("\n📊 Flutter App UploadCategory enum 존재 여부:");
  for (const cat of CATEGORIES) {
    const missing = appMismatches.find((m) => m.category === cat);
    console.log(`   ${missing ? "❌" : "✅"} [${cat}]`);
  }

  const allMismatches = [...sizeMismatches, ...extMismatches, ...appMismatches];
  if (allMismatches.length === 0) {
    console.log("\n✅ SoT 일치 — 모든 카테고리·사이즈·확장자가 4-플랫폼에서 동기화되어 있습니다.\n");
    process.exit(0);
  }

  console.error(`\n❌ ${allMismatches.length}건의 불일치 발견:\n`);
  for (const m of allMismatches) {
    console.error(`   • ${m.message}`);
    console.error(`     ${JSON.stringify(m.detail, null, 2).replace(/\n/g, "\n     ")}`);
  }
  console.error("\n💡 해결 방법:");
  console.error("   1. 모든 카테고리의 maxSize 를 5 * 1024 * 1024 (5MB) 로 통일");
  console.error("   2. 확장자 화이트리스트 (Backend extHints · Web/Admin acceptExtensions) 동기화");
  console.error("   3. App `lib/core/storage/file_storage_service.dart` UploadCategory enum 동기화");
  console.error(
    "\n참고: docs/Guides/UPLOAD_GUIDE.md · claudedocs/SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20.md\n",
  );

  process.exit(1);
}

main();
