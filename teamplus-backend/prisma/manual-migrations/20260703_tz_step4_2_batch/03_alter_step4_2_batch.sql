-- Step 4-2 (B군 잔여 완결): convert the last 27 timestamp columns.
--   26 columns  timestamp -> date (@db.Date).
--   1 column    app_premium_events.event_date  timestamp -> timestamptz(3) (@db.Timestamptz(3), A군 재분류).
-- After this file, B군(date-family remaining) 잔존 = 0 — 타임존 저장 재설계 원천 종결.
--
-- Run order: 00_precheck_audit.sql  ->  THIS file. Rollback: 99_rollback_step4_2_batch.sql.
--
-- Backup policy (dev, 2026-07-03): precheck query 2 shows the 26 date-candidate columns hold 0 non-null rows,
--   so an empty backup table would be pointless — backups are SKIPPED for those 26 (empty tables, nothing to lose;
--   rollback simply reverses the ALTER). ONLY app_premium_events (1 row) gets a backup table.
--   PROD: if precheck query 2 reports non-null rows for any date-candidate column, add a backup table for that
--   table before running its block (mirror the app_premium_events pattern) and confirm the TOD regime first.
--
-- USING rationale:
--   * date columns: (col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date is the exact inverse of how a
--     date-only value serialized to a UTC-naive timestamp on a KST server. Harmless on the empty dev tables;
--     correct for the 00:00 (and 15:00) regimes on prod. It also yields the correct KST calendar day for
--     settlement_transactions.transaction_date, whose value is derived from a payment-completion instant.
--   * event_date -> timestamptz: USING event_date AT TIME ZONE 'UTC' reads the naive value as a UTC instant,
--     preserving the exact epoch (dev row: 2026-02-08T10:00:00Z = 19:00 KST). TZ-explicit => server-TZ-safe.
--
-- Idempotent: each ALTER is guarded to run only while the column is still 'timestamp without time zone', so a
--   re-run is a no-op. Each table converted in its own transaction. ALTER TYPE rewrites the table (brief lock) —
--   trivial on the empty dev tables; on prod run in a low-traffic window.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- Helper note: the DO blocks below share this shape — read current type from information_schema, ALTER only if
-- still 'timestamp without time zone', else RAISE NOTICE and skip.

-- ============================================================================
-- PART A — 26 columns: timestamp -> date  (empty on dev, no backup)
-- ============================================================================

-- A1) tournament_matches.match_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='tournament_matches' AND column_name='match_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.tournament_matches ALTER COLUMN match_date TYPE date
      USING (match_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'tournament_matches.match_date -> date.';
  ELSE RAISE NOTICE 'tournament_matches.match_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A2) class_diaries.session_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='class_diaries' AND column_name='session_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.class_diaries ALTER COLUMN session_date TYPE date
      USING (session_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'class_diaries.session_date -> date.';
  ELSE RAISE NOTICE 'class_diaries.session_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A3) work_schedules.schedule_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='work_schedules' AND column_name='schedule_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.work_schedules ALTER COLUMN schedule_date TYPE date
      USING (schedule_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'work_schedules.schedule_date -> date.';
  ELSE RAISE NOTICE 'work_schedules.schedule_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A4) player_class_histories.{start,end}_date  (pair, one transaction)
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='player_class_histories' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='player_class_histories' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_class_histories ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'player_class_histories.start_date -> date.';
  ELSE RAISE NOTICE 'player_class_histories.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_class_histories ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'player_class_histories.end_date -> date.';
  ELSE RAISE NOTICE 'player_class_histories.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A5) player_careers.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='player_careers' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='player_careers' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_careers ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'player_careers.start_date -> date.';
  ELSE RAISE NOTICE 'player_careers.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_careers ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'player_careers.end_date -> date.';
  ELSE RAISE NOTICE 'player_careers.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A6) staff_careers.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='staff_careers' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='staff_careers' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.staff_careers ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'staff_careers.start_date -> date.';
  ELSE RAISE NOTICE 'staff_careers.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.staff_careers ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'staff_careers.end_date -> date.';
  ELSE RAISE NOTICE 'staff_careers.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A7) leagues.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='leagues' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='leagues' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.leagues ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'leagues.start_date -> date.';
  ELSE RAISE NOTICE 'leagues.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.leagues ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'leagues.end_date -> date.';
  ELSE RAISE NOTICE 'leagues.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A8) overseas_trips.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='overseas_trips' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='overseas_trips' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.overseas_trips ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'overseas_trips.start_date -> date.';
  ELSE RAISE NOTICE 'overseas_trips.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.overseas_trips ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'overseas_trips.end_date -> date.';
  ELSE RAISE NOTICE 'overseas_trips.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A9) academy_promotions.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='academy_promotions' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='academy_promotions' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.academy_promotions ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'academy_promotions.start_date -> date.';
  ELSE RAISE NOTICE 'academy_promotions.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.academy_promotions ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'academy_promotions.end_date -> date.';
  ELSE RAISE NOTICE 'academy_promotions.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A10) camps.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='camps' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='camps' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.camps ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'camps.start_date -> date.';
  ELSE RAISE NOTICE 'camps.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.camps ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'camps.end_date -> date.';
  ELSE RAISE NOTICE 'camps.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A11) lesson_packages.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='lesson_packages' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='lesson_packages' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.lesson_packages ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'lesson_packages.start_date -> date.';
  ELSE RAISE NOTICE 'lesson_packages.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.lesson_packages ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'lesson_packages.end_date -> date.';
  ELSE RAISE NOTICE 'lesson_packages.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A12) coupons.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='coupons' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='coupons' AND column_name='end_date';
  IF ts = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.coupons ALTER COLUMN start_date TYPE date
      USING (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'coupons.start_date -> date.';
  ELSE RAISE NOTICE 'coupons.start_date already type=%, skipping.', ts; END IF;
  IF te = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.coupons ALTER COLUMN end_date TYPE date
      USING (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'coupons.end_date -> date.';
  ELSE RAISE NOTICE 'coupons.end_date already type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A13) settlement_details.payment_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='settlement_details' AND column_name='payment_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.settlement_details ALTER COLUMN payment_date TYPE date
      USING (payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'settlement_details.payment_date -> date.';
  ELSE RAISE NOTICE 'settlement_details.payment_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A14) settlement_transactions.transaction_date
--   NOTE: value is derived from a payment-completion instant (completedAt). The KST-USING expression maps that
--   instant to its correct KST calendar day. On prod, confirm precheck query 4 TOD before running.
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='settlement_transactions' AND column_name='transaction_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.settlement_transactions ALTER COLUMN transaction_date TYPE date
      USING (transaction_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'settlement_transactions.transaction_date -> date.';
  ELSE RAISE NOTICE 'settlement_transactions.transaction_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A15) child_profiles.next_test_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='child_profiles' AND column_name='next_test_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.child_profiles ALTER COLUMN next_test_date TYPE date
      USING (next_test_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'child_profiles.next_test_date -> date.';
  ELSE RAISE NOTICE 'child_profiles.next_test_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A16) overseas_trip_registrations.passport_expiry_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='overseas_trip_registrations' AND column_name='passport_expiry_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.overseas_trip_registrations ALTER COLUMN passport_expiry_date TYPE date
      USING (passport_expiry_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'overseas_trip_registrations.passport_expiry_date -> date.';
  ELSE RAISE NOTICE 'overseas_trip_registrations.passport_expiry_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A17) teams.founding_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='teams' AND column_name='founding_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.teams ALTER COLUMN founding_date TYPE date
      USING (founding_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date $ddl$;
    RAISE NOTICE 'teams.founding_date -> date.';
  ELSE RAISE NOTICE 'teams.founding_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- ============================================================================
-- PART B — app_premium_events.event_date: timestamp -> timestamptz(3)  (A군 재분류, 1 row on dev, WITH backup)
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS icehockey.app_premium_events_backup_20260703 AS
SELECT id, event_date FROM icehockey.app_premium_events;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='app_premium_events' AND column_name='event_date';
  IF t = 'timestamp without time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.app_premium_events ALTER COLUMN event_date TYPE timestamptz(3)
      USING event_date AT TIME ZONE 'UTC' $ddl$;
    RAISE NOTICE 'app_premium_events.event_date -> timestamptz(3).';
  ELSE RAISE NOTICE 'app_premium_events.event_date already type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- V1) all 27 columns should now report their new type (26 = 'date', event_date = 'timestamp with time zone').
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='icehockey' AND (
  (table_name='app_premium_events'          AND column_name='event_date') OR
  (table_name='tournament_matches'          AND column_name='match_date') OR
  (table_name='class_diaries'               AND column_name='session_date') OR
  (table_name='work_schedules'              AND column_name='schedule_date') OR
  (table_name='player_class_histories'      AND column_name IN ('start_date','end_date')) OR
  (table_name='player_careers'              AND column_name IN ('start_date','end_date')) OR
  (table_name='staff_careers'               AND column_name IN ('start_date','end_date')) OR
  (table_name='leagues'                     AND column_name IN ('start_date','end_date')) OR
  (table_name='overseas_trips'              AND column_name IN ('start_date','end_date')) OR
  (table_name='academy_promotions'          AND column_name IN ('start_date','end_date')) OR
  (table_name='camps'                       AND column_name IN ('start_date','end_date')) OR
  (table_name='lesson_packages'             AND column_name IN ('start_date','end_date')) OR
  (table_name='coupons'                     AND column_name IN ('start_date','end_date')) OR
  (table_name='settlement_details'          AND column_name='payment_date') OR
  (table_name='settlement_transactions'     AND column_name='transaction_date') OR
  (table_name='child_profiles'              AND column_name='next_test_date') OR
  (table_name='overseas_trip_registrations' AND column_name='passport_expiry_date') OR
  (table_name='teams'                       AND column_name='founding_date')
)
ORDER BY table_name, column_name;

-- V2) event_date instant preserved: epoch after ALTER must equal the backup epoch (read as UTC). Expect 0 mismatch.
SELECT count(*) AS event_date_epoch_mismatch
FROM icehockey.app_premium_events e
JOIN icehockey.app_premium_events_backup_20260703 b ON b.id = e.id
WHERE extract(epoch FROM e.event_date) IS DISTINCT FROM extract(epoch FROM (b.event_date AT TIME ZONE 'UTC'));
