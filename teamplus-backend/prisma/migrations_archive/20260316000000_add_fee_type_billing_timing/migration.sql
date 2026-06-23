-- Migration: 월정액/횟수제 결제 방식 + 선결제/후결제 지원
-- 2026-03-16

-- class_products: 결제 방식 및 단가 컬럼 추가
ALTER TABLE "class_products"
  ADD COLUMN "fee_type"         VARCHAR(20) NOT NULL DEFAULT 'PER_SESSION',
  ADD COLUMN "billing_timing"   VARCHAR(20) NOT NULL DEFAULT 'PREPAID',
  ADD COLUMN "sessions_per_week" INTEGER,
  ADD COLUMN "fee_per_session"  DECIMAL(10, 2);

-- class_products 인덱스
CREATE INDEX "class_products_fee_type_idx" ON "class_products"("fee_type");
CREATE INDEX "class_products_billing_timing_idx" ON "class_products"("billing_timing");

-- clubs: 기본 결제 시점 컬럼 추가
ALTER TABLE "clubs"
  ADD COLUMN "default_billing_timing" VARCHAR(20) NOT NULL DEFAULT 'PREPAID';
