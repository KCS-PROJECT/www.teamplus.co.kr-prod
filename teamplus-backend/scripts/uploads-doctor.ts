/**
 * uploads-doctor — DB UploadedFile ↔ 디스크 파일 정합성 진단 도구
 *
 * 목적:
 *   1) Missing files     : DB UploadedFile 레코드는 있는데 디스크에 파일 없음 (사고 · 데이터 손실)
 *   2) Orphan files      : 디스크에 파일은 있는데 DB 에 레코드 없음 (정리 가능)
 *   3) Mismatched size   : DB size 와 디스크 size 불일치 (변조 · 손상)
 *   4) Category 통계     : 카테고리·날짜별 파일 수·총 용량
 *   5) Top uploaders     : 업로더별 사용량
 *
 * 사용법:
 *   # 진단만 (변경 없음 — 기본)
 *   npm run uploads:doctor
 *
 *   # 상세 리포트 (JSON 출력)
 *   npm run uploads:doctor -- --json
 *
 *   # Orphan 파일 정리 (디스크에서 삭제, DB 무변경)
 *   npm run uploads:doctor -- --cleanup-orphans
 *
 *   # Missing 레코드 정리 (DB UploadedFile 레코드 soft-archive — 디스크 무변경)
 *   #   ※ 현재 UploadedFile 에 deletedAt 없음 → 본 옵션은 미구현 (향후 확장)
 *
 * 안전:
 *   - 기본 동작은 READ-ONLY. --cleanup-orphans 명시 시에만 디스크 삭제.
 *   - 디스크 삭제 시에도 UPLOAD_ROOT 하위 경로만 허용 (path traversal 방지).
 *   - Prisma client 종료 보장 (try/finally).
 */

/* eslint-disable no-console */
import { PrismaClient, UploadCategory } from "@prisma/client";
import { promises as fsp } from "fs";
import { join, relative } from "path";
import * as dotenv from "dotenv";

// .env.local 우선 로드 (UPLOAD_ROOT 등)
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

import { getUploadRoot, UPLOAD_CATEGORY_DIRS } from "../src/common/upload-paths";

const prisma = new PrismaClient();

const CLEANUP_ORPHANS = process.argv.includes("--cleanup-orphans");
const JSON_OUTPUT = process.argv.includes("--json");

interface DiagnosticReport {
  uploadRoot: string;
  generatedAt: string;
  summary: {
    dbRecords: number;
    diskFiles: number;
    missingFiles: number;
    orphanFiles: number;
    mismatchedSize: number;
    totalDbSizeBytes: number;
    totalDiskSizeBytes: number;
  };
  categories: Array<{
    category: UploadCategory | string;
    dbCount: number;
    diskCount: number;
    totalSizeBytes: number;
  }>;
  topUploaders: Array<{
    uploaderId: string;
    fileCount: number;
    totalSizeBytes: number;
  }>;
  duplicates: Array<{
    sha256: string;
    count: number;
    totalSizeBytes: number;
  }>;
  missingFiles: Array<{
    id: string;
    category: string;
    originalName: string;
    url: string;
    uploaderId: string;
    createdAt: string;
  }>;
  orphanFiles: Array<{
    absolutePath: string;
    relativePath: string;
    sizeBytes: number;
  }>;
  mismatchedSize: Array<{
    id: string;
    url: string;
    dbSize: number;
    diskSize: number;
  }>;
  cleanupOrphansDeleted?: number;
}

/**
 * 디스크의 모든 업로드 파일 절대 경로 목록 (재귀).
 * @returns Map<relativePath, sizeBytes>
 */
async function scanDiskFiles(): Promise<Map<string, number>> {
  const root = getUploadRoot();
  const result = new Map<string, number>();

  async function walk(dir: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return; // 카테고리 디렉토리 없음 — 정상
      throw err;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        // .gitkeep 등 숨김 파일 제외
        if (entry.name.startsWith(".")) continue;
        try {
          const stat = await fsp.stat(abs);
          const rel = relative(root, abs).split("\\").join("/");
          result.set(rel, stat.size);
        } catch {
          // permission denied 등 — 스킵
        }
      }
    }
  }

  for (const category of UPLOAD_CATEGORY_DIRS) {
    await walk(join(root, category));
  }

  return result;
}

/**
 * URL 또는 path 에서 디스크 상대경로 추출.
 * "/uploads/avatar/2026/05/23/foo.webp" → "avatar/2026/05/23/foo.webp"
 */
function urlToRelativePath(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("/uploads/")) return null;
  return trimmed.replace(/^\/uploads\/+/, "");
}

/**
 * 안전한 디스크 삭제 — UPLOAD_ROOT 하위 경로만 허용.
 */
async function safeUnlink(absPath: string): Promise<boolean> {
  const root = getUploadRoot();
  if (!absPath.startsWith(root)) {
    console.warn(`[uploads-doctor] UPLOAD_ROOT 외부 경로 — 삭제 거부: ${absPath}`);
    return false;
  }
  try {
    await fsp.unlink(absPath);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return true; // 이미 없음 — 정상
    console.warn(
      `[uploads-doctor] 삭제 실패: ${absPath} - ${(err as Error).message}`,
    );
    return false;
  }
}

async function diagnose(): Promise<DiagnosticReport> {
  const uploadRoot = getUploadRoot();
  console.log(`[uploads-doctor] UPLOAD_ROOT = ${uploadRoot}`);
  console.log("[uploads-doctor] 1/4 디스크 스캔 중...");
  const diskFiles = await scanDiskFiles();

  console.log("[uploads-doctor] 2/4 DB 레코드 로드 중...");
  const dbRecords = await prisma.uploadedFile.findMany({
    select: {
      id: true,
      category: true,
      originalName: true,
      url: true,
      path: true,
      size: true,
      sha256: true,
      uploaderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("[uploads-doctor] 3/4 정합성 비교 중...");

  // DB 의 URL → diskFiles 와 매칭
  const dbRelativePaths = new Set<string>();
  const missingFiles: DiagnosticReport["missingFiles"] = [];
  const mismatchedSize: DiagnosticReport["mismatchedSize"] = [];

  for (const record of dbRecords) {
    const rel = urlToRelativePath(record.url);
    if (!rel) continue; // 외부 URL — 스킵
    dbRelativePaths.add(rel);

    const diskSize = diskFiles.get(rel);
    if (diskSize === undefined) {
      missingFiles.push({
        id: record.id,
        category: record.category,
        originalName: record.originalName,
        url: record.url,
        uploaderId: record.uploaderId,
        createdAt: record.createdAt.toISOString(),
      });
    } else if (diskSize !== record.size) {
      mismatchedSize.push({
        id: record.id,
        url: record.url,
        dbSize: record.size,
        diskSize,
      });
    }
  }

  // 디스크에는 있고 DB 에 없는 파일
  const orphanFiles: DiagnosticReport["orphanFiles"] = [];
  for (const [rel, size] of diskFiles.entries()) {
    if (!dbRelativePaths.has(rel)) {
      orphanFiles.push({
        absolutePath: join(uploadRoot, rel),
        relativePath: rel,
        sizeBytes: size,
      });
    }
  }

  // 카테고리 통계 (DB 기준 + 디스크 카운트)
  const categoryStats = new Map<
    string,
    { dbCount: number; diskCount: number; totalSizeBytes: number }
  >();
  for (const record of dbRecords) {
    const cur = categoryStats.get(record.category) ?? {
      dbCount: 0,
      diskCount: 0,
      totalSizeBytes: 0,
    };
    cur.dbCount += 1;
    cur.totalSizeBytes += record.size;
    categoryStats.set(record.category, cur);
  }
  for (const [rel] of diskFiles) {
    const category = rel.split("/")[0]?.toUpperCase().replace("S", "S"); // 단순 매핑 시도
    // 카테고리 enum 매핑 — 디렉토리명 → enum
    const dirToCategory: Record<string, string> = {
      image: "IMAGE",
      avatar: "AVATAR",
      video: "VIDEO",
      videos: "VIDEO",
      document: "DOCUMENT",
      attachment: "ATTACHMENT",
    };
    const dir = rel.split("/")[0];
    const cat = dirToCategory[dir] ?? dir.toUpperCase();
    const cur = categoryStats.get(cat) ?? {
      dbCount: 0,
      diskCount: 0,
      totalSizeBytes: 0,
    };
    cur.diskCount += 1;
    categoryStats.set(cat, cur);
    void category; // unused — 의도적 미사용
  }

  // 업로더 TOP 10
  const uploaderStats = new Map<
    string,
    { fileCount: number; totalSizeBytes: number }
  >();
  for (const record of dbRecords) {
    const cur = uploaderStats.get(record.uploaderId) ?? {
      fileCount: 0,
      totalSizeBytes: 0,
    };
    cur.fileCount += 1;
    cur.totalSizeBytes += record.size;
    uploaderStats.set(record.uploaderId, cur);
  }
  const topUploaders = Array.from(uploaderStats.entries())
    .map(([uploaderId, stats]) => ({ uploaderId, ...stats }))
    .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
    .slice(0, 10);

  // 중복 (sha256 동일)
  const dupMap = new Map<
    string,
    { count: number; totalSizeBytes: number }
  >();
  for (const record of dbRecords) {
    if (!record.sha256) continue;
    const cur = dupMap.get(record.sha256) ?? { count: 0, totalSizeBytes: 0 };
    cur.count += 1;
    cur.totalSizeBytes += record.size;
    dupMap.set(record.sha256, cur);
  }
  const duplicates = Array.from(dupMap.entries())
    .filter(([, v]) => v.count > 1)
    .map(([sha256, v]) => ({ sha256, ...v }))
    .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

  const totalDbSizeBytes = dbRecords.reduce((sum, r) => sum + r.size, 0);
  const totalDiskSizeBytes = Array.from(diskFiles.values()).reduce(
    (sum, s) => sum + s,
    0,
  );

  const report: DiagnosticReport = {
    uploadRoot,
    generatedAt: new Date().toISOString(),
    summary: {
      dbRecords: dbRecords.length,
      diskFiles: diskFiles.size,
      missingFiles: missingFiles.length,
      orphanFiles: orphanFiles.length,
      mismatchedSize: mismatchedSize.length,
      totalDbSizeBytes,
      totalDiskSizeBytes,
    },
    categories: Array.from(categoryStats.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes),
    topUploaders,
    duplicates: duplicates.slice(0, 20),
    missingFiles: missingFiles.slice(0, 50),
    orphanFiles: orphanFiles.slice(0, 50),
    mismatchedSize: mismatchedSize.slice(0, 50),
  };

  console.log("[uploads-doctor] 4/4 진단 완료.");

  // --cleanup-orphans 옵션
  if (CLEANUP_ORPHANS && orphanFiles.length > 0) {
    console.log(
      `[uploads-doctor] Orphan 파일 ${orphanFiles.length}개 디스크 삭제 시도...`,
    );
    let deleted = 0;
    for (const orphan of orphanFiles) {
      if (await safeUnlink(orphan.absolutePath)) deleted += 1;
    }
    report.cleanupOrphansDeleted = deleted;
    console.log(`[uploads-doctor] Orphan 삭제 완료: ${deleted}건`);
  }

  return report;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function printHumanReport(r: DiagnosticReport): void {
  console.log("");
  console.log("==================== Uploads Doctor — 진단 리포트 ====================");
  console.log(`UPLOAD_ROOT     : ${r.uploadRoot}`);
  console.log(`Generated At    : ${r.generatedAt}`);
  console.log("");
  console.log("--- 요약 ---");
  console.log(`DB 레코드       : ${r.summary.dbRecords.toLocaleString()}건`);
  console.log(`디스크 파일     : ${r.summary.diskFiles.toLocaleString()}건`);
  console.log(`Missing files   : ${r.summary.missingFiles}건 (DB→디스크 부재)`);
  console.log(`Orphan files    : ${r.summary.orphanFiles}건 (디스크→DB 부재)`);
  console.log(`Mismatched size : ${r.summary.mismatchedSize}건`);
  console.log(
    `DB 총 용량      : ${formatBytes(r.summary.totalDbSizeBytes)}`,
  );
  console.log(
    `디스크 총 용량  : ${formatBytes(r.summary.totalDiskSizeBytes)}`,
  );
  console.log("");
  console.log("--- 카테고리별 ---");
  for (const c of r.categories) {
    console.log(
      `${c.category.padEnd(12)} DB=${String(c.dbCount).padStart(6)}  Disk=${String(c.diskCount).padStart(6)}  Size=${formatBytes(c.totalSizeBytes)}`,
    );
  }
  console.log("");
  console.log("--- 업로더 TOP 10 ---");
  for (const u of r.topUploaders) {
    console.log(
      `${u.uploaderId.padEnd(28)} files=${String(u.fileCount).padStart(5)}  total=${formatBytes(u.totalSizeBytes)}`,
    );
  }
  if (r.duplicates.length > 0) {
    console.log("");
    console.log("--- sha256 중복 (TOP 20) ---");
    for (const d of r.duplicates) {
      console.log(
        `${d.sha256.substring(0, 16)}… ×${d.count}  totalSize=${formatBytes(d.totalSizeBytes)}`,
      );
    }
  }
  if (r.missingFiles.length > 0) {
    console.log("");
    console.log("--- Missing files (TOP 50) ---");
    for (const m of r.missingFiles) {
      console.log(`  [${m.id}] ${m.category} ${m.url} uploader=${m.uploaderId}`);
    }
  }
  if (r.orphanFiles.length > 0) {
    console.log("");
    console.log("--- Orphan files (TOP 50) ---");
    for (const o of r.orphanFiles) {
      console.log(`  ${o.relativePath} (${formatBytes(o.sizeBytes)})`);
    }
    if (!CLEANUP_ORPHANS) {
      console.log("");
      console.log(
        "  💡 Orphan 정리: npm run uploads:doctor -- --cleanup-orphans",
      );
    }
  }
  if (r.mismatchedSize.length > 0) {
    console.log("");
    console.log("--- Mismatched size (TOP 50) ---");
    for (const m of r.mismatchedSize) {
      console.log(
        `  [${m.id}] DB=${formatBytes(m.dbSize)} Disk=${formatBytes(m.diskSize)} url=${m.url}`,
      );
    }
  }
  if (r.cleanupOrphansDeleted !== undefined) {
    console.log("");
    console.log(`✓ Orphan 정리 완료: ${r.cleanupOrphansDeleted}건 삭제`);
  }
  console.log("");
}

async function main(): Promise<void> {
  try {
    const report = await diagnose();
    if (JSON_OUTPUT) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
    // Missing files 가 있으면 exit 1 (CI/모니터링 통합용)
    if (report.summary.missingFiles > 0) {
      console.warn(
        `⚠️  Missing files ${report.summary.missingFiles}건 — DB와 디스크 동기화 필요`,
      );
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("[uploads-doctor] 실패:", err);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
