-- Migration: Add Tournament Registration + Eligible Birth Year Filter + Fee Calculation
-- 대회 참가비 자동계산 + 연도별 자격 필터링

-- ==================== tournaments 테이블 확장 ====================

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "eligible_birth_year_from" INTEGER,
  ADD COLUMN IF NOT EXISTS "eligible_birth_year_to"   INTEGER,
  ADD COLUMN IF NOT EXISTS "fee_per_game"              DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "total_games"               INTEGER,
  ADD COLUMN IF NOT EXISTS "fee_type"                  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "max_participants"          INTEGER,
  ADD COLUMN IF NOT EXISTS "registration_deadline"     TIMESTAMP(3);

-- ==================== tournament_registrations 테이블 생성 ====================

CREATE TABLE "tournament_registrations" (
  "id"             TEXT         NOT NULL,
  "tournament_id"  TEXT         NOT NULL,
  "user_id"        TEXT         NOT NULL,
  "child_id"       TEXT,
  "games_count"    INTEGER      NOT NULL,
  "calculated_fee" DECIMAL(10,2) NOT NULL,
  "payment_status" VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  "payment_id"     TEXT,
  "registered_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at"   TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

-- 외래키 제약
ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UNIQUE 제약 (대회 + 등록자 + 자녀 조합)
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_user_id_child_id_key"
  ON "tournament_registrations"("tournament_id", "user_id", COALESCE("child_id", ''));

-- 인덱스
CREATE INDEX "tournament_registrations_tournament_id_payment_status_idx"
  ON "tournament_registrations"("tournament_id", "payment_status");

CREATE INDEX "tournament_registrations_user_id_idx"
  ON "tournament_registrations"("user_id");
