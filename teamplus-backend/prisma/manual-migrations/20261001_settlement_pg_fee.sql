-- 팀 정산 명세에 결제(PG) 수수료율·수수료 금액을 기록한다(팀 부담, 마감 시 건별 계산). 재실행해도 안전하다.
-- 기존 행은 0 으로 채워져 실지급액(actual_amount)과 의미가 그대로다.
-- 롤백: oneshot/20261001_settlement_pg_fee_rollback.sql (배포 자동 적용 대상이 아니다)

ALTER TABLE "settlement_details"
  ADD COLUMN IF NOT EXISTS "pg_fee_rate"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pg_fee_amount" INTEGER NOT NULL DEFAULT 0;
