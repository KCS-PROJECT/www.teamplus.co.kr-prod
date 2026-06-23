-- [2026-06-16] 대회 후불 정산 — Tournament.billingMode 컬럼 추가.
-- 원격 공유 DEV DB(drift) 대상 수동 ALTER (prisma migrate dev 금지).
-- additive · NOT NULL DEFAULT 'PREPAID' → 기존 행 자동 하위호환(선불 영향 0). IF NOT EXISTS 로 멱등.
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "billing_mode" VARCHAR NOT NULL DEFAULT 'PREPAID';
