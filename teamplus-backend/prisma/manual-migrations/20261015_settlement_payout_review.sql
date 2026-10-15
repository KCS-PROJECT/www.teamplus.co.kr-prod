-- 나이스 지급 결과 대조의 운영자 확인(사유·메모·처리자·처리 시각)을 지급 요청 행에 둔다. 재실행해도 안전하다.
-- 롤백: oneshot/20261015_settlement_payout_review_rollback.sql (배포 자동 적용 대상이 아니다)

ALTER TABLE "settlement_payout_requests"
  ADD COLUMN IF NOT EXISTS "review_reason"  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "reviewed_at"    TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "review_memo"    VARCHAR(500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_payout_requests_reviewed_by_id_fkey'
  ) THEN
    ALTER TABLE "settlement_payout_requests"
      ADD CONSTRAINT "settlement_payout_requests_reviewed_by_id_fkey"
      FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
