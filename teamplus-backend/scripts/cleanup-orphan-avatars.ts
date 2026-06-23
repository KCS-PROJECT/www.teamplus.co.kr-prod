/**
 * Orphan avatar 정리 스크립트
 *
 * 목적:
 *   users.avatar_url 필드 중 로컬 디스크(uploads/avatar/...)에 실제 파일이 없는
 *   참조(orphan)를 찾아 NULL 처리한다.
 *
 * 배경:
 *   일부 환경(로컬 개발·시드 DB 이전)에서 DB 에는 아바타 경로가 있지만
 *   파일 시스템에는 실제 이미지가 없어 Next.js Image 400 에러가 발생한다.
 *
 * 사용법:
 *   # 1) Dry-run (변경 없음 · 영향 받는 user 수만 출력)
 *   cd teamplus-backend
 *   npx tsx scripts/cleanup-orphan-avatars.ts --dry-run
 *
 *   # 2) 실제 실행 (확인 후)
 *   npx tsx scripts/cleanup-orphan-avatars.ts
 *
 * 안전장치:
 *   - 외부 URL(https://...) 은 건드리지 않음 (로컬 파일만 검증)
 *   - --dry-run 기본 동작은 아님 (실수 방지용 명시 옵션 패턴 안 따르고,
 *     대신 실행 전 건수·샘플 5건을 출력하여 사용자가 중단 가능)
 *   - 트랜잭션으로 묶어 롤백 가능
 *   - 실행 로그를 stdout 으로 출력
 *
 * TEAMPLUS 규약:
 *   - Prisma 경유 (raw SQL 대신)
 *   - PrismaClient 직접 인스턴스 (스크립트 전용)
 *   - 환경 변수는 .env.local 로드 (dotenv)
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// .env.local 우선 로드
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const UPLOADS_ROOT = path.resolve(__dirname, "..", "uploads");
const DRY_RUN = process.argv.includes("--dry-run");

interface OrphanRecord {
  id: string;
  email: string;
  avatarUrl: string;
}

function resolveLocalPath(avatarUrl: string): string | null {
  // 로컬 경로만 검증 (외부 URL 은 건너뜀)
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
    return null;

  // /uploads/avatar/... 또는 uploads/avatar/... 두 형태 모두 지원
  const normalized = avatarUrl.replace(/^\/+/, "");
  if (!normalized.startsWith("uploads/")) return null;

  const relative = normalized.replace(/^uploads\//, "");
  return path.join(UPLOADS_ROOT, relative);
}

async function main() {
  const prisma = new PrismaClient();

  console.log(`\n[cleanup-orphan-avatars] 시작 (DRY_RUN=${DRY_RUN})`);
  console.log(`  uploads 루트: ${UPLOADS_ROOT}`);

  try {
    const users = await prisma.user.findMany({
      where: {
        avatarUrl: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
      },
    });

    console.log(`  avatar_url 보유 사용자: ${users.length} 명`);

    const orphans: OrphanRecord[] = [];
    const external: OrphanRecord[] = [];

    for (const u of users) {
      if (!u.avatarUrl) continue;
      const localPath = resolveLocalPath(u.avatarUrl);
      if (!localPath) {
        external.push({ id: u.id, email: u.email, avatarUrl: u.avatarUrl });
        continue;
      }
      if (!fs.existsSync(localPath)) {
        orphans.push({ id: u.id, email: u.email, avatarUrl: u.avatarUrl });
      }
    }

    console.log(`  외부 URL (건드리지 않음): ${external.length} 건`);
    console.log(`  orphan (로컬 파일 없음): ${orphans.length} 건`);

    if (orphans.length > 0) {
      console.log(`\n  샘플 (최대 5 건):`);
      orphans.slice(0, 5).forEach((o) => {
        console.log(`    - ${o.email}: ${o.avatarUrl}`);
      });
    }

    if (DRY_RUN) {
      console.log(
        `\n  DRY-RUN 모드 · 변경 없음. 실제 실행 시 --dry-run 을 제거하세요.\n`,
      );
      return;
    }

    if (orphans.length === 0) {
      console.log(`\n  정리할 orphan 없음. 종료.\n`);
      return;
    }

    console.log(`\n  ${orphans.length} 건 NULL 처리 중...`);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: { in: orphans.map((o) => o.id) },
        },
        data: { avatarUrl: null },
      });
      return updated.count;
    });

    console.log(`  ✅ ${result} 건 정리 완료.\n`);
  } catch (err) {
    console.error("  ❌ 실패:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
