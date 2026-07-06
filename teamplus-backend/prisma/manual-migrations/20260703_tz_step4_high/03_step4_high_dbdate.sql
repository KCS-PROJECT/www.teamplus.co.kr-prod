-- Step 4-1 (HIGH B군): convert 6 columns  timestamp(without tz) -> date (@db.Date).
--   users.birth_date, child_profiles.birth_date, training_sessions.session_date,
--   skill_evaluations.evaluation_date, tournaments.start_date, tournaments.end_date.
--
-- Run order: 00_precheck_audit.sql  ->  (02a backfill: NOT NEEDED, see below)  ->  THIS file.
--
-- Backfill decision (dev, 2026-07-03): precheck step 2 shows every non-null value has TOD 00:00:00
--   (single UTC-midnight write regime) and precheck step 3 shows KST-USING == ::date mismatch = 0.
--   Therefore the USING conversion restores the exact intended date for every row and NO 02a backfill
--   is required. On PROD, re-run 00_precheck first; only if a regime-unknown TOD (not 00:00 and not 15:00)
--   appears do you author a prod 02a backfill before this file.
--
-- USING rationale: (col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date is the exact inverse of how a
--   date-only value serialized to a UTC-naive timestamp on a KST server, restoring the intended calendar date:
--     2010-01-01 00:00:00  ->  2010-01-01   (UTC-midnight write regime — this dataset)
--     2026-07-01 15:00:00  ->  2026-07-02   (KST-midnight regime — also correct, none present here)
--   TZ-explicit => safe under any server TZ, so identical result on prod.
--
-- Idempotent: backup tables use IF NOT EXISTS; each ALTER is guarded to run only while the column is still
--   `timestamp`, so a re-run is a no-op. Each table converted in its own transaction. ALTER TYPE rewrites the
--   table (brief lock) — trivial here (<=90 rows), but on prod run in a low-traffic window.
--
-- MUST be deployed together with the matching Step 4-1 track-2 backend/web code (getUTC* getters, dateOnlyToUtc
--   writes, day-level tournament end-judgement). Once a column is `date`, code that still writes offset-less
--   `new Date("...T00:00:00")` (UTC midnight) stays correct; but any +09:00 wall-clock write would shift the day.
-- Rollback: 99_rollback_step4_high.sql (restore raw timestamps from the backup tables + reverse ALTER).

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- ============================================================================
-- 1) users.birth_date
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS icehockey.users_backup_20260703 AS
SELECT id, birth_date FROM icehockey.users;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='users' AND column_name='birth_date';
  IF cur_type = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.users
      ALTER COLUMN birth_date TYPE date
      USING (birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'users.birth_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'users.birth_date already type=%, skipping.', cur_type;
  END IF;
END $$;
COMMIT;

-- ============================================================================
-- 2) child_profiles.birth_date
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS icehockey.child_profiles_backup_20260703 AS
SELECT id, birth_date FROM icehockey.child_profiles;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='child_profiles' AND column_name='birth_date';
  IF cur_type = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.child_profiles
      ALTER COLUMN birth_date TYPE date
      USING (birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'child_profiles.birth_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'child_profiles.birth_date already type=%, skipping.', cur_type;
  END IF;
END $$;
COMMIT;

-- ============================================================================
-- 3) training_sessions.session_date  (0 rows on dev — trivial)
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS icehockey.training_sessions_backup_20260703 AS
SELECT id, session_date FROM icehockey.training_sessions;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='training_sessions' AND column_name='session_date';
  IF cur_type = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.training_sessions
      ALTER COLUMN session_date TYPE date
      USING (session_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'training_sessions.session_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'training_sessions.session_date already type=%, skipping.', cur_type;
  END IF;
END $$;
COMMIT;

-- ============================================================================
-- 4) skill_evaluations.evaluation_date  (0 rows on dev — trivial)
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS icehockey.skill_evaluations_backup_20260703 AS
SELECT id, evaluation_date FROM icehockey.skill_evaluations;
DO $$
DECLARE cur_type text;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='skill_evaluations' AND column_name='evaluation_date';
  IF cur_type = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.skill_evaluations
      ALTER COLUMN evaluation_date TYPE date
      USING (evaluation_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'skill_evaluations.evaluation_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'skill_evaluations.evaluation_date already type=%, skipping.', cur_type;
  END IF;
END $$;
COMMIT;

-- ============================================================================
-- 5) tournaments.start_date + end_date  (converted together in one transaction — they are a pair)
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS icehockey.tournaments_backup_20260703 AS
SELECT id, start_date, end_date FROM icehockey.tournaments;
DO $$
DECLARE t_start text; t_end text;
BEGIN
  SELECT data_type INTO t_start FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='tournaments' AND column_name='start_date';
  SELECT data_type INTO t_end FROM information_schema.columns
  WHERE table_schema='icehockey' AND table_name='tournaments' AND column_name='end_date';
  IF t_start = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.tournaments
      ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'tournaments.start_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'tournaments.start_date already type=%, skipping.', t_start;
  END IF;
  IF t_end = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.tournaments
      ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'tournaments.end_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'tournaments.end_date already type=%, skipping.', t_end;
  END IF;
END $$;
COMMIT;

-- ============================================================================
-- 6) verification: every converted date must equal USING(backup.raw). Expect 0 mismatches each.
-- ============================================================================
SELECT 'users.birth_date' col, count(*) mismatch_rows
  FROM icehockey.users u JOIN icehockey.users_backup_20260703 b ON b.id=u.id
 WHERE u.birth_date IS DISTINCT FROM (b.birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
UNION ALL
SELECT 'child_profiles.birth_date', count(*)
  FROM icehockey.child_profiles c JOIN icehockey.child_profiles_backup_20260703 b ON b.id=c.id
 WHERE c.birth_date IS DISTINCT FROM (b.birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
UNION ALL
SELECT 'training_sessions.session_date', count(*)
  FROM icehockey.training_sessions t JOIN icehockey.training_sessions_backup_20260703 b ON b.id=t.id
 WHERE t.session_date IS DISTINCT FROM (b.session_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
UNION ALL
SELECT 'skill_evaluations.evaluation_date', count(*)
  FROM icehockey.skill_evaluations s JOIN icehockey.skill_evaluations_backup_20260703 b ON b.id=s.id
 WHERE s.evaluation_date IS DISTINCT FROM (b.evaluation_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
UNION ALL
SELECT 'tournaments.start_date', count(*)
  FROM icehockey.tournaments t JOIN icehockey.tournaments_backup_20260703 b ON b.id=t.id
 WHERE t.start_date IS DISTINCT FROM (b.start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
UNION ALL
SELECT 'tournaments.end_date', count(*)
  FROM icehockey.tournaments t JOIN icehockey.tournaments_backup_20260703 b ON b.id=t.id
 WHERE t.end_date IS DISTINCT FROM (b.end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date;
