-- [2026-07-23] 활성 환불 요청 1건 제약 — 동일 결제에 동시 활성 요청/실행 차단(§11 #6, §13.7).
-- Prisma 스키마는 partial WHERE 를 표현할 수 없어 수동 SQL 필수.
-- 활성 집합 = pending(대기) · executing(실행 중) · execution_failed(PG 성공 여부 미해소).
CREATE UNIQUE INDEX IF NOT EXISTS "refund_requests_active_payment_key"
  ON "refund_requests"("payment_id")
  WHERE "status" IN ('pending','executing','execution_failed');
