-- CreateTable
CREATE TABLE `shipping_policies` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shipping_fee` INTEGER NOT NULL,
    `free_shipping_threshold` INTEGER NULL,
    `additional_fee` INTEGER NOT NULL DEFAULT 0,
    `estimated_days` VARCHAR(191) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shipping_policies_is_active_idx`(`is_active`),
    INDEX `shipping_policies_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- InsertDefaultData
INSERT INTO `shipping_policies` (`id`, `name`, `shipping_fee`, `free_shipping_threshold`, `additional_fee`, `estimated_days`, `is_default`, `is_active`, `updated_at`) VALUES
('default-policy-001', '기본 배송', 3000, 50000, 3000, '2-3', true, true, NOW()),
('express-policy-001', '익일 배송', 5000, 100000, 5000, '1', false, true, NOW());
