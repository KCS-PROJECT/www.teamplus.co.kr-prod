-- 팀 정산 수취 계좌(팀 1:1). 팀 소유 감독이 입력하고, 운영자는 조회 후 나이스 관리자에 서브몰을 수동 등록한다.
-- 사업자번호·계좌번호는 애플리케이션에서 암호화한 값이 저장된다. 재실행해도 안전하다.
-- 롤백: oneshot/20260929_team_settlement_accounts_rollback.sql (배포 자동 적용 대상이 아니다)

DO $$ BEGIN
  CREATE TYPE "TeamSettlementAccountStatus" AS ENUM ('SUBMITTED', 'REGISTERED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "team_settlement_accounts" (
  "id"               TEXT NOT NULL,
  "team_id"          TEXT NOT NULL,
  "business_number"  TEXT NOT NULL,
  "bank_code"        VARCHAR(3) NOT NULL,
  "bank_account"     TEXT NOT NULL,
  "account_holder"   VARCHAR(30) NOT NULL,
  "status"           "TeamSettlementAccountStatus" NOT NULL DEFAULT 'SUBMITTED',
  "submitted_by_id"  TEXT NOT NULL,
  "submitted_at"     TIMESTAMPTZ(3) NOT NULL,
  "registered_by_id" TEXT,
  "registered_at"    TIMESTAMPTZ(3),
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "team_settlement_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_settlement_accounts_team_id_key"
  ON "team_settlement_accounts" ("team_id");

CREATE INDEX IF NOT EXISTS "team_settlement_accounts_status_idx"
  ON "team_settlement_accounts" ("status");

DO $$ BEGIN
  ALTER TABLE "team_settlement_accounts"
    ADD CONSTRAINT "team_settlement_accounts_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_settlement_accounts"
    ADD CONSTRAINT "team_settlement_accounts_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_settlement_accounts"
    ADD CONSTRAINT "team_settlement_accounts_registered_by_id_fkey"
    FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
