import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";
import { GameLessonConfirmationScheduler } from "./game-lesson-confirmation.scheduler";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";

/**
 * Waitlist Module
 *
 * 수업 정원 초과 시 대기자 자동 관리 모듈
 *
 * 주요 기능:
 * - 대기 등록/취소
 * - 자동 승격 (promoteNextWaitlist)
 * - 승격 후 24시간 확정 응답
 * - 만료 대기자 처리 (processExpiredWaitlists) — 15분마다 자동 실행
 *
 * WaitlistService는 EnrollmentsModule에서도 사용 (취소 시 자동 승격 트리거)
 */
@Module({
  imports: [PrismaModule, NotificationsModule, ScheduleModule.forRoot()],
  controllers: [WaitlistController],
  providers: [WaitlistService, GameLessonConfirmationScheduler],
  exports: [WaitlistService],
})
export class WaitlistModule {}
