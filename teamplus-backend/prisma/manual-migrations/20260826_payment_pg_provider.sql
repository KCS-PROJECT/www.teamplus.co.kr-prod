-- 결제사(PG) 식별 컬럼 추가 + 기존 결제 백필.
-- 기존에는 payment_method 값('toss')과 tid 정규식 추론으로 결제사를 판별해 왔다.
-- 결제사가 3개 이상이 되면 tid 형식 충돌로 환불이 잘못된 결제사로 나갈 수 있어 컬럼으로 승격한다.
-- 의미: 결제 시작 시점에 고정되는 값. 승인·취소·환불 라우팅의 기준이며 한번 기록되면 바뀌지 않는다.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "pg_provider" VARCHAR(20);

COMMENT ON COLUMN "payments"."pg_provider" IS
  '결제사 — 결제 시작 시점에 고정. 승인·취소·환불 라우팅 기준. toss|nice|inicis|mock';

-- 백필. 모든 문장에 pg_provider IS NULL 조건이 있어 재실행해도 결과가 같다.
-- KG이니시스(inicis) 문장은 없다 — PG 결제 실사용 0건(본인인증 전용).

-- (1) 테스트 결제
UPDATE "payments" SET "pg_provider" = 'mock'
 WHERE "pg_provider" IS NULL AND "payment_method" = 'mock';

-- (2) 토스 — payment_method 에 명시된 건 (2026-05-14 이후 confirm 이 하드코딩 저장)
UPDATE "payments" SET "pg_provider" = 'toss'
 WHERE "pg_provider" IS NULL AND "payment_method" = 'toss';

-- (3) 토스 — 초기 건. payment_method 에 실제 결제수단('계좌이체')이 저장돼 있어
--     토스 거래번호 형식(t + 영숫자 11~39)으로 판정한다.
UPDATE "payments" SET "pg_provider" = 'toss'
 WHERE "pg_provider" IS NULL AND "tid" ~ '^t[A-Za-z0-9]{11,39}$';
