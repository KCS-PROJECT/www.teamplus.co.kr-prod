-- Step 4-1 (HIGH B군) ROLLBACK — revert the 6 columns  date  ->  timestamp(without tz)  and restore
-- the pre-ALTER raw timestamps from the *_backup_20260703 tables created by 03_step4_high_dbdate.sql.
--
-- Precondition: the backup tables (users_backup_20260703, child_profiles_backup_20260703,
--   training_sessions_backup_20260703, skill_evaluations_backup_20260703, tournaments_backup_20260703) exist.
-- Effect: column type back to `timestamp` (UTC-midnight of the stored date), then the exact original wall-clock
--   timestamps re-copied from backup so no precision is lost. Each table in its own transaction; guarded so a
--   re-run is a no-op once already reverted.
-- NOTE: rolling back the DB WITHOUT also reverting the Step 4-1 track-2 code is unsafe — day-level getUTC*/dateOnlyToUtc
--   code expects `date`. Revert both together.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- 1) users.birth_date
BEGIN;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='users' AND column_name='birth_date';
  IF cur_type = 'date' THEN
    EXECUTE 'ALTER TABLE icehockey.users ALTER COLUMN birth_date TYPE timestamp USING birth_date::timestamp';
    UPDATE icehockey.users u SET birth_date = b.birth_date
      FROM icehockey.users_backup_20260703 b WHERE b.id = u.id;
    RAISE NOTICE 'users.birth_date reverted date -> timestamp + restored.';
  ELSE RAISE NOTICE 'users.birth_date type=%, skipping rollback.', cur_type; END IF;
END $$;
COMMIT;

-- 2) child_profiles.birth_date
BEGIN;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='child_profiles' AND column_name='birth_date';
  IF cur_type = 'date' THEN
    EXECUTE 'ALTER TABLE icehockey.child_profiles ALTER COLUMN birth_date TYPE timestamp USING birth_date::timestamp';
    UPDATE icehockey.child_profiles c SET birth_date = b.birth_date
      FROM icehockey.child_profiles_backup_20260703 b WHERE b.id = c.id;
    RAISE NOTICE 'child_profiles.birth_date reverted date -> timestamp + restored.';
  ELSE RAISE NOTICE 'child_profiles.birth_date type=%, skipping rollback.', cur_type; END IF;
END $$;
COMMIT;

-- 3) training_sessions.session_date
BEGIN;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='training_sessions' AND column_name='session_date';
  IF cur_type = 'date' THEN
    EXECUTE 'ALTER TABLE icehockey.training_sessions ALTER COLUMN session_date TYPE timestamp USING session_date::timestamp';
    UPDATE icehockey.training_sessions t SET session_date = b.session_date
      FROM icehockey.training_sessions_backup_20260703 b WHERE b.id = t.id;
    RAISE NOTICE 'training_sessions.session_date reverted date -> timestamp + restored.';
  ELSE RAISE NOTICE 'training_sessions.session_date type=%, skipping rollback.', cur_type; END IF;
END $$;
COMMIT;

-- 4) skill_evaluations.evaluation_date
BEGIN;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='skill_evaluations' AND column_name='evaluation_date';
  IF cur_type = 'date' THEN
    EXECUTE 'ALTER TABLE icehockey.skill_evaluations ALTER COLUMN evaluation_date TYPE timestamp USING evaluation_date::timestamp';
    UPDATE icehockey.skill_evaluations s SET evaluation_date = b.evaluation_date
      FROM icehockey.skill_evaluations_backup_20260703 b WHERE b.id = s.id;
    RAISE NOTICE 'skill_evaluations.evaluation_date reverted date -> timestamp + restored.';
  ELSE RAISE NOTICE 'skill_evaluations.evaluation_date type=%, skipping rollback.', cur_type; END IF;
END $$;
COMMIT;

-- 5) tournaments.start_date + end_date
BEGIN;
DO $$
DECLARE t_start text; t_end text;
BEGIN
  SELECT data_type INTO t_start FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='tournaments' AND column_name='start_date';
  SELECT data_type INTO t_end FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='tournaments' AND column_name='end_date';
  IF t_start = 'date' THEN
    EXECUTE 'ALTER TABLE icehockey.tournaments ALTER COLUMN start_date TYPE timestamp USING start_date::timestamp';
    UPDATE icehockey.tournaments t SET start_date = b.start_date
      FROM icehockey.tournaments_backup_20260703 b WHERE b.id = t.id;
    RAISE NOTICE 'tournaments.start_date reverted date -> timestamp + restored.';
  ELSE RAISE NOTICE 'tournaments.start_date type=%, skipping rollback.', t_start; END IF;
  IF t_end = 'date' THEN
    EXECUTE 'ALTER TABLE icehockey.tournaments ALTER COLUMN end_date TYPE timestamp USING end_date::timestamp';
    UPDATE icehockey.tournaments t SET end_date = b.end_date
      FROM icehockey.tournaments_backup_20260703 b WHERE b.id = t.id;
    RAISE NOTICE 'tournaments.end_date reverted date -> timestamp + restored.';
  ELSE RAISE NOTICE 'tournaments.end_date type=%, skipping rollback.', t_end; END IF;
END $$;
COMMIT;
