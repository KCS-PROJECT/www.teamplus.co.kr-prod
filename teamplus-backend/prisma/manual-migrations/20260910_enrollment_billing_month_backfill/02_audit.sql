-- 수강 신청 귀속월 백필 감사 (읽기 전용) — 설계 SoT: claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §8-A
--   ⚠️ 하위 디렉토리라 apply-all.sh 자동 적용 대상이 아니다. 백필 직후 1회 + 운영 점검용으로 보관한다.
--   ⚠️ prisma db execute 는 SELECT 결과를 출력하지 않으므로 전부 RAISE NOTICE 로 낸다. 쓰기 없음.
--
--   1. 상태 9종별 billing_month NULL 건수 (SoT src/common/enrollment/enrollment-status.constants.ts)
--   2. 결정 불능 행(billing_month IS NULL) 상위 20건 개별 추출 — Phase 4 NOT NULL 게이트
--   3. 같은 (child_id, class_id, billing_month) 중복 — DB 유니크를 두지 않은 결정의 유일한 대체 방어선

DO $$
DECLARE
  rec       record;
  n_known   int;
  n_unknown int;
BEGIN
  RAISE NOTICE '=== 1. 상태별 billing_month NULL 건수 ===';
  FOR rec IN
    SELECT s.status,
           COUNT(e.id)                                        AS total,
           COUNT(e.id) FILTER (WHERE e.billing_month IS NULL)  AS month_null,
           COUNT(e.id) FILTER (WHERE e.billing_timing IS NULL) AS timing_null
      FROM (VALUES ('pending'), ('pending_approval'), ('approved'), ('rejected'), ('paid'),
                   ('cancelled'), ('expired'), ('completed'), ('refunded')) AS s(status)
      LEFT JOIN icehockey.enrollments e ON e.status = s.status
     GROUP BY s.status ORDER BY s.status
  LOOP
    RAISE NOTICE '[audit] status=% 전체=% month_NULL=% timing_NULL=%',
      rec.status, rec.total, rec.month_null, rec.timing_null;
  END LOOP;

  -- SoT 9종 밖의 상태가 있으면 백필 규칙 자체가 미커버 — 별도 경고
  SELECT COUNT(*) INTO n_unknown FROM icehockey.enrollments
   WHERE status NOT IN ('pending', 'pending_approval', 'approved', 'rejected', 'paid',
                        'cancelled', 'expired', 'completed', 'refunded');
  IF n_unknown > 0 THEN
    RAISE NOTICE '[audit] ⚠️ SoT 9종 밖 status %건 — enrollment-status.constants.ts 갱신 필요', n_unknown;
  END IF;

  SELECT COUNT(*) INTO n_known FROM icehockey.enrollments;
  RAISE NOTICE '[audit] enrollments 총 %건', n_known;
END $$;

DO $$
DECLARE
  rec record;
  n   int;
BEGIN
  RAISE NOTICE '=== 2. 결정 불능 행 (billing_month IS NULL) ===';
  SELECT COUNT(*) INTO n FROM icehockey.enrollments WHERE billing_month IS NULL;
  RAISE NOTICE '[audit] 결정 불능 %건 (0 이어야 Phase 4 NOT NULL 진행 가능)', n;

  FOR rec IN
    SELECT e.id, e.status, e.child_id, e.class_id, e.class_product_id, e.payment_id,
           e.created_at, e.paid_at, c.billing_mode, e.billing_timing
      FROM icehockey.enrollments e
      LEFT JOIN icehockey.classes c ON c.id = e.class_id
     WHERE e.billing_month IS NULL
     ORDER BY e.created_at
     LIMIT 20
  LOOP
    RAISE NOTICE '[audit] id=% status=% child=% class=% mode=% timing=% product=% payment=% created=% paid=%',
      rec.id, rec.status, rec.child_id, rec.class_id, rec.billing_mode, rec.billing_timing,
      COALESCE(rec.class_product_id, '-'), COALESCE(rec.payment_id, '-'),
      rec.created_at, COALESCE(rec.paid_at::text, '-');
  END LOOP;
END $$;

DO $$
DECLARE
  rec       record;
  n_groups  int;
  n_rows    int;
BEGIN
  RAISE NOTICE '=== 3. 같은 달 중복 감사 (살아 있는 신청) ===';
  SELECT COUNT(*), COALESCE(SUM(g.n), 0) INTO n_groups, n_rows FROM (
    SELECT COUNT(*) AS n
      FROM icehockey.enrollments
     WHERE status IN ('pending', 'pending_approval', 'approved', 'paid')
       AND billing_month IS NOT NULL
     GROUP BY child_id, class_id, billing_month
    HAVING COUNT(*) > 1
  ) g;
  RAISE NOTICE '[audit] 중복 묶음 %개 / 관련 행 %건 (0 이어야 정상)', n_groups, n_rows;

  FOR rec IN
    SELECT child_id, class_id, billing_month, COUNT(*) AS n,
           array_agg(id ORDER BY created_at) AS ids,
           array_agg(DISTINCT status)        AS statuses
      FROM icehockey.enrollments
     WHERE status IN ('pending', 'pending_approval', 'approved', 'paid')
       AND billing_month IS NOT NULL
     GROUP BY child_id, class_id, billing_month
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC
     LIMIT 20
  LOOP
    RAISE NOTICE '[audit] 중복 child=% class=% month=% n=% status=% ids=%',
      rec.child_id, rec.class_id, rec.billing_month, rec.n, rec.statuses, rec.ids;
  END LOOP;
END $$;
