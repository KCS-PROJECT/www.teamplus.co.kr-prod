-- ===================================================================
-- Migration: add_settlement_terms_softdelete_liability_waiver
-- Date    : 2026-05-21
-- Purpose : 앱 심사 v5/v6 즉시 적용 항목
--   * P-12: AppSettings.commission_rate (3% 기본)
--   * P-13: AppSettings.settlement_days (매월 10일·말일 2회)
--   * L-02: User.agreed_terms_version / agreed_privacy_version / agreed_at
--   * NEW-06: User.deleted_at (Soft Delete, PIPA 30일 보존)
--   * C-09: liability_waivers 신규 테이블 (부상 면책 동의서 저장)
-- ===================================================================

-- ─────────────────────────────────────────────────────────
-- 1. AppSettings 정산 설정 (P-12, P-13)
-- ─────────────────────────────────────────────────────────
ALTER TABLE "app_settings"
  ADD COLUMN "commission_rate" DECIMAL(5, 4) NOT NULL DEFAULT 0.0300;

ALTER TABLE "app_settings"
  ADD COLUMN "settlement_days" INTEGER[] NOT NULL DEFAULT ARRAY[10, 31]::INTEGER[];

COMMENT ON COLUMN "app_settings"."commission_rate" IS '플랫폼 수수료율 (0.0000~1.0000, 기본 0.0300 = 3%)';
COMMENT ON COLUMN "app_settings"."settlement_days" IS '정산 지급일 배열 (31은 말일 의미)';

-- ─────────────────────────────────────────────────────────
-- 2. User 약관 동의 버전 (L-02)
-- ─────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "agreed_terms_version" TEXT,
  ADD COLUMN "agreed_privacy_version" TEXT,
  ADD COLUMN "agreed_at" TIMESTAMP(3);

COMMENT ON COLUMN "users"."agreed_terms_version" IS '마지막 동의한 이용약관 버전';
COMMENT ON COLUMN "users"."agreed_privacy_version" IS '마지막 동의한 개인정보처리방침 버전';
COMMENT ON COLUMN "users"."agreed_at" IS '마지막 약관 동의 시각';

-- ─────────────────────────────────────────────────────────
-- 3. User Soft Delete (NEW-06)
-- ─────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "deleted_at" TIMESTAMP(3);

COMMENT ON COLUMN "users"."deleted_at" IS '논리적 삭제 시각 (NULL=active, 값 있음=soft-deleted)';

-- soft-delete 인덱스 (active 사용자 빠른 조회)
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at") WHERE "deleted_at" IS NULL;

-- ─────────────────────────────────────────────────────────
-- 4. LiabilityWaiver 신규 테이블 (C-09)
-- ─────────────────────────────────────────────────────────
CREATE TABLE "liability_waivers" (
  "id"            TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "terms_version" TEXT NOT NULL,
  "signed_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address"    TEXT,
  "user_agent"    TEXT,
  "context"       TEXT,
  "context_id"    TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "liability_waivers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liability_waivers_user_id_idx" ON "liability_waivers"("user_id");
CREATE INDEX "liability_waivers_user_id_context_idx" ON "liability_waivers"("user_id", "context");
CREATE INDEX "liability_waivers_signed_at_idx" ON "liability_waivers"("signed_at");

ALTER TABLE "liability_waivers"
  ADD CONSTRAINT "liability_waivers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "liability_waivers" IS '부상 면책 동의서 저장 (C-09, 2026-05-21)';
