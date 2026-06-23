-- Migration: normalize JSONB-backed columns and unbounded URL columns for PostgreSQL

-- JSONB normalization
ALTER TABLE "system_notices"
  ALTER COLUMN "display_locations_json" TYPE JSONB
    USING COALESCE(NULLIF(BTRIM("display_locations_json"::text), ''), '[]')::jsonb,
  ALTER COLUMN "display_locations_json" SET DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS "app_banners_is_active_target_roles_json_idx";
DROP INDEX IF EXISTS "idx_16409_app_banners_is_active_target_roles_json_idx";

ALTER TABLE "app_banners"
  ALTER COLUMN "target_roles_json" TYPE JSONB
    USING COALESCE(NULLIF(BTRIM("target_roles_json"::text), ''), '[]')::jsonb,
  ALTER COLUMN "target_roles_json" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "display_locations_json" TYPE JSONB
    USING COALESCE(NULLIF(BTRIM("display_locations_json"::text), ''), '[]')::jsonb,
  ALTER COLUMN "display_locations_json" SET DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "app_banners_target_roles_json_gin_idx"
  ON "app_banners" USING GIN ("target_roles_json");

ALTER TABLE "app_premium_events"
  ALTER COLUMN "benefits_json" TYPE JSONB
    USING COALESCE(NULLIF(BTRIM("benefits_json"::text), ''), '[]')::jsonb;

ALTER TABLE "alimtalk_logs"
  ALTER COLUMN "response_data" TYPE JSONB
    USING CASE
      WHEN "response_data" IS NULL OR NULLIF(BTRIM("response_data"::text), '') IS NULL THEN NULL
      ELSE "response_data"::jsonb
    END;

ALTER TABLE "audit_logs"
  ALTER COLUMN "old_value" TYPE JSONB
    USING CASE
      WHEN "old_value" IS NULL OR NULLIF(BTRIM("old_value"::text), '') IS NULL THEN NULL
      ELSE "old_value"::jsonb
    END,
  ALTER COLUMN "new_value" TYPE JSONB
    USING CASE
      WHEN "new_value" IS NULL OR NULLIF(BTRIM("new_value"::text), '') IS NULL THEN NULL
      ELSE "new_value"::jsonb
    END;

ALTER TABLE "payment_webhooks"
  ALTER COLUMN "webhook_payload" TYPE JSONB
    USING "webhook_payload"::jsonb;

ALTER TABLE "identity_webhook_logs"
  ALTER COLUMN "webhook_payload" TYPE JSONB
    USING "webhook_payload"::jsonb;

ALTER TABLE "venues"
  ALTER COLUMN "amenities" TYPE JSONB
    USING CASE
      WHEN "amenities" IS NULL OR NULLIF(BTRIM("amenities"::text), '') IS NULL THEN NULL
      ELSE "amenities"::jsonb
    END,
  ALTER COLUMN "operating_hours" TYPE JSONB
    USING CASE
      WHEN "operating_hours" IS NULL OR NULLIF(BTRIM("operating_hours"::text), '') IS NULL THEN NULL
      ELSE "operating_hours"::jsonb
    END;

ALTER TABLE "lesson_packages"
  ALTER COLUMN "session_dates" TYPE JSONB
    USING CASE
      WHEN "session_dates" IS NULL OR NULLIF(BTRIM("session_dates"::text), '') IS NULL THEN NULL
      ELSE "session_dates"::jsonb
    END;

-- URL / asset columns should be unbounded text
ALTER TABLE "shop_categories" ALTER COLUMN "image_url" TYPE TEXT;
ALTER TABLE "shop_product_images" ALTER COLUMN "image_url" TYPE TEXT;
ALTER TABLE "shop_shipping_companies" ALTER COLUMN "tracking_url" TYPE TEXT;
ALTER TABLE "club_post_attachments" ALTER COLUMN "file_url" TYPE TEXT;
ALTER TABLE "venues" ALTER COLUMN "image_url" TYPE TEXT;
ALTER TABLE "teams" ALTER COLUMN "logo_url" TYPE TEXT;
ALTER TABLE "camps" ALTER COLUMN "image_url" TYPE TEXT;
ALTER TABLE "academy_promotions" ALTER COLUMN "image_url" TYPE TEXT;
