-- Step 3 backfill (DEV) for class_schedules.scheduled_date.
--
-- RESULT OF DEV AUDIT (2026-07-02): 0 rows require backfill. Run order: this file BEFORE
-- 03_step3_scheduled_date.sql (kept for order-parity with prod; it is a safe no-op on dev).
--
-- Why no backfill is needed (full evidence: 03_db-architect_report.md):
--   The ALTER's USING clause -- (scheduled_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
--   -- is the exact inverse of BOTH storage regimes present in the data:
--     * shift-path  (tod 15:00, offset-less `new Date("YYYY-MM-DDT00:00:00")` on a KST server):
--       stored = intended-1day @ 15:00Z  ->  USING recovers the intended date.
--     * compose-path (tod 06:00 / 15:30 / 06:10 / 06:59 / 07:32, KST wall-clock with +09:00):
--       stored = intended @ (KST-9h)Z    ->  USING recovers the intended date.
--   All 165 rows fall in one of these regimes, so USING already yields the intended KST
--   calendar date for every row. The weekday "MISALIGNED" rows (5 standard + 2 cancelled +
--   ad-hoc) are legitimate off-template / extra sessions, NOT conversion errors -- their
--   stored intent (including Sundays deliberately added to a Saturday class) is faithfully
--   recovered by USING. Verified against class_days / class_name / class_day_schedules and
--   the 15:00 time-component signature (a direct-store row would carry tod 00:00, of which
--   there are 0).
--
-- Prod-reflection note: DO NOT copy this file to prod. Generate 02b_step3_backfill_prod.sql
-- from prod's own 00_precheck_audit.sql output. Prod accumulated ~1 week of independent data
-- after the dev copy, so its non-standard rows must be judged fresh (per-row, pattern-based,
-- ID-hardcoding forbidden, idempotent). Only rows whose USING date does NOT equal the
-- intended date -- e.g. a genuine direct-store row (tod between 00:00-14:59 whose date is
-- already the intended KST date) -- would need a correction there.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- Idempotent guard: assert the no-backfill precondition still holds (fail loudly if a
-- direct-store row -- tod 00:00 -- ever appears; such a row WOULD need a correction and
-- must not be silently pushed +1 day by the ALTER).
DO $$
DECLARE
  direct_store_rows int;
BEGIN
  SELECT count(*) INTO direct_store_rows
  FROM class_schedules
  WHERE to_char(scheduled_date, 'HH24:MI') = '00:00';

  IF direct_store_rows > 0 THEN
    RAISE EXCEPTION
      'Found % row(s) stored at 00:00 (direct-store regime). These need per-row intent review before the ALTER -- USING would shift them +1 day. Aborting backfill/ALTER.',
      direct_store_rows;
  END IF;

  RAISE NOTICE 'Step 3 backfill precondition OK: 0 direct-store rows; no backfill required.';
END $$;
