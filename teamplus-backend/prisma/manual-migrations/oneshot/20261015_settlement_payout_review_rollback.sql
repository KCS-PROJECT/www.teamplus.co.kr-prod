-- 20261015_settlement_payout_review.sql 되돌리기. 수동 실행 전용.
-- 운영자가 적은 확인 메모와 처리 이력이 함께 사라진다 — 지우기 전에 백업한다.

BEGIN;

ALTER TABLE "settlement_payout_requests"
  DROP CONSTRAINT IF EXISTS "settlement_payout_requests_reviewed_by_id_fkey";

ALTER TABLE "settlement_payout_requests"
  DROP COLUMN IF EXISTS "review_reason",
  DROP COLUMN IF EXISTS "reviewed_at",
  DROP COLUMN IF EXISTS "reviewed_by_id",
  DROP COLUMN IF EXISTS "review_memo";

COMMIT;
