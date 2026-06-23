import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { PaymentCalculationService } from "./payment-calculation.service";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { WebhookRetryService } from "./webhook-retry.service";
import { LessonConfirmationService } from "./lesson-confirmation.service";
// Phase A: 4개 신규 서비스 골격 (Phase B에서 메서드 이관 예정)
import { PaymentCreateService } from "./services/payment-create.service";
import { PaymentWebhookService } from "./services/payment-webhook.service";
import { PaymentRefundService } from "./services/payment-refund.service";
import { PaymentReceiptService } from "./services/payment-receipt.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { RedisModule } from "@/redis/redis.module";
import { EnrollmentsModule } from "@/enrollments/enrollments.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import paymentConfig from "@/config/payment.config";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule.forFeature(paymentConfig),
    EnrollmentsModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    KgInicisGateway,
    TossPaymentsGateway,
    PaymentCalculationService,
    PostpaidSettlementService,
    WebhookRetryService,
    LessonConfirmationService,
    // Phase A 골격 서비스 (exports 제외 — Facade PaymentsService 경유)
    PaymentCreateService,
    PaymentWebhookService,
    PaymentRefundService,
    PaymentReceiptService,
  ],
  exports: [
    PaymentsService,
    KgInicisGateway,
    TossPaymentsGateway,
    PaymentCalculationService,
    WebhookRetryService,
    LessonConfirmationService,
  ],
})
export class PaymentsModule {}
