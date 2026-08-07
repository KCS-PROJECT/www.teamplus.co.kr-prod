-- 대회 기간(일정 미정) 허용 — tournaments.start_date/end_date NOT NULL 해제.
-- null = 일정 미정(추후 확정) 대회. 기존 데이터 무변경(additive-safe, 멱등).
ALTER TABLE "tournaments" ALTER COLUMN "start_date" DROP NOT NULL;
ALTER TABLE "tournaments" ALTER COLUMN "end_date" DROP NOT NULL;
