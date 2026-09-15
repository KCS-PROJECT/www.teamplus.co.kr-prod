-- 수강 신청 귀속월·결제방식 스냅샷 — 설계 SoT: claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §4-3·§8-A
-- billing_month = 대상월(그 달 1일). 어느 달을 다니려고 신청했나 — 신청일·결제일 파생값이 아니다.
-- billing_timing = 신청 시점 결제 방식 스냅샷(PREPAID|POSTPAID). class_products join 없이 자격 조건을 닫는다.
-- 둘 다 nullable additive. NOT NULL·CHECK 는 백필·생성 경로 반영이 끝난 마지막 Phase 로 미룬다
--   (중간 배포 상태에서 제약이 먼저 걸리면 구코드 INSERT 가 실패한다).
-- 같은 달 중복은 DB 유니크가 아니라 앱 가드 + 좌석 잠금이 막고, 감사 쿼리로 점검한다(설계 §4-3).
-- 인덱스 이름은 Prisma introspection 네이밍(@@index([childId, classId, billingMonth]))과 일치 — drift 방지.

ALTER TABLE icehockey.enrollments ADD COLUMN IF NOT EXISTS billing_month  date;
ALTER TABLE icehockey.enrollments ADD COLUMN IF NOT EXISTS billing_timing text;

CREATE INDEX IF NOT EXISTS "enrollments_child_id_class_id_billing_month_idx"
  ON icehockey.enrollments ("child_id", "class_id", "billing_month");

-- 값 도메인 CHECK — NULL 허용이라 구코드 INSERT 는 그대로 통과한다(String+CHECK 컨벤션,
--   20260723_refund_request_step1 선례). 자격 조건식이 'PREPAID'/'POSTPAID' 동등 비교라
--   소문자·BOTH·UNASSIGNED 가 들어오면 어느 쪽도 아닌 행이 조용히 생기는 것을 막는다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'enrollments_billing_timing_check'
       AND conrelid = 'icehockey.enrollments'::regclass
  ) THEN
    ALTER TABLE icehockey.enrollments
      ADD CONSTRAINT enrollments_billing_timing_check
      CHECK (billing_timing IS NULL OR billing_timing IN ('PREPAID', 'POSTPAID'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'enrollments_billing_month_first_day_check'
       AND conrelid = 'icehockey.enrollments'::regclass
  ) THEN
    ALTER TABLE icehockey.enrollments
      ADD CONSTRAINT enrollments_billing_month_first_day_check
      CHECK (billing_month IS NULL OR billing_month = date_trunc('month', billing_month)::date);
  END IF;
END $$;

-- 검증 (적용 후 2행이어야 함):
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'icehockey' AND table_name = 'enrollments'
--    AND column_name IN ('billing_month', 'billing_timing');
