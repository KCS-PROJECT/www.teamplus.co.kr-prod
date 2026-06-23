-- CreateTable
CREATE TABLE `pickup_matches` (
    `id` VARCHAR(191) NOT NULL,
    `manager_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `rink_name` VARCHAR(191) NOT NULL,
    `rink_address` VARCHAR(191) NULL,
    `rink_venue_info` VARCHAR(191) NULL,
    `price` INTEGER NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `level_code` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NOT NULL DEFAULT '혼성',
    `max_participants` INTEGER NOT NULL,
    `home_team_name` VARCHAR(191) NULL,
    `away_team_name` VARCHAR(191) NULL,
    `rules` JSON NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'recruiting',
    `is_featured` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pickup_matches_manager_id_idx`(`manager_id`),
    INDEX `pickup_matches_scheduled_at_idx`(`scheduled_at`),
    INDEX `pickup_matches_status_idx`(`status`),
    INDEX `pickup_matches_level_idx`(`level`),
    INDEX `pickup_matches_gender_idx`(`gender`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pickup_match_applicants` (
    `id` VARCHAR(191) NOT NULL,
    `match_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `level` VARCHAR(191) NULL,
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `note` TEXT NULL,
    `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pickup_match_applicants_match_id_idx`(`match_id`),
    INDEX `pickup_match_applicants_user_id_idx`(`user_id`),
    INDEX `pickup_match_applicants_status_idx`(`status`),
    INDEX `pickup_match_applicants_payment_status_idx`(`payment_status`),
    UNIQUE INDEX `pickup_match_applicants_match_id_user_id_key`(`match_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pickup_matches` ADD CONSTRAINT `pickup_matches_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pickup_match_applicants` ADD CONSTRAINT `pickup_match_applicants_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `pickup_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pickup_match_applicants` ADD CONSTRAINT `pickup_match_applicants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
