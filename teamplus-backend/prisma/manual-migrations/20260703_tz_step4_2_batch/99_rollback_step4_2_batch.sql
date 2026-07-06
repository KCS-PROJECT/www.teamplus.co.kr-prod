-- Rollback for 03_alter_step4_2_batch.sql — revert the 27 columns to their original 'timestamp without time zone'.
--
--   26 date columns: date -> timestamp. On dev these tables are empty, so the reverse ALTER is a no-op on data.
--     USING col::timestamp materializes each date at 00:00:00 (the UTC-midnight write regime the values came from).
--     PROD: if a column carried data and you took a per-table backup before the ALTER, prefer restoring exact raw
--     values from that backup instead of the ::timestamp cast (the cast loses any original non-midnight TOD).
--
--   app_premium_events.event_date: timestamptz(3) -> timestamp. USING event_date AT TIME ZONE 'UTC' writes back
--     the UTC naive wall-clock, the exact inverse of the forward ALTER, restoring the original stored value.
--     (Backup table app_premium_events_backup_20260703 also holds the original rows if a full restore is needed.)
--
-- Idempotent: each ALTER guarded to run only if the column is currently the post-migration type.
-- Each table reverted in its own transaction.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- Reusable pattern: revert a date column back to timestamp (only if currently 'date').
-- A1) tournament_matches.match_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='tournament_matches' AND column_name='match_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.tournament_matches ALTER COLUMN match_date TYPE timestamp
      USING match_date::timestamp $ddl$;
    RAISE NOTICE 'tournament_matches.match_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'tournament_matches.match_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A2) class_diaries.session_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='class_diaries' AND column_name='session_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.class_diaries ALTER COLUMN session_date TYPE timestamp
      USING session_date::timestamp $ddl$;
    RAISE NOTICE 'class_diaries.session_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'class_diaries.session_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A3) work_schedules.schedule_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='work_schedules' AND column_name='schedule_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.work_schedules ALTER COLUMN schedule_date TYPE timestamp
      USING schedule_date::timestamp $ddl$;
    RAISE NOTICE 'work_schedules.schedule_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'work_schedules.schedule_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A4) player_class_histories.{start,end}_date
BEGIN;
DO $$
DECLARE ts text; te text;
BEGIN
  SELECT data_type INTO ts FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='player_class_histories' AND column_name='start_date';
  SELECT data_type INTO te FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='player_class_histories' AND column_name='end_date';
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_class_histories ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'player_class_histories.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'player_class_histories.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_class_histories ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'player_class_histories.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'player_class_histories.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_careers ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'player_careers.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'player_careers.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.player_careers ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'player_careers.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'player_careers.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.staff_careers ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'staff_careers.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'staff_careers.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.staff_careers ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'staff_careers.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'staff_careers.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.leagues ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'leagues.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'leagues.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.leagues ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'leagues.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'leagues.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.overseas_trips ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'overseas_trips.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'overseas_trips.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.overseas_trips ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'overseas_trips.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'overseas_trips.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.academy_promotions ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'academy_promotions.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'academy_promotions.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.academy_promotions ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'academy_promotions.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'academy_promotions.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.camps ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'camps.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'camps.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.camps ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'camps.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'camps.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.lesson_packages ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'lesson_packages.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'lesson_packages.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.lesson_packages ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'lesson_packages.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'lesson_packages.end_date type=%, skipping.', te; END IF;
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
  IF ts = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.coupons ALTER COLUMN start_date TYPE timestamp
      USING start_date::timestamp $ddl$;
    RAISE NOTICE 'coupons.start_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'coupons.start_date type=%, skipping.', ts; END IF;
  IF te = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.coupons ALTER COLUMN end_date TYPE timestamp
      USING end_date::timestamp $ddl$;
    RAISE NOTICE 'coupons.end_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'coupons.end_date type=%, skipping.', te; END IF;
END $$;
COMMIT;

-- A13) settlement_details.payment_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='settlement_details' AND column_name='payment_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.settlement_details ALTER COLUMN payment_date TYPE timestamp
      USING payment_date::timestamp $ddl$;
    RAISE NOTICE 'settlement_details.payment_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'settlement_details.payment_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A14) settlement_transactions.transaction_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='settlement_transactions' AND column_name='transaction_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.settlement_transactions ALTER COLUMN transaction_date TYPE timestamp
      USING transaction_date::timestamp $ddl$;
    RAISE NOTICE 'settlement_transactions.transaction_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'settlement_transactions.transaction_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A15) child_profiles.next_test_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='child_profiles' AND column_name='next_test_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.child_profiles ALTER COLUMN next_test_date TYPE timestamp
      USING next_test_date::timestamp $ddl$;
    RAISE NOTICE 'child_profiles.next_test_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'child_profiles.next_test_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A16) overseas_trip_registrations.passport_expiry_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='overseas_trip_registrations' AND column_name='passport_expiry_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.overseas_trip_registrations ALTER COLUMN passport_expiry_date TYPE timestamp
      USING passport_expiry_date::timestamp $ddl$;
    RAISE NOTICE 'overseas_trip_registrations.passport_expiry_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'overseas_trip_registrations.passport_expiry_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- A17) teams.founding_date
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='teams' AND column_name='founding_date';
  IF t = 'date' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.teams ALTER COLUMN founding_date TYPE timestamp
      USING founding_date::timestamp $ddl$;
    RAISE NOTICE 'teams.founding_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'teams.founding_date type=%, skipping.', t; END IF;
END $$;
COMMIT;

-- B) app_premium_events.event_date: timestamptz(3) -> timestamp (inverse of forward USING).
BEGIN;
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='icehockey' AND table_name='app_premium_events' AND column_name='event_date';
  IF t = 'timestamp with time zone' THEN
    EXECUTE $ddl$ ALTER TABLE icehockey.app_premium_events ALTER COLUMN event_date TYPE timestamp
      USING event_date AT TIME ZONE 'UTC' $ddl$;
    RAISE NOTICE 'app_premium_events.event_date reverted -> timestamp.';
  ELSE RAISE NOTICE 'app_premium_events.event_date type=%, skipping.', t; END IF;
END $$;
COMMIT;
