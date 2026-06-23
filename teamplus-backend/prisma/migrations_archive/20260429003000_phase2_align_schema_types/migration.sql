-- Phase 2 후속: schema.prisma 와 DB 컬럼 타입 동기화
-- 목적: VARCHAR → TEXT (Prisma String 기본 매핑), TIMESTAMP → TIMESTAMP(3), FK ON UPDATE CASCADE 명시

BEGIN;

-- clubs 메타 컬럼: VARCHAR → TEXT
ALTER TABLE "icehockey"."clubs"
  ALTER COLUMN "short_name"      TYPE TEXT,
  ALTER COLUMN "division"        TYPE TEXT,
  ALTER COLUMN "primary_color"   TYPE TEXT,
  ALTER COLUMN "secondary_color" TYPE TEXT,
  ALTER COLUMN "home_arena"      TYPE TEXT,
  ALTER COLUMN "founding_date"   TYPE TIMESTAMP(3);

-- team_group_members 로스터 컬럼: VARCHAR → TEXT
ALTER TABLE "icehockey"."team_group_members"
  ALTER COLUMN "position" TYPE TEXT,
  ALTER COLUMN "status"   TYPE TEXT,
  ALTER COLUMN "left_at"  TYPE TIMESTAMP(3);

-- team_groups FK: ON UPDATE CASCADE 명시 (Prisma 기본)
ALTER TABLE "icehockey"."team_groups"
  DROP CONSTRAINT "team_groups_team_id_fkey";
ALTER TABLE "icehockey"."team_groups"
  ADD CONSTRAINT "team_groups_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "icehockey"."clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
