-- Migration: 학년별 타겟 공지 + 아카데미 홍보 시스템
-- 1. system_notices 테이블에 학년 타겟 필드 추가
-- 2. academy_promotions 테이블 신규 생성

-- ==============================================
-- 1. system_notices 확장: 학년별 타겟 공지 필드
-- ==============================================
ALTER TABLE "system_notices"
  ADD COLUMN "target_birth_year_from" INTEGER,
  ADD COLUMN "target_birth_year_to"   INTEGER,
  ADD COLUMN "target_club_id"         TEXT;

CREATE INDEX "system_notices_target_club_id_idx"
  ON "system_notices" ("target_club_id");

-- ==============================================
-- 2. academy_promotions 테이블 생성
-- ==============================================
CREATE TABLE "academy_promotions" (
  "id"            TEXT        NOT NULL,
  "coach_id"      TEXT        NOT NULL,
  "club_id"       TEXT,
  "title"         TEXT        NOT NULL,
  "content"       TEXT        NOT NULL,
  "image_url"     TEXT,
  "lesson_type"   TEXT        NOT NULL,
  "schedule_info" TEXT,
  "price_info"    TEXT,
  "capacity"      INTEGER,
  "venue_info"    TEXT,
  "contact_phone" TEXT,
  "is_active"     BOOLEAN     NOT NULL DEFAULT true,
  "start_date"    TIMESTAMP(3),
  "end_date"      TIMESTAMP(3),
  "view_count"    INTEGER     NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "academy_promotions_pkey" PRIMARY KEY ("id")
);

-- 외래 키 제약
ALTER TABLE "academy_promotions"
  ADD CONSTRAINT "academy_promotions_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academy_promotions"
  ADD CONSTRAINT "academy_promotions_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 인덱스
CREATE INDEX "academy_promotions_is_active_created_at_idx"
  ON "academy_promotions" ("is_active", "created_at");

CREATE INDEX "academy_promotions_coach_id_idx"
  ON "academy_promotions" ("coach_id");

CREATE INDEX "academy_promotions_lesson_type_idx"
  ON "academy_promotions" ("lesson_type");
