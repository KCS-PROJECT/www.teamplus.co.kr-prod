-- Add view_count column to system_notices for tracking notice views
-- Default 0, NOT NULL. Uses IF NOT EXISTS for idempotent application.

ALTER TABLE "system_notices"
  ADD COLUMN IF NOT EXISTS "view_count" INTEGER NOT NULL DEFAULT 0;
