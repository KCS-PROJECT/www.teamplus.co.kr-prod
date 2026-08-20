-- 수업/대회 단위 공지 스트림 Phase 1 (설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md v1.2.3)
-- team_posts 축 배타 확장 + team_post_reads 신설
-- 실측 전제: team_posts 계열 DEV 0건 (2026-08-18 검수) — 백필 불필요
-- 실행: npx prisma db execute --file prisma/manual-migrations/20260820_team_post_unit_notice.sql --schema prisma/schema.prisma

BEGIN;

-- 1) team_posts: teamId nullable + 신규 컬럼 5종
ALTER TABLE team_posts ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS target_class_id TEXT;
ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS target_tournament_id TEXT;
ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS published_notified_at TIMESTAMPTZ(3);
ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ(3);
ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ(3);
-- 미읽음 재알림 24시간 쿨다운 (v1.2.3 후속 — 읽음 노출 축소 + 재알림 버튼)
ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS last_remind_at TIMESTAMPTZ(3);

-- 2) FK: 기존 team FK 를 CASCADE → RESTRICT 로 교체 (아카이브 보존 + SetNull 시 축 CHECK 충돌 방지)
-- [반복 안전] ADD CONSTRAINT 는 IF NOT EXISTS 를 지원하지 않으므로 duplicate_object 가드로 감싼다
--   (매 배포 apply-all.sh 재실행 시 duplicate constraint 로 체인이 중단되는 것 방지).
ALTER TABLE team_posts DROP CONSTRAINT IF EXISTS team_posts_team_id_fkey;
ALTER TABLE team_posts ADD CONSTRAINT team_posts_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT ON UPDATE CASCADE;
DO $$ BEGIN
  ALTER TABLE team_posts ADD CONSTRAINT team_posts_target_class_id_fkey
    FOREIGN KEY (target_class_id) REFERENCES classes(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE team_posts ADD CONSTRAINT team_posts_target_tournament_id_fkey
    FOREIGN KEY (target_tournament_id) REFERENCES tournaments(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) 축 배타 CHECK — teamId·targetClassId·targetTournamentId 중 정확히 1개만 non-null
DO $$ BEGIN
  ALTER TABLE team_posts ADD CONSTRAINT team_posts_scope_axis_check
    CHECK (num_nonnulls(team_id, target_class_id, target_tournament_id) = 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) 축별 정렬 인덱스
CREATE INDEX IF NOT EXISTS team_posts_target_class_id_is_pinned_created_at_idx
  ON team_posts (target_class_id, is_pinned, created_at);
CREATE INDEX IF NOT EXISTS team_posts_target_tournament_id_is_pinned_created_at_idx
  ON team_posts (target_tournament_id, is_pinned, created_at);

-- 5) team_post_reads 신설 (NoticeRead 동형 — 읽음 N/M 근거)
CREATE TABLE IF NOT EXISTS team_post_reads (
  id      TEXT NOT NULL,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT team_post_reads_pkey PRIMARY KEY (id),
  CONSTRAINT team_post_reads_post_id_fkey FOREIGN KEY (post_id)
    REFERENCES team_posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT team_post_reads_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS team_post_reads_post_id_user_id_key
  ON team_post_reads (post_id, user_id);
CREATE INDEX IF NOT EXISTS team_post_reads_user_id_read_at_idx
  ON team_post_reads (user_id, read_at);

COMMIT;
