-- Convert TEXT columns to native PostgreSQL ENUM types
-- Background: Baseline migration used MySQL ENUM(...) syntax which created TEXT columns in PostgreSQL.
-- Prisma Client expects native PostgreSQL enum types for proper type casting.

-- ============================================================
-- 1. UserType
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "UserType" AS ENUM ('ADMIN', 'DIRECTOR', 'COACH', 'PARENT', 'TEEN', 'CHILD');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users" ALTER COLUMN "user_type" TYPE "UserType" USING "user_type"::"UserType";
ALTER TABLE "app_menus" ALTER COLUMN "user_type" TYPE "UserType" USING "user_type"::"UserType";

-- ============================================================
-- 2. DiscountType
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "coupons" ALTER COLUMN "discount_type" TYPE "DiscountType" USING "discount_type"::"DiscountType";

-- ============================================================
-- 3. CouponTarget
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "CouponTarget" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "coupons" ALTER COLUMN "target_type" TYPE "CouponTarget" USING "target_type"::"CouponTarget";

-- ============================================================
-- 4. PointActionType
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "PointActionType" AS ENUM ('EARN', 'USE', 'EXPIRE', 'ADJUST', 'REFUND');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "point_transactions" ALTER COLUMN "type" TYPE "PointActionType" USING "type"::"PointActionType";

-- ============================================================
-- 5. ChatRoomType
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "ChatRoomType" AS ENUM ('DIRECT', 'GROUP', 'CLASS', 'CLUB', 'SUPPORT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "chat_rooms" ALTER COLUMN "type" TYPE "ChatRoomType" USING "type"::"ChatRoomType";

-- ============================================================
-- 6. ChatMessageType
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'NOTICE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "chat_messages" ALTER COLUMN "type" TYPE "ChatMessageType" USING "type"::"ChatMessageType";

-- ============================================================
-- 7. TrainingType
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "TrainingType" AS ENUM ('LESSON', 'REGULAR_TRAINING', 'REGULAR_CLASS', 'GROUP_CLASS', 'GAME', 'FUN', 'CAMP', 'PICKUP');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "venue_rental_schedules" ALTER COLUMN "training_type" TYPE "TrainingType" USING "training_type"::"TrainingType";
