-- =============================================================================
-- Sprint 2026-04-11 · 공통 기능 누락/스텁 보강 — DDL 적용 스크립트
--
-- 이 스크립트는 `npm run db:migrate`가 아닌 운영 DB에 수동 적용 가능한 최소 DDL입니다.
-- 실행 전 반드시 백업을 권장합니다.
--
-- 포함:
-- 1. UserNotificationPreference — 3 컬럼 추가 (soundEnabled, vibrationEnabled,
--    quietHoursEnabled, categories JSONB)
-- 2. AppFeedback — adminReplyAt 컬럼 추가
-- 3. notice_reads — 신규 테이블 (공지 per-user 읽음 추적)
-- 4. user_blocks — 신규 테이블 (사용자 차단)
-- 5. user_reports — 신규 테이블 (사용자/콘텐츠 신고)
-- =============================================================================

-- 스키마 고정 (운영 DB: icehockey)
SET search_path TO icehockey;

BEGIN;

-- ─── 1. UserNotificationPreference 컬럼 추가 ────────────────────────────────
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "sound_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "vibration_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "categories" JSONB NOT NULL
    DEFAULT '{"class":true,"payment":true,"notice":true,"system":true}'::jsonb;

-- ─── 2. AppFeedback.admin_reply_at 추가 ─────────────────────────────────────
ALTER TABLE "app_feedbacks"
  ADD COLUMN IF NOT EXISTS "admin_reply_at" TIMESTAMP(3);

-- ─── 3. NoticeRead 신규 테이블 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notice_reads" (
  "id"         TEXT          NOT NULL,
  "notice_id"  TEXT          NOT NULL,
  "user_id"    TEXT          NOT NULL,
  "read_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("id")
);

-- FK / Index
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notice_reads_notice_id_fkey'
  ) THEN
    ALTER TABLE "notice_reads"
      ADD CONSTRAINT "notice_reads_notice_id_fkey"
      FOREIGN KEY ("notice_id") REFERENCES "system_notices"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notice_reads_user_id_fkey'
  ) THEN
    ALTER TABLE "notice_reads"
      ADD CONSTRAINT "notice_reads_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "notice_reads_notice_id_user_id_key"
  ON "notice_reads"("notice_id", "user_id");
CREATE INDEX IF NOT EXISTS "notice_reads_user_id_read_at_idx"
  ON "notice_reads"("user_id", "read_at");

-- ─── 4. UserBlock 신규 테이블 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id"         TEXT          NOT NULL,
  "blocker_id" TEXT          NOT NULL,
  "blocked_id" TEXT          NOT NULL,
  "reason"     TEXT,
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_blocks_blocker_id_fkey'
  ) THEN
    ALTER TABLE "user_blocks"
      ADD CONSTRAINT "user_blocks_blocker_id_fkey"
      FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_blocks_blocked_id_fkey'
  ) THEN
    ALTER TABLE "user_blocks"
      ADD CONSTRAINT "user_blocks_blocked_id_fkey"
      FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "user_blocks_blocker_id_blocked_id_key"
  ON "user_blocks"("blocker_id", "blocked_id");
CREATE INDEX IF NOT EXISTS "user_blocks_blocker_id_idx"
  ON "user_blocks"("blocker_id");
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_id_idx"
  ON "user_blocks"("blocked_id");

-- ─── 5. UserReport 신규 테이블 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_reports" (
  "id"          TEXT          NOT NULL,
  "reporter_id" TEXT          NOT NULL,
  "reported_id" TEXT          NOT NULL,
  "target_type" TEXT          NOT NULL,
  "target_id"   TEXT,
  "category"    TEXT          NOT NULL,
  "description" TEXT,
  "status"      TEXT          NOT NULL DEFAULT 'pending',
  "admin_note"  TEXT,
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_reports_reporter_id_fkey'
  ) THEN
    ALTER TABLE "user_reports"
      ADD CONSTRAINT "user_reports_reporter_id_fkey"
      FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_reports_reported_id_fkey'
  ) THEN
    ALTER TABLE "user_reports"
      ADD CONSTRAINT "user_reports_reported_id_fkey"
      FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_reports_status_created_at_idx"
  ON "user_reports"("status", "created_at");
CREATE INDEX IF NOT EXISTS "user_reports_reporter_id_idx"
  ON "user_reports"("reporter_id");
CREATE INDEX IF NOT EXISTS "user_reports_reported_id_idx"
  ON "user_reports"("reported_id");

COMMIT;

-- 적용 후 확인 쿼리:
-- SELECT COUNT(*) FROM notice_reads;       -- 0
-- SELECT COUNT(*) FROM user_blocks;        -- 0
-- SELECT COUNT(*) FROM user_reports;       -- 0
-- SELECT sound_enabled, categories FROM user_notification_preferences LIMIT 1;
-- SELECT admin_reply_at FROM app_feedbacks LIMIT 1;
