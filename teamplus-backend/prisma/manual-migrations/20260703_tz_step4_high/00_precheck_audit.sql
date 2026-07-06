-- Step 4-1 (HIGH B군) precheck/audit — 6 columns: users.birth_date, child_profiles.birth_date,
--   training_sessions.session_date, skill_evaluations.evaluation_date, tournaments.start_date, tournaments.end_date.
--
-- Purpose: prove the time-of-day (TOD) regime of every stored value BEFORE converting timestamp -> date (@db.Date),
-- and prove that USING (col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date restores the intended calendar date
-- for every row (== zero backfill needed). READ-ONLY. Safe to run on dev or prod.
--
-- DEV result (2026-07-03): every non-null value has TOD 00:00:00 (UTC-midnight write regime,
--   i.e. `new Date("YYYY-MM-DD")` serialized to a UTC-naive timestamp). Under this single regime the KST-USING
--   expression is identical to `col::date`, so the conversion is loss-free and no 02a backfill is required.
--   Row counts: users 60 non-null / child_profiles 39 / tournaments 12 / training_sessions 0 / skill_evaluations 0.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- 1) current column types (expect: timestamp without time zone, all 6).
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'icehockey' AND (
  (table_name='users'             AND column_name='birth_date')      OR
  (table_name='child_profiles'    AND column_name='birth_date')      OR
  (table_name='training_sessions' AND column_name='session_date')    OR
  (table_name='skill_evaluations' AND column_name='evaluation_date') OR
  (table_name='tournaments'       AND column_name IN ('start_date','end_date'))
)
ORDER BY table_name, column_name;

-- 2) TOD regime distribution per column. Expected regimes: 00:00:00 (UTC-midnight write) and/or
--    15:00:00 (KST-midnight). Both are correctly restored by the USING KST expression. Any OTHER TOD
--    is a regime-unknown row that would need per-row adjudication before ALTER.
SELECT 'users.birth_date' col, to_char(birth_date,'HH24:MI:SS') tod, count(*)
  FROM users WHERE birth_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'child_profiles.birth_date', to_char(birth_date,'HH24:MI:SS'), count(*)
  FROM child_profiles WHERE birth_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'training_sessions.session_date', to_char(session_date,'HH24:MI:SS'), count(*)
  FROM training_sessions WHERE session_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'skill_evaluations.evaluation_date', to_char(evaluation_date,'HH24:MI:SS'), count(*)
  FROM skill_evaluations WHERE evaluation_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'tournaments.start_date', to_char(start_date,'HH24:MI:SS'), count(*)
  FROM tournaments WHERE start_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'tournaments.end_date', to_char(end_date,'HH24:MI:SS'), count(*)
  FROM tournaments WHERE end_date IS NOT NULL GROUP BY 2
ORDER BY 1, 3 DESC;

-- 3) KST-USING vs plain ::date mismatch. Expect 0 for every column => USING conversion is loss-free,
--    no backfill needed. (If >0, those rows are in the 15:00 regime and STILL correct under USING — this
--    check only confirms the two expressions agree, which they do only in the 00:00 regime.)
SELECT 'users' col,
       count(*) FILTER (WHERE (birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date <> birth_date::date) kst_vs_plain_mismatch
  FROM users WHERE birth_date IS NOT NULL
UNION ALL SELECT 'child_profiles',
       count(*) FILTER (WHERE (birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date <> birth_date::date)
  FROM child_profiles WHERE birth_date IS NOT NULL
UNION ALL SELECT 'tournaments.start',
       count(*) FILTER (WHERE (start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date <> start_date::date)
  FROM tournaments WHERE start_date IS NOT NULL
UNION ALL SELECT 'tournaments.end',
       count(*) FILTER (WHERE (end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date <> end_date::date)
  FROM tournaments WHERE end_date IS NOT NULL;

-- 4) birthDate age-boundary audit: 1/1-born and 12/31-born rows. The transition must preserve the birth YEAR
--    (age off-by-one guard). raw vs kst_conv must be the same calendar date for every boundary row.
SELECT 'users' src, id, to_char(birth_date,'YYYY-MM-DD') raw, extract(year FROM birth_date) yr,
       to_char((birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'),'YYYY-MM-DD') kst_conv
  FROM users
 WHERE birth_date IS NOT NULL AND (
   (extract(month FROM birth_date)=1  AND extract(day FROM birth_date)=1) OR
   (extract(month FROM birth_date)=12 AND extract(day FROM birth_date)=31))
UNION ALL
SELECT 'child_profiles', id, to_char(birth_date,'YYYY-MM-DD'), extract(year FROM birth_date),
       to_char((birth_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'),'YYYY-MM-DD')
  FROM child_profiles
 WHERE (extract(month FROM birth_date)=1  AND extract(day FROM birth_date)=1) OR
       (extract(month FROM birth_date)=12 AND extract(day FROM birth_date)=31)
ORDER BY 1, raw;
