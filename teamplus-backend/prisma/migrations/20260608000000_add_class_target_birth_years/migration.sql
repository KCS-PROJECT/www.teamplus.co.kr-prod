-- AddColumn: classes.target_birth_years (대상 출생연도 개별 목록)
--   · 개별/비연속 선택을 지원하는 SoT 컬럼. 예: {2015,2017,2019}
--   · 빈 배열({}) = 전 연령 대상. 기존 age_min/age_max 는 이 값의 한국나이 min/max 파생값.
ALTER TABLE "icehockey"."classes"
    ADD COLUMN "target_birth_years" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Backfill: 기존 age_min~age_max(한국나이 범위)를 출생연도 목록으로 환산.
--   한국나이 정의(age.util.ts §): koreanAge = currentYear - birthYear + 1
--   역산: birthYear = currentYear - koreanAge + 1
--   범위 [age_min, age_max] → 출생연도 [currentYear-age_max+1 .. currentYear-age_min+1]
UPDATE "icehockey"."classes"
SET "target_birth_years" = ARRAY(
    SELECT (EXTRACT(YEAR FROM CURRENT_DATE)::int - a + 1)
    FROM generate_series("age_min", "age_max") AS a
    ORDER BY 1
)
WHERE "age_min" IS NOT NULL
  AND "age_max" IS NOT NULL
  AND "age_max" >= "age_min";
