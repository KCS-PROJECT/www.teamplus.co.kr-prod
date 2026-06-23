-- [2026-06-10 SECURITY] CI 결정적 HMAC 인덱스(ci_hash) 컬럼 추가.
-- 원격 공유 DB(drift) 대상 수동 ALTER. unique 인덱스는 백필+중복검토 후 step2 에서 별도 생성.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ci_hash" TEXT;
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "ci_hash" TEXT;
