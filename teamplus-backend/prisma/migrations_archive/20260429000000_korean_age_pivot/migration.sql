-- ============================================================
-- Korean Age Pivot — 만나이 → 한국나이 일괄 전환 (백필 only)
-- ============================================================
-- 배경: calculateKoreanAge 함수가 misnomer (실제로는 만나이 계산) 였고
--       DB 컬럼 (users.korean_age, club_members.player_age) 의 원래 설계
--       의도는 "한국 나이" (database_schema.sql, ERD.md, erd.json 명시).
--       비즈니스 표준을 한국나이로 통일하면서 기존 저장값을 한국나이로 백필.
--
-- 정책:
--  - 한국나이 = currentYear - birthYear + 1 (생일 무관)
--  - 만 14세 미만 보호자 동의 검증은 만나이 유지 (calculateInternationalAge 사용)
--  - 운영 데이터 없음 (mock/test 만 존재) → 단순 일괄 갱신 안전
--
-- 참고: src/common/utils/age.util.ts, docs/Planning/PAYMENT_FEE_POLICY.md §5

-- ─────────────────────────────────────────────────────────────
-- 1) users.korean_age 한국나이로 일괄 백필
-- ─────────────────────────────────────────────────────────────
UPDATE "users"
SET "korean_age" = EXTRACT(YEAR FROM CURRENT_DATE)::int
                 - EXTRACT(YEAR FROM "birth_date")::int + 1
WHERE "birth_date" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2) club_members.player_age 한국나이로 일괄 백필
--    a) 자녀: ChildProfile.birth_date 우선 사용
-- ─────────────────────────────────────────────────────────────
UPDATE "club_members" cm
SET "player_age" = EXTRACT(YEAR FROM CURRENT_DATE)::int
                 - EXTRACT(YEAR FROM cp."birth_date")::int + 1
FROM "child_profiles" cp
WHERE cm."user_id" = cp."user_id"
  AND cp."birth_date" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
--    b) 비자녀(parent/coach 등): User.birth_date 사용
--       (ChildProfile 이 없는 회원만)
-- ─────────────────────────────────────────────────────────────
UPDATE "club_members" cm
SET "player_age" = EXTRACT(YEAR FROM CURRENT_DATE)::int
                 - EXTRACT(YEAR FROM u."birth_date")::int + 1
FROM "users" u
WHERE cm."user_id" = u."id"
  AND u."birth_date" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "child_profiles" cp WHERE cp."user_id" = u."id"
  );
