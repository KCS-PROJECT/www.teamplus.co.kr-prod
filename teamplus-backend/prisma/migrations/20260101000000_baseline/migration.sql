-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('SYSTEM', 'OPER', 'ADMIN', 'DIRECTOR', 'ACADEMY_DIRECTOR', 'COACH', 'PARENT', 'TEEN', 'CHILD');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "CouponTarget" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT');

-- CreateEnum
CREATE TYPE "LevelApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'DIRECTOR_OVERRIDE');

-- CreateEnum
CREATE TYPE "PointActionType" AS ENUM ('EARN', 'USE', 'EXPIRE', 'ADJUST', 'REFUND');

-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('DIRECT', 'GROUP', 'CLASS', 'CLUB', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'NOTICE');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('LESSON', 'REGULAR_TRAINING', 'REGULAR_CLASS', 'GROUP_CLASS', 'GAME', 'FUN', 'CAMP', 'PICKUP');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConsultationCategory" AS ENUM ('GENERAL', 'CLASS_CONTENT', 'PROGRESS', 'PAYMENT', 'SCHEDULE', 'ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementDetailStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'HOLD');

-- CreateEnum
CREATE TYPE "SettlementApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVIEW');

-- CreateEnum
CREATE TYPE "MemberApprovalAction" AS ENUM ('APPROVED', 'REJECTED', 'REVOKED', 'REAPPLIED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "WishlistTargetType" AS ENUM ('PRODUCT', 'CLUB', 'ACADEMY', 'COACH', 'CLASS', 'TOURNAMENT', 'VENUE', 'OTHER');

-- CreateEnum
CREATE TYPE "GalleryCategory" AS ENUM ('TRAINING', 'GAME', 'EVENT', 'TOURNAMENT', 'DAILY', 'AWARD', 'OTHER');

-- CreateEnum
CREATE TYPE "GalleryVisibility" AS ENUM ('PUBLIC', 'CLUB_ONLY', 'MEMBERS_ONLY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "UploadCategory" AS ENUM ('IMAGE', 'DOCUMENT', 'VIDEO', 'AVATAR', 'ATTACHMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL,
    "created_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ci" TEXT,
    "di" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "birth_date" TIMESTAMP(3),
    "korean_age" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "withdraw_requested_at" TIMESTAMP(3),
    "withdraw_reason" TEXT,
    "withdraw_processed_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3),
    "dormant_at" TIMESTAMP(3),
    "gender" TEXT,
    "note" TEXT,
    "zip_code" TEXT,
    "address" TEXT,
    "address_detail" TEXT,
    "avatar_url" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "pin_verified_until" TIMESTAMP(3),
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "level_label" TEXT NOT NULL DEFAULT '입문',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "next_test_date" TIMESTAMP(3),
    "last_evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_pins" (
    "id" TEXT NOT NULL,
    "child_profile_id" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_set_by" TEXT NOT NULL,
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "team_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "location" TEXT,
    "phone" TEXT,
    "default_billing_timing" TEXT NOT NULL DEFAULT 'PREPAID',
    "logo_url" TEXT,
    "short_name" TEXT,
    "division" TEXT,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "description" TEXT,
    "slogan" TEXT,
    "founding_date" TIMESTAMP(3),
    "home_arena" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "gender_type" TEXT NOT NULL DEFAULT 'MIX',
    "season_wins" INTEGER NOT NULL DEFAULT 0,
    "season_losses" INTEGER NOT NULL DEFAULT 0,
    "season_draws" INTEGER NOT NULL DEFAULT 0,
    "recent_attendance_rate" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "player_age" INTEGER NOT NULL,
    "player_level" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "role_in_team" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "academy_id" TEXT,
    "class_name" TEXT NOT NULL,
    "description" TEXT,
    "training_type" TEXT,
    "instructor_name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "age_min" INTEGER,
    "age_max" INTEGER,
    "level_required" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approval_status" TEXT NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "rejection_reason" TEXT,
    "coach_id" TEXT,
    "venue_id" TEXT,
    "class_days" JSONB,
    "category" TEXT,
    "required_coaches" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_coach_assignments" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "invited_by" TEXT NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_coach_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedules" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_reason" TEXT,
    "rsvp_deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_products" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "sessions_per_month" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "fee_type" TEXT NOT NULL DEFAULT 'PER_SESSION',
    "billing_timing" TEXT NOT NULL DEFAULT 'PREPAID',
    "sessions_per_week" INTEGER,
    "fee_per_session" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT,
    "amount" INTEGER NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "payment_method" TEXT,
    "tid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_credits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "used_sessions" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payment_id" TEXT,

    CONSTRAINT "member_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_logs" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "refund_amount" INTEGER NOT NULL,
    "refund_reason" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_attendances" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "attendance_status" TEXT NOT NULL DEFAULT 'unchecked',
    "checked_in_at" TIMESTAMP(3),
    "credit_deducted" BOOLEAN NOT NULL DEFAULT false,
    "checked_in_via" TEXT,
    "checked_in_by" TEXT,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3),
    "modified_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "link_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "template_id" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alimtalk_templates" (
    "id" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alimtalk_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alimtalk_logs" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "response_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alimtalk_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "sale_price" INTEGER,
    "cost_price" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "max_order_qty" INTEGER,
    "brand" TEXT,
    "manufacturer" TEXT,
    "origin" TEXT,
    "weight" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "alt_text" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_options" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "option_name" TEXT NOT NULL,
    "option_value" TEXT NOT NULL,
    "additional_price" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_carts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_cart_items" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "option_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_status" TEXT NOT NULL DEFAULT 'pending',
    "total_amount" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "shipping_fee" INTEGER NOT NULL DEFAULT 0,
    "payment_amount" INTEGER NOT NULL,
    "payment_method" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "tid" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "address_detail" TEXT,
    "delivery_memo" TEXT,
    "shipping_id" TEXT,
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "option_id" TEXT,
    "product_name" TEXT NOT NULL,
    "option_name" TEXT,
    "option_value" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_shipping_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tracking_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_shipping_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_shippings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_shippings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'standard',
    "shipping_fee" INTEGER NOT NULL,
    "free_shipping_threshold" INTEGER,
    "additional_fee" INTEGER NOT NULL DEFAULT 0,
    "estimated_days" TEXT,
    "regions" TEXT,
    "surcharge" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_registrations" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "registration_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlists" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "user_id" TEXT NOT NULL,
    "child_id" TEXT,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notified_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "member_credit_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "schedule_id" TEXT,
    "refund_id" TEXT,
    "reason" TEXT,
    "adjusted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "target_type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "start_at" TIMESTAMP(3),
    "display_locations_json" JSONB NOT NULL DEFAULT '[]',
    "target_birth_year_from" INTEGER,
    "target_birth_year_to" INTEGER,
    "target_team_id" TEXT,

    CONSTRAINT "system_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "id" TEXT NOT NULL,
    "notice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_comments" (
    "id" TEXT NOT NULL,
    "notice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notice_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_view_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "viewed_date" CHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_view_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_promotions" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "team_id" TEXT,
    "academy_id" TEXT,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "image_url" TEXT,
    "lesson_type" TEXT NOT NULL,
    "schedule_info" TEXT,
    "price_info" TEXT,
    "capacity" INTEGER,
    "venue_info" TEXT,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'alimtalk',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sound_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vibration_enabled" BOOLEAN NOT NULL DEFAULT true,
    "categories" JSONB NOT NULL DEFAULT '{"class":true,"payment":true,"notice":true,"system":true}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhooks" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT,
    "webhook_type" TEXT NOT NULL,
    "webhook_payload" JSONB NOT NULL,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "error_message" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "request_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ci" TEXT,
    "di" TEXT,
    "verified_name" TEXT,
    "verified_phone" TEXT,
    "verified_birth" TEXT,
    "verified_gender" TEXT,
    "purpose" TEXT NOT NULL,
    "return_url" TEXT,
    "client_ip" TEXT,
    "user_agent" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_webhook_logs" (
    "id" TEXT NOT NULL,
    "identity_verification_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "webhook_type" TEXT NOT NULL,
    "webhook_payload" JSONB NOT NULL,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "http_status" INTEGER,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_menus" (
    "id" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "parent_id" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_children" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'parent',
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "class_product_id" TEXT,
    "requested_by" TEXT NOT NULL,
    "request_type" TEXT NOT NULL DEFAULT 'parent_direct',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_qr_codes" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "qr_data" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "scanned_at" TIMESTAMP(3),
    "scanned_by" TEXT,

    CONSTRAINT "attendance_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "metric_date" DATE NOT NULL,
    "active_members" INTEGER NOT NULL DEFAULT 0,
    "new_members" INTEGER NOT NULL DEFAULT 0,
    "classes_held" INTEGER NOT NULL DEFAULT 0,
    "total_attendees" INTEGER NOT NULL DEFAULT 0,
    "attendance_rate" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_posts" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "post_type" TEXT NOT NULL DEFAULT 'announcement',
    "target_level" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_post_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_post_likes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_post_attachments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_post_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_events" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_type" TEXT NOT NULL,
    "target_level" TEXT,
    "capacity" INTEGER,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "price_mode" TEXT NOT NULL DEFAULT 'payment',
    "price_amount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_event_registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "payment_id" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rinks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "phone" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rinks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "team_id" TEXT,
    "rink_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "eligible_birth_year_from" INTEGER,
    "eligible_birth_year_to" INTEGER,
    "fee_per_game" DECIMAL(10,2),
    "total_games" INTEGER,
    "fee_type" TEXT,
    "max_participants" INTEGER,
    "registration_deadline" TIMESTAMP(3),
    "age_group" TEXT,
    "selected_participant_ids" JSONB,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_registrations" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "child_id" TEXT,
    "games_count" INTEGER NOT NULL,
    "calculated_fee" DECIMAL(10,2) NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "payment_id" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hockey_matches" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT,
    "rink_id" TEXT,
    "venue_id" TEXT,
    "home_team_id" TEXT,
    "away_team_id" TEXT,
    "home_club_id" TEXT,
    "away_club_id" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "home_score" INTEGER NOT NULL DEFAULT 0,
    "away_score" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "current_period" INTEGER,
    "round" TEXT,
    "match_order" INTEGER,
    "referee_main" TEXT,
    "referee_lines" TEXT,
    "game_sheet" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hockey_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_groups" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age_group" TEXT,
    "created_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" TEXT,
    "jersey_number" INTEGER,
    "is_captain" BOOLEAN NOT NULL DEFAULT false,
    "is_alt_captain" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "left_at" TIMESTAMP(3),

    CONSTRAINT "team_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_periods" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "home_score" INTEGER NOT NULL DEFAULT 0,
    "away_score" INTEGER NOT NULL DEFAULT 0,
    "home_penalty_minutes" INTEGER NOT NULL DEFAULT 0,
    "away_penalty_minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "match_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "event_time" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "team_id" TEXT,
    "player_id" TEXT,
    "assist_player1_id" TEXT,
    "assist_player2_id" TEXT,
    "penalty_type" TEXT,
    "penalty_minutes" INTEGER,
    "description" TEXT,
    "is_game_winner" BOOLEAN NOT NULL DEFAULT false,
    "is_power_play" BOOLEAN NOT NULL DEFAULT false,
    "is_short_handed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "address_detail" TEXT,
    "city" TEXT,
    "zip_code" TEXT,
    "phone" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "capacity" INTEGER,
    "rink_size" TEXT,
    "amenities" JSONB,
    "operating_hours" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "image_url" TEXT,
    "hourly_rate" INTEGER,
    "manager_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "settlement_month" TEXT NOT NULL,
    "total_revenue" INTEGER NOT NULL DEFAULT 0,
    "platform_fee" INTEGER NOT NULL DEFAULT 0,
    "payment_fee" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bank_name" TEXT,
    "bank_account" TEXT,
    "account_holder" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "manager_id" TEXT,
    "manager_approval_status" "SettlementApprovalStatus",
    "manager_approval_at" TIMESTAMP(3),

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_transactions" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "transaction_type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_evaluations" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "class_id" TEXT,
    "evaluation_date" TIMESTAMP(3) NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "coach_comment" TEXT,
    "improvement_areas" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_dimensions" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "dimension_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "previous_score" INTEGER,
    "improvement" INTEGER,

    CONSTRAINT "skill_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "category" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "criteria" JSONB,
    "point_value" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_badges" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earned_reason" TEXT,
    "is_displayed" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "child_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_wishlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_id" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "admin_reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "min_order_amount" INTEGER,
    "max_discount_amount" INTEGER,
    "usage_limit" INTEGER,
    "usage_per_user" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "target_type" "CouponTarget" NOT NULL DEFAULT 'ALL',
    "target_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_coupons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "order_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_levels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "level_name" TEXT NOT NULL DEFAULT 'Bronze',
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "current_points" INTEGER NOT NULL DEFAULT 0,
    "points_to_next" INTEGER NOT NULL DEFAULT 1000,
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "level_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_level_histories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "previous_level" INTEGER NOT NULL,
    "new_level" INTEGER NOT NULL,
    "previous_name" TEXT NOT NULL,
    "new_name" TEXT NOT NULL,
    "status" "LevelApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" TEXT,
    "season" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_level_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_skill_levels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "tier_name" TEXT NOT NULL DEFAULT '하위',
    "season" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_skill_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "PointActionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "description" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "type" "ChatRoomType" NOT NULL DEFAULT 'DIRECT',
    "category" "ConsultationCategory",
    "team_id" TEXT,
    "class_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_message" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_members" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "nickname" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "last_read_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "read_by" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_premium_events" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(200),
    "description" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "venue_name" VARCHAR(200) NOT NULL,
    "venue_address" VARCHAR(400),
    "benefits_json" JSONB NOT NULL,
    "cta_label" VARCHAR(100) NOT NULL DEFAULT '이벤트 신청하기',
    "cta_url" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_id" TEXT,
    "updated_id" TEXT,

    CONSTRAINT "app_premium_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "link_type" TEXT NOT NULL DEFAULT 'none',
    "target_role" TEXT,
    "target_roles_json" JSONB NOT NULL DEFAULT '[]',
    "display_locations_json" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_versions" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "min_version" TEXT NOT NULL,
    "force_update" BOOLEAN NOT NULL DEFAULT false,
    "release_notes" TEXT,
    "store_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_faqs" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_feedbacks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "app_version" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "admin_reply_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_terms" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fcm_token" VARCHAR(512) NOT NULL,
    "platform" TEXT NOT NULL,
    "device_model" TEXT,
    "os_version" TEXT,
    "app_version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_matches" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "rink_name" TEXT NOT NULL,
    "rink_address" TEXT,
    "rink_venue_info" TEXT,
    "price" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "level_code" TEXT,
    "gender" TEXT NOT NULL DEFAULT '혼성',
    "max_participants" INTEGER NOT NULL,
    "home_team_name" TEXT,
    "away_team_name" TEXT,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'recruiting',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "app_name" TEXT NOT NULL DEFAULT 'teamplus',
    "app_version" TEXT NOT NULL DEFAULT '1.0.0',
    "api_url" TEXT NOT NULL DEFAULT 'http://localhost:5003',
    "support_email" TEXT NOT NULL DEFAULT 'admin@teamplus.com',
    "support_phone" TEXT,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" TEXT,
    "debug_mode" BOOLEAN NOT NULL DEFAULT false,
    "max_upload_size" INTEGER NOT NULL DEFAULT 10,
    "session_timeout" INTEGER NOT NULL DEFAULT 60,
    "minimum_app_version_ios" TEXT NOT NULL DEFAULT '1.0.0',
    "minimum_app_version_and" TEXT NOT NULL DEFAULT '1.0.0',
    "force_update_message" TEXT,
    "signup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "social_login_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_login_attempts" INTEGER NOT NULL DEFAULT 5,
    "credit_expire_days" INTEGER NOT NULL DEFAULT 90,
    "qr_expire_minutes" INTEGER NOT NULL DEFAULT 5,
    "terms_version" TEXT NOT NULL DEFAULT '1.0',
    "privacy_version" TEXT NOT NULL DEFAULT '1.0',
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_match_applicants" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "position" TEXT,
    "level" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "rejection_reason" TEXT,
    "rejected_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_amount" INTEGER,
    "payment_id" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_match_applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_class_histories" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "attended_sessions" INTEGER NOT NULL DEFAULT 0,
    "attendance_rate" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "coach_comment" TEXT,
    "final_score" INTEGER,
    "certificate_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_class_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_awards" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "award_name" TEXT NOT NULL,
    "award_type" TEXT NOT NULL,
    "description" TEXT,
    "awarded_at" TIMESTAMP(3) NOT NULL,
    "tournament_id" TEXT,
    "match_id" TEXT,
    "season" TEXT,
    "awarded_by" TEXT,
    "certificate_url" TEXT,
    "image_url" TEXT,
    "is_displayed" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_awards" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "award_name" TEXT NOT NULL,
    "award_type" TEXT NOT NULL,
    "description" TEXT,
    "awarded_at" TIMESTAMP(3) NOT NULL,
    "tournament_id" TEXT,
    "season" TEXT,
    "awarded_by" TEXT,
    "certificate_url" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_careers" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "position" TEXT,
    "jersey_number" INTEGER,
    "league_name" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_careers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_careers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "league_name" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "certifications" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_careers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_notification_logs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_value" TEXT,
    "sent_by" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_time_slots" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_type" TEXT NOT NULL DEFAULT 'open',
    "status" TEXT NOT NULL DEFAULT 'available',
    "price" DECIMAL(10,2),
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_bookings" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "time_slot_id" TEXT,
    "team_id" TEXT,
    "contract_id" TEXT,
    "schedule_id" TEXT,
    "booked_by_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "purpose" TEXT,
    "total_price" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cancel_reason" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_rental_contracts" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contract_type" TEXT NOT NULL DEFAULT 'monthly',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "monthly_fee" DECIMAL(10,2),
    "total_amount" DECIMAL(10,2),
    "deposit_amount" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "signed_at" TIMESTAMP(3),
    "memo" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_rental_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_rental_schedules" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "training_type" "TrainingType" NOT NULL DEFAULT 'REGULAR_TRAINING',
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "price_per_session" DECIMAL(10,2),
    "color_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_rental_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_holidays" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'holiday',
    "is_all_day" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TEXT,
    "end_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camps" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "venue_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "max_capacity" INTEGER,
    "price" DECIMAL(10,2),
    "accommodation" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_registrations" (
    "id" TEXT NOT NULL,
    "camp_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_amount" DECIMAL(10,2),
    "payment_id" TEXT,
    "memo" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "camp_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_packages" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "training_type" TEXT NOT NULL,
    "venue_id" TEXT,
    "total_sessions" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "day_of_week" TEXT,
    "start_time" TEXT,
    "end_time" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "session_dates" JSONB,
    "max_capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_package_enrollments" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enrolled',
    "attended_count" INTEGER NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(10,2),
    "payment_id" TEXT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "lesson_package_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_expenses" (
    "id" TEXT NOT NULL,
    "match_id" TEXT,
    "tournament_id" TEXT,
    "team_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_by_id" TEXT,
    "receipt_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_code_groups" (
    "id" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "common_code_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_codes" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value1" TEXT,
    "value2" TEXT,
    "value3" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "common_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_rsvps" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "child_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overseas_trips" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "registration_deadline" TIMESTAMP(3) NOT NULL,
    "max_participants" INTEGER NOT NULL,
    "age_group" TEXT,
    "estimated_cost" DECIMAL(10,2) DEFAULT 0,
    "deposit_amount" DECIMAL(10,2) DEFAULT 0,
    "deposit_deadline" TIMESTAMP(3),
    "flight_info" TEXT,
    "hotel_info" TEXT,
    "transport_info" TEXT,
    "itinerary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overseas_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overseas_trip_registrations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "child_id" TEXT,
    "parent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deposit_paid_at" TIMESTAMP(3),
    "deposit_amount" DECIMAL(10,2),
    "passport_verified" BOOLEAN NOT NULL DEFAULT false,
    "passport_expiry_date" TIMESTAMP(3),
    "special_requirements" TEXT,
    "emergency_contact" TEXT,
    "emergency_phone" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overseas_trip_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "description" TEXT,
    "age_group" TEXT,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "team_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "max_teams" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_divisions" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "seed" INTEGER,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "team_divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_matches" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "division_id" TEXT,
    "home_team_id" TEXT NOT NULL,
    "away_team_id" TEXT NOT NULL,
    "match_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "venue_id" TEXT,
    "round" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "home_score" INTEGER,
    "away_score" INTEGER,
    "period" TEXT,
    "referee" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tms_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'web',
    "category" TEXT NOT NULL DEFAULT 'bug',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "author_name" TEXT NOT NULL,
    "author_email" TEXT,
    "assignee" TEXT,
    "due_date" DATE,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tms_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tms_attachments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tms_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tms_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tms_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "social_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "profile_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "team_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "video_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "duration" INTEGER,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "video_type" TEXT NOT NULL DEFAULT 'training',
    "tournament_id" TEXT,
    "match_id" TEXT,
    "class_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academies" (
    "id" TEXT NOT NULL,
    "director_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_members" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "child_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_coaches" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT_COACH',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "student_id" TEXT,
    "chat_room_id" TEXT NOT NULL,
    "category" "ConsultationCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "ConsultationStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_message_at" TIMESTAMP(3),
    "unread_count_for_parent" INTEGER NOT NULL DEFAULT 0,
    "unread_count_for_coach" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_details" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_amount" INTEGER NOT NULL,
    "fee_rate" DOUBLE PRECISION NOT NULL,
    "fee_amount" INTEGER NOT NULL,
    "actual_amount" INTEGER NOT NULL,
    "status" "SettlementDetailStatus" NOT NULL DEFAULT 'PENDING',
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_approval_logs" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "action" "MemberApprovalAction" NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "actor_role" "UserType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "receipt_url" TEXT,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "sms_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_type" "WishlistTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galleries" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "coach_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_photo_url" TEXT,
    "category" "GalleryCategory" NOT NULL DEFAULT 'OTHER',
    "visibility" "GalleryVisibility" NOT NULL DEFAULT 'CLUB_ONLY',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "galleries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_photos" (
    "id" TEXT NOT NULL,
    "gallery_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "caption" TEXT,
    "taken_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_boards" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '칭찬 스티커판',
    "goal_count" INTEGER NOT NULL DEFAULT 10,
    "reward_name" TEXT,
    "reward_id" TEXT,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_slots" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "slot_number" INTEGER NOT NULL,
    "sticker_type" TEXT,
    "is_earned" BOOLEAN NOT NULL DEFAULT false,
    "earned_at" TIMESTAMP(3),
    "earned_reason" TEXT,
    "awarded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "class_id" TEXT,
    "session_date" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "intensity_level" TEXT NOT NULL DEFAULT 'medium',
    "focus_area" TEXT,
    "notes" TEXT,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_metrics" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "metric_value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_diaries" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "session_date" TIMESTAMP(3) NOT NULL,
    "main_focus" TEXT,
    "drill_description" TEXT,
    "intensity_level" TEXT NOT NULL DEFAULT 'medium',
    "present_count" INTEGER NOT NULL DEFAULT 0,
    "absent_count" INTEGER NOT NULL DEFAULT 0,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "coach_notes" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_diaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "class_id" TEXT,
    "schedule_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_swap_requests" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "target_coach_id" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "responded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_checklists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "class_id" TEXT,
    "team_id" TEXT,
    "title" TEXT NOT NULL DEFAULT '가방 챙기기',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "checked_items" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "icon_name" TEXT,
    "image_url" TEXT,
    "is_checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_inspections" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "venue_id" TEXT,
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "issue_detail" TEXT,
    "photo_url" TEXT,
    "needs_action" BOOLEAN NOT NULL DEFAULT false,
    "assignee_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "category" "UploadCategory" NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "extension" TEXT,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "uploader_id" TEXT NOT NULL,
    "modified_by_id" TEXT,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_secrets" (
    "user_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_secrets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_url" TEXT,
    "file_size" INTEGER,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_ci_key" ON "users"("ci");

-- CreateIndex
CREATE INDEX "users_user_type_idx" ON "users"("user_type");

-- CreateIndex
CREATE INDEX "users_is_verified_idx" ON "users"("is_verified");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_withdraw_requested_at_idx" ON "users"("withdraw_requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "parent_profiles_user_id_key" ON "parent_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_user_id_key" ON "coach_profiles"("user_id");

-- CreateIndex
CREATE INDEX "coach_profiles_team_id_idx" ON "coach_profiles"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_profiles_user_id_key" ON "child_profiles"("user_id");

-- CreateIndex
CREATE INDEX "child_profiles_pin_verified_until_idx" ON "child_profiles"("pin_verified_until");

-- CreateIndex
CREATE UNIQUE INDEX "child_pins_child_profile_id_key" ON "child_pins"("child_profile_id");

-- CreateIndex
CREATE INDEX "child_pins_child_profile_id_idx" ON "child_pins"("child_profile_id");

-- CreateIndex
CREATE INDEX "child_pins_locked_until_idx" ON "child_pins"("locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "teams_team_code_key" ON "teams"("team_code");

-- CreateIndex
CREATE INDEX "teams_created_at_idx" ON "teams"("created_at");

-- CreateIndex
CREATE INDEX "teams_coach_id_idx" ON "teams"("coach_id");

-- CreateIndex
CREATE INDEX "teams_is_active_idx" ON "teams"("is_active");

-- CreateIndex
CREATE INDEX "team_members_team_id_idx" ON "team_members"("team_id");

-- CreateIndex
CREATE INDEX "team_members_approval_status_idx" ON "team_members"("approval_status");

-- CreateIndex
CREATE INDEX "team_members_joined_at_idx" ON "team_members"("joined_at");

-- CreateIndex
CREATE INDEX "team_members_approval_status_joined_at_idx" ON "team_members"("approval_status", "joined_at");

-- CreateIndex
CREATE INDEX "team_members_user_id_approval_status_idx" ON "team_members"("user_id", "approval_status");

-- CreateIndex
CREATE INDEX "team_members_team_id_approval_status_idx" ON "team_members"("team_id", "approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_user_id_team_id_key" ON "team_members"("user_id", "team_id");

-- CreateIndex
CREATE INDEX "classes_team_id_idx" ON "classes"("team_id");

-- CreateIndex
CREATE INDEX "classes_academy_id_idx" ON "classes"("academy_id");

-- CreateIndex
CREATE INDEX "classes_is_active_idx" ON "classes"("is_active");

-- CreateIndex
CREATE INDEX "classes_start_time_idx" ON "classes"("start_time");

-- CreateIndex
CREATE INDEX "classes_instructor_name_idx" ON "classes"("instructor_name");

-- CreateIndex
CREATE INDEX "classes_coach_id_idx" ON "classes"("coach_id");

-- CreateIndex
CREATE INDEX "classes_venue_id_idx" ON "classes"("venue_id");

-- CreateIndex
CREATE INDEX "classes_category_idx" ON "classes"("category");

-- CreateIndex
CREATE INDEX "classes_approval_status_idx" ON "classes"("approval_status");

-- CreateIndex
CREATE INDEX "class_coach_assignments_class_id_status_idx" ON "class_coach_assignments"("class_id", "status");

-- CreateIndex
CREATE INDEX "class_coach_assignments_coach_user_id_status_idx" ON "class_coach_assignments"("coach_user_id", "status");

-- CreateIndex
CREATE INDEX "class_coach_assignments_invited_at_idx" ON "class_coach_assignments"("invited_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_coach_assignments_class_id_coach_user_id_key" ON "class_coach_assignments"("class_id", "coach_user_id");

-- CreateIndex
CREATE INDEX "class_schedules_class_id_idx" ON "class_schedules"("class_id");

-- CreateIndex
CREATE INDEX "class_schedules_scheduled_date_idx" ON "class_schedules"("scheduled_date");

-- CreateIndex
CREATE INDEX "class_schedules_is_cancelled_idx" ON "class_schedules"("is_cancelled");

-- CreateIndex
CREATE INDEX "class_schedules_class_id_scheduled_date_is_cancelled_idx" ON "class_schedules"("class_id", "scheduled_date", "is_cancelled");

-- CreateIndex
CREATE INDEX "class_products_class_id_idx" ON "class_products"("class_id");

-- CreateIndex
CREATE INDEX "class_products_fee_type_idx" ON "class_products"("fee_type");

-- CreateIndex
CREATE INDEX "class_products_billing_timing_idx" ON "class_products"("billing_timing");

-- CreateIndex
CREATE INDEX "class_products_is_active_idx" ON "class_products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_number_key" ON "payments"("order_number");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_payment_status_idx" ON "payments"("payment_status");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE INDEX "payments_payment_status_completed_at_idx" ON "payments"("payment_status", "completed_at");

-- CreateIndex
CREATE INDEX "payments_user_id_payment_status_created_at_idx" ON "payments"("user_id", "payment_status", "created_at");

-- CreateIndex
CREATE INDEX "member_credits_user_id_idx" ON "member_credits"("user_id");

-- CreateIndex
CREATE INDEX "member_credits_class_id_idx" ON "member_credits"("class_id");

-- CreateIndex
CREATE INDEX "member_credits_expires_at_idx" ON "member_credits"("expires_at");

-- CreateIndex
CREATE INDEX "member_credits_user_id_class_id_expires_at_idx" ON "member_credits"("user_id", "class_id", "expires_at");

-- CreateIndex
CREATE INDEX "refund_logs_payment_id_idx" ON "refund_logs"("payment_id");

-- CreateIndex
CREATE INDEX "class_attendances_member_id_idx" ON "class_attendances"("member_id");

-- CreateIndex
CREATE INDEX "class_attendances_created_at_idx" ON "class_attendances"("created_at");

-- CreateIndex
CREATE INDEX "class_attendances_member_id_created_at_idx" ON "class_attendances"("member_id", "created_at");

-- CreateIndex
CREATE INDEX "class_attendances_attendance_status_schedule_id_idx" ON "class_attendances"("attendance_status", "schedule_id");

-- CreateIndex
CREATE INDEX "class_attendances_member_id_attendance_status_idx" ON "class_attendances"("member_id", "attendance_status");

-- CreateIndex
CREATE INDEX "class_attendances_checked_in_via_idx" ON "class_attendances"("checked_in_via");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendances_schedule_id_member_id_key" ON "class_attendances"("schedule_id", "member_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_notification_type_idx" ON "notifications"("notification_type");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "alimtalk_templates_template_code_key" ON "alimtalk_templates"("template_code");

-- CreateIndex
CREATE INDEX "alimtalk_templates_category_idx" ON "alimtalk_templates"("category");

-- CreateIndex
CREATE INDEX "alimtalk_templates_is_active_idx" ON "alimtalk_templates"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "alimtalk_logs_notification_id_key" ON "alimtalk_logs"("notification_id");

-- CreateIndex
CREATE INDEX "alimtalk_logs_status_idx" ON "alimtalk_logs"("status");

-- CreateIndex
CREATE INDEX "alimtalk_logs_created_at_idx" ON "alimtalk_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_categories_code_key" ON "shop_categories"("code");

-- CreateIndex
CREATE INDEX "shop_categories_parent_id_idx" ON "shop_categories"("parent_id");

-- CreateIndex
CREATE INDEX "shop_categories_level_idx" ON "shop_categories"("level");

-- CreateIndex
CREATE INDEX "shop_categories_is_active_idx" ON "shop_categories"("is_active");

-- CreateIndex
CREATE INDEX "shop_categories_display_order_idx" ON "shop_categories"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_code_key" ON "shop_products"("code");

-- CreateIndex
CREATE INDEX "shop_products_category_id_idx" ON "shop_products"("category_id");

-- CreateIndex
CREATE INDEX "shop_products_is_active_idx" ON "shop_products"("is_active");

-- CreateIndex
CREATE INDEX "shop_products_is_featured_idx" ON "shop_products"("is_featured");

-- CreateIndex
CREATE INDEX "shop_products_is_new_idx" ON "shop_products"("is_new");

-- CreateIndex
CREATE INDEX "shop_products_created_at_idx" ON "shop_products"("created_at");

-- CreateIndex
CREATE INDEX "shop_products_sales_count_idx" ON "shop_products"("sales_count");

-- CreateIndex
CREATE INDEX "shop_products_price_idx" ON "shop_products"("price");

-- CreateIndex
CREATE INDEX "shop_product_images_product_id_idx" ON "shop_product_images"("product_id");

-- CreateIndex
CREATE INDEX "shop_product_images_is_main_idx" ON "shop_product_images"("is_main");

-- CreateIndex
CREATE INDEX "shop_product_options_product_id_idx" ON "shop_product_options"("product_id");

-- CreateIndex
CREATE INDEX "shop_product_options_option_name_idx" ON "shop_product_options"("option_name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_carts_user_id_key" ON "shop_carts"("user_id");

-- CreateIndex
CREATE INDEX "shop_cart_items_cart_id_idx" ON "shop_cart_items"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_cart_items_cart_id_product_id_option_id_key" ON "shop_cart_items"("cart_id", "product_id", "option_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_order_number_key" ON "shop_orders"("order_number");

-- CreateIndex
CREATE INDEX "shop_orders_user_id_idx" ON "shop_orders"("user_id");

-- CreateIndex
CREATE INDEX "shop_orders_order_status_idx" ON "shop_orders"("order_status");

-- CreateIndex
CREATE INDEX "shop_orders_payment_status_idx" ON "shop_orders"("payment_status");

-- CreateIndex
CREATE INDEX "shop_orders_created_at_idx" ON "shop_orders"("created_at");

-- CreateIndex
CREATE INDEX "shop_order_items_order_id_idx" ON "shop_order_items"("order_id");

-- CreateIndex
CREATE INDEX "shop_order_items_product_id_idx" ON "shop_order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_shipping_companies_code_key" ON "shop_shipping_companies"("code");

-- CreateIndex
CREATE INDEX "shop_shipping_companies_is_active_idx" ON "shop_shipping_companies"("is_active");

-- CreateIndex
CREATE INDEX "shop_shippings_company_id_idx" ON "shop_shippings"("company_id");

-- CreateIndex
CREATE INDEX "shop_shippings_tracking_number_idx" ON "shop_shippings"("tracking_number");

-- CreateIndex
CREATE INDEX "shop_shippings_status_idx" ON "shop_shippings"("status");

-- CreateIndex
CREATE INDEX "shipping_policies_type_idx" ON "shipping_policies"("type");

-- CreateIndex
CREATE INDEX "shipping_policies_is_active_idx" ON "shipping_policies"("is_active");

-- CreateIndex
CREATE INDEX "shipping_policies_is_default_idx" ON "shipping_policies"("is_default");

-- CreateIndex
CREATE INDEX "class_registrations_user_id_idx" ON "class_registrations"("user_id");

-- CreateIndex
CREATE INDEX "class_registrations_status_idx" ON "class_registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "class_registrations_class_id_user_id_key" ON "class_registrations"("class_id", "user_id");

-- CreateIndex
CREATE INDEX "waitlists_class_id_status_idx" ON "waitlists"("class_id", "status");

-- CreateIndex
CREATE INDEX "waitlists_user_id_idx" ON "waitlists"("user_id");

-- CreateIndex
CREATE INDEX "waitlists_position_idx" ON "waitlists"("position");

-- CreateIndex
CREATE UNIQUE INDEX "waitlists_class_id_user_id_child_id_key" ON "waitlists"("class_id", "user_id", "child_id");

-- CreateIndex
CREATE INDEX "credit_transactions_member_credit_id_idx" ON "credit_transactions"("member_credit_id");

-- CreateIndex
CREATE INDEX "credit_transactions_type_idx" ON "credit_transactions"("type");

-- CreateIndex
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions"("created_at");

-- CreateIndex
CREATE INDEX "credit_transactions_adjusted_by_idx" ON "credit_transactions"("adjusted_by");

-- CreateIndex
CREATE INDEX "system_notices_is_active_idx" ON "system_notices"("is_active");

-- CreateIndex
CREATE INDEX "system_notices_priority_idx" ON "system_notices"("priority");

-- CreateIndex
CREATE INDEX "system_notices_created_at_idx" ON "system_notices"("created_at");

-- CreateIndex
CREATE INDEX "system_notices_is_active_start_at_idx" ON "system_notices"("is_active", "start_at");

-- CreateIndex
CREATE INDEX "system_notices_target_team_id_idx" ON "system_notices"("target_team_id");

-- CreateIndex
CREATE INDEX "system_notices_pinned_created_at_idx" ON "system_notices"("pinned", "created_at");

-- CreateIndex
CREATE INDEX "notice_reads_user_id_read_at_idx" ON "notice_reads"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notice_reads_notice_id_user_id_key" ON "notice_reads"("notice_id", "user_id");

-- CreateIndex
CREATE INDEX "notice_comments_notice_id_idx" ON "notice_comments"("notice_id");

-- CreateIndex
CREATE INDEX "notice_comments_user_id_idx" ON "notice_comments"("user_id");

-- CreateIndex
CREATE INDEX "daily_view_logs_entity_type_entity_id_idx" ON "daily_view_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "daily_view_logs_user_id_idx" ON "daily_view_logs"("user_id");

-- CreateIndex
CREATE INDEX "daily_view_logs_viewed_date_idx" ON "daily_view_logs"("viewed_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_view_logs_unique" ON "daily_view_logs"("entity_type", "entity_id", "user_id", "viewed_date");

-- CreateIndex
CREATE INDEX "academy_promotions_is_active_created_at_idx" ON "academy_promotions"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "academy_promotions_coach_id_idx" ON "academy_promotions"("coach_id");

-- CreateIndex
CREATE INDEX "academy_promotions_academy_id_idx" ON "academy_promotions"("academy_id");

-- CreateIndex
CREATE INDEX "academy_promotions_class_id_idx" ON "academy_promotions"("class_id");

-- CreateIndex
CREATE INDEX "academy_promotions_lesson_type_idx" ON "academy_promotions"("lesson_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_template_code_key" ON "notification_templates"("template_code");

-- CreateIndex
CREATE INDEX "notification_templates_channel_idx" ON "notification_templates"("channel");

-- CreateIndex
CREATE INDEX "notification_templates_is_active_idx" ON "notification_templates"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_user_id_key" ON "user_notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "payment_webhooks_payment_id_idx" ON "payment_webhooks"("payment_id");

-- CreateIndex
CREATE INDEX "payment_webhooks_webhook_type_idx" ON "payment_webhooks"("webhook_type");

-- CreateIndex
CREATE INDEX "payment_webhooks_processed_at_idx" ON "payment_webhooks"("processed_at");

-- CreateIndex
CREATE INDEX "payment_webhooks_status_idx" ON "payment_webhooks"("status");

-- CreateIndex
CREATE INDEX "payment_webhooks_next_retry_at_idx" ON "payment_webhooks"("next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_request_id_key" ON "identity_verifications"("request_id");

-- CreateIndex
CREATE INDEX "identity_verifications_user_id_idx" ON "identity_verifications"("user_id");

-- CreateIndex
CREATE INDEX "identity_verifications_provider_idx" ON "identity_verifications"("provider");

-- CreateIndex
CREATE INDEX "identity_verifications_status_idx" ON "identity_verifications"("status");

-- CreateIndex
CREATE INDEX "identity_verifications_purpose_idx" ON "identity_verifications"("purpose");

-- CreateIndex
CREATE INDEX "identity_verifications_requested_at_idx" ON "identity_verifications"("requested_at");

-- CreateIndex
CREATE INDEX "identity_verifications_expires_at_idx" ON "identity_verifications"("expires_at");

-- CreateIndex
CREATE INDEX "identity_webhook_logs_identity_verification_id_idx" ON "identity_webhook_logs"("identity_verification_id");

-- CreateIndex
CREATE INDEX "identity_webhook_logs_provider_idx" ON "identity_webhook_logs"("provider");

-- CreateIndex
CREATE INDEX "identity_webhook_logs_webhook_type_idx" ON "identity_webhook_logs"("webhook_type");

-- CreateIndex
CREATE INDEX "identity_webhook_logs_processed_at_idx" ON "identity_webhook_logs"("processed_at");

-- CreateIndex
CREATE INDEX "app_menus_user_type_idx" ON "app_menus"("user_type");

-- CreateIndex
CREATE INDEX "app_menus_is_active_idx" ON "app_menus"("is_active");

-- CreateIndex
CREATE INDEX "app_menus_parent_id_idx" ON "app_menus"("parent_id");

-- CreateIndex
CREATE INDEX "parent_children_child_id_idx" ON "parent_children"("child_id");

-- CreateIndex
CREATE INDEX "parent_children_is_primary_idx" ON "parent_children"("is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "parent_children_parent_id_child_id_key" ON "parent_children"("parent_id", "child_id");

-- CreateIndex
CREATE INDEX "enrollments_child_id_idx" ON "enrollments"("child_id");

-- CreateIndex
CREATE INDEX "enrollments_class_id_idx" ON "enrollments"("class_id");

-- CreateIndex
CREATE INDEX "enrollments_requested_by_idx" ON "enrollments"("requested_by");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE INDEX "enrollments_request_type_idx" ON "enrollments"("request_type");

-- CreateIndex
CREATE INDEX "enrollments_expires_at_idx" ON "enrollments"("expires_at");

-- CreateIndex
CREATE INDEX "enrollments_status_requested_at_idx" ON "enrollments"("status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_qr_codes_qr_data_key" ON "attendance_qr_codes"("qr_data");

-- CreateIndex
CREATE INDEX "attendance_qr_codes_schedule_id_idx" ON "attendance_qr_codes"("schedule_id");

-- CreateIndex
CREATE INDEX "attendance_qr_codes_generated_by_idx" ON "attendance_qr_codes"("generated_by");

-- CreateIndex
CREATE INDEX "attendance_qr_codes_expires_at_idx" ON "attendance_qr_codes"("expires_at");

-- CreateIndex
CREATE INDEX "daily_metrics_team_id_idx" ON "daily_metrics"("team_id");

-- CreateIndex
CREATE INDEX "daily_metrics_metric_date_idx" ON "daily_metrics"("metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_team_id_metric_date_key" ON "daily_metrics"("team_id", "metric_date");

-- CreateIndex
CREATE INDEX "team_posts_team_id_idx" ON "team_posts"("team_id");

-- CreateIndex
CREATE INDEX "team_posts_author_id_idx" ON "team_posts"("author_id");

-- CreateIndex
CREATE INDEX "team_posts_post_type_idx" ON "team_posts"("post_type");

-- CreateIndex
CREATE INDEX "team_posts_is_active_idx" ON "team_posts"("is_active");

-- CreateIndex
CREATE INDEX "team_posts_team_id_is_pinned_created_at_idx" ON "team_posts"("team_id", "is_pinned", "created_at");

-- CreateIndex
CREATE INDEX "team_post_comments_post_id_idx" ON "team_post_comments"("post_id");

-- CreateIndex
CREATE INDEX "team_post_comments_author_id_idx" ON "team_post_comments"("author_id");

-- CreateIndex
CREATE INDEX "team_post_likes_post_id_idx" ON "team_post_likes"("post_id");

-- CreateIndex
CREATE INDEX "team_post_likes_user_id_idx" ON "team_post_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_post_likes_post_id_user_id_key" ON "team_post_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "team_post_attachments_post_id_idx" ON "team_post_attachments"("post_id");

-- CreateIndex
CREATE INDEX "team_events_team_id_idx" ON "team_events"("team_id");

-- CreateIndex
CREATE INDEX "team_events_event_type_idx" ON "team_events"("event_type");

-- CreateIndex
CREATE INDEX "team_events_status_idx" ON "team_events"("status");

-- CreateIndex
CREATE INDEX "team_events_start_at_idx" ON "team_events"("start_at");

-- CreateIndex
CREATE INDEX "team_events_end_at_idx" ON "team_events"("end_at");

-- CreateIndex
CREATE INDEX "team_event_registrations_event_id_idx" ON "team_event_registrations"("event_id");

-- CreateIndex
CREATE INDEX "team_event_registrations_member_id_idx" ON "team_event_registrations"("member_id");

-- CreateIndex
CREATE INDEX "team_event_registrations_status_idx" ON "team_event_registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "team_event_registrations_event_id_member_id_key" ON "team_event_registrations"("event_id", "member_id");

-- CreateIndex
CREATE INDEX "rinks_name_idx" ON "rinks"("name");

-- CreateIndex
CREATE INDEX "tournaments_team_id_idx" ON "tournaments"("team_id");

-- CreateIndex
CREATE INDEX "tournaments_rink_id_idx" ON "tournaments"("rink_id");

-- CreateIndex
CREATE INDEX "tournaments_start_date_idx" ON "tournaments"("start_date");

-- CreateIndex
CREATE INDEX "tournaments_status_idx" ON "tournaments"("status");

-- CreateIndex
CREATE INDEX "tournament_registrations_tournament_id_payment_status_idx" ON "tournament_registrations"("tournament_id", "payment_status");

-- CreateIndex
CREATE INDEX "tournament_registrations_user_id_idx" ON "tournament_registrations"("user_id");

-- CreateIndex
CREATE INDEX "tournament_registrations_child_id_idx" ON "tournament_registrations"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_user_id_child_id_key" ON "tournament_registrations"("tournament_id", "user_id", "child_id");

-- CreateIndex
CREATE INDEX "hockey_matches_tournament_id_idx" ON "hockey_matches"("tournament_id");

-- CreateIndex
CREATE INDEX "hockey_matches_rink_id_idx" ON "hockey_matches"("rink_id");

-- CreateIndex
CREATE INDEX "hockey_matches_venue_id_idx" ON "hockey_matches"("venue_id");

-- CreateIndex
CREATE INDEX "hockey_matches_home_team_id_idx" ON "hockey_matches"("home_team_id");

-- CreateIndex
CREATE INDEX "hockey_matches_away_team_id_idx" ON "hockey_matches"("away_team_id");

-- CreateIndex
CREATE INDEX "hockey_matches_scheduled_at_idx" ON "hockey_matches"("scheduled_at");

-- CreateIndex
CREATE INDEX "hockey_matches_status_idx" ON "hockey_matches"("status");

-- CreateIndex
CREATE INDEX "team_groups_team_id_idx" ON "team_groups"("team_id");

-- CreateIndex
CREATE INDEX "team_groups_age_group_idx" ON "team_groups"("age_group");

-- CreateIndex
CREATE INDEX "team_groups_team_id_is_active_idx" ON "team_groups"("team_id", "is_active");

-- CreateIndex
CREATE INDEX "team_group_members_group_id_idx" ON "team_group_members"("group_id");

-- CreateIndex
CREATE INDEX "team_group_members_member_id_idx" ON "team_group_members"("member_id");

-- CreateIndex
CREATE INDEX "team_group_members_status_idx" ON "team_group_members"("status");

-- CreateIndex
CREATE INDEX "team_group_members_position_idx" ON "team_group_members"("position");

-- CreateIndex
CREATE UNIQUE INDEX "team_group_members_group_id_member_id_key" ON "team_group_members"("group_id", "member_id");

-- CreateIndex
CREATE INDEX "match_periods_match_id_idx" ON "match_periods"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_periods_match_id_period_number_key" ON "match_periods"("match_id", "period_number");

-- CreateIndex
CREATE INDEX "match_events_match_id_idx" ON "match_events"("match_id");

-- CreateIndex
CREATE INDEX "match_events_event_type_idx" ON "match_events"("event_type");

-- CreateIndex
CREATE INDEX "match_events_period_number_idx" ON "match_events"("period_number");

-- CreateIndex
CREATE INDEX "match_events_player_id_idx" ON "match_events"("player_id");

-- CreateIndex
CREATE INDEX "venues_team_id_idx" ON "venues"("team_id");

-- CreateIndex
CREATE INDEX "venues_status_idx" ON "venues"("status");

-- CreateIndex
CREATE INDEX "venues_city_idx" ON "venues"("city");

-- CreateIndex
CREATE INDEX "venues_name_idx" ON "venues"("name");

-- CreateIndex
CREATE INDEX "settlements_team_id_idx" ON "settlements"("team_id");

-- CreateIndex
CREATE INDEX "settlements_settlement_month_idx" ON "settlements"("settlement_month");

-- CreateIndex
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

-- CreateIndex
CREATE INDEX "settlements_manager_id_idx" ON "settlements"("manager_id");

-- CreateIndex
CREATE INDEX "settlements_manager_approval_status_idx" ON "settlements"("manager_approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_team_id_settlement_month_key" ON "settlements"("team_id", "settlement_month");

-- CreateIndex
CREATE INDEX "settlement_transactions_settlement_id_idx" ON "settlement_transactions"("settlement_id");

-- CreateIndex
CREATE INDEX "settlement_transactions_payment_id_idx" ON "settlement_transactions"("payment_id");

-- CreateIndex
CREATE INDEX "settlement_transactions_transaction_type_idx" ON "settlement_transactions"("transaction_type");

-- CreateIndex
CREATE INDEX "settlement_transactions_transaction_date_idx" ON "settlement_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "skill_evaluations_member_id_idx" ON "skill_evaluations"("member_id");

-- CreateIndex
CREATE INDEX "skill_evaluations_coach_id_idx" ON "skill_evaluations"("coach_id");

-- CreateIndex
CREATE INDEX "skill_evaluations_class_id_idx" ON "skill_evaluations"("class_id");

-- CreateIndex
CREATE INDEX "skill_evaluations_evaluation_date_idx" ON "skill_evaluations"("evaluation_date");

-- CreateIndex
CREATE INDEX "skill_evaluations_status_idx" ON "skill_evaluations"("status");

-- CreateIndex
CREATE INDEX "skill_dimensions_evaluation_id_idx" ON "skill_dimensions"("evaluation_id");

-- CreateIndex
CREATE INDEX "skill_dimensions_dimension_name_idx" ON "skill_dimensions"("dimension_name");

-- CreateIndex
CREATE INDEX "badges_category_idx" ON "badges"("category");

-- CreateIndex
CREATE INDEX "badges_rarity_idx" ON "badges"("rarity");

-- CreateIndex
CREATE INDEX "badges_is_active_idx" ON "badges"("is_active");

-- CreateIndex
CREATE INDEX "child_badges_child_id_idx" ON "child_badges"("child_id");

-- CreateIndex
CREATE INDEX "child_badges_badge_id_idx" ON "child_badges"("badge_id");

-- CreateIndex
CREATE INDEX "child_badges_is_displayed_idx" ON "child_badges"("is_displayed");

-- CreateIndex
CREATE UNIQUE INDEX "child_badges_child_id_badge_id_key" ON "child_badges"("child_id", "badge_id");

-- CreateIndex
CREATE INDEX "shop_wishlists_user_id_idx" ON "shop_wishlists"("user_id");

-- CreateIndex
CREATE INDEX "shop_wishlists_product_id_idx" ON "shop_wishlists"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_wishlists_user_id_product_id_key" ON "shop_wishlists"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "shop_reviews_user_id_idx" ON "shop_reviews"("user_id");

-- CreateIndex
CREATE INDEX "shop_reviews_product_id_idx" ON "shop_reviews"("product_id");

-- CreateIndex
CREATE INDEX "shop_reviews_rating_idx" ON "shop_reviews"("rating");

-- CreateIndex
CREATE INDEX "shop_reviews_is_visible_idx" ON "shop_reviews"("is_visible");

-- CreateIndex
CREATE INDEX "shop_reviews_created_at_idx" ON "shop_reviews"("created_at");

-- CreateIndex
CREATE INDEX "class_reviews_class_id_idx" ON "class_reviews"("class_id");

-- CreateIndex
CREATE INDEX "class_reviews_user_id_idx" ON "class_reviews"("user_id");

-- CreateIndex
CREATE INDEX "class_reviews_rating_idx" ON "class_reviews"("rating");

-- CreateIndex
CREATE INDEX "class_reviews_created_at_idx" ON "class_reviews"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_reviews_user_id_class_id_key" ON "class_reviews"("user_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_is_active_idx" ON "coupons"("is_active");

-- CreateIndex
CREATE INDEX "coupons_start_date_end_date_idx" ON "coupons"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "user_coupons_user_id_idx" ON "user_coupons"("user_id");

-- CreateIndex
CREATE INDEX "user_coupons_coupon_id_idx" ON "user_coupons"("coupon_id");

-- CreateIndex
CREATE INDEX "user_coupons_is_used_idx" ON "user_coupons"("is_used");

-- CreateIndex
CREATE UNIQUE INDEX "user_coupons_user_id_coupon_id_key" ON "user_coupons"("user_id", "coupon_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_levels_user_id_key" ON "member_levels"("user_id");

-- CreateIndex
CREATE INDEX "member_levels_level_idx" ON "member_levels"("level");

-- CreateIndex
CREATE INDEX "member_level_histories_user_id_idx" ON "member_level_histories"("user_id");

-- CreateIndex
CREATE INDEX "member_level_histories_changed_at_idx" ON "member_level_histories"("changed_at");

-- CreateIndex
CREATE INDEX "member_level_histories_season_idx" ON "member_level_histories"("season");

-- CreateIndex
CREATE INDEX "member_level_histories_status_idx" ON "member_level_histories"("status");

-- CreateIndex
CREATE UNIQUE INDEX "player_skill_levels_user_id_key" ON "player_skill_levels"("user_id");

-- CreateIndex
CREATE INDEX "player_skill_levels_tier_idx" ON "player_skill_levels"("tier");

-- CreateIndex
CREATE INDEX "point_transactions_user_id_idx" ON "point_transactions"("user_id");

-- CreateIndex
CREATE INDEX "point_transactions_type_idx" ON "point_transactions"("type");

-- CreateIndex
CREATE INDEX "point_transactions_created_at_idx" ON "point_transactions"("created_at");

-- CreateIndex
CREATE INDEX "point_transactions_expires_at_idx" ON "point_transactions"("expires_at");

-- CreateIndex
CREATE INDEX "chat_rooms_team_id_idx" ON "chat_rooms"("team_id");

-- CreateIndex
CREATE INDEX "chat_rooms_class_id_idx" ON "chat_rooms"("class_id");

-- CreateIndex
CREATE INDEX "chat_rooms_type_idx" ON "chat_rooms"("type");

-- CreateIndex
CREATE INDEX "chat_rooms_is_active_idx" ON "chat_rooms"("is_active");

-- CreateIndex
CREATE INDEX "chat_rooms_last_message_at_idx" ON "chat_rooms"("last_message_at");

-- CreateIndex
CREATE INDEX "chat_rooms_created_at_idx" ON "chat_rooms"("created_at");

-- CreateIndex
CREATE INDEX "chat_room_members_room_id_idx" ON "chat_room_members"("room_id");

-- CreateIndex
CREATE INDEX "chat_room_members_user_id_idx" ON "chat_room_members"("user_id");

-- CreateIndex
CREATE INDEX "chat_room_members_is_active_idx" ON "chat_room_members"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "chat_room_members_room_id_user_id_key" ON "chat_room_members"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_idx" ON "chat_messages"("room_id");

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_idx" ON "chat_messages"("sender_id");

-- CreateIndex
CREATE INDEX "chat_messages_receiver_id_idx" ON "chat_messages"("receiver_id");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_is_deleted_created_at_idx" ON "chat_messages"("room_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "app_premium_events_is_active_sort_order_idx" ON "app_premium_events"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "app_premium_events_is_active_event_date_idx" ON "app_premium_events"("is_active", "event_date");

-- CreateIndex
CREATE INDEX "app_banners_is_active_idx" ON "app_banners"("is_active");

-- CreateIndex
CREATE INDEX "app_banners_sort_order_idx" ON "app_banners"("sort_order");

-- CreateIndex
CREATE INDEX "app_banners_is_active_sort_order_idx" ON "app_banners"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "app_versions_platform_is_active_idx" ON "app_versions"("platform", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "app_versions_platform_version_key" ON "app_versions"("platform", "version");

-- CreateIndex
CREATE INDEX "app_faqs_category_is_active_idx" ON "app_faqs"("category", "is_active");

-- CreateIndex
CREATE INDEX "app_faqs_sort_order_idx" ON "app_faqs"("sort_order");

-- CreateIndex
CREATE INDEX "app_faqs_category_is_active_sort_order_idx" ON "app_faqs"("category", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "app_feedbacks_status_idx" ON "app_feedbacks"("status");

-- CreateIndex
CREATE INDEX "app_feedbacks_category_idx" ON "app_feedbacks"("category");

-- CreateIndex
CREATE INDEX "app_feedbacks_created_at_idx" ON "app_feedbacks"("created_at");

-- CreateIndex
CREATE INDEX "app_feedbacks_status_created_at_idx" ON "app_feedbacks"("status", "created_at");

-- CreateIndex
CREATE INDEX "app_feedbacks_user_id_created_at_idx" ON "app_feedbacks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "app_terms_type_is_active_idx" ON "app_terms"("type", "is_active");

-- CreateIndex
CREATE INDEX "app_terms_published_at_idx" ON "app_terms"("published_at");

-- CreateIndex
CREATE INDEX "user_devices_user_id_is_active_idx" ON "user_devices"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "user_devices_fcm_token_idx" ON "user_devices"("fcm_token");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_user_id_fcm_token_key" ON "user_devices"("user_id", "fcm_token");

-- CreateIndex
CREATE INDEX "pickup_matches_manager_id_idx" ON "pickup_matches"("manager_id");

-- CreateIndex
CREATE INDEX "pickup_matches_scheduled_at_idx" ON "pickup_matches"("scheduled_at");

-- CreateIndex
CREATE INDEX "pickup_matches_status_idx" ON "pickup_matches"("status");

-- CreateIndex
CREATE INDEX "pickup_matches_level_idx" ON "pickup_matches"("level");

-- CreateIndex
CREATE INDEX "pickup_matches_gender_idx" ON "pickup_matches"("gender");

-- CreateIndex
CREATE INDEX "pickup_matches_status_scheduled_at_idx" ON "pickup_matches"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "pickup_matches_view_count_idx" ON "pickup_matches"("view_count");

-- CreateIndex
CREATE INDEX "pickup_match_applicants_match_id_idx" ON "pickup_match_applicants"("match_id");

-- CreateIndex
CREATE INDEX "pickup_match_applicants_user_id_idx" ON "pickup_match_applicants"("user_id");

-- CreateIndex
CREATE INDEX "pickup_match_applicants_status_idx" ON "pickup_match_applicants"("status");

-- CreateIndex
CREATE INDEX "pickup_match_applicants_payment_status_idx" ON "pickup_match_applicants"("payment_status");

-- CreateIndex
CREATE INDEX "pickup_match_applicants_payment_id_idx" ON "pickup_match_applicants"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_match_applicants_match_id_user_id_key" ON "pickup_match_applicants"("match_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_class_histories_enrollment_id_key" ON "player_class_histories"("enrollment_id");

-- CreateIndex
CREATE INDEX "player_class_histories_member_id_idx" ON "player_class_histories"("member_id");

-- CreateIndex
CREATE INDEX "player_class_histories_class_id_idx" ON "player_class_histories"("class_id");

-- CreateIndex
CREATE INDEX "player_class_histories_status_idx" ON "player_class_histories"("status");

-- CreateIndex
CREATE INDEX "player_class_histories_start_date_idx" ON "player_class_histories"("start_date");

-- CreateIndex
CREATE INDEX "player_class_histories_member_id_status_idx" ON "player_class_histories"("member_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "player_class_histories_member_id_class_id_key" ON "player_class_histories"("member_id", "class_id");

-- CreateIndex
CREATE INDEX "player_awards_member_id_idx" ON "player_awards"("member_id");

-- CreateIndex
CREATE INDEX "player_awards_award_type_idx" ON "player_awards"("award_type");

-- CreateIndex
CREATE INDEX "player_awards_awarded_at_idx" ON "player_awards"("awarded_at");

-- CreateIndex
CREATE INDEX "player_awards_tournament_id_idx" ON "player_awards"("tournament_id");

-- CreateIndex
CREATE INDEX "player_awards_season_idx" ON "player_awards"("season");

-- CreateIndex
CREATE INDEX "player_awards_is_displayed_idx" ON "player_awards"("is_displayed");

-- CreateIndex
CREATE INDEX "player_awards_member_id_is_displayed_idx" ON "player_awards"("member_id", "is_displayed");

-- CreateIndex
CREATE INDEX "team_awards_team_id_idx" ON "team_awards"("team_id");

-- CreateIndex
CREATE INDEX "team_awards_award_type_idx" ON "team_awards"("award_type");

-- CreateIndex
CREATE INDEX "team_awards_awarded_at_idx" ON "team_awards"("awarded_at");

-- CreateIndex
CREATE INDEX "team_awards_tournament_id_idx" ON "team_awards"("tournament_id");

-- CreateIndex
CREATE INDEX "team_awards_season_idx" ON "team_awards"("season");

-- CreateIndex
CREATE INDEX "player_careers_member_id_idx" ON "player_careers"("member_id");

-- CreateIndex
CREATE INDEX "player_careers_is_current_idx" ON "player_careers"("is_current");

-- CreateIndex
CREATE INDEX "player_careers_start_date_idx" ON "player_careers"("start_date");

-- CreateIndex
CREATE INDEX "player_careers_member_id_is_current_idx" ON "player_careers"("member_id", "is_current");

-- CreateIndex
CREATE INDEX "staff_careers_user_id_idx" ON "staff_careers"("user_id");

-- CreateIndex
CREATE INDEX "staff_careers_role_idx" ON "staff_careers"("role");

-- CreateIndex
CREATE INDEX "staff_careers_is_current_idx" ON "staff_careers"("is_current");

-- CreateIndex
CREATE INDEX "staff_careers_start_date_idx" ON "staff_careers"("start_date");

-- CreateIndex
CREATE INDEX "staff_careers_user_id_is_current_idx" ON "staff_careers"("user_id", "is_current");

-- CreateIndex
CREATE INDEX "push_notification_logs_target_type_idx" ON "push_notification_logs"("target_type");

-- CreateIndex
CREATE INDEX "push_notification_logs_status_idx" ON "push_notification_logs"("status");

-- CreateIndex
CREATE INDEX "push_notification_logs_sent_by_idx" ON "push_notification_logs"("sent_by");

-- CreateIndex
CREATE INDEX "push_notification_logs_sent_at_idx" ON "push_notification_logs"("sent_at");

-- CreateIndex
CREATE INDEX "venue_time_slots_venue_id_idx" ON "venue_time_slots"("venue_id");

-- CreateIndex
CREATE INDEX "venue_time_slots_date_idx" ON "venue_time_slots"("date");

-- CreateIndex
CREATE INDEX "venue_time_slots_status_idx" ON "venue_time_slots"("status");

-- CreateIndex
CREATE INDEX "venue_time_slots_slot_type_idx" ON "venue_time_slots"("slot_type");

-- CreateIndex
CREATE UNIQUE INDEX "venue_time_slots_venue_id_date_start_time_key" ON "venue_time_slots"("venue_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "venue_bookings_venue_id_idx" ON "venue_bookings"("venue_id");

-- CreateIndex
CREATE INDEX "venue_bookings_team_id_idx" ON "venue_bookings"("team_id");

-- CreateIndex
CREATE INDEX "venue_bookings_contract_id_idx" ON "venue_bookings"("contract_id");

-- CreateIndex
CREATE INDEX "venue_bookings_schedule_id_idx" ON "venue_bookings"("schedule_id");

-- CreateIndex
CREATE INDEX "venue_bookings_booked_by_id_idx" ON "venue_bookings"("booked_by_id");

-- CreateIndex
CREATE INDEX "venue_bookings_date_idx" ON "venue_bookings"("date");

-- CreateIndex
CREATE INDEX "venue_bookings_status_idx" ON "venue_bookings"("status");

-- CreateIndex
CREATE INDEX "venue_bookings_venue_id_date_idx" ON "venue_bookings"("venue_id", "date");

-- CreateIndex
CREATE INDEX "venue_rental_contracts_team_id_idx" ON "venue_rental_contracts"("team_id");

-- CreateIndex
CREATE INDEX "venue_rental_contracts_venue_id_idx" ON "venue_rental_contracts"("venue_id");

-- CreateIndex
CREATE INDEX "venue_rental_contracts_status_idx" ON "venue_rental_contracts"("status");

-- CreateIndex
CREATE INDEX "venue_rental_contracts_start_date_idx" ON "venue_rental_contracts"("start_date");

-- CreateIndex
CREATE INDEX "venue_rental_contracts_end_date_idx" ON "venue_rental_contracts"("end_date");

-- CreateIndex
CREATE INDEX "venue_rental_schedules_contract_id_idx" ON "venue_rental_schedules"("contract_id");

-- CreateIndex
CREATE INDEX "venue_rental_schedules_venue_id_idx" ON "venue_rental_schedules"("venue_id");

-- CreateIndex
CREATE INDEX "venue_rental_schedules_team_id_idx" ON "venue_rental_schedules"("team_id");

-- CreateIndex
CREATE INDEX "venue_rental_schedules_day_of_week_idx" ON "venue_rental_schedules"("day_of_week");

-- CreateIndex
CREATE INDEX "venue_rental_schedules_is_active_idx" ON "venue_rental_schedules"("is_active");

-- CreateIndex
CREATE INDEX "venue_holidays_venue_id_idx" ON "venue_holidays"("venue_id");

-- CreateIndex
CREATE INDEX "venue_holidays_date_idx" ON "venue_holidays"("date");

-- CreateIndex
CREATE INDEX "venue_holidays_type_idx" ON "venue_holidays"("type");

-- CreateIndex
CREATE UNIQUE INDEX "venue_holidays_venue_id_date_key" ON "venue_holidays"("venue_id", "date");

-- CreateIndex
CREATE INDEX "camps_team_id_idx" ON "camps"("team_id");

-- CreateIndex
CREATE INDEX "camps_start_date_idx" ON "camps"("start_date");

-- CreateIndex
CREATE INDEX "camps_status_idx" ON "camps"("status");

-- CreateIndex
CREATE INDEX "camp_registrations_camp_id_idx" ON "camp_registrations"("camp_id");

-- CreateIndex
CREATE INDEX "camp_registrations_member_id_idx" ON "camp_registrations"("member_id");

-- CreateIndex
CREATE INDEX "camp_registrations_status_idx" ON "camp_registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "camp_registrations_camp_id_member_id_key" ON "camp_registrations"("camp_id", "member_id");

-- CreateIndex
CREATE INDEX "lesson_packages_team_id_idx" ON "lesson_packages"("team_id");

-- CreateIndex
CREATE INDEX "lesson_packages_status_idx" ON "lesson_packages"("status");

-- CreateIndex
CREATE INDEX "lesson_packages_training_type_idx" ON "lesson_packages"("training_type");

-- CreateIndex
CREATE INDEX "lesson_package_enrollments_package_id_idx" ON "lesson_package_enrollments"("package_id");

-- CreateIndex
CREATE INDEX "lesson_package_enrollments_member_id_idx" ON "lesson_package_enrollments"("member_id");

-- CreateIndex
CREATE INDEX "lesson_package_enrollments_status_idx" ON "lesson_package_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_package_enrollments_package_id_member_id_key" ON "lesson_package_enrollments"("package_id", "member_id");

-- CreateIndex
CREATE INDEX "game_expenses_match_id_idx" ON "game_expenses"("match_id");

-- CreateIndex
CREATE INDEX "game_expenses_tournament_id_idx" ON "game_expenses"("tournament_id");

-- CreateIndex
CREATE INDEX "game_expenses_team_id_idx" ON "game_expenses"("team_id");

-- CreateIndex
CREATE INDEX "game_expenses_category_idx" ON "game_expenses"("category");

-- CreateIndex
CREATE INDEX "game_expenses_status_idx" ON "game_expenses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "common_code_groups_group_code_key" ON "common_code_groups"("group_code");

-- CreateIndex
CREATE INDEX "common_code_groups_is_active_idx" ON "common_code_groups"("is_active");

-- CreateIndex
CREATE INDEX "common_code_groups_sort_order_idx" ON "common_code_groups"("sort_order");

-- CreateIndex
CREATE INDEX "common_codes_group_id_idx" ON "common_codes"("group_id");

-- CreateIndex
CREATE INDEX "common_codes_parent_id_idx" ON "common_codes"("parent_id");

-- CreateIndex
CREATE INDEX "common_codes_level_idx" ON "common_codes"("level");

-- CreateIndex
CREATE INDEX "common_codes_is_active_idx" ON "common_codes"("is_active");

-- CreateIndex
CREATE INDEX "common_codes_sort_order_idx" ON "common_codes"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "common_codes_group_id_code_key" ON "common_codes"("group_id", "code");

-- CreateIndex
CREATE INDEX "class_rsvps_schedule_id_status_idx" ON "class_rsvps"("schedule_id", "status");

-- CreateIndex
CREATE INDEX "class_rsvps_user_id_idx" ON "class_rsvps"("user_id");

-- CreateIndex
CREATE INDEX "class_rsvps_child_id_idx" ON "class_rsvps"("child_id");

-- CreateIndex
CREATE INDEX "class_rsvps_status_idx" ON "class_rsvps"("status");

-- CreateIndex
CREATE UNIQUE INDEX "class_rsvps_schedule_id_user_id_child_id_key" ON "class_rsvps"("schedule_id", "user_id", "child_id");

-- CreateIndex
CREATE INDEX "overseas_trips_team_id_idx" ON "overseas_trips"("team_id");

-- CreateIndex
CREATE INDEX "overseas_trips_status_idx" ON "overseas_trips"("status");

-- CreateIndex
CREATE INDEX "overseas_trips_start_date_idx" ON "overseas_trips"("start_date");

-- CreateIndex
CREATE INDEX "overseas_trips_registration_deadline_idx" ON "overseas_trips"("registration_deadline");

-- CreateIndex
CREATE INDEX "overseas_trips_created_by_id_idx" ON "overseas_trips"("created_by_id");

-- CreateIndex
CREATE INDEX "overseas_trip_registrations_trip_id_idx" ON "overseas_trip_registrations"("trip_id");

-- CreateIndex
CREATE INDEX "overseas_trip_registrations_member_id_idx" ON "overseas_trip_registrations"("member_id");

-- CreateIndex
CREATE INDEX "overseas_trip_registrations_parent_id_idx" ON "overseas_trip_registrations"("parent_id");

-- CreateIndex
CREATE INDEX "overseas_trip_registrations_status_idx" ON "overseas_trip_registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "overseas_trip_registrations_trip_id_member_id_key" ON "overseas_trip_registrations"("trip_id", "member_id");

-- CreateIndex
CREATE INDEX "leagues_season_idx" ON "leagues"("season");

-- CreateIndex
CREATE INDEX "leagues_age_group_idx" ON "leagues"("age_group");

-- CreateIndex
CREATE INDEX "leagues_status_idx" ON "leagues"("status");

-- CreateIndex
CREATE INDEX "leagues_team_id_idx" ON "leagues"("team_id");

-- CreateIndex
CREATE INDEX "leagues_year_idx" ON "leagues"("year");

-- CreateIndex
CREATE INDEX "divisions_league_id_idx" ON "divisions"("league_id");

-- CreateIndex
CREATE INDEX "divisions_level_idx" ON "divisions"("level");

-- CreateIndex
CREATE INDEX "divisions_sort_order_idx" ON "divisions"("sort_order");

-- CreateIndex
CREATE INDEX "team_divisions_division_id_idx" ON "team_divisions"("division_id");

-- CreateIndex
CREATE INDEX "team_divisions_season_idx" ON "team_divisions"("season");

-- CreateIndex
CREATE INDEX "team_divisions_status_idx" ON "team_divisions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "team_divisions_team_id_division_id_season_key" ON "team_divisions"("team_id", "division_id", "season");

-- CreateIndex
CREATE INDEX "tournament_matches_tournament_id_match_date_idx" ON "tournament_matches"("tournament_id", "match_date");

-- CreateIndex
CREATE INDEX "tournament_matches_division_id_idx" ON "tournament_matches"("division_id");

-- CreateIndex
CREATE INDEX "tournament_matches_home_team_id_idx" ON "tournament_matches"("home_team_id");

-- CreateIndex
CREATE INDEX "tournament_matches_away_team_id_idx" ON "tournament_matches"("away_team_id");

-- CreateIndex
CREATE INDEX "tournament_matches_venue_id_idx" ON "tournament_matches"("venue_id");

-- CreateIndex
CREATE INDEX "tournament_matches_status_idx" ON "tournament_matches"("status");

-- CreateIndex
CREATE INDEX "tournament_matches_match_date_idx" ON "tournament_matches"("match_date");

-- CreateIndex
CREATE INDEX "tms_posts_platform_idx" ON "tms_posts"("platform");

-- CreateIndex
CREATE INDEX "tms_posts_category_idx" ON "tms_posts"("category");

-- CreateIndex
CREATE INDEX "tms_posts_status_idx" ON "tms_posts"("status");

-- CreateIndex
CREATE INDEX "tms_posts_priority_idx" ON "tms_posts"("priority");

-- CreateIndex
CREATE INDEX "tms_posts_is_active_idx" ON "tms_posts"("is_active");

-- CreateIndex
CREATE INDEX "tms_posts_created_at_idx" ON "tms_posts"("created_at");

-- CreateIndex
CREATE INDEX "tms_attachments_post_id_idx" ON "tms_attachments"("post_id");

-- CreateIndex
CREATE INDEX "tms_comments_post_id_idx" ON "tms_comments"("post_id");

-- CreateIndex
CREATE INDEX "social_accounts_user_id_idx" ON "social_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_provider_social_id_key" ON "social_accounts"("provider", "social_id");

-- CreateIndex
CREATE INDEX "videos_uploader_id_idx" ON "videos"("uploader_id");

-- CreateIndex
CREATE INDEX "videos_team_id_idx" ON "videos"("team_id");

-- CreateIndex
CREATE INDEX "videos_video_type_idx" ON "videos"("video_type");

-- CreateIndex
CREATE INDEX "videos_status_idx" ON "videos"("status");

-- CreateIndex
CREATE INDEX "videos_created_at_idx" ON "videos"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "academies_code_key" ON "academies"("code");

-- CreateIndex
CREATE INDEX "academies_director_id_idx" ON "academies"("director_id");

-- CreateIndex
CREATE INDEX "academies_is_active_idx" ON "academies"("is_active");

-- CreateIndex
CREATE INDEX "academies_region_idx" ON "academies"("region");

-- CreateIndex
CREATE INDEX "academy_members_academy_id_status_idx" ON "academy_members"("academy_id", "status");

-- CreateIndex
CREATE INDEX "academy_members_user_id_idx" ON "academy_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academy_members_academy_id_user_id_child_id_key" ON "academy_members"("academy_id", "user_id", "child_id");

-- CreateIndex
CREATE INDEX "academy_coaches_academy_id_is_active_idx" ON "academy_coaches"("academy_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "academy_coaches_academy_id_user_id_key" ON "academy_coaches"("academy_id", "user_id");

-- CreateIndex
CREATE INDEX "user_blocks_blocker_id_idx" ON "user_blocks"("blocker_id");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "user_reports_status_created_at_idx" ON "user_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "user_reports_reporter_id_idx" ON "user_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "user_reports_reported_id_idx" ON "user_reports"("reported_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_chat_room_id_key" ON "consultations"("chat_room_id");

-- CreateIndex
CREATE INDEX "consultations_parent_id_status_idx" ON "consultations"("parent_id", "status");

-- CreateIndex
CREATE INDEX "consultations_coach_id_status_idx" ON "consultations"("coach_id", "status");

-- CreateIndex
CREATE INDEX "consultations_student_id_idx" ON "consultations"("student_id");

-- CreateIndex
CREATE INDEX "consultations_last_message_at_idx" ON "consultations"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_details_order_number_key" ON "settlement_details"("order_number");

-- CreateIndex
CREATE INDEX "settlement_details_settlement_id_status_idx" ON "settlement_details"("settlement_id", "status");

-- CreateIndex
CREATE INDEX "settlement_details_payment_date_idx" ON "settlement_details"("payment_date");

-- CreateIndex
CREATE INDEX "settlement_details_payment_id_idx" ON "settlement_details"("payment_id");

-- CreateIndex
CREATE INDEX "member_approval_logs_member_id_created_at_idx" ON "member_approval_logs"("member_id", "created_at");

-- CreateIndex
CREATE INDEX "member_approval_logs_actor_id_idx" ON "member_approval_logs"("actor_id");

-- CreateIndex
CREATE INDEX "member_approval_logs_action_idx" ON "member_approval_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_payment_id_key" ON "payment_receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_receipt_number_key" ON "payment_receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "payment_receipts_receipt_number_idx" ON "payment_receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "payment_receipts_issued_at_idx" ON "payment_receipts"("issued_at");

-- CreateIndex
CREATE INDEX "wishlists_user_id_target_type_idx" ON "wishlists"("user_id", "target_type");

-- CreateIndex
CREATE INDEX "wishlists_target_type_target_id_idx" ON "wishlists"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_user_id_target_type_target_id_key" ON "wishlists"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "galleries_team_id_category_idx" ON "galleries"("team_id", "category");

-- CreateIndex
CREATE INDEX "galleries_coach_id_idx" ON "galleries"("coach_id");

-- CreateIndex
CREATE INDEX "galleries_visibility_idx" ON "galleries"("visibility");

-- CreateIndex
CREATE INDEX "gallery_photos_gallery_id_sort_order_idx" ON "gallery_photos"("gallery_id", "sort_order");

-- CreateIndex
CREATE INDEX "gallery_photos_taken_at_idx" ON "gallery_photos"("taken_at");

-- CreateIndex
CREATE INDEX "gallery_photos_uploader_id_idx" ON "gallery_photos"("uploader_id");

-- CreateIndex
CREATE INDEX "sticker_boards_child_id_is_active_idx" ON "sticker_boards"("child_id", "is_active");

-- CreateIndex
CREATE INDEX "sticker_boards_team_id_idx" ON "sticker_boards"("team_id");

-- CreateIndex
CREATE INDEX "sticker_slots_board_id_is_earned_idx" ON "sticker_slots"("board_id", "is_earned");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_slots_board_id_slot_number_key" ON "sticker_slots"("board_id", "slot_number");

-- CreateIndex
CREATE INDEX "training_sessions_member_id_session_date_idx" ON "training_sessions"("member_id", "session_date");

-- CreateIndex
CREATE INDEX "training_sessions_team_id_session_date_idx" ON "training_sessions"("team_id", "session_date");

-- CreateIndex
CREATE INDEX "training_sessions_class_id_idx" ON "training_sessions"("class_id");

-- CreateIndex
CREATE INDEX "training_metrics_session_id_idx" ON "training_metrics"("session_id");

-- CreateIndex
CREATE INDEX "training_metrics_metric_name_idx" ON "training_metrics"("metric_name");

-- CreateIndex
CREATE INDEX "class_diaries_class_id_session_date_idx" ON "class_diaries"("class_id", "session_date");

-- CreateIndex
CREATE INDEX "class_diaries_team_id_session_date_idx" ON "class_diaries"("team_id", "session_date");

-- CreateIndex
CREATE INDEX "class_diaries_coach_id_idx" ON "class_diaries"("coach_id");

-- CreateIndex
CREATE INDEX "work_schedules_coach_id_schedule_date_idx" ON "work_schedules"("coach_id", "schedule_date");

-- CreateIndex
CREATE INDEX "work_schedules_team_id_schedule_date_idx" ON "work_schedules"("team_id", "schedule_date");

-- CreateIndex
CREATE INDEX "work_schedules_status_idx" ON "work_schedules"("status");

-- CreateIndex
CREATE INDEX "schedule_swap_requests_schedule_id_idx" ON "schedule_swap_requests"("schedule_id");

-- CreateIndex
CREATE INDEX "schedule_swap_requests_requester_id_status_idx" ON "schedule_swap_requests"("requester_id", "status");

-- CreateIndex
CREATE INDEX "schedule_swap_requests_target_coach_id_status_idx" ON "schedule_swap_requests"("target_coach_id", "status");

-- CreateIndex
CREATE INDEX "equipment_checklists_user_id_idx" ON "equipment_checklists"("user_id");

-- CreateIndex
CREATE INDEX "equipment_checklists_class_id_idx" ON "equipment_checklists"("class_id");

-- CreateIndex
CREATE INDEX "checklist_items_checklist_id_sort_order_idx" ON "checklist_items"("checklist_id", "sort_order");

-- CreateIndex
CREATE INDEX "equipment_inspections_team_id_inspected_at_idx" ON "equipment_inspections"("team_id", "inspected_at");

-- CreateIndex
CREATE INDEX "equipment_inspections_inspector_id_idx" ON "equipment_inspections"("inspector_id");

-- CreateIndex
CREATE INDEX "equipment_inspections_status_idx" ON "equipment_inspections"("status");

-- CreateIndex
CREATE INDEX "inspection_items_inspection_id_sort_order_idx" ON "inspection_items"("inspection_id", "sort_order");

-- CreateIndex
CREATE INDEX "inspection_items_condition_idx" ON "inspection_items"("condition");

-- CreateIndex
CREATE INDEX "inspection_items_needs_action_idx" ON "inspection_items"("needs_action");

-- CreateIndex
CREATE INDEX "uploaded_files_uploader_id_idx" ON "uploaded_files"("uploader_id");

-- CreateIndex
CREATE INDEX "uploaded_files_modified_by_id_idx" ON "uploaded_files"("modified_by_id");

-- CreateIndex
CREATE INDEX "uploaded_files_ref_type_ref_id_idx" ON "uploaded_files"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "uploaded_files_created_at_idx" ON "uploaded_files"("created_at");

-- CreateIndex
CREATE INDEX "uploaded_files_updated_at_idx" ON "uploaded_files"("updated_at");

-- CreateIndex
CREATE INDEX "uploaded_files_category_idx" ON "uploaded_files"("category");

-- CreateIndex
CREATE INDEX "uploaded_files_extension_idx" ON "uploaded_files"("extension");

-- CreateIndex
CREATE INDEX "data_export_requests_user_id_requested_at_idx" ON "data_export_requests"("user_id", "requested_at");

-- CreateIndex
CREATE INDEX "data_export_requests_status_expires_at_idx" ON "data_export_requests"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_pins" ADD CONSTRAINT "child_pins_child_profile_id_fkey" FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_coach_assignments" ADD CONSTRAINT "class_coach_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_coach_assignments" ADD CONSTRAINT "class_coach_assignments_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_coach_assignments" ADD CONSTRAINT "class_coach_assignments_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_products" ADD CONSTRAINT "class_products_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "class_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credits" ADD CONSTRAINT "member_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credits" ADD CONSTRAINT "member_credits_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credits" ADD CONSTRAINT "member_credits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_logs" ADD CONSTRAINT "refund_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "class_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alimtalk_logs" ADD CONSTRAINT "alimtalk_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "shop_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "shop_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_images" ADD CONSTRAINT "shop_product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_options" ADD CONSTRAINT "shop_product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_carts" ADD CONSTRAINT "shop_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "shop_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "shop_product_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_shipping_id_fkey" FOREIGN KEY ("shipping_id") REFERENCES "shop_shippings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "shop_product_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_shippings" ADD CONSTRAINT "shop_shippings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "shop_shipping_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_registrations" ADD CONSTRAINT "class_registrations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_registrations" ADD CONSTRAINT "class_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_member_credit_id_fkey" FOREIGN KEY ("member_credit_id") REFERENCES "member_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "system_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_comments" ADD CONSTRAINT "notice_comments_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "system_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_comments" ADD CONSTRAINT "notice_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_promotions" ADD CONSTRAINT "academy_promotions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_promotions" ADD CONSTRAINT "academy_promotions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_promotions" ADD CONSTRAINT "academy_promotions_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_promotions" ADD CONSTRAINT "academy_promotions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_webhook_logs" ADD CONSTRAINT "identity_webhook_logs_identity_verification_id_fkey" FOREIGN KEY ("identity_verification_id") REFERENCES "identity_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_menus" ADD CONSTRAINT "app_menus_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app_menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_product_id_fkey" FOREIGN KEY ("class_product_id") REFERENCES "class_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_codes" ADD CONSTRAINT "attendance_qr_codes_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "class_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_codes" ADD CONSTRAINT "attendance_qr_codes_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_codes" ADD CONSTRAINT "attendance_qr_codes_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_post_comments" ADD CONSTRAINT "team_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "team_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_post_comments" ADD CONSTRAINT "team_post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_post_likes" ADD CONSTRAINT "team_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "team_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_post_likes" ADD CONSTRAINT "team_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_post_attachments" ADD CONSTRAINT "team_post_attachments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "team_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_registrations" ADD CONSTRAINT "team_event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "team_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_registrations" ADD CONSTRAINT "team_event_registrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_registrations" ADD CONSTRAINT "team_event_registrations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_rink_id_fkey" FOREIGN KEY ("rink_id") REFERENCES "rinks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hockey_matches" ADD CONSTRAINT "hockey_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hockey_matches" ADD CONSTRAINT "hockey_matches_rink_id_fkey" FOREIGN KEY ("rink_id") REFERENCES "rinks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hockey_matches" ADD CONSTRAINT "hockey_matches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hockey_matches" ADD CONSTRAINT "hockey_matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hockey_matches" ADD CONSTRAINT "hockey_matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_groups" ADD CONSTRAINT "team_groups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_group_members" ADD CONSTRAINT "team_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "team_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_group_members" ADD CONSTRAINT "team_group_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_periods" ADD CONSTRAINT "match_periods_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "hockey_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "hockey_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_transactions" ADD CONSTRAINT "settlement_transactions_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evaluations" ADD CONSTRAINT "skill_evaluations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evaluations" ADD CONSTRAINT "skill_evaluations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_dimensions" ADD CONSTRAINT "skill_dimensions_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "skill_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_badges" ADD CONSTRAINT "child_badges_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_badges" ADD CONSTRAINT "child_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_wishlists" ADD CONSTRAINT "shop_wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_wishlists" ADD CONSTRAINT "shop_wishlists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_reviews" ADD CONSTRAINT "shop_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_reviews" ADD CONSTRAINT "shop_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_reviews" ADD CONSTRAINT "class_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_reviews" ADD CONSTRAINT "class_reviews_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_levels" ADD CONSTRAINT "member_levels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_level_histories" ADD CONSTRAINT "member_level_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_levels" ADD CONSTRAINT "player_skill_levels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_feedbacks" ADD CONSTRAINT "app_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_matches" ADD CONSTRAINT "pickup_matches_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_matches" ADD CONSTRAINT "pickup_matches_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_match_applicants" ADD CONSTRAINT "pickup_match_applicants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "pickup_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_match_applicants" ADD CONSTRAINT "pickup_match_applicants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_match_applicants" ADD CONSTRAINT "pickup_match_applicants_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_class_histories" ADD CONSTRAINT "player_class_histories_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_class_histories" ADD CONSTRAINT "player_class_histories_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_class_histories" ADD CONSTRAINT "player_class_histories_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_awards" ADD CONSTRAINT "player_awards_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_awards" ADD CONSTRAINT "player_awards_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_awards" ADD CONSTRAINT "player_awards_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "hockey_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_awards" ADD CONSTRAINT "team_awards_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_awards" ADD CONSTRAINT "team_awards_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_careers" ADD CONSTRAINT "player_careers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_careers" ADD CONSTRAINT "staff_careers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_time_slots" ADD CONSTRAINT "venue_time_slots_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "venue_time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "venue_rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "venue_rental_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_booked_by_id_fkey" FOREIGN KEY ("booked_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rental_contracts" ADD CONSTRAINT "venue_rental_contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rental_contracts" ADD CONSTRAINT "venue_rental_contracts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rental_contracts" ADD CONSTRAINT "venue_rental_contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rental_schedules" ADD CONSTRAINT "venue_rental_schedules_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "venue_rental_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rental_schedules" ADD CONSTRAINT "venue_rental_schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rental_schedules" ADD CONSTRAINT "venue_rental_schedules_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_holidays" ADD CONSTRAINT "venue_holidays_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "camps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_package_enrollments" ADD CONSTRAINT "lesson_package_enrollments_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "lesson_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_package_enrollments" ADD CONSTRAINT "lesson_package_enrollments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_expenses" ADD CONSTRAINT "game_expenses_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "hockey_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_expenses" ADD CONSTRAINT "game_expenses_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_expenses" ADD CONSTRAINT "game_expenses_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_code_groups" ADD CONSTRAINT "common_code_groups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_code_groups" ADD CONSTRAINT "common_code_groups_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_codes" ADD CONSTRAINT "common_codes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "common_code_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_codes" ADD CONSTRAINT "common_codes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "common_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_codes" ADD CONSTRAINT "common_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_codes" ADD CONSTRAINT "common_codes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_rsvps" ADD CONSTRAINT "class_rsvps_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "class_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_rsvps" ADD CONSTRAINT "class_rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_rsvps" ADD CONSTRAINT "class_rsvps_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overseas_trips" ADD CONSTRAINT "overseas_trips_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overseas_trips" ADD CONSTRAINT "overseas_trips_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overseas_trip_registrations" ADD CONSTRAINT "overseas_trip_registrations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "overseas_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overseas_trip_registrations" ADD CONSTRAINT "overseas_trip_registrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overseas_trip_registrations" ADD CONSTRAINT "overseas_trip_registrations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overseas_trip_registrations" ADD CONSTRAINT "overseas_trip_registrations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_divisions" ADD CONSTRAINT "team_divisions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_divisions" ADD CONSTRAINT "team_divisions_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tms_attachments" ADD CONSTRAINT "tms_attachments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "tms_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tms_comments" ADD CONSTRAINT "tms_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "tms_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academies" ADD CONSTRAINT "academies_director_id_fkey" FOREIGN KEY ("director_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_members" ADD CONSTRAINT "academy_members_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_members" ADD CONSTRAINT "academy_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_members" ADD CONSTRAINT "academy_members_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_coaches" ADD CONSTRAINT "academy_coaches_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_coaches" ADD CONSTRAINT "academy_coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_details" ADD CONSTRAINT "settlement_details_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_details" ADD CONSTRAINT "settlement_details_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_approval_logs" ADD CONSTRAINT "member_approval_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_approval_logs" ADD CONSTRAINT "member_approval_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_boards" ADD CONSTRAINT "sticker_boards_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_boards" ADD CONSTRAINT "sticker_boards_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_slots" ADD CONSTRAINT "sticker_slots_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "sticker_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_slots" ADD CONSTRAINT "sticker_slots_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_metrics" ADD CONSTRAINT "training_metrics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_diaries" ADD CONSTRAINT "class_diaries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_diaries" ADD CONSTRAINT "class_diaries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_diaries" ADD CONSTRAINT "class_diaries_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_swap_requests" ADD CONSTRAINT "schedule_swap_requests_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_swap_requests" ADD CONSTRAINT "schedule_swap_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_swap_requests" ADD CONSTRAINT "schedule_swap_requests_target_coach_id_fkey" FOREIGN KEY ("target_coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_swap_requests" ADD CONSTRAINT "schedule_swap_requests_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_checklists" ADD CONSTRAINT "equipment_checklists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_checklists" ADD CONSTRAINT "equipment_checklists_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "equipment_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_inspections" ADD CONSTRAINT "equipment_inspections_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_inspections" ADD CONSTRAINT "equipment_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "equipment_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_secrets" ADD CONSTRAINT "two_factor_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

