-- Precheck / audit for Step 3 (env-agnostic; run on dev AND prod before applying).
-- Purpose: confirm scheduled_date type + time-of-day distribution, and enumerate any
-- non-standard rows so their intended calendar date can be judged BEFORE the ALTER.
--
-- Prod-reflection note: on prod this is NOT just a confirmation query -- its output is the
-- INPUT for building 02b_step3_backfill_prod.sql. Do not band-correct; judge per row against
-- the owning class (class_days / class_name / class_day_schedules) as done for dev in
-- _workspace/timezone-step3-scheduled-date/03_db-architect_report.md.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- 1) current column type (expect: timestamp without time zone -> target: date)
SELECT data_type
FROM information_schema.columns
WHERE table_schema = 'icehockey' AND table_name = 'class_schedules' AND column_name = 'scheduled_date';

-- 2) row totals
SELECT count(*) AS total_rows, count(scheduled_date) AS non_null FROM class_schedules;

-- 3) time-of-day distribution (15:00 = standard shift-path; others = compose-path / legacy)
SELECT to_char(scheduled_date, 'HH24:MI:SS') AS tod, count(*) AS n
FROM class_schedules
GROUP BY tod
ORDER BY n DESC, tod;

-- 4) full enumeration of NON-standard rows (tod <> 15:00) with the date the ALTER would
--    produce, plus owning-class weekday context for per-row intent judgment.
SELECT
  cs.id,
  cs.class_id,
  left(c.class_name, 30)                                                        AS class_name,
  c.class_days,
  to_char(cs.scheduled_date, 'YYYY-MM-DD HH24:MI')                             AS raw_ts,
  (cs.scheduled_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date        AS using_date,
  (ARRAY['일','월','화','수','목','금','토'])[
     extract(dow FROM (cs.scheduled_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date)::int + 1] AS using_dow_ko,
  cs.start_time,
  cs.is_cancelled,
  to_char(cs.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')       AS created_kst
FROM class_schedules cs
JOIN classes c ON c.id = cs.class_id
WHERE to_char(cs.scheduled_date, 'HH24:MI') <> '15:00'
ORDER BY cs.class_id, cs.scheduled_date;

-- 5) global weekday-alignment: does the ALTER's target date land on the class's declared
--    weekday template? MISALIGNED rows are legitimate ad-hoc/off-template sessions, not
--    conversion errors (verify each before assuming a backfill is needed).
WITH s AS (
  SELECT cs.id, cs.class_id, cs.is_cancelled,
    to_char(cs.scheduled_date, 'HH24:MI') AS tod,
    (ARRAY['일','월','화','수','목','금','토'])[
       extract(dow FROM (cs.scheduled_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date)::int + 1] AS dow_ko,
    c.class_days
  FROM class_schedules cs JOIN classes c ON c.id = cs.class_id
)
SELECT
  CASE WHEN tod = '15:00' THEN 'standard(15:00)' ELSE 'nonstandard' END AS grp,
  is_cancelled,
  CASE
    WHEN jsonb_array_length(class_days) = 0 THEN 'no-template'
    WHEN class_days ? dow_ko THEN 'ALIGNED'
    ELSE 'MISALIGNED'
  END AS weekday_match,
  count(*) AS n
FROM s
GROUP BY grp, is_cancelled, weekday_match
ORDER BY grp, is_cancelled, weekday_match;
