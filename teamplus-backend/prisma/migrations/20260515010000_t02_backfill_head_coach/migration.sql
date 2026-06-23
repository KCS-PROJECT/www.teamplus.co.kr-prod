-- ===================================================================
-- T02 협업 백필 마이그레이션 — 2026-05-15
-- ===================================================================
-- 목적:
--   기존 팀의 TeamMember 중 감독(teams.coach_id) 에 해당하지만
--   role_in_team 이 NULL 인 레코드를 'HEAD_COACH' 로 보정한다.
--
-- 멱등성:
--   role_in_team IS NULL 조건이 있어 재실행해도 안전.
--   이미 HEAD_COACH/COACH 등 값이 채워진 행은 변경하지 않음.
-- ===================================================================

UPDATE "public"."team_members"
SET "role_in_team" = 'HEAD_COACH'
WHERE "user_id" IN (
  SELECT "coach_id" FROM "public"."teams" WHERE "coach_id" IS NOT NULL
)
  AND "role_in_team" IS NULL;
