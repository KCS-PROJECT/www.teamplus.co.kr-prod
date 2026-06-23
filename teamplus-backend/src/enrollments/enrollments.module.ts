import { Module } from "@nestjs/common";
import { EnrollmentsController } from "./enrollments.controller";
import { EnrollmentsService } from "./enrollments.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { WaitlistModule } from "@/waitlist/waitlist.module";

/**
 * Enrollments Module
 *
 * 수강신청 관리 모듈
 *
 * 지원하는 두 가지 방식:
 *
 * 방식1: 학부모 직접 신청 (parent_direct) - 기본
 * - 학부모가 자녀를 선택하여 직접 수강신청
 * - 바로 결제 진행 가능
 * - 상태: pending → paid
 *
 * 방식2: 자녀 요청 → 학부모 승인 (child_request)
 * - 자녀(14세 이상)가 수강 요청
 * - 학부모에게 푸시 알림 발송
 * - 학부모 승인 후 결제 진행
 * - 상태: pending_approval → approved → paid
 *
 * 공통 비즈니스 규칙:
 * - 결제는 항상 학부모만 가능
 * - 72시간 내 미결제/미승인 시 자동 만료
 * - 주 보호자만 승인/거절 권한
 *
 * 2026-05-19 (N주 패키지 정합 재설계):
 * - MonthlyEnrollmentScheduler 폐기 (학부모별 결제일이 N주 패키지 단위로 모두 다름)
 * - ScheduleModule.forRoot() 중복 등록 제거 (app.module.ts 단일 등록 원칙)
 * - 만료 임박 알림은 CreditExpiryService.sendExpiryWarnings (매일 09:00 cron) 가 담당
 */
@Module({
  imports: [PrismaModule, NotificationsModule, WaitlistModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
