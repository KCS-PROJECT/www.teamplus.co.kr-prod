-- Task #6: DB FK 제약조건 추가 + 정규화 수정
-- 2026-03-05

-- AlterTable: clubs - coach_name 중복 컬럼 제거 (coachId FK로 대체)
ALTER TABLE `clubs` DROP COLUMN `coach_name`;

-- AlterTable: parent_profiles - children JSON 배열 제거 (parent_children 테이블로 정규화)
ALTER TABLE `parent_profiles` DROP COLUMN `children`;

-- AddForeignKey: clubs.coach_id → users.id
ALTER TABLE `clubs` ADD CONSTRAINT `clubs_coach_id_fkey` FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: member_credits.member_id → club_members.id
ALTER TABLE `member_credits` ADD CONSTRAINT `member_credits_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: shop_orders.user_id → users.id
ALTER TABLE `shop_orders` ADD CONSTRAINT `shop_orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: attendance_qr_codes.schedule_id → class_schedules.id
ALTER TABLE `attendance_qr_codes` ADD CONSTRAINT `attendance_qr_codes_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `class_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: attendance_qr_codes.member_id → users.id
ALTER TABLE `attendance_qr_codes` ADD CONSTRAINT `attendance_qr_codes_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: attendance_qr_codes.scanned_by → users.id
ALTER TABLE `attendance_qr_codes` ADD CONSTRAINT `attendance_qr_codes_scanned_by_fkey` FOREIGN KEY (`scanned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: skill_evaluations.coach_id → users.id
ALTER TABLE `skill_evaluations` ADD CONSTRAINT `skill_evaluations_coach_id_fkey` FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: child_badges.child_id → users.id
ALTER TABLE `child_badges` ADD CONSTRAINT `child_badges_child_id_fkey` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
