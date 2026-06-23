-- Migration: Phase δ-pre 스키마 개선 일괄 마이그레이션
-- 1. ClubMember.leftAt 추가 (C-9 이적 leftAt 기록)
-- 2. ClubMember.roleInTeam 추가 (C-8 역할 겸직)
-- 3. LevelApprovalStatus enum + MemberLevelHistory.status (C-5 reason 파싱 제거)
-- 4. PlayerSkillLevel 모델 분리 (C-5 선수기술등급 1-3, VIP MemberLevel 1-5와 분리)
-- Applied via: prisma db push (2026-04-18), then migrate resolve

-- 1. ClubMember: left_at, role_in_team
ALTER TABLE "icehockey"."club_members"
  ADD COLUMN IF NOT EXISTS "left_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "role_in_team" TEXT;

-- 2. LevelApprovalStatus enum
DO $$ BEGIN
  CREATE TYPE "icehockey"."LevelApprovalStatus" AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'DIRECTOR_OVERRIDE'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. MemberLevelHistory.status
ALTER TABLE "icehockey"."member_level_histories"
  ADD COLUMN IF NOT EXISTS "status" "icehockey"."LevelApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS "member_level_histories_status_idx"
  ON "icehockey"."member_level_histories"("status");

-- 4. PlayerSkillLevel 테이블 (선수기술등급 tier 1-3)
CREATE TABLE IF NOT EXISTS "icehockey"."player_skill_levels" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "tier"       INTEGER NOT NULL DEFAULT 1,
  "tier_name"  TEXT NOT NULL DEFAULT '하위',
  "season"     TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_skill_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_skill_levels_user_id_key"
  ON "icehockey"."player_skill_levels"("user_id");

CREATE INDEX IF NOT EXISTS "player_skill_levels_tier_idx"
  ON "icehockey"."player_skill_levels"("tier");

ALTER TABLE "icehockey"."player_skill_levels"
  DROP CONSTRAINT IF EXISTS "player_skill_levels_user_id_fkey";

ALTER TABLE "icehockey"."player_skill_levels"
  ADD CONSTRAINT "player_skill_levels_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icehockey"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
