-- CreateTable: app_premium_events (프리미엄 이벤트 관리)
CREATE TABLE `app_premium_events` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `subtitle` VARCHAR(200) NULL,
    `description` LONGTEXT NOT NULL,
    `event_date` DATETIME(3) NOT NULL,
    `venue_name` VARCHAR(200) NOT NULL,
    `venue_address` VARCHAR(400) NULL,
    `benefits_json` JSON NOT NULL,
    `cta_label` VARCHAR(100) NOT NULL DEFAULT '이벤트 신청하기',
    `cta_url` TEXT NULL,
    `image_url` TEXT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_id` VARCHAR(191) NULL,
    `updated_id` VARCHAR(191) NULL,

    INDEX `app_premium_events_is_active_sort_order_idx`(`is_active`, `sort_order`),
    INDEX `app_premium_events_is_active_event_date_idx`(`is_active`, `event_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
