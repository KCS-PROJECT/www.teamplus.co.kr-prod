-- 신규 결제에 사용할 결제사(PG) 설정. 관리자가 어드민에서 변경하며 재배포 없이 즉시 반영된다.
-- 기존 결제의 승인·취소·환불은 이 값이 아니라 payments.pg_provider(결제 시작 시점 고정)를 따른다.
-- 기본값 'toss' — 기존 행이 현재 동작과 동일해진다.
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "payment_provider" VARCHAR(20) NOT NULL DEFAULT 'toss';

COMMENT ON COLUMN "app_settings"."payment_provider" IS
  '신규 결제에 사용할 결제사. 기존 결제 라우팅은 payments.pg_provider 를 따른다. toss|nice';
