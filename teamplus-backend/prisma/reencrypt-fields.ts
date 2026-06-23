/**
 * At-rest 필드 재암호화 마이그레이션 — 레거시 CRYPTO_SECRET_KEY → 서버 전용 FIELD_ENCRYPTION_KEY
 *
 * [2026-06-15 SECURITY] finding #2 후속.
 *   web 의 NEXT_PUBLIC_CRYPTO_SECRET_KEY(=CRYPTO_SECRET_KEY)가 브라우저에 노출되는데,
 *   백엔드 at-rest 필드 암호화도 같은 키를 써서 PII 암호화 키가 공개로 읽혔다.
 *   field-encryption.util.ts 가 이제 FIELD_ENCRYPTION_KEY 를 우선 사용하고, 복호화는
 *   레거시 키 폴백을 지원한다. 본 스크립트는 기존 데이터를 신규 키로 강제 재암호화해
 *   레거시 CRYPTO_SECRET_KEY 를 env 에서 제거할 수 있게 한다.
 *
 * 선행 조건:
 *   1) FIELD_ENCRYPTION_KEY (64 hex, `openssl rand -hex 32`, 서버 전용) 설정
 *   2) 레거시 CRYPTO_SECRET_KEY 도 아직 env 에 유지(폴백 복호화에 필요)
 *
 * 사용법:
 *   npx tsx prisma/reencrypt-fields.ts            # DRY-RUN (변경 없음, 건수만 출력)
 *   npx tsx prisma/reencrypt-fields.ts --apply    # 실제 재암호화 반영
 *
 * ⚠️ 원격 공유 DEV DB 정책: prisma migrate dev 금지. 본 스크립트는 데이터만 갱신한다.
 *   운영 적용 전 백업 권장. 완료 후 env 에서 CRYPTO_SECRET_KEY 제거 가능
 *   (web 의 NEXT_PUBLIC_CRYPTO_SECRET_KEY 와 로그인 E2E 정합은 별도 — 동시 교체 주의).
 *
 * 대상: Settlement.bankAccount (현재 유일한 at-rest 암호화 필드).
 *   신규 암호화 필드를 추가하면 본 스크립트의 TARGETS 에 등록할 것.
 */
import { PrismaClient } from "@prisma/client";
import {
  encryptField,
  decryptField,
  isEncryptedField,
} from "../src/common/utils/field-encryption.util";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.warn(
      "⚠️ FIELD_ENCRYPTION_KEY 미설정 — 신규 키가 없으면 재암호화 의미가 없습니다. " +
        "먼저 `openssl rand -hex 32` 로 생성해 env 에 설정하세요.",
    );
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.settlement.findMany({
      where: { bankAccount: { not: null } },
      select: { id: true, bankAccount: true },
    });

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const value = row.bankAccount;
      if (!value || !isEncryptedField(value)) {
        skipped++;
        continue;
      }
      try {
        // 레거시/신규 키 자동 폴백으로 복호화 → 신규 키(FIELD_ENCRYPTION_KEY)로 재암호화
        const plain = decryptField(value);
        const reencrypted = encryptField(plain);
        if (apply) {
          await prisma.settlement.update({
            where: { id: row.id },
            data: { bankAccount: reencrypted },
          });
        }
        migrated++;
      } catch (e) {
        failed++;
        console.error(
          `  ✗ settlement ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    console.log(
      `[reencrypt-fields] Settlement.bankAccount — total=${rows.length} ` +
        `reencrypt=${migrated} skipped(평문/null)=${skipped} failed=${failed} ` +
        (apply ? "(APPLIED)" : "(DRY-RUN — --apply 로 실제 반영)"),
    );
    if (failed > 0) {
      console.error(
        "❌ 복호화 실패 건 존재 — 레거시 CRYPTO_SECRET_KEY 가 env 에 있는지 확인 후 재실행하세요.",
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
