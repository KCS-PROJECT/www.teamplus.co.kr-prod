-- AlterTable: AppBanner에 display_locations_json 컬럼 추가
ALTER TABLE `app_banners`
  ADD COLUMN `display_locations_json` VARCHAR(191) NOT NULL DEFAULT '[]';
