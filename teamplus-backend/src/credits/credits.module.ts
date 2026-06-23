import { Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { CreditsService } from "./credits.service";
import { CreditDomainService } from "./credit-domain.service";
import { CreditExpiryService } from "./credit-expiry.service";
import { CreditsController } from "./credits.controller";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";

/**
 * PR-B (v0.5): CreditDomainService 신설 + Global 처리.
 *
 * - 모든 MemberCredit 수정의 단일 진입점.
 * - 다른 모듈(attendance / payments / classes / training / admin)에서
 *   imports 없이 의존성 주입 가능.
 */
@Global()
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), NotificationsModule],
  controllers: [CreditsController],
  providers: [CreditDomainService, CreditsService, CreditExpiryService],
  exports: [CreditDomainService, CreditsService, CreditExpiryService],
})
export class CreditsModule {}
