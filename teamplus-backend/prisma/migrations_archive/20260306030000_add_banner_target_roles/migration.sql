-- AlterTable: AppBanner에 targetRolesJson 필드 추가 (다중 역할 타겟팅)
ALTER TABLE `app_banners` ADD COLUMN `target_roles_json` VARCHAR(191) NOT NULL DEFAULT '[]';

-- CreateIndex: isActive + createdAt 복합 인덱스 추가 (기간별 활성 배너 쿼리 최적화)
CREATE INDEX `app_banners_is_active_created_at_idx` ON `app_banners`(`is_active`, `created_at`);

-- CreateIndex: isActive + targetRolesJson 복합 인덱스 추가 (역할별 활성 배너 필터링 최적화)
CREATE INDEX `app_banners_is_active_target_roles_json_idx` ON `app_banners`(`is_active`, `target_roles_json`(100));
