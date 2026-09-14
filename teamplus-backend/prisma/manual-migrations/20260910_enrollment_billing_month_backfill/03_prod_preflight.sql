-- 수강 신청 귀속월 백필 — 운영 사전 점검 (읽기 전용 · psql 실행 전용)
--   설계 SoT: claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §8-A
--
--   목적: 운영에 ALTER·백필을 적용하기 전에 규모와 위험을 먼저 본다.
--         01_backfill.sql 과 같은 판정식을 쓰되 UPDATE 없이 집계만 한다.
--   전제: 컬럼(billing_month·billing_timing)이 아직 없어도 실행된다 — 신규 컬럼을 참조하지 않는다.
--   안전: SELECT 만 한다. 트랜잭션·임시 테이블·뷰를 만들지 않는다.
--
--   실행:  PGURL=$(grep '^PROD_DATABASE_URL=' teamplus-backend/.env.local | cut -d= -f2- | sed 's/?.*$//')
--          PGCLIENTENCODING=UTF8 psql "$PGURL" -P pager=off -f 03_prod_preflight.sql
--          · 접속 문자열 끝의 `?schema=` 는 libpq 가 거부하므로 제거한다(테이블은 전부 icehockey. 로 한정).
--          · 비밀번호는 대화·로그에 평문으로 남기지 않는다 — 파일에서 읽어 변수로만 전달한다.
--          · prisma db execute 는 SELECT 를 출력하지 않으므로 쓰지 않는다.
--   ⚠️ 운영(.230)과 개발(.115)은 서버·데이터·id 가 전부 별개다. 0번 결과의 server_ip 를 먼저 확인한다.
--      로컬 .env 의 DATABASE_URL 은 양쪽 저장소 모두 개발(.115)을 가리킨다.
--
--   ⚠️ 아래 transition_month 는 실행일에서 파생하지 않는다. 운영 반영 시점의 달로 검토·고정한 뒤 실행한다.
--      01_backfill.sql 의 params 값과 반드시 같아야 결과가 일치한다.

\echo '=== 0. 접속 대상 확인 — 운영은 .230, 개발은 .115. 예상과 다르면 즉시 중단 ==='
SELECT inet_server_addr() AS server_ip,
       current_database()  AS db,
       current_user        AS usr,
       (now() AT TIME ZONE 'Asia/Seoul')::timestamp(0) AS kst_now;

\echo ''
\echo '=== 1. Phase 1 컬럼 적용 여부 (0행 = 아직 미적용) ==='
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'icehockey'
   AND table_name   = 'enrollments'
   AND column_name IN ('billing_month', 'billing_timing')
 ORDER BY column_name;

\echo ''
\echo '=== 2. 상태별 전체 행 수 (백필 대상 규모) ==='
SELECT status, COUNT(*) AS rows
  FROM icehockey.enrollments
 GROUP BY status
 ORDER BY COUNT(*) DESC;

\echo ''
\echo '=== 2-1. SoT 9종 밖 상태 (0행이어야 정상) ==='
SELECT status, COUNT(*) AS rows
  FROM icehockey.enrollments
 WHERE status NOT IN ('pending', 'pending_approval', 'approved', 'rejected', 'paid',
                      'cancelled', 'expired', 'completed', 'refunded')
 GROUP BY status
 ORDER BY COUNT(*) DESC;

\echo ''
\echo '=== 3. 백필 판정 미리보기 — 규칙별 결정/미결정 건수 ==='
WITH params AS (
  SELECT DATE '2026-09-01' AS transition_month   -- ← 운영 반영 달로 검토·고정
),
sched AS (
  SELECT s.class_id,
         date_trunc('month', MIN(s.scheduled_date))::date AS first_month,
         date_trunc('month', MIN(s.scheduled_date)
           FILTER (WHERE s.scheduled_date >= (now() AT TIME ZONE 'Asia/Seoul')::date))::date
           AS earliest_remaining_month
    FROM icehockey.class_schedules s
   WHERE s.is_cancelled = false
   GROUP BY s.class_id
),
calc AS (
  SELECT
    e.id, e.status, e.child_id, e.class_id,
    tm.timing,
    CASE
      WHEN tm.timing = 'PREPAID' AND cp.billing_month IS NOT NULL              THEN '1 선불 상품월'
      WHEN c.training_type = 'spot'                                            THEN '2 스팟 일정월'
      WHEN tm.timing = 'POSTPAID' AND e.status IN ('approved','paid')
           AND r.status = 'active'                                             THEN '3 후불 진행중'
      WHEN tm.timing = 'POSTPAID'                                              THEN '4 후불 종결(생성월)'
      WHEN p.completed_at IS NOT NULL                                          THEN '5 레거시 결제완료일'
      WHEN e.paid_at IS NOT NULL                                               THEN '5 레거시 결제일'
      ELSE '6 생성월 폴백'
    END AS rule,
    CASE
      WHEN tm.timing = 'PREPAID' AND cp.billing_month IS NOT NULL
        THEN cp.billing_month
      WHEN c.training_type = 'spot'
        THEN sd.first_month
      WHEN tm.timing = 'POSTPAID' AND e.status IN ('approved','paid') AND r.status = 'active'
        THEN COALESCE(sd.earliest_remaining_month, c.sales_open_month, params.transition_month)
      WHEN tm.timing = 'POSTPAID'
        THEN date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Seoul'))::date
      WHEN p.completed_at IS NOT NULL
        THEN date_trunc('month', (p.completed_at AT TIME ZONE 'Asia/Seoul'))::date
      WHEN e.paid_at IS NOT NULL
        THEN date_trunc('month', (e.paid_at AT TIME ZONE 'Asia/Seoul'))::date
      ELSE date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Seoul'))::date
    END AS month
  FROM icehockey.enrollments e
  CROSS JOIN params
  LEFT JOIN icehockey.classes             c  ON c.id = e.class_id
  LEFT JOIN icehockey.class_products      cp ON cp.id = e.class_product_id
  LEFT JOIN icehockey.payments            p  ON p.id = e.payment_id
  LEFT JOIN icehockey.class_registrations r  ON r.class_id = e.class_id AND r.user_id = e.child_id
  LEFT JOIN sched                         sd ON sd.class_id = e.class_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN c.billing_mode IS NULL OR c.billing_mode = 'PREPAID'  THEN 'PREPAID'
      WHEN c.billing_mode = 'POSTPAID'                           THEN 'POSTPAID'
      WHEN cp.billing_timing IN ('PREPAID', 'POSTPAID')          THEN cp.billing_timing
      ELSE NULL
    END AS timing
  ) tm
)
SELECT rule,
       COUNT(*)                                  AS rows,
       COUNT(month)                              AS month_resolved,
       COUNT(*) - COUNT(month)                   AS month_null,
       COUNT(timing)                             AS timing_resolved
  FROM calc
 GROUP BY rule
 ORDER BY rule;

\echo ''
\echo '=== 4. 생성월 폴백이 적용될 행 (status 가 전부 종결이어야 안전) ==='
WITH params AS (SELECT DATE '2026-09-01' AS transition_month),
sched AS (
  SELECT s.class_id,
         date_trunc('month', MIN(s.scheduled_date))::date AS first_month,
         date_trunc('month', MIN(s.scheduled_date)
           FILTER (WHERE s.scheduled_date >= (now() AT TIME ZONE 'Asia/Seoul')::date))::date
           AS earliest_remaining_month
    FROM icehockey.class_schedules s
   WHERE s.is_cancelled = false
   GROUP BY s.class_id
),
calc AS (
  SELECT e.id, e.status, e.class_id, e.class_product_id, e.payment_id,
         e.created_at, e.paid_at, c.billing_mode, c.training_type, tm.timing,
    CASE
      WHEN tm.timing = 'PREPAID' AND cp.billing_month IS NOT NULL              THEN false
      WHEN c.training_type = 'spot'                                            THEN false
      WHEN tm.timing = 'POSTPAID'                                              THEN false
      WHEN p.completed_at IS NOT NULL OR e.paid_at IS NOT NULL                 THEN false
      ELSE true
    END AS is_fallback,
    CASE
      WHEN tm.timing = 'PREPAID' AND cp.billing_month IS NOT NULL THEN cp.billing_month
      WHEN c.training_type = 'spot'                               THEN sd.first_month
      WHEN tm.timing = 'POSTPAID' AND e.status IN ('approved','paid') AND r.status = 'active'
        THEN COALESCE(sd.earliest_remaining_month, c.sales_open_month, params.transition_month)
      WHEN tm.timing = 'POSTPAID'
        THEN date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Seoul'))::date
      WHEN p.completed_at IS NOT NULL
        THEN date_trunc('month', (p.completed_at AT TIME ZONE 'Asia/Seoul'))::date
      WHEN e.paid_at IS NOT NULL
        THEN date_trunc('month', (e.paid_at AT TIME ZONE 'Asia/Seoul'))::date
      ELSE date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Seoul'))::date
    END AS month
    FROM icehockey.enrollments e
    CROSS JOIN params
    LEFT JOIN icehockey.classes             c  ON c.id = e.class_id
    LEFT JOIN icehockey.class_products      cp ON cp.id = e.class_product_id
    LEFT JOIN icehockey.payments            p  ON p.id = e.payment_id
    LEFT JOIN icehockey.class_registrations r  ON r.class_id = e.class_id AND r.user_id = e.child_id
    LEFT JOIN sched                         sd ON sd.class_id = e.class_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN c.billing_mode IS NULL OR c.billing_mode = 'PREPAID' THEN 'PREPAID'
        WHEN c.billing_mode = 'POSTPAID'                          THEN 'POSTPAID'
        WHEN cp.billing_timing IN ('PREPAID', 'POSTPAID')         THEN cp.billing_timing
        ELSE NULL
      END AS timing
    ) tm
)
SELECT status,
       COUNT(*)                                                       AS rows,
       MIN((created_at AT TIME ZONE 'Asia/Seoul')::date)              AS oldest_kst,
       MAX((created_at AT TIME ZONE 'Asia/Seoul')::date)              AS newest_kst,
       COUNT(*) FILTER (WHERE status IN ('pending', 'pending_approval', 'approved', 'paid'))
                                                                      AS live_rows
  FROM calc
 WHERE is_fallback
 GROUP BY status
 ORDER BY COUNT(*) DESC;

\echo ''
\echo '=== 5. 같은 달 중복 (DB 유니크 없음 · 유일한 방어선 · 0행 목표) ==='
WITH params AS (SELECT DATE '2026-09-01' AS transition_month),
sched AS (
  SELECT s.class_id,
         date_trunc('month', MIN(s.scheduled_date))::date AS first_month,
         date_trunc('month', MIN(s.scheduled_date)
           FILTER (WHERE s.scheduled_date >= (now() AT TIME ZONE 'Asia/Seoul')::date))::date
           AS earliest_remaining_month
    FROM icehockey.class_schedules s
   WHERE s.is_cancelled = false
   GROUP BY s.class_id
),
calc AS (
  SELECT e.id, e.status, e.child_id, e.class_id, e.created_at,
    CASE
      WHEN tm.timing = 'PREPAID' AND cp.billing_month IS NOT NULL THEN cp.billing_month
      WHEN c.training_type = 'spot'                               THEN sd.first_month
      WHEN tm.timing = 'POSTPAID' AND e.status IN ('approved','paid') AND r.status = 'active'
        THEN COALESCE(sd.earliest_remaining_month, c.sales_open_month, params.transition_month)
      WHEN tm.timing = 'POSTPAID'
        THEN date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Seoul'))::date
      WHEN p.completed_at IS NOT NULL
        THEN date_trunc('month', (p.completed_at AT TIME ZONE 'Asia/Seoul'))::date
      WHEN e.paid_at IS NOT NULL
        THEN date_trunc('month', (e.paid_at AT TIME ZONE 'Asia/Seoul'))::date
      ELSE date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Seoul'))::date
    END AS month
    FROM icehockey.enrollments e
    CROSS JOIN params
    LEFT JOIN icehockey.classes             c  ON c.id = e.class_id
    LEFT JOIN icehockey.class_products      cp ON cp.id = e.class_product_id
    LEFT JOIN icehockey.payments            p  ON p.id = e.payment_id
    LEFT JOIN icehockey.class_registrations r  ON r.class_id = e.class_id AND r.user_id = e.child_id
    LEFT JOIN sched                         sd ON sd.class_id = e.class_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN c.billing_mode IS NULL OR c.billing_mode = 'PREPAID' THEN 'PREPAID'
        WHEN c.billing_mode = 'POSTPAID'                          THEN 'POSTPAID'
        WHEN cp.billing_timing IN ('PREPAID', 'POSTPAID')         THEN cp.billing_timing
        ELSE NULL
      END AS timing
    ) tm
)
SELECT child_id, class_id, month, COUNT(*) AS n,
       array_agg(DISTINCT status)        AS statuses,
       array_agg(id ORDER BY created_at) AS ids
  FROM calc
 WHERE status IN ('pending', 'pending_approval', 'approved', 'paid')
   AND month IS NOT NULL
 GROUP BY child_id, class_id, month
HAVING COUNT(*) > 1
 ORDER BY COUNT(*) DESC
 LIMIT 30;

\echo ''
\echo '=== 6. 감독이 해제했는데 approved/paid 로 남은 후불 행 (Phase 3 전 수동 취소 대상) ==='
SELECT e.id, e.status, e.child_id, e.class_id,
       (e.created_at AT TIME ZONE 'Asia/Seoul')::date AS created_kst
  FROM icehockey.enrollments e
  LEFT JOIN icehockey.classes             c ON c.id = e.class_id
  LEFT JOIN icehockey.class_registrations r ON r.class_id = e.class_id AND r.user_id = e.child_id
 WHERE c.billing_mode = 'POSTPAID'
   AND e.status IN ('approved', 'paid')
   AND (r.status IS DISTINCT FROM 'active')
 ORDER BY e.created_at
 LIMIT 30;

\echo ''
\echo '=== 점검 끝 — 판단 기준 ==='
\echo '  · 1번이 0행이면 ALTER 미적용 상태(정상, 배포 시 Jenkins 자동 적용)'
\echo '  · 3번 month_null 이 전부 0 이어야 한다(생성월 폴백이 마지막을 메운다)'
\echo '  · 4번 live_rows 가 0 이어야 안전 — 살아 있는 행에 생성월을 넣으면 자격 판정이 틀어진다'
\echo '  · 5번 중복이 0행이 아니면 Phase 3 전에 정리 필요'
\echo '  · 6번은 Phase 3 에서 신청 취소로 정리할 대상 목록'
