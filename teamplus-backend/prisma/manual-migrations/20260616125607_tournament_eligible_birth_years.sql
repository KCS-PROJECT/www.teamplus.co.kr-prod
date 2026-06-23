-- [2026-06-16] 대회 참가 출생연도 개별 선택 — Tournament.eligibleBirthYears 컬럼 추가.
-- 원격 공유 DEV DB(drift) 대상 수동 ALTER (prisma migrate dev 금지).
-- additive · NOT NULL DEFAULT ARRAY[]::INTEGER[] → 기존 행은 빈 배열 백필.
-- 빈 배열은 eligible_birth_year_from/to 범위로 폴백(이중지원)이라 기존 대회 영향 0.
-- IF NOT EXISTS 로 멱등. Class.target_birth_years(20260608) 선례 미러링.
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "eligible_birth_years" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
