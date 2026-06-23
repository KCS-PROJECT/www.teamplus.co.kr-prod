-- Team 복합 인덱스 추가 (2026-04-12)
-- findAll 패턴: WHERE clubId=? AND isActive=true AND division=?
CREATE INDEX IF NOT EXISTS "teams_club_id_is_active_idx"
  ON "teams"("club_id", "is_active");
CREATE INDEX IF NOT EXISTS "teams_club_id_division_is_active_idx"
  ON "teams"("club_id", "division", "is_active");
