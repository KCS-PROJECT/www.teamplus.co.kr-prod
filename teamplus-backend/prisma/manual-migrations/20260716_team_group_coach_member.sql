-- 하위그룹 담당코치 지정 — team_groups.coach_member_id (nullable, 백필 불필요)
-- 대상: TeamMember.id (roleInTeam ∈ HEAD_COACH/COACH), 팀 탈퇴/삭제 시 SET NULL → 미지정 복귀
ALTER TABLE team_groups ADD COLUMN IF NOT EXISTS coach_member_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_groups_coach_member_id_fkey'
  ) THEN
    ALTER TABLE team_groups
      ADD CONSTRAINT team_groups_coach_member_id_fkey
      FOREIGN KEY (coach_member_id) REFERENCES team_members(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "team_groups_coach_member_id_idx"
  ON team_groups(coach_member_id);
