-- AlterColumn: teams.team_code NOT NULL → NULLABLE (2026-06-01)
--   감독 가입 시 팀 코드를 받지 않고 미설정(null)으로 생성, 추후 팀 관리에서 등록·변경.
--   기존 UNIQUE 제약은 유지(PostgreSQL은 nullable UNIQUE에서 NULL 다중 허용).
ALTER TABLE "teams" ALTER COLUMN "team_code" DROP NOT NULL;
