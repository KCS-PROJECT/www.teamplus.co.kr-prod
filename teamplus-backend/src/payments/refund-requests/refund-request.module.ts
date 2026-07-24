import { forwardRef, Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { PaymentsModule } from "../payments.module";
import { RefundRequestController } from "./refund-request.controller";
import { RefundRequestService } from "./refund-request.service";
import { RefundReminderService } from "./refund-reminder.service";

/**
 * RefundRequestModule — 환불 승인제(Phase 1).
 *
 * PaymentRefundService(환불 실행 엔진)를 PaymentsModule 에서 주입받으므로
 * PaymentsModule 과 상호 참조(forwardRef). ResourceAccessService 는 @Global 로 자동 주입.
 */
@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [RefundRequestController],
  providers: [RefundRequestService, RefundReminderService],
})
export class RefundRequestModule {}
