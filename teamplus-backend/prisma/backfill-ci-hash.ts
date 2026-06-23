/**
 * [2026-06-10 SECURITY] User.ci_hash 백필 스크립트.
 *
 * 배경: identity.service.encryptData 는 호출마다 랜덤 IV 를 써서 동일 CI 도 매번 다른 암호문이 된다.
 *   그래서 암호문 동등비교(중복가입 차단)가 무력화돼 있었다. 결정적 HMAC 인덱스(ci_hash)를 도입하면서
 *   기존 User.ci(암호문)를 복호화 → HMAC 재계산하여 ci_hash 를 채운다.
 *
 * 안전장치:
 *   - 기본은 dry-run (실제 UPDATE 안 함). 실제 적용은 `--apply` 플래그.
 *   - ci_hash 가 이미 있으면 skip (멱등).
 *   - 복호화 실패(키 불일치 등)는 건너뛰고 집계만.
 *   - 중복 ci_hash 그룹(과거 broken dedup 으로 생긴 중복 계정)을 리포트 — 운영자 수동 검토 대상.
 *
 * 실행:
 *   npx tsx prisma/backfill-ci-hash.ts            # dry-run (집계만)
 *   npx tsx prisma/backfill-ci-hash.ts --apply    # 실제 ci_hash UPDATE
 *
 * 전제: ci_hash 컬럼이 이미 추가돼 있어야 함 (prisma/manual-migrations/2026-06-10-ci-hash.sql).
 */
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const prisma = new PrismaClient();

const ENCRYPTION_KEY =
  process.env.IDENTITY_ENCRYPTION_KEY || "default-32-char-encryption-key!";
const CI_HASH_KEY =
  process.env.IDENTITY_CI_HASH_KEY || ENCRYPTION_KEY || "";
const ALGO = "aes-256-cbc";

function decryptData(encrypted: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const [ivHex, cipherHex] = encrypted.split(":");
  if (!ivHex || !cipherHex) throw new Error("bad format");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  let out = decipher.update(cipherHex, "hex", "utf8");
  out += decipher.final("utf8");
  return out;
}

function generateCiHash(ci: string): string {
  return crypto.createHmac("sha256", CI_HASH_KEY).update(ci, "utf8").digest("hex");
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[ci-hash backfill] mode=${apply ? "APPLY" : "DRY-RUN"}`);

  const users = await prisma.user.findMany({
    where: { ci: { not: null } },
    select: { id: true, ci: true, ciHash: true },
  });
  console.log(`[ci-hash backfill] ci 보유 사용자: ${users.length}명`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const hashToUserIds = new Map<string, string[]>();

  for (const u of users) {
    if (!u.ci) continue;
    let hash: string;
    try {
      const plain = decryptData(u.ci);
      hash = generateCiHash(plain);
    } catch {
      failed++;
      continue;
    }
    // 중복 그룹 집계
    const arr = hashToUserIds.get(hash) ?? [];
    arr.push(u.id);
    hashToUserIds.set(hash, arr);

    if (u.ciHash === hash) {
      skipped++;
      continue;
    }
    if (apply) {
      // 중복은 unique 제약 위반 위험 → 첫 계정만 채우고 충돌은 아래 리포트로
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: { ciHash: hash },
        });
        updated++;
      } catch (e) {
        failed++;
        console.warn(`  ! update 실패 userId=${u.id}: ${(e as Error).message}`);
      }
    } else {
      updated++; // dry-run 에서는 "채워질 예정" 카운트
    }
  }

  const duplicates = [...hashToUserIds.entries()].filter(
    ([, ids]) => ids.length > 1,
  );

  console.log(
    `[ci-hash backfill] ${apply ? "업데이트" : "업데이트 예정"}: ${updated}, 이미 일치(skip): ${skipped}, 복호화 실패: ${failed}`,
  );
  if (duplicates.length > 0) {
    console.warn(
      `[ci-hash backfill] ⚠️ 중복 CI 그룹 ${duplicates.length}건 발견 — 과거 중복가입 계정. unique 인덱스 생성 전 수동 검토 필요:`,
    );
    for (const [hash, ids] of duplicates) {
      console.warn(`   ${hash.slice(0, 12)}... → userIds: ${ids.join(", ")}`);
    }
  } else {
    console.log(
      "[ci-hash backfill] ✅ 중복 CI 없음 — unique 인덱스 생성 안전.",
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
