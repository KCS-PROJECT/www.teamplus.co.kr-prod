-- AlterTable: Add birth_date and korean_age columns to users table
ALTER TABLE `users` ADD COLUMN `birth_date` DATETIME(3) NULL;
ALTER TABLE `users` ADD COLUMN `korean_age` INTEGER NULL;
