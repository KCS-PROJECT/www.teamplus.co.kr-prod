-- 나이스 지급대행 API 연동 1단계: 서브몰 자동 등록 결과 저장, 호출 기록, 사용 단계 설정. 재실행해도 안전하다.
-- 롤백: oneshot/20260930_payout_api_4a_rollback.sql (배포 자동 적용 대상이 아니다)

ALTER TYPE "TeamSettlementAccountStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "team_settlement_accounts"
  ADD COLUMN IF NOT EXISTS "sub_mall_id"             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "last_res_code"           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "last_res_msg"            VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "last_attempted_at"       TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "registration_started_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX IF NOT EXISTS "team_settlement_accounts_sub_mall_id_key"
  ON "team_settlement_accounts" ("sub_mall_id");

CREATE TABLE IF NOT EXISTS "nice_payout_api_logs" (
  "id"            TEXT NOT NULL,
  "sid"           VARCHAR(7) NOT NULL,
  "team_id"       TEXT,
  "settlement_id" TEXT,
  "sub_id"        VARCHAR(50),
  "req_type"      SMALLINT,
  "res_code"      VARCHAR(10),
  "res_msg"       VARCHAR(200),
  "outcome"       VARCHAR(10) NOT NULL,
  "http_status"   INTEGER,
  "duration_ms"   INTEGER NOT NULL,
  "error"         VARCHAR(50),
  "requested_by"  TEXT,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nice_payout_api_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "nice_payout_api_logs_team_id_sid_idx"
  ON "nice_payout_api_logs" ("team_id", "sid");

CREATE INDEX IF NOT EXISTS "nice_payout_api_logs_settlement_id_idx"
  ON "nice_payout_api_logs" ("settlement_id");

CREATE INDEX IF NOT EXISTS "nice_payout_api_logs_created_at_idx"
  ON "nice_payout_api_logs" ("created_at");

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "payout_api_mode" VARCHAR(10) NOT NULL DEFAULT 'off';
