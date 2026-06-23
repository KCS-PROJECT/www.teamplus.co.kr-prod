-- Reorder columns in users table: move ci, di, is_verified, verified_at, birth_date, korean_age before created_at
ALTER TABLE `users`
  MODIFY COLUMN `ci` VARCHAR(191) NULL AFTER `user_type`,
  MODIFY COLUMN `di` VARCHAR(191) NULL AFTER `ci`,
  MODIFY COLUMN `is_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `di`,
  MODIFY COLUMN `verified_at` DATETIME(3) NULL AFTER `is_verified`,
  MODIFY COLUMN `birth_date` DATETIME(3) NULL AFTER `verified_at`,
  MODIFY COLUMN `korean_age` INT(11) NULL AFTER `birth_date`;
