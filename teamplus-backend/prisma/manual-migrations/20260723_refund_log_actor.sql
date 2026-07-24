-- [2026-07-23] RefundLog 감사 컬럼 — 모든 환불(승인/ADMIN/trusted) 실행 주체 기록(잔여 결정 3번).
ALTER TABLE "refund_logs" ADD COLUMN IF NOT EXISTS "actor_id" TEXT;
