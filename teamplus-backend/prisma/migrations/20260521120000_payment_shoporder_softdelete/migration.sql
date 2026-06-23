-- ===================================================================
-- Migration: payment_shoporder_softdelete (NEW-06 확장)
-- Date    : 2026-05-21
-- Purpose : 결제·주문 모델에 Soft Delete 적용
--   * Payment.deleted_at   — PIPA 5년 보존 + 회계 감사 대비
--   * ShopOrder.deleted_at — 전자상거래법 5년 보존
-- ===================================================================

-- Payment
ALTER TABLE "payments"
  ADD COLUMN "deleted_at" TIMESTAMP(3);

COMMENT ON COLUMN "payments"."deleted_at" IS 'Soft Delete (NEW-06, 2026-05-21, PIPA 5년 보존)';

-- Active payments 빠른 조회용 partial index
CREATE INDEX "payments_deleted_at_idx" ON "payments"("deleted_at") WHERE "deleted_at" IS NULL;

-- ShopOrder
ALTER TABLE "shop_orders"
  ADD COLUMN "deleted_at" TIMESTAMP(3);

COMMENT ON COLUMN "shop_orders"."deleted_at" IS 'Soft Delete (NEW-06, 2026-05-21, 전자상거래법 5년 보존)';

CREATE INDEX "shop_orders_deleted_at_idx" ON "shop_orders"("deleted_at") WHERE "deleted_at" IS NULL;
