-- 대회일정(경기)별 참가비(fee) 추가
--   · 원격 공유 DB(schema=icehockey) — prisma migrate dev 불가(shadow DB 권한 없음) → prisma db execute / 수동 SQL 적용.
--   · additive (nullable 컬럼 추가) — 데이터 손실 없음. IF NOT EXISTS 로 재실행 안전.
--   · 적용 후: npx prisma generate (Prisma Client 모델 동기화)

-- HockeyMatch.fee — 감독이 대회일정마다 개별 참가비 입력 (null/0 = 무료).
--   학부모는 일정들을 선택해 합산 결제하거나 전체 결제한다.
ALTER TABLE "icehockey"."hockey_matches"
    ADD COLUMN IF NOT EXISTS "fee" DECIMAL(10,2);
