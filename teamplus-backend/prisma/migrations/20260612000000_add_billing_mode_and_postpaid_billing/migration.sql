-- Phase B-1: 결제 방식(billing_mode) + 월별 후불 청구 모델 추가
--   · 원격 공유 DB(schema=icehockey) — prisma migrate dev 불가 → prisma db execute / 수동 SQL 적용.
--   · 전부 additive (컬럼/테이블 추가) — 데이터 손실 없음. IF NOT EXISTS 로 재실행 안전.
--   · 적용 후: npx prisma generate (Prisma Client 모델 동기화)

-- 1) Class.billingMode — 감독이 수업 생성 시 선불/후불 지정 (PREPAID=모드 B 선불 / POSTPAID=모드 A 후불)
ALTER TABLE "icehockey"."classes"
    ADD COLUMN IF NOT EXISTS "billing_mode" TEXT NOT NULL DEFAULT 'PREPAID';
CREATE INDEX IF NOT EXISTS "classes_billing_mode_idx" ON "icehockey"."classes"("billing_mode");

-- 2) 월별 후불 청구 헤더 (수업×월 멱등) — 감독이 출석 검수 후 확정하는 단위
CREATE TABLE IF NOT EXISTS "icehockey"."monthly_postpaid_billings" (
    "id"           TEXT NOT NULL,
    "class_id"     TEXT NOT NULL,
    "year_month"   TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'draft',
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "monthly_postpaid_billings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_postpaid_billings_class_id_fkey" FOREIGN KEY ("class_id")
        REFERENCES "icehockey"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_postpaid_billings_class_id_year_month_key" ON "icehockey"."monthly_postpaid_billings"("class_id", "year_month");
CREATE INDEX IF NOT EXISTS "monthly_postpaid_billings_class_id_idx" ON "icehockey"."monthly_postpaid_billings"("class_id");
CREATE INDEX IF NOT EXISTS "monthly_postpaid_billings_status_idx"   ON "icehockey"."monthly_postpaid_billings"("status");

-- 3) 월별 후불 청구 라인 (회원별 출석 횟수 × 단가 + 납부 상태)
CREATE TABLE IF NOT EXISTS "icehockey"."monthly_postpaid_billing_lines" (
    "id"               TEXT NOT NULL,
    "billing_id"       TEXT NOT NULL,
    "user_id"          TEXT NOT NULL,
    "attendance_count" INTEGER NOT NULL,
    "amount"           INTEGER NOT NULL,
    "payment_status"   TEXT NOT NULL DEFAULT 'pending',
    "payment_id"       TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "monthly_postpaid_billing_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_postpaid_billing_lines_billing_id_fkey" FOREIGN KEY ("billing_id")
        REFERENCES "icehockey"."monthly_postpaid_billings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "monthly_postpaid_billing_lines_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "icehockey"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "monthly_postpaid_billing_lines_payment_id_fkey" FOREIGN KEY ("payment_id")
        REFERENCES "icehockey"."payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_postpaid_billing_lines_billing_id_user_id_key" ON "icehockey"."monthly_postpaid_billing_lines"("billing_id", "user_id");
CREATE INDEX IF NOT EXISTS "monthly_postpaid_billing_lines_billing_id_idx"     ON "icehockey"."monthly_postpaid_billing_lines"("billing_id");
CREATE INDEX IF NOT EXISTS "monthly_postpaid_billing_lines_user_id_idx"        ON "icehockey"."monthly_postpaid_billing_lines"("user_id");
CREATE INDEX IF NOT EXISTS "monthly_postpaid_billing_lines_payment_status_idx" ON "icehockey"."monthly_postpaid_billing_lines"("payment_status");
