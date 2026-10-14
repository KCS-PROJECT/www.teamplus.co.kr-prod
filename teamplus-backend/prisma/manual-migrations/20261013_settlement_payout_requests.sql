-- 팀 정산 나이스 지급대행 요청 기록과 기본 지급일 설정. 재실행해도 안전하다.
-- 롤백: oneshot/20261013_settlement_payout_requests_rollback.sql (배포 자동 적용 대상이 아니다)

CREATE TABLE IF NOT EXISTS "settlement_payout_requests" (
  "id"                 TEXT NOT NULL,
  "settlement_id"      TEXT NOT NULL,
  "team_id"            TEXT,
  "team_name"          VARCHAR(100) NOT NULL,
  "settlement_month"   VARCHAR(7) NOT NULL,
  "sub_mall_id"        VARCHAR(50) NOT NULL,
  "settlement_date"    DATE NOT NULL,
  "amount"             INTEGER NOT NULL,
  "accnt_desc"         VARCHAR(30),
  "nice_seq"           VARCHAR(20),
  "status"             VARCHAR(12) NOT NULL,
  "res_code"           VARCHAR(10),
  "res_msg"            VARCHAR(200),
  "request_error"      VARCHAR(50),
  "nice_status_nm"     VARCHAR(20),
  "err_reason"         VARCHAR(200),
  "bank_name"          VARCHAR(50) NOT NULL,
  "bank_account"       TEXT NOT NULL,
  "account_holder"     VARCHAR(30) NOT NULL,
  "account_updated_at" TIMESTAMPTZ(3) NOT NULL,
  "requested_by_id"    TEXT,
  "requested_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at"       TIMESTAMPTZ(3),
  "last_checked_at"    TIMESTAMPTZ(3),
  "check_count"        INTEGER NOT NULL DEFAULT 0,
  "needs_review"       BOOLEAN NOT NULL DEFAULT false,
  "updated_at"         TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "settlement_payout_requests_pkey" PRIMARY KEY ("id")
);

-- 정산이 지워질 때 요청 기록이 함께 사라지지 않게 막고, 팀이 지워지면 팀 연결만 끊는다(팀명 스냅샷으로 표시).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_payout_requests_settlement_id_fkey'
  ) THEN
    ALTER TABLE "settlement_payout_requests"
      ADD CONSTRAINT "settlement_payout_requests_settlement_id_fkey"
      FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_payout_requests_team_id_fkey'
  ) THEN
    ALTER TABLE "settlement_payout_requests"
      ADD CONSTRAINT "settlement_payout_requests_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_payout_requests_requested_by_id_fkey'
  ) THEN
    ALTER TABLE "settlement_payout_requests"
      ADD CONSTRAINT "settlement_payout_requests_requested_by_id_fkey"
      FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "settlement_payout_requests_settlement_id_requested_at_idx"
  ON "settlement_payout_requests" ("settlement_id", "requested_at");

CREATE INDEX IF NOT EXISTS "settlement_payout_requests_settlement_date_status_idx"
  ON "settlement_payout_requests" ("settlement_date", "status");

CREATE INDEX IF NOT EXISTS "settlement_payout_requests_team_id_idx"
  ON "settlement_payout_requests" ("team_id");

CREATE INDEX IF NOT EXISTS "settlement_payout_requests_status_idx"
  ON "settlement_payout_requests" ("status");

-- 정산 1건에 진행 중인 지급 요청은 1건만 — 같은 정산을 두 번 보내는 경쟁을 DB 가 막는다(위반은 P2002).
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_payout_requests_one_active_per_settlement"
  ON "settlement_payout_requests" ("settlement_id")
  WHERE "status" IN ('REQUESTING', 'REQUESTED', 'UNCONFIRMED');

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "payout_day_of_month" INTEGER NOT NULL DEFAULT 15;
