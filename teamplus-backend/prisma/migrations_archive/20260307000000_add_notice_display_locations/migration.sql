-- AlterTable: SystemNotice에 startAt, displayLocationsJson 컬럼 추가
ALTER TABLE `system_notices`
  ADD COLUMN `start_at` DATETIME(3) NULL,
  ADD COLUMN `display_locations_json` VARCHAR(191) NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX `system_notices_is_active_start_at_idx` ON `system_notices`(`is_active`, `start_at`);
