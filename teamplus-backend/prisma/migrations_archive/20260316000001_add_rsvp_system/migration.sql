-- Migration: RSVP 참석/불참 사전응답 시스템 추가
-- Created: 2026-03-16
-- Description: ClassSchedule에 rsvp_deadline 컬럼 추가 + class_rsvps 테이블 생성

-- 1. class_schedules에 rsvp_deadline 컬럼 추가
ALTER TABLE "icehockey"."class_schedules"
  ADD COLUMN "rsvp_deadline" TIMESTAMP(3);

-- 2. class_rsvps 테이블 생성
CREATE TABLE "icehockey"."class_rsvps" (
  "id"           TEXT         NOT NULL,
  "schedule_id"  TEXT         NOT NULL,
  "user_id"      TEXT         NOT NULL,
  "child_id"     TEXT,
  "status"       TEXT         NOT NULL DEFAULT 'PENDING',
  "responded_at" TIMESTAMP(3),
  "note"         TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "class_rsvps_pkey" PRIMARY KEY ("id")
);

-- 3. 인덱스 생성
CREATE UNIQUE INDEX "class_rsvps_schedule_id_user_id_child_id_key"
  ON "icehockey"."class_rsvps"("schedule_id", "user_id", "child_id");

CREATE INDEX "class_rsvps_schedule_id_status_idx"
  ON "icehockey"."class_rsvps"("schedule_id", "status");

CREATE INDEX "class_rsvps_user_id_idx"
  ON "icehockey"."class_rsvps"("user_id");

CREATE INDEX "class_rsvps_status_idx"
  ON "icehockey"."class_rsvps"("status");

-- 4. 외래키 제약조건
ALTER TABLE "icehockey"."class_rsvps"
  ADD CONSTRAINT "class_rsvps_schedule_id_fkey"
  FOREIGN KEY ("schedule_id")
  REFERENCES "icehockey"."class_schedules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icehockey"."class_rsvps"
  ADD CONSTRAINT "class_rsvps_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "icehockey"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icehockey"."class_rsvps"
  ADD CONSTRAINT "class_rsvps_child_id_fkey"
  FOREIGN KEY ("child_id")
  REFERENCES "icehockey"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
