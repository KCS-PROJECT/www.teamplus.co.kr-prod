-- Step 4-2 (B군 잔여 완결) precheck/audit — 27 columns.
--   26 columns  timestamp -> date (@db.Date):
--     tournament_matches.match_date, class_diaries.session_date, work_schedules.schedule_date,
--     player_class_histories.{start,end}_date, player_careers.{start,end}_date, staff_careers.{start,end}_date,
--     leagues.{start,end}_date, overseas_trips.{start,end}_date, academy_promotions.{start,end}_date,
--     camps.{start,end}_date, lesson_packages.{start,end}_date, coupons.{start,end}_date,
--     settlement_details.payment_date, settlement_transactions.transaction_date, child_profiles.next_test_date,
--     overseas_trip_registrations.passport_expiry_date, teams.founding_date.
--   1 column  timestamp -> timestamptz(3) (@db.Timestamptz(3)):
--     app_premium_events.event_date  (A군 재분류 — 행사 "일시"는 시각 포함 instant).
--
-- Purpose: prove current types + row regime BEFORE the batch ALTER. READ-ONLY. Safe on dev or prod.
--
-- DEV result (2026-07-03): 26 date-candidate columns all 0 non-null rows; app_premium_events.event_date has
--   exactly 1 row = 2026-02-08 10:00:00 (naive) = 2026-02-08T10:00:00Z = 19:00 KST (event start instant).
--   Interpreting the naive value as UTC (USING event_date AT TIME ZONE 'UTC') preserves that exact instant.
--
-- PROD note: prod may carry its own data (settlements, careers, coupons, matches accumulated since dev fork).
--   Re-run this precheck on prod first. For any date-candidate column with non-null rows, inspect the TOD
--   regime in query 2: if every value is 00:00:00 (UTC-midnight write) — or 15:00:00 (KST-midnight) — the
--   KST-USING conversion is loss-free, proceed. Any OTHER TOD => regime-unknown, STOP and adjudicate before ALTER.
--   settlement_transactions.transaction_date is derived from an instant (payment completedAt): its stored value
--   may legitimately carry a non-midnight TOD on prod; there the KST-USING expression yields the correct KST
--   calendar day of that instant, so it stays correct — but confirm via query 2 before running the ALTER.

SET client_encoding TO 'UTF8';
SET search_path TO icehockey;

-- 1) current column types (expect: 27 rows, all 'timestamp without time zone').
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

-- 2) non-null row count per column (dev: 26 x 0, app_premium_events.event_date = 1).
SELECT 'app_premium_events.event_date' c, count(*) FILTER (WHERE event_date IS NOT NULL) n FROM app_premium_events
UNION ALL SELECT 'tournament_matches.match_date', count(*) FILTER (WHERE match_date IS NOT NULL) FROM tournament_matches
UNION ALL SELECT 'class_diaries.session_date', count(*) FILTER (WHERE session_date IS NOT NULL) FROM class_diaries
UNION ALL SELECT 'work_schedules.schedule_date', count(*) FILTER (WHERE schedule_date IS NOT NULL) FROM work_schedules
UNION ALL SELECT 'player_class_histories.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM player_class_histories
UNION ALL SELECT 'player_class_histories.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM player_class_histories
UNION ALL SELECT 'player_careers.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM player_careers
UNION ALL SELECT 'player_careers.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM player_careers
UNION ALL SELECT 'staff_careers.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM staff_careers
UNION ALL SELECT 'staff_careers.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM staff_careers
UNION ALL SELECT 'leagues.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM leagues
UNION ALL SELECT 'leagues.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM leagues
UNION ALL SELECT 'overseas_trips.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM overseas_trips
UNION ALL SELECT 'overseas_trips.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM overseas_trips
UNION ALL SELECT 'academy_promotions.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM academy_promotions
UNION ALL SELECT 'academy_promotions.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM academy_promotions
UNION ALL SELECT 'camps.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM camps
UNION ALL SELECT 'camps.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM camps
UNION ALL SELECT 'lesson_packages.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM lesson_packages
UNION ALL SELECT 'lesson_packages.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM lesson_packages
UNION ALL SELECT 'coupons.start_date', count(*) FILTER (WHERE start_date IS NOT NULL) FROM coupons
UNION ALL SELECT 'coupons.end_date', count(*) FILTER (WHERE end_date IS NOT NULL) FROM coupons
UNION ALL SELECT 'settlement_details.payment_date', count(*) FILTER (WHERE payment_date IS NOT NULL) FROM settlement_details
UNION ALL SELECT 'settlement_transactions.transaction_date', count(*) FILTER (WHERE transaction_date IS NOT NULL) FROM settlement_transactions
UNION ALL SELECT 'child_profiles.next_test_date', count(*) FILTER (WHERE next_test_date IS NOT NULL) FROM child_profiles
UNION ALL SELECT 'overseas_trip_registrations.passport_expiry_date', count(*) FILTER (WHERE passport_expiry_date IS NOT NULL) FROM overseas_trip_registrations
UNION ALL SELECT 'teams.founding_date', count(*) FILTER (WHERE founding_date IS NOT NULL) FROM teams
ORDER BY 1;

-- 3) app_premium_events.event_date instant audit: raw naive value + epoch when read as a UTC instant.
--    The timestamp->timestamptz ALTER (USING event_date AT TIME ZONE 'UTC') must preserve this epoch exactly.
--    dev: 2026-02-08 10:00:00 naive -> epoch 1770544800 (= 2026-02-08T10:00:00Z = 19:00 KST).
SELECT id,
       to_char(event_date,'YYYY-MM-DD HH24:MI:SS') raw_naive,
       extract(epoch FROM (event_date AT TIME ZONE 'UTC')) epoch_as_utc_instant
FROM app_premium_events
WHERE event_date IS NOT NULL
ORDER BY id;

-- 4) TOD regime for any date-candidate column that DOES carry rows (dev: none; prod: settlements/careers may).
--    Only 00:00:00 (and 15:00:00) are safe-to-convert regimes. Any other TOD => adjudicate before ALTER.
SELECT 'settlement_details.payment_date' col, to_char(payment_date,'HH24:MI:SS') tod, count(*)
  FROM settlement_details WHERE payment_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'settlement_transactions.transaction_date', to_char(transaction_date,'HH24:MI:SS'), count(*)
  FROM settlement_transactions WHERE transaction_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'tournament_matches.match_date', to_char(match_date,'HH24:MI:SS'), count(*)
  FROM tournament_matches WHERE match_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'coupons.start_date', to_char(start_date,'HH24:MI:SS'), count(*)
  FROM coupons WHERE start_date IS NOT NULL GROUP BY 2
UNION ALL SELECT 'coupons.end_date', to_char(end_date,'HH24:MI:SS'), count(*)
  FROM coupons WHERE end_date IS NOT NULL GROUP BY 2
ORDER BY 1, 3 DESC;
