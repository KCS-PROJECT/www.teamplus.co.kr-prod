-- 결제 1건당 수업권 1행 보장 — 완료 경로 동시 진입 시 이중 발급을 DB 에서 차단.
-- payment_id IS NULL(mockPay·관리자 수동 발급)은 제외하는 partial index 라 기존 동작 무변경.
-- Prisma @unique 를 쓰지 않는 이유: Payment.credits 관계가 1:1 로 바뀌어 기존 배열 사용처가 깨진다.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_member_credits_payment_id"
  ON "member_credits" ("payment_id")
  WHERE "payment_id" IS NOT NULL;
