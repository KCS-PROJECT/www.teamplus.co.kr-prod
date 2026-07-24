-- [2026-07-24] 토스 멱등 재처리 안전 계약 — 최초 PG 시도 시각 보존.
-- 멱등키 유효기간(토스 ~15일) 경과 판정 기준. reprocess 는 executionStartedAt 을 갱신하므로
-- 최초 시각은 본 컬럼에 1회만 기록(set-if-null).
ALTER TABLE "refund_requests" ADD COLUMN IF NOT EXISTS "pg_first_attempted_at" TIMESTAMPTZ(3);
