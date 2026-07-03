-- Step 3: convert class_schedules.scheduled_date  timestamp(without tz)  ->  date  (@db.Date).
--
-- Run order: 00_precheck_audit.sql -> 02a(dev)/02b(prod) backfill -> THIS file.
-- Single transaction: pre-ALTER snapshot + type conversion. Guarded so a re-run is a no-op
-- once the column is already `date`.
--
-- USING rationale (see 02a header / 03_db-architect_report.md): the conversion is the exact
-- inverse of how a KST wall-clock (or KST midnight) was serialized to a UTC-naive timestamp
-- on a KST server, so it restores the intended KST calendar date for every stored row:
--   2026-07-01 15:00:00  ->  2026-07-02   (KST-midnight shift-path)
--   2026-06-05 15:30:00  ->  2026-06-06   (compose-path, +09:00 wall-clock)
--
-- Prod-reflection note: safe under any server TZ (the USING expression is TZ-explicit).
-- MUST be applied together with the matching backend code deploy (Step 3 track 2): once the
-- column is `date`, code that still writes offset-less `new Date("...T00:00:00")` would
-- re-pollute it. Rollback = restore from the backup table below, then reverse the ALTER
-- (`ALTER COLUMN scheduled_date TYPE timestamp USING scheduled_date::timestamp`) and re-copy.
-- ALTER TYPE rewrites the table (brief lock); on prod run in a low-traffic window.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

BEGIN;

-- 1) pre-ALTER snapshot (raw timestamps) for verification + rollback. IF NOT EXISTS => re-run safe.
CREATE TABLE IF NOT EXISTS icehockey.class_schedules_backup_20260702 AS
SELECT id, scheduled_date FROM icehockey.class_schedules;

-- 2) conditional type conversion (only while still timestamp; idempotent on re-run).
DO $$
DECLARE
  cur_type text;
BEGIN
  SELECT data_type INTO cur_type
  FROM information_schema.columns
  WHERE table_schema = 'icehockey' AND table_name = 'class_schedules'
    AND column_name = 'scheduled_date';

  IF cur_type = 'timestamp without time zone' THEN
    EXECUTE $ddl$
      ALTER TABLE icehockey.class_schedules
        ALTER COLUMN scheduled_date TYPE date
        USING (scheduled_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
    $ddl$;
    RAISE NOTICE 'scheduled_date converted timestamp -> date.';
  ELSE
    RAISE NOTICE 'scheduled_date already type=%, skipping ALTER.', cur_type;
  END IF;
END $$;

COMMIT;

-- 3) verification: every converted date must equal USING(backup.raw). Expect 0 mismatches.
SELECT count(*) AS mismatch_rows
FROM icehockey.class_schedules cs
JOIN icehockey.class_schedules_backup_20260702 b ON b.id = cs.id
WHERE cs.scheduled_date
   <> (b.scheduled_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date;
