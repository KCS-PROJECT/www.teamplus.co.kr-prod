-- 수강 신청 귀속월·결제방식 백필 (1회성) — 설계 SoT: claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §4-3·§8-A
--   하위 디렉토리라 apply-all.sh 자동 적용 대상이 아니다(배포마다 재실행 방지). 수동 1회 실행.
--
--   실행 절차: 선행 ALTER(../20260910_enrollment_billing_month.sql) 적용 → prisma generate → 서버 기동 전
--     0) params.transition_month 를 반영 시점의 달로 검토·고정한다(실행일에서 파생하지 않는다).
--     1) 이 파일 그대로 실행 = 드라이런(파일 끝 ROLLBACK, 변경 0). NOTICE 로 건수를 확인한다.
--     2) 숫자가 예상과 맞으면 마지막 줄 ROLLBACK 을 COMMIT 으로 바꿔 다시 실행한다.
--   ⚠️ prisma db execute 는 SELECT 도 NOTICE 도 출력하지 않는다 — NOTICE 를 보려면 psql 로 실행하고,
--      psql 이 없으면 드라이런 집계는 src CTE 와 같은 SELECT 를 별도 스크립트로 돌려 확인한다.
--      02_audit.sql 도 같은 이유로 psql 또는 별도 스크립트로 본다.
--   재실행 안전: 이미 값이 있는 행은 COALESCE 로 보존한다(선행 실행 결과를 덮지 않는다).
--
-- 대상 = enrollments 전체 행(상태 9종 — SoT src/common/enrollment/enrollment-status.constants.ts).
--   월은 상태와 무관한 사실이라 상태별로 규칙을 나누지 않는다(후불 살아있는 행 예외만, 아래 3).
--
-- billing_timing — resolveRowBillingTiming(src/payments/settlement/attribution.util.ts) 규칙을 그대로 옮긴다.
--   수업 billing_mode 가 PREPAID/POSTPAID 면 그 값, BOTH(그 외)면 연결 상품 billing_timing, 상품 없으면 NULL.
--   "상품 복사"가 아니다 — 선불 수업에 후불 상품이 잘못 연결된 행에서 두 규칙이 갈린다.
--
-- billing_month 우선순위 — 런타임 resolveEnrollmentBilling(common/billing/enrollment-billing.util.ts)과 같은 달을 준다.
--   1. PREPAID + 상품 billing_month 존재            → 그 값(이미 date = 그 달 1일, 재변환 금지)
--   2. 스팟(training_type = 'spot')                 → 그 수업의 취소 아닌 일정 중 가장 이른 날짜의 달
--                                                     (런타임 earliestRemainingMonth 와 동일 — 결제일 달이 아니다)
--   3. POSTPAID + status IN (approved, paid)
--      + class_registrations.status = 'active'       → 판매 중인 달 = 오늘 이후 취소 아닌 가장 이른 일정의 달,
--                                                     없으면 sales_open_month, 없으면 params.transition_month
--                                                     (감독이 해제한 선수 = registration inactive 는 여기 안 옴)
--   4. POSTPAID + 그 외(종결·해제)                  → created_at 의 KST 달 1일(종결 행에 미래 달 금지)
--   5. 그 외(무월 레거시 회차권 — 미사용 잔재)      → payments.completed_at 의 KST 달, 없으면 paid_at 의 KST 달
--   6. 전부 없으면 created_at 의 KST 달 1일 — 근거가 남지 않은 행의 마지막 폴백.
--      대상은 상품 월도 결제 시각도 없는 선불 행이며 실측상 전부 종결 상태다(개발 8행 · 운영 16행,
--      2026-09-10 조회 시점 모두 expired/cancelled). 종결 행이라 자격 판정에 쓰이지 않고,
--      Phase 4 NOT NULL 을 막지 않도록 월을 채운다. 살아 있는 행이 여기까지 오면 02_audit.sql 3-1 이 잡는다.

BEGIN;

DROP TABLE IF EXISTS _enrollment_billing_month_backfill;

CREATE TEMP TABLE _enrollment_billing_month_backfill ON COMMIT DROP AS
WITH params AS (
  -- 전환월: 반영 시점의 달. 운영 실행 전 검토·고정(실행일 now() 파생 금지 — 실행 날짜에 따라 달이 갈린다).
  SELECT DATE '2026-09-01' AS transition_month
),
sched AS (
  SELECT
    s.class_id,
    date_trunc('month', MIN(s.scheduled_date))::date AS first_month,
    date_trunc('month', MIN(s.scheduled_date)
      FILTER (WHERE s.scheduled_date >= (now() AT TIME ZONE 'Asia/Seoul')::date))::date AS earliest_remaining_month
  FROM icehockey.class_schedules s
  WHERE s.is_cancelled = false
  GROUP BY s.class_id
),
src AS (
  SELECT
    e.id,
    e.status,
    tm.timing,
    CASE
      WHEN tm.timing = 'PREPAID' AND cp.billing_month IS NOT NULL
        THEN cp.billing_month
      WHEN c.training_type = 'spot'
        THEN sd.first_month
      WHEN tm.timing = 'POSTPAID' AND e.status IN ('approved', 'paid') AND r.status = 'active'
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
      -- attribution.util 의 `mode ?? 'PREPAID'` 기본값까지 동일하게 반영
      WHEN c.billing_mode IS NULL OR c.billing_mode = 'PREPAID' THEN 'PREPAID'
      WHEN c.billing_mode = 'POSTPAID' THEN 'POSTPAID'
      WHEN cp.billing_timing IN ('PREPAID', 'POSTPAID') THEN cp.billing_timing
      ELSE NULL
    END AS timing
  ) tm
  WHERE e.billing_month IS NULL OR e.billing_timing IS NULL
),
upd AS (
  UPDATE icehockey.enrollments e
     SET billing_timing = COALESCE(e.billing_timing, src.timing),
         billing_month  = COALESCE(e.billing_month,  src.month)
    FROM src
   WHERE src.id = e.id
     AND (src.month IS NOT NULL OR src.timing IS NOT NULL)
  RETURNING e.id, e.status, e.billing_month, e.billing_timing
)
SELECT * FROM upd;

DO $$
DECLARE
  rec              record;
  n_touched        int;
  n_month          int;
  n_month_null     int;
  n_timing_null    int;
  n_total          int;
  n_postpaid_inact int;
BEGIN
  SELECT COUNT(*), COUNT(billing_month) INTO n_touched, n_month
    FROM _enrollment_billing_month_backfill;
  SELECT COUNT(*) INTO n_total FROM icehockey.enrollments;
  RAISE NOTICE '[backfill] enrollments 총 %건 / 이번 실행 갱신 %건 (그중 billing_month 확정 %건)',
    n_total, n_touched, n_month;

  -- (a) 상태별 갱신 건수
  FOR rec IN
    SELECT status, COUNT(*) AS touched, COUNT(billing_month) AS month_filled,
           COUNT(billing_timing) AS timing_filled
      FROM _enrollment_billing_month_backfill
     GROUP BY status ORDER BY status
  LOOP
    RAISE NOTICE '[backfill] 갱신 status=% 행=% month확정=% timing확정=%',
      rec.status, rec.touched, rec.month_filled, rec.timing_filled;
  END LOOP;

  -- (b) 상태별 잔여 billing_month NULL
  FOR rec IN
    SELECT status, COUNT(*) AS n
      FROM icehockey.enrollments
     WHERE billing_month IS NULL
     GROUP BY status ORDER BY status
  LOOP
    RAISE NOTICE '[backfill] 잔여 month NULL status=% %건', rec.status, rec.n;
  END LOOP;

  -- (c) 감독 해제(registration inactive)인데 approved/paid 로 남은 후불 행 — 규칙 4(생성월)로
  --     종결 취급됐다. Phase 3 전 수동 취소 대상이므로 건수를 남긴다.
  SELECT COUNT(*) INTO n_postpaid_inact
    FROM icehockey.enrollments e
    LEFT JOIN icehockey.class_registrations r ON r.class_id = e.class_id AND r.user_id = e.child_id
   WHERE e.billing_timing = 'POSTPAID' AND e.status IN ('approved', 'paid')
     AND (r.status IS NULL OR r.status <> 'active');
  RAISE NOTICE '[backfill] 후불 approved/paid 이지만 등록 비활성 %건 — Phase 3 전 수동 취소 대상', n_postpaid_inact;

  -- (d) 총 잔여 — 결정 불능 행은 남길 수 있다(EXCEPTION 아님). Phase 4 NOT NULL 전에 해소한다.
  SELECT COUNT(*) INTO n_month_null  FROM icehockey.enrollments WHERE billing_month  IS NULL;
  SELECT COUNT(*) INTO n_timing_null FROM icehockey.enrollments WHERE billing_timing IS NULL;
  RAISE NOTICE '[backfill] 총 잔여 billing_month NULL %건 · billing_timing NULL %건 — 02_audit.sql 로 개별 추출',
    n_month_null, n_timing_null;
END $$;

-- 드라이런 기본. 반영할 때만 이 줄을 COMMIT; 으로 바꿔 다시 실행한다.
ROLLBACK;
