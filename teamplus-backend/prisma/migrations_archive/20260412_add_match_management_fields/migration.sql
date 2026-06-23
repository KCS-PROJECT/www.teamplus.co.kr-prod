-- Migration: add_match_management_fields
-- 생성일: 2026-04-12
-- 목적: PickupMatch 관리 기능 확장 (조회수, 취소 관리, 수정자 추적)
--       PickupMatchApplicant 거절/환불 정보 추가

-- PickupMatch 테이블: 관리 기능 확장 필드 추가
ALTER TABLE "pickup_matches"
  ADD COLUMN "view_count"          INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "cancelled_at"        TIMESTAMP(3),
  ADD COLUMN "cancelled_reason"    TEXT,
  ADD COLUMN "updated_by_user_id"  TEXT;

-- PickupMatch: updatedBy FK 추가 (MatchUpdater relation)
ALTER TABLE "pickup_matches"
  ADD CONSTRAINT "pickup_matches_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PickupMatch: 인덱스 추가
CREATE INDEX "pickup_matches_status_scheduled_at_idx" ON "pickup_matches"("status", "scheduled_at");
CREATE INDEX "pickup_matches_view_count_idx" ON "pickup_matches"("view_count");

-- PickupMatchApplicant 테이블: 거절/환불 정보 추가
ALTER TABLE "pickup_match_applicants"
  ADD COLUMN "rejection_reason"  TEXT,
  ADD COLUMN "rejected_at"       TIMESTAMP(3),
  ADD COLUMN "refunded_at"       TIMESTAMP(3),
  ADD COLUMN "refund_amount"     INTEGER;
