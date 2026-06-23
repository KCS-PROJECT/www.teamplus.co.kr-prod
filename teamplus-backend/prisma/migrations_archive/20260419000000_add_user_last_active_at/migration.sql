-- Add lastActiveAt column to users for API lifecycle activity tracking
ALTER TABLE "users" ADD COLUMN "last_active_at" TIMESTAMP(3);
