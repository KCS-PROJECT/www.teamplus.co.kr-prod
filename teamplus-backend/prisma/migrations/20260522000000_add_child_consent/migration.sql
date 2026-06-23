-- ===================================================================
-- Migration: add_child_consent (L-10 · 앱심사 v7 잔존 항목)
-- Date    : 2026-05-22
-- Purpose : 만 14세 미만 자녀 등록 시 법정대리인 동의를 저장.
--   * 근거: PIPA(개인정보보호법) §22조, 정통망법 §31조2
--   * 보존: 동의 철회 후 5년 (분쟁 대비)
--   * 식별: guardian_user_id(PARENT) + child_user_id(CHILD) 조합
-- ===================================================================

CREATE TABLE "child_consents" (
  "id"                     TEXT          NOT NULL,
  "guardian_user_id"       TEXT          NOT NULL,
  "child_user_id"          TEXT          NOT NULL,
  "child_age_months"       INTEGER       NOT NULL,
  "terms_version"          TEXT          NOT NULL,
  "privacy_version"        TEXT          NOT NULL,
  "consent_personal_info"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "consent_third_party"    BOOLEAN       NOT NULL DEFAULT FALSE,
  "consent_marketing"      BOOLEAN       NOT NULL DEFAULT FALSE,
  "verification_method"    TEXT          NOT NULL,
  "ip_address"             TEXT,
  "user_agent"             TEXT,
  "revoked_at"             TIMESTAMP(3),
  "signed_at"              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "child_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "child_consents_guardian_user_id_idx" ON "child_consents"("guardian_user_id");
CREATE INDEX "child_consents_child_user_id_idx" ON "child_consents"("child_user_id");
CREATE INDEX "child_consents_guardian_user_id_child_user_id_idx"
  ON "child_consents"("guardian_user_id", "child_user_id");
CREATE INDEX "child_consents_revoked_at_idx" ON "child_consents"("revoked_at");

COMMENT ON TABLE  "child_consents"                          IS 'L-10 만 14세 미만 자녀 법정대리인 동의 저장 (2026-05-22)';
COMMENT ON COLUMN "child_consents"."guardian_user_id"       IS 'PARENT User.id (법정대리인)';
COMMENT ON COLUMN "child_consents"."child_user_id"          IS 'CHILD User.id (동의 대상 자녀)';
COMMENT ON COLUMN "child_consents"."child_age_months"       IS '동의 시점 자녀 만나이 (개월) — 14세 미만 검증';
COMMENT ON COLUMN "child_consents"."terms_version"          IS 'AppSettings.termsVersion 스냅샷';
COMMENT ON COLUMN "child_consents"."privacy_version"        IS 'AppSettings.privacyVersion 스냅샷';
COMMENT ON COLUMN "child_consents"."verification_method"    IS 'sms_otp | identity_verify | pin';
COMMENT ON COLUMN "child_consents"."revoked_at"             IS '동의 철회 시각 (NULL=유효)';
