-- Phase 2: clubs ↔ teams ↔ team_groups 모델 통합 (옵션 3)
-- 근거: docs/Planning/CLUBS_TO_TEAMS_MIGRATION_SPEC.md §1.2
-- 정책: 타이탄스/블리자드(현 teams) → 신 clubs 승격
--       test 주니어 5개(현 teams) → test 클럽 산하 team_groups로 변환
--       team_rosters → team_group_members 흡수 (자식 그룹 + 자동 "기본" 그룹)
--       teams 테이블 DROP

BEGIN;

-- ============================================================
-- STEP 1: clubs 에 메타 컬럼 10개 ADD
-- ============================================================
ALTER TABLE "icehockey"."clubs"
  ADD COLUMN "logo_url"        TEXT,
  ADD COLUMN "short_name"      VARCHAR(16),
  ADD COLUMN "division"        VARCHAR(8),
  ADD COLUMN "primary_color"   VARCHAR(16),
  ADD COLUMN "secondary_color" VARCHAR(16),
  ADD COLUMN "description"     TEXT,
  ADD COLUMN "slogan"          TEXT,
  ADD COLUMN "founding_date"   TIMESTAMP,
  ADD COLUMN "home_arena"      VARCHAR(255),
  ADD COLUMN "is_active"       BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX "clubs_is_active_idx" ON "icehockey"."clubs"("is_active");

-- ============================================================
-- STEP 2: team_group_members 에 로스터 컬럼 7개 ADD
-- ============================================================
ALTER TABLE "icehockey"."team_group_members"
  ADD COLUMN "position"       VARCHAR(16),
  ADD COLUMN "jersey_number"  INT,
  ADD COLUMN "is_captain"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "is_alt_captain" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "status"         VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN "left_at"        TIMESTAMP;

CREATE INDEX "team_group_members_status_idx" ON "icehockey"."team_group_members"("status");
CREATE INDEX "team_group_members_position_idx" ON "icehockey"."team_group_members"("position");

-- ============================================================
-- STEP 3: 타이탄스/블리자드 → 신 clubs INSERT (id 그대로 사용, cuid 충돌 0)
-- ============================================================
INSERT INTO "icehockey"."clubs" (
  "id", "club_code", "club_name", "coach_id", "phone", "location", "default_billing_timing",
  "created_at", "updated_at",
  "logo_url", "short_name", "division", "primary_color", "secondary_color",
  "description", "slogan", "founding_date", "home_arena", "is_active"
)
SELECT
  t."id",
  COALESCE(NULLIF(UPPER(t."short_name"), ''), 'TEAM') || '-' || SUBSTRING(t."id" FROM 1 FOR 8) AS club_code,
  t."name",
  c_src."coach_id",
  c_src."phone",
  c_src."location",
  c_src."default_billing_timing",
  t."created_at",
  t."updated_at",
  t."logo_url", t."short_name", t."division", t."primary_color", t."secondary_color",
  t."description", t."slogan", t."founding_date", t."home_arena", t."is_active"
FROM "icehockey"."teams" t
JOIN "icehockey"."clubs" c_src ON c_src."id" = t."club_id"
WHERE t."short_name" IN ('TTN', 'BLZ')
  AND t."club_id" = (SELECT "id" FROM "icehockey"."clubs" WHERE "club_code" = 'ICE-INTERNAL');

-- ============================================================
-- STEP 4: team_groups FK 제약 변경 (teams → clubs 참조)
-- (Step 5 INSERT 전에 먼저 변경해야 test 클럽 id를 team_id 로 가질 수 있음)
-- ============================================================
ALTER TABLE "icehockey"."team_groups"
  DROP CONSTRAINT "team_groups_team_id_fkey";

ALTER TABLE "icehockey"."team_groups"
  ADD CONSTRAINT "team_groups_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "icehockey"."clubs"("id") ON DELETE CASCADE;

-- ============================================================
-- STEP 5: test 주니어 5개 teams → team_groups INSERT (id 그대로)
-- ============================================================
INSERT INTO "icehockey"."team_groups" (
  "id", "team_id", "name", "age_group", "is_active", "created_at", "updated_at"
)
SELECT
  t."id",
  t."club_id",
  t."name",
  t."division",
  t."is_active",
  t."created_at",
  t."updated_at"
FROM "icehockey"."teams" t
WHERE t."club_id" = (SELECT "id" FROM "icehockey"."clubs" WHERE "club_code" = 'test-test');

-- ============================================================
-- STEP 6: club_members 재배치 (TeamRoster 매핑 따라)
-- 타이탄스/블리자드 roster 멤버 → 신 clubs.id 로 재포인트
-- (teams.id == 신 clubs.id 이므로 동일 값)
-- ============================================================
UPDATE "icehockey"."club_members" cm
SET "club_id" = tr."team_id"
FROM "icehockey"."team_rosters" tr
WHERE cm."id" = tr."member_id"
  AND tr."team_id" IN (
    SELECT "id" FROM "icehockey"."teams" WHERE "short_name" IN ('TTN', 'BLZ')
  );

-- ============================================================
-- STEP 7: 타이탄스/블리자드 "기본" team_groups 자동 생성
-- (자식 그룹에 속하지 않은 roster를 흡수할 곳)
-- ============================================================
INSERT INTO "icehockey"."team_groups" (
  "id", "team_id", "name", "age_group", "is_active", "created_at", "updated_at"
)
SELECT
  'tg_default_' || t."id",
  t."id",
  '기본',
  NULL,
  TRUE,
  NOW(),
  NOW()
FROM "icehockey"."teams" t
WHERE t."short_name" IN ('TTN', 'BLZ');

-- ============================================================
-- STEP 8-1: 자식 team_groups 에 이미 있는 멤버 → 로스터 컬럼 백필
-- ============================================================
UPDATE "icehockey"."team_group_members" tgm
SET
  "position"       = tr."position",
  "jersey_number"  = tr."jersey_number",
  "is_captain"     = tr."is_captain",
  "is_alt_captain" = tr."is_alt_captain",
  "status"         = tr."status",
  "left_at"        = tr."left_at"
FROM "icehockey"."team_rosters" tr,
     "icehockey"."team_groups" tg
WHERE tgm."group_id"  = tg."id"
  AND tgm."member_id" = tr."member_id"
  AND tg."team_id"    = tr."team_id";

-- ============================================================
-- STEP 8-2: 자식 그룹에 없는 roster → 기본 그룹 또는 변환된 team_groups 로 INSERT
-- ============================================================
INSERT INTO "icehockey"."team_group_members" (
  "id", "group_id", "member_id", "joined_at",
  "position", "jersey_number", "is_captain", "is_alt_captain", "status", "left_at"
)
SELECT
  'tgm_' || tr."id",
  CASE
    -- 타이탄스/블리자드: tg_default_<teams.id> 그룹으로
    WHEN EXISTS (
      SELECT 1 FROM "icehockey"."team_groups" tg
      WHERE tg."id" = 'tg_default_' || tr."team_id"
    )
      THEN 'tg_default_' || tr."team_id"
    -- test 주니어: teams.id 가 곧 team_groups.id (Step 4 에서 변환됨)
    ELSE tr."team_id"
  END AS group_id,
  tr."member_id",
  tr."joined_at",
  tr."position",
  tr."jersey_number",
  tr."is_captain",
  tr."is_alt_captain",
  tr."status",
  tr."left_at"
FROM "icehockey"."team_rosters" tr
WHERE NOT EXISTS (
  -- 동일 (team_id, member_id) 가 자식 그룹에 이미 있으면 제외 (8-1 에서 처리됨)
  SELECT 1
  FROM "icehockey"."team_group_members" tgm
  JOIN "icehockey"."team_groups" tg ON tg."id" = tgm."group_id"
  WHERE tgm."member_id" = tr."member_id"
    AND tg."team_id"    = tr."team_id"
);

-- ============================================================
-- STEP 9: DROP team_rosters, DROP teams
-- (team_awards/team_divisions/hockey_matches/tournament_matches FK 도 함께 제거됨 — 데이터 0건)
-- ============================================================
DROP TABLE IF EXISTS "icehockey"."team_rosters" CASCADE;
DROP TABLE IF EXISTS "icehockey"."teams" CASCADE;

COMMIT;
