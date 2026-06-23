-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `user_type` ENUM('ADMIN', 'DIRECTOR', 'COACH', 'PARENT', 'TEEN', 'CHILD') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `ci` VARCHAR(191) NULL,
    `di` VARCHAR(191) NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_phone_key`(`phone`),
    UNIQUE INDEX `users_ci_key`(`ci`),
    INDEX `users_user_type_idx`(`user_type`),
    INDEX `users_is_verified_idx`(`is_verified`),
    INDEX `users_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parent_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `children` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `parent_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coach_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `child_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `birth_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `child_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clubs` (
    `id` VARCHAR(191) NOT NULL,
    `club_code` VARCHAR(191) NOT NULL,
    `club_name` VARCHAR(191) NOT NULL,
    `coach_id` VARCHAR(191) NOT NULL,
    `coach_name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `clubs_club_code_key`(`club_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_members` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `player_name` VARCHAR(191) NOT NULL,
    `player_age` INTEGER NOT NULL,
    `player_level` VARCHAR(191) NULL,
    `approval_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_members_club_id_idx`(`club_id`),
    INDEX `club_members_approval_status_idx`(`approval_status`),
    INDEX `club_members_joined_at_idx`(`joined_at`),
    UNIQUE INDEX `club_members_user_id_club_id_key`(`user_id`, `club_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classes` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `class_name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `instructor_name` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `age_min` INTEGER NULL,
    `age_max` INTEGER NULL,
    `level_required` VARCHAR(191) NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `classes_club_id_idx`(`club_id`),
    INDEX `classes_is_active_idx`(`is_active`),
    INDEX `classes_start_time_idx`(`start_time`),
    INDEX `classes_instructor_name_idx`(`instructor_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `scheduled_date` DATETIME(3) NOT NULL,
    `is_cancelled` BOOLEAN NOT NULL DEFAULT false,
    `cancellation_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `class_schedules_class_id_idx`(`class_id`),
    INDEX `class_schedules_scheduled_date_idx`(`scheduled_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_products` (
    `id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `product_name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `price` INTEGER NOT NULL,
    `sessions_per_month` INTEGER NOT NULL,
    `duration_days` INTEGER NOT NULL DEFAULT 30,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `class_products_class_id_idx`(`class_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `order_number` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payment_method` VARCHAR(191) NULL,
    `tid` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    UNIQUE INDEX `payments_order_number_key`(`order_number`),
    INDEX `payments_user_id_idx`(`user_id`),
    INDEX `payments_order_number_idx`(`order_number`),
    INDEX `payments_payment_status_idx`(`payment_status`),
    INDEX `payments_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_credits` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `total_credits` INTEGER NOT NULL,
    `used_credits` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `issued_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payment_id` VARCHAR(191) NULL,

    INDEX `member_credits_user_id_idx`(`user_id`),
    INDEX `member_credits_member_id_idx`(`member_id`),
    INDEX `member_credits_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_logs` (
    `id` VARCHAR(191) NOT NULL,
    `payment_id` VARCHAR(191) NOT NULL,
    `refund_amount` INTEGER NOT NULL,
    `refund_reason` VARCHAR(191) NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `refund_logs_payment_id_idx`(`payment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_attendances` (
    `id` VARCHAR(191) NOT NULL,
    `schedule_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `attendance_status` VARCHAR(191) NOT NULL DEFAULT 'absent',
    `checked_in_at` DATETIME(3) NULL,
    `credit_deducted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `class_attendances_schedule_id_idx`(`schedule_id`),
    INDEX `class_attendances_member_id_idx`(`member_id`),
    INDEX `class_attendances_created_at_idx`(`created_at`),
    INDEX `class_attendances_member_id_created_at_idx`(`member_id`, `created_at`),
    UNIQUE INDEX `class_attendances_schedule_id_member_id_key`(`schedule_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `notification_type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `template_id` VARCHAR(191) NULL,

    INDEX `notifications_user_id_idx`(`user_id`),
    INDEX `notifications_is_read_idx`(`is_read`),
    INDEX `notifications_created_at_idx`(`created_at`),
    INDEX `notifications_notification_type_idx`(`notification_type`),
    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alimtalk_logs` (
    `id` VARCHAR(191) NOT NULL,
    `notification_id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `template_code` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `sent_at` DATETIME(3) NULL,
    `response_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `alimtalk_logs_notification_id_key`(`notification_id`),
    INDEX `alimtalk_logs_status_idx`(`status`),
    INDEX `alimtalk_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `parent_id` VARCHAR(191) NULL,
    `level` INTEGER NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(191) NULL,
    `image_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shop_categories_code_key`(`code`),
    INDEX `shop_categories_parent_id_idx`(`parent_id`),
    INDEX `shop_categories_level_idx`(`level`),
    INDEX `shop_categories_is_active_idx`(`is_active`),
    INDEX `shop_categories_display_order_idx`(`display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_products` (
    `id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `price` INTEGER NOT NULL,
    `sale_price` INTEGER NULL,
    `cost_price` INTEGER NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `min_order_qty` INTEGER NOT NULL DEFAULT 1,
    `max_order_qty` INTEGER NULL,
    `brand` VARCHAR(191) NULL,
    `manufacturer` VARCHAR(191) NULL,
    `origin` VARCHAR(191) NULL,
    `weight` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_featured` BOOLEAN NOT NULL DEFAULT false,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `sales_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shop_products_code_key`(`code`),
    INDEX `shop_products_category_id_idx`(`category_id`),
    INDEX `shop_products_is_active_idx`(`is_active`),
    INDEX `shop_products_is_featured_idx`(`is_featured`),
    INDEX `shop_products_is_new_idx`(`is_new`),
    INDEX `shop_products_created_at_idx`(`created_at`),
    INDEX `shop_products_sales_count_idx`(`sales_count`),
    INDEX `shop_products_price_idx`(`price`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_product_images` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `alt_text` VARCHAR(191) NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_main` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shop_product_images_product_id_idx`(`product_id`),
    INDEX `shop_product_images_is_main_idx`(`is_main`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_product_options` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `option_name` VARCHAR(191) NOT NULL,
    `option_value` VARCHAR(191) NOT NULL,
    `additional_price` INTEGER NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shop_product_options_product_id_idx`(`product_id`),
    INDEX `shop_product_options_option_name_idx`(`option_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_orders` (
    `id` VARCHAR(191) NOT NULL,
    `order_number` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `order_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `total_amount` INTEGER NOT NULL,
    `discount_amount` INTEGER NOT NULL DEFAULT 0,
    `shipping_fee` INTEGER NOT NULL DEFAULT 0,
    `payment_amount` INTEGER NOT NULL,
    `payment_method` VARCHAR(191) NULL,
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `tid` VARCHAR(191) NULL,
    `recipient_name` VARCHAR(191) NOT NULL,
    `recipient_phone` VARCHAR(191) NOT NULL,
    `zip_code` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `address_detail` VARCHAR(191) NULL,
    `delivery_memo` VARCHAR(191) NULL,
    `shipping_id` VARCHAR(191) NULL,
    `shipped_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shop_orders_order_number_key`(`order_number`),
    INDEX `shop_orders_user_id_idx`(`user_id`),
    INDEX `shop_orders_order_number_idx`(`order_number`),
    INDEX `shop_orders_order_status_idx`(`order_status`),
    INDEX `shop_orders_payment_status_idx`(`payment_status`),
    INDEX `shop_orders_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_order_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `option_id` VARCHAR(191) NULL,
    `product_name` VARCHAR(191) NOT NULL,
    `option_name` VARCHAR(191) NULL,
    `option_value` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` INTEGER NOT NULL,
    `total_price` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shop_order_items_order_id_idx`(`order_id`),
    INDEX `shop_order_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_shipping_companies` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `tracking_url` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `shop_shipping_companies_code_key`(`code`),
    INDEX `shop_shipping_companies_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_shippings` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `tracking_number` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'preparing',
    `shipped_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shop_shippings_company_id_idx`(`company_id`),
    INDEX `shop_shippings_tracking_number_idx`(`tracking_number`),
    INDEX `shop_shippings_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `registration_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `class_registrations_class_id_idx`(`class_id`),
    INDEX `class_registrations_member_id_idx`(`member_id`),
    INDEX `class_registrations_status_idx`(`status`),
    UNIQUE INDEX `class_registrations_class_id_member_id_key`(`class_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `member_credit_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `schedule_id` VARCHAR(191) NULL,
    `refund_id` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_transactions_member_credit_id_idx`(`member_credit_id`),
    INDEX `credit_transactions_type_idx`(`type`),
    INDEX `credit_transactions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_notices` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `target_type` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,

    INDEX `system_notices_is_active_idx`(`is_active`),
    INDEX `system_notices_priority_idx`(`priority`),
    INDEX `system_notices_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_invites` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `invite_code` VARCHAR(191) NOT NULL,
    `invite_type` VARCHAR(191) NOT NULL DEFAULT 'code',
    `expires_at` DATETIME(3) NULL,
    `usage_limit` INTEGER NULL,
    `current_usage` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `club_invites_invite_code_key`(`invite_code`),
    INDEX `club_invites_club_id_idx`(`club_id`),
    INDEX `club_invites_invite_code_idx`(`invite_code`),
    INDEX `club_invites_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_templates` (
    `id` VARCHAR(191) NOT NULL,
    `template_code` VARCHAR(191) NOT NULL,
    `template_name` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `channel` VARCHAR(191) NOT NULL DEFAULT 'alimtalk',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_templates_template_code_key`(`template_code`),
    INDEX `notification_templates_template_code_idx`(`template_code`),
    INDEX `notification_templates_channel_idx`(`channel`),
    INDEX `notification_templates_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_notification_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `push_enabled` BOOLEAN NOT NULL DEFAULT true,
    `sms_enabled` BOOLEAN NOT NULL DEFAULT true,
    `email_enabled` BOOLEAN NOT NULL DEFAULT false,
    `quiet_hours_start` VARCHAR(191) NULL,
    `quiet_hours_end` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_notification_preferences_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_webhooks` (
    `id` VARCHAR(191) NOT NULL,
    `payment_id` VARCHAR(191) NULL,
    `webhook_type` VARCHAR(191) NOT NULL,
    `webhook_payload` JSON NOT NULL,
    `signature` VARCHAR(191) NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `error_message` VARCHAR(191) NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payment_webhooks_payment_id_idx`(`payment_id`),
    INDEX `payment_webhooks_webhook_type_idx`(`webhook_type`),
    INDEX `payment_webhooks_processed_at_idx`(`processed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identity_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `ci` VARCHAR(191) NULL,
    `di` VARCHAR(191) NULL,
    `verified_name` VARCHAR(191) NULL,
    `verified_phone` VARCHAR(191) NULL,
    `verified_birth` VARCHAR(191) NULL,
    `verified_gender` VARCHAR(191) NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `return_url` VARCHAR(191) NULL,
    `client_ip` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verified_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `error_code` VARCHAR(191) NULL,
    `error_message` VARCHAR(191) NULL,

    UNIQUE INDEX `identity_verifications_request_id_key`(`request_id`),
    INDEX `identity_verifications_user_id_idx`(`user_id`),
    INDEX `identity_verifications_request_id_idx`(`request_id`),
    INDEX `identity_verifications_provider_idx`(`provider`),
    INDEX `identity_verifications_status_idx`(`status`),
    INDEX `identity_verifications_purpose_idx`(`purpose`),
    INDEX `identity_verifications_requested_at_idx`(`requested_at`),
    INDEX `identity_verifications_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identity_webhook_logs` (
    `id` VARCHAR(191) NOT NULL,
    `identity_verification_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `webhook_type` VARCHAR(191) NOT NULL,
    `webhook_payload` JSON NOT NULL,
    `signature` VARCHAR(191) NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `http_status` INTEGER NULL,
    `error_message` VARCHAR(191) NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `identity_webhook_logs_identity_verification_id_idx`(`identity_verification_id`),
    INDEX `identity_webhook_logs_provider_idx`(`provider`),
    INDEX `identity_webhook_logs_webhook_type_idx`(`webhook_type`),
    INDEX `identity_webhook_logs_processed_at_idx`(`processed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_menus` (
    `id` VARCHAR(191) NOT NULL,
    `user_type` ENUM('ADMIN', 'DIRECTOR', 'COACH', 'PARENT', 'TEEN', 'CHILD') NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NOT NULL,
    `href` VARCHAR(191) NOT NULL,
    `parent_id` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `app_menus_user_type_idx`(`user_type`),
    INDEX `app_menus_is_active_idx`(`is_active`),
    INDEX `app_menus_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parent_children` (
    `id` VARCHAR(191) NOT NULL,
    `parent_id` VARCHAR(191) NOT NULL,
    `child_id` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL DEFAULT 'parent',
    `is_primary` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `parent_children_parent_id_idx`(`parent_id`),
    INDEX `parent_children_child_id_idx`(`child_id`),
    INDEX `parent_children_is_primary_idx`(`is_primary`),
    UNIQUE INDEX `parent_children_parent_id_child_id_key`(`parent_id`, `child_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(191) NOT NULL,
    `child_id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `class_product_id` VARCHAR(191) NULL,
    `requested_by` VARCHAR(191) NOT NULL,
    `request_type` VARCHAR(191) NOT NULL DEFAULT 'parent_direct',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `approved_by` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `payment_id` VARCHAR(191) NULL,
    `paid_at` DATETIME(3) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `note` TEXT NULL,

    INDEX `enrollments_child_id_idx`(`child_id`),
    INDEX `enrollments_class_id_idx`(`class_id`),
    INDEX `enrollments_requested_by_idx`(`requested_by`),
    INDEX `enrollments_status_idx`(`status`),
    INDEX `enrollments_request_type_idx`(`request_type`),
    INDEX `enrollments_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_qr_codes` (
    `id` VARCHAR(191) NOT NULL,
    `schedule_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `qr_data` VARCHAR(191) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `scanned_at` DATETIME(3) NULL,
    `scanned_by` VARCHAR(191) NULL,

    UNIQUE INDEX `attendance_qr_codes_qr_data_key`(`qr_data`),
    INDEX `attendance_qr_codes_schedule_id_idx`(`schedule_id`),
    INDEX `attendance_qr_codes_member_id_idx`(`member_id`),
    INDEX `attendance_qr_codes_qr_data_idx`(`qr_data`),
    INDEX `attendance_qr_codes_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_metrics` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `metric_date` DATE NOT NULL,
    `active_members` INTEGER NOT NULL DEFAULT 0,
    `new_members` INTEGER NOT NULL DEFAULT 0,
    `classes_held` INTEGER NOT NULL DEFAULT 0,
    `total_attendees` INTEGER NOT NULL DEFAULT 0,
    `attendance_rate` INTEGER NOT NULL DEFAULT 0,
    `total_revenue` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `daily_metrics_club_id_idx`(`club_id`),
    INDEX `daily_metrics_metric_date_idx`(`metric_date`),
    UNIQUE INDEX `daily_metrics_club_id_metric_date_key`(`club_id`, `metric_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_posts` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `post_type` VARCHAR(191) NOT NULL DEFAULT 'announcement',
    `target_level` VARCHAR(191) NULL,
    `is_pinned` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `comment_count` INTEGER NOT NULL DEFAULT 0,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_posts_club_id_idx`(`club_id`),
    INDEX `club_posts_author_id_idx`(`author_id`),
    INDEX `club_posts_post_type_idx`(`post_type`),
    INDEX `club_posts_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_post_comments` (
    `id` VARCHAR(191) NOT NULL,
    `post_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_post_comments_post_id_idx`(`post_id`),
    INDEX `club_post_comments_author_id_idx`(`author_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_post_likes` (
    `id` VARCHAR(191) NOT NULL,
    `post_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_post_likes_post_id_idx`(`post_id`),
    INDEX `club_post_likes_user_id_idx`(`user_id`),
    UNIQUE INDEX `club_post_likes_post_id_user_id_key`(`post_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_post_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `post_id` VARCHAR(191) NOT NULL,
    `file_url` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `file_type` VARCHAR(191) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_post_attachments_post_id_idx`(`post_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_events` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `target_level` VARCHAR(191) NULL,
    `capacity` INTEGER NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `price_mode` VARCHAR(191) NOT NULL DEFAULT 'payment',
    `price_amount` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `club_events_club_id_idx`(`club_id`),
    INDEX `club_events_event_type_idx`(`event_type`),
    INDEX `club_events_status_idx`(`status`),
    INDEX `club_events_start_at_idx`(`start_at`),
    INDEX `club_events_end_at_idx`(`end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `club_event_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `payment_id` VARCHAR(191) NULL,
    `memo` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `club_event_registrations_event_id_idx`(`event_id`),
    INDEX `club_event_registrations_member_id_idx`(`member_id`),
    INDEX `club_event_registrations_status_idx`(`status`),
    UNIQUE INDEX `club_event_registrations_event_id_member_id_key`(`event_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rinks` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `memo` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tournaments` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `club_id` VARCHAR(191) NULL,
    `rink_id` VARCHAR(191) NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tournaments_club_id_idx`(`club_id`),
    INDEX `tournaments_rink_id_idx`(`rink_id`),
    INDEX `tournaments_start_date_idx`(`start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hockey_matches` (
    `id` VARCHAR(191) NOT NULL,
    `tournament_id` VARCHAR(191) NULL,
    `rink_id` VARCHAR(191) NULL,
    `venue_id` VARCHAR(191) NULL,
    `home_club_id` VARCHAR(191) NULL,
    `away_club_id` VARCHAR(191) NULL,
    `home_team_id` VARCHAR(191) NULL,
    `away_team_id` VARCHAR(191) NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `home_score` INTEGER NOT NULL DEFAULT 0,
    `away_score` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `current_period` INTEGER NULL,
    `round` VARCHAR(191) NULL,
    `match_order` INTEGER NULL,
    `referee_main` VARCHAR(191) NULL,
    `referee_lines` VARCHAR(191) NULL,
    `game_sheet` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `hockey_matches_tournament_id_idx`(`tournament_id`),
    INDEX `hockey_matches_rink_id_idx`(`rink_id`),
    INDEX `hockey_matches_venue_id_idx`(`venue_id`),
    INDEX `hockey_matches_home_team_id_idx`(`home_team_id`),
    INDEX `hockey_matches_away_team_id_idx`(`away_team_id`),
    INDEX `hockey_matches_scheduled_at_idx`(`scheduled_at`),
    INDEX `hockey_matches_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `short_name` VARCHAR(191) NULL,
    `logo_url` VARCHAR(191) NULL,
    `primary_color` VARCHAR(191) NULL,
    `secondary_color` VARCHAR(191) NULL,
    `division` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `teams_club_id_idx`(`club_id`),
    INDEX `teams_division_idx`(`division`),
    INDEX `teams_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_rosters` (
    `id` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `jersey_number` INTEGER NULL,
    `is_captain` BOOLEAN NOT NULL DEFAULT false,
    `is_alt_captain` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `left_at` DATETIME(3) NULL,

    INDEX `team_rosters_team_id_idx`(`team_id`),
    INDEX `team_rosters_member_id_idx`(`member_id`),
    INDEX `team_rosters_position_idx`(`position`),
    INDEX `team_rosters_status_idx`(`status`),
    UNIQUE INDEX `team_rosters_team_id_member_id_key`(`team_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_periods` (
    `id` VARCHAR(191) NOT NULL,
    `match_id` VARCHAR(191) NOT NULL,
    `period_number` INTEGER NOT NULL,
    `started_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `home_score` INTEGER NOT NULL DEFAULT 0,
    `away_score` INTEGER NOT NULL DEFAULT 0,
    `home_penalty_minutes` INTEGER NOT NULL DEFAULT 0,
    `away_penalty_minutes` INTEGER NOT NULL DEFAULT 0,

    INDEX `match_periods_match_id_idx`(`match_id`),
    UNIQUE INDEX `match_periods_match_id_period_number_key`(`match_id`, `period_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_events` (
    `id` VARCHAR(191) NOT NULL,
    `match_id` VARCHAR(191) NOT NULL,
    `period_number` INTEGER NOT NULL,
    `event_time` VARCHAR(191) NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NULL,
    `player_id` VARCHAR(191) NULL,
    `assist_player1_id` VARCHAR(191) NULL,
    `assist_player2_id` VARCHAR(191) NULL,
    `penalty_type` VARCHAR(191) NULL,
    `penalty_minutes` INTEGER NULL,
    `description` VARCHAR(191) NULL,
    `is_game_winner` BOOLEAN NOT NULL DEFAULT false,
    `is_power_play` BOOLEAN NOT NULL DEFAULT false,
    `is_short_handed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `match_events_match_id_idx`(`match_id`),
    INDEX `match_events_event_type_idx`(`event_type`),
    INDEX `match_events_period_number_idx`(`period_number`),
    INDEX `match_events_player_id_idx`(`player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venues` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `address_detail` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `zip_code` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `capacity` INTEGER NULL,
    `rink_size` VARCHAR(191) NULL,
    `amenities` JSON NULL,
    `operating_hours` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `image_url` VARCHAR(191) NULL,
    `hourly_rate` INTEGER NULL,
    `manager_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `venues_club_id_idx`(`club_id`),
    INDEX `venues_status_idx`(`status`),
    INDEX `venues_city_idx`(`city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settlements` (
    `id` VARCHAR(191) NOT NULL,
    `club_id` VARCHAR(191) NOT NULL,
    `settlement_month` VARCHAR(191) NOT NULL,
    `total_revenue` INTEGER NOT NULL DEFAULT 0,
    `platform_fee` INTEGER NOT NULL DEFAULT 0,
    `payment_fee` INTEGER NOT NULL DEFAULT 0,
    `refund_amount` INTEGER NOT NULL DEFAULT 0,
    `net_amount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `bank_name` VARCHAR(191) NULL,
    `bank_account` VARCHAR(191) NULL,
    `account_holder` VARCHAR(191) NULL,
    `scheduled_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `approved_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `settlements_club_id_idx`(`club_id`),
    INDEX `settlements_settlement_month_idx`(`settlement_month`),
    INDEX `settlements_status_idx`(`status`),
    UNIQUE INDEX `settlements_club_id_settlement_month_key`(`club_id`, `settlement_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settlement_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `settlement_id` VARCHAR(191) NOT NULL,
    `payment_id` VARCHAR(191) NULL,
    `transaction_type` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `transaction_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `settlement_transactions_settlement_id_idx`(`settlement_id`),
    INDEX `settlement_transactions_payment_id_idx`(`payment_id`),
    INDEX `settlement_transactions_transaction_type_idx`(`transaction_type`),
    INDEX `settlement_transactions_transaction_date_idx`(`transaction_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_evaluations` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `coach_id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NULL,
    `evaluation_date` DATETIME(3) NOT NULL,
    `overall_score` INTEGER NOT NULL,
    `coach_comment` TEXT NULL,
    `improvement_areas` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `skill_evaluations_member_id_idx`(`member_id`),
    INDEX `skill_evaluations_coach_id_idx`(`coach_id`),
    INDEX `skill_evaluations_class_id_idx`(`class_id`),
    INDEX `skill_evaluations_evaluation_date_idx`(`evaluation_date`),
    INDEX `skill_evaluations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_dimensions` (
    `id` VARCHAR(191) NOT NULL,
    `evaluation_id` VARCHAR(191) NOT NULL,
    `dimension_name` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `comment` VARCHAR(191) NULL,
    `previous_score` INTEGER NULL,
    `improvement` INTEGER NULL,

    INDEX `skill_dimensions_evaluation_id_idx`(`evaluation_id`),
    INDEX `skill_dimensions_dimension_name_idx`(`dimension_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badges` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `icon_url` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `rarity` VARCHAR(191) NOT NULL DEFAULT 'common',
    `criteria` JSON NULL,
    `point_value` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `badges_category_idx`(`category`),
    INDEX `badges_rarity_idx`(`rarity`),
    INDEX `badges_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `child_badges` (
    `id` VARCHAR(191) NOT NULL,
    `child_id` VARCHAR(191) NOT NULL,
    `badge_id` VARCHAR(191) NOT NULL,
    `earned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `earned_reason` VARCHAR(191) NULL,
    `is_displayed` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `child_badges_child_id_idx`(`child_id`),
    INDEX `child_badges_badge_id_idx`(`badge_id`),
    INDEX `child_badges_is_displayed_idx`(`is_displayed`),
    UNIQUE INDEX `child_badges_child_id_badge_id_key`(`child_id`, `badge_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_wishlists` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shop_wishlists_user_id_idx`(`user_id`),
    INDEX `shop_wishlists_product_id_idx`(`product_id`),
    UNIQUE INDEX `shop_wishlists_user_id_product_id_key`(`user_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `rating` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `helpful_count` INTEGER NOT NULL DEFAULT 0,
    `admin_reply` TEXT NULL,
    `replied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shop_reviews_user_id_idx`(`user_id`),
    INDEX `shop_reviews_product_id_idx`(`product_id`),
    INDEX `shop_reviews_rating_idx`(`rating`),
    INDEX `shop_reviews_is_visible_idx`(`is_visible`),
    INDEX `shop_reviews_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `content` TEXT NULL,
    `images` JSON NOT NULL,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `class_reviews_class_id_idx`(`class_id`),
    INDEX `class_reviews_user_id_idx`(`user_id`),
    INDEX `class_reviews_rating_idx`(`rating`),
    INDEX `class_reviews_created_at_idx`(`created_at`),
    UNIQUE INDEX `class_reviews_user_id_class_id_key`(`user_id`, `class_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `discount_type` ENUM('FIXED', 'PERCENTAGE') NOT NULL,
    `discount_value` INTEGER NOT NULL,
    `min_order_amount` INTEGER NULL,
    `max_discount_amount` INTEGER NULL,
    `usage_limit` INTEGER NULL,
    `usage_per_user` INTEGER NOT NULL DEFAULT 1,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `target_type` ENUM('ALL', 'CATEGORY', 'PRODUCT') NOT NULL DEFAULT 'ALL',
    `target_ids` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupons_code_key`(`code`),
    INDEX `coupons_code_idx`(`code`),
    INDEX `coupons_is_active_idx`(`is_active`),
    INDEX `coupons_start_date_end_date_idx`(`start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_coupons` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `coupon_id` VARCHAR(191) NOT NULL,
    `is_used` BOOLEAN NOT NULL DEFAULT false,
    `used_at` DATETIME(3) NULL,
    `order_id` VARCHAR(191) NULL,
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_coupons_user_id_idx`(`user_id`),
    INDEX `user_coupons_coupon_id_idx`(`coupon_id`),
    INDEX `user_coupons_is_used_idx`(`is_used`),
    UNIQUE INDEX `user_coupons_user_id_coupon_id_key`(`user_id`, `coupon_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_levels` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `level_name` VARCHAR(191) NOT NULL DEFAULT 'Bronze',
    `total_points` INTEGER NOT NULL DEFAULT 0,
    `current_points` INTEGER NOT NULL DEFAULT 0,
    `points_to_next` INTEGER NOT NULL DEFAULT 1000,
    `benefits` JSON NOT NULL,
    `level_updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `member_levels_user_id_key`(`user_id`),
    INDEX `member_levels_level_idx`(`level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `point_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('EARN', 'USE', 'EXPIRE', 'ADJUST', 'REFUND') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `reference_id` VARCHAR(191) NULL,
    `reference_type` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `point_transactions_user_id_idx`(`user_id`),
    INDEX `point_transactions_type_idx`(`type`),
    INDEX `point_transactions_created_at_idx`(`created_at`),
    INDEX `point_transactions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `type` ENUM('DIRECT', 'GROUP', 'CLASS', 'CLUB', 'SUPPORT') NOT NULL DEFAULT 'DIRECT',
    `club_id` VARCHAR(191) NULL,
    `class_id` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_message` TEXT NULL,
    `last_message_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `chat_rooms_club_id_idx`(`club_id`),
    INDEX `chat_rooms_class_id_idx`(`class_id`),
    INDEX `chat_rooms_type_idx`(`type`),
    INDEX `chat_rooms_is_active_idx`(`is_active`),
    INDEX `chat_rooms_last_message_at_idx`(`last_message_at`),
    INDEX `chat_rooms_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_room_members` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'member',
    `nickname` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_muted` BOOLEAN NOT NULL DEFAULT false,
    `last_read_at` DATETIME(3) NULL,
    `unread_count` INTEGER NOT NULL DEFAULT 0,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `left_at` DATETIME(3) NULL,

    INDEX `chat_room_members_room_id_idx`(`room_id`),
    INDEX `chat_room_members_user_id_idx`(`user_id`),
    INDEX `chat_room_members_is_active_idx`(`is_active`),
    UNIQUE INDEX `chat_room_members_room_id_user_id_key`(`room_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `receiver_id` VARCHAR(191) NULL,
    `type` ENUM('TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'NOTICE') NOT NULL DEFAULT 'TEXT',
    `content` TEXT NOT NULL,
    `attachments` JSON NOT NULL,
    `is_edited` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `read_by` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `chat_messages_room_id_idx`(`room_id`),
    INDEX `chat_messages_sender_id_idx`(`sender_id`),
    INDEX `chat_messages_receiver_id_idx`(`receiver_id`),
    INDEX `chat_messages_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `parent_profiles` ADD CONSTRAINT `parent_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_profiles` ADD CONSTRAINT `coach_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_profiles` ADD CONSTRAINT `coach_profiles_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `child_profiles` ADD CONSTRAINT `child_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_members` ADD CONSTRAINT `club_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_members` ADD CONSTRAINT `club_members_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_schedules` ADD CONSTRAINT `class_schedules_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_products` ADD CONSTRAINT `class_products_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `class_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_credits` ADD CONSTRAINT `member_credits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_credits` ADD CONSTRAINT `member_credits_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_logs` ADD CONSTRAINT `refund_logs_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_attendances` ADD CONSTRAINT `class_attendances_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `class_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_attendances` ADD CONSTRAINT `class_attendances_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `notification_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alimtalk_logs` ADD CONSTRAINT `alimtalk_logs_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_categories` ADD CONSTRAINT `shop_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `shop_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_products` ADD CONSTRAINT `shop_products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `shop_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_product_images` ADD CONSTRAINT `shop_product_images_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_product_options` ADD CONSTRAINT `shop_product_options_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_orders` ADD CONSTRAINT `shop_orders_shipping_id_fkey` FOREIGN KEY (`shipping_id`) REFERENCES `shop_shippings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_order_items` ADD CONSTRAINT `shop_order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `shop_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_order_items` ADD CONSTRAINT `shop_order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_order_items` ADD CONSTRAINT `shop_order_items_option_id_fkey` FOREIGN KEY (`option_id`) REFERENCES `shop_product_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_shippings` ADD CONSTRAINT `shop_shippings_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `shop_shipping_companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_registrations` ADD CONSTRAINT `class_registrations_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_registrations` ADD CONSTRAINT `class_registrations_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_member_credit_id_fkey` FOREIGN KEY (`member_credit_id`) REFERENCES `member_credits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_invites` ADD CONSTRAINT `club_invites_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_notification_preferences` ADD CONSTRAINT `user_notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_verifications` ADD CONSTRAINT `identity_verifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_webhook_logs` ADD CONSTRAINT `identity_webhook_logs_identity_verification_id_fkey` FOREIGN KEY (`identity_verification_id`) REFERENCES `identity_verifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_menus` ADD CONSTRAINT `app_menus_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `app_menus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parent_children` ADD CONSTRAINT `parent_children_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parent_children` ADD CONSTRAINT `parent_children_child_id_fkey` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_child_id_fkey` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_class_product_id_fkey` FOREIGN KEY (`class_product_id`) REFERENCES `class_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_posts` ADD CONSTRAINT `club_posts_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_posts` ADD CONSTRAINT `club_posts_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_post_comments` ADD CONSTRAINT `club_post_comments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `club_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_post_comments` ADD CONSTRAINT `club_post_comments_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_post_likes` ADD CONSTRAINT `club_post_likes_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `club_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_post_likes` ADD CONSTRAINT `club_post_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_post_attachments` ADD CONSTRAINT `club_post_attachments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `club_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_events` ADD CONSTRAINT `club_events_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `club_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tournaments` ADD CONSTRAINT `tournaments_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tournaments` ADD CONSTRAINT `tournaments_rink_id_fkey` FOREIGN KEY (`rink_id`) REFERENCES `rinks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_tournament_id_fkey` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_rink_id_fkey` FOREIGN KEY (`rink_id`) REFERENCES `rinks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_venue_id_fkey` FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_home_club_id_fkey` FOREIGN KEY (`home_club_id`) REFERENCES `clubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_away_club_id_fkey` FOREIGN KEY (`away_club_id`) REFERENCES `clubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_home_team_id_fkey` FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hockey_matches` ADD CONSTRAINT `hockey_matches_away_team_id_fkey` FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_rosters` ADD CONSTRAINT `team_rosters_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_rosters` ADD CONSTRAINT `team_rosters_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_periods` ADD CONSTRAINT `match_periods_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `hockey_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_events` ADD CONSTRAINT `match_events_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `hockey_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_events` ADD CONSTRAINT `match_events_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `team_rosters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_events` ADD CONSTRAINT `match_events_assist_player1_id_fkey` FOREIGN KEY (`assist_player1_id`) REFERENCES `team_rosters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_events` ADD CONSTRAINT `match_events_assist_player2_id_fkey` FOREIGN KEY (`assist_player2_id`) REFERENCES `team_rosters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venues` ADD CONSTRAINT `venues_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settlements` ADD CONSTRAINT `settlements_club_id_fkey` FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settlement_transactions` ADD CONSTRAINT `settlement_transactions_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_evaluations` ADD CONSTRAINT `skill_evaluations_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_dimensions` ADD CONSTRAINT `skill_dimensions_evaluation_id_fkey` FOREIGN KEY (`evaluation_id`) REFERENCES `skill_evaluations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `child_badges` ADD CONSTRAINT `child_badges_badge_id_fkey` FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_wishlists` ADD CONSTRAINT `shop_wishlists_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_wishlists` ADD CONSTRAINT `shop_wishlists_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_reviews` ADD CONSTRAINT `shop_reviews_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_reviews` ADD CONSTRAINT `shop_reviews_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_reviews` ADD CONSTRAINT `class_reviews_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_reviews` ADD CONSTRAINT `class_reviews_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_coupons` ADD CONSTRAINT `user_coupons_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_coupons` ADD CONSTRAINT `user_coupons_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_levels` ADD CONSTRAINT `member_levels_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `point_transactions` ADD CONSTRAINT `point_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_room_members` ADD CONSTRAINT `chat_room_members_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_room_members` ADD CONSTRAINT `chat_room_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_receiver_id_fkey` FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

