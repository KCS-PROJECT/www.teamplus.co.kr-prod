-- Add missing columns to system_notices table
-- These columns were defined in Prisma schema but not yet applied to the database

ALTER TABLE "system_notices" ADD COLUMN IF NOT EXISTS "target_birth_year_from" INTEGER;
ALTER TABLE "system_notices" ADD COLUMN IF NOT EXISTS "target_birth_year_to" INTEGER;
ALTER TABLE "system_notices" ADD COLUMN IF NOT EXISTS "target_club_id" TEXT;

-- Add index for target_club_id
CREATE INDEX IF NOT EXISTS "system_notices_target_club_id_idx" ON "system_notices" ("target_club_id");
