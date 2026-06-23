import { Module, forwardRef } from "@nestjs/common";
import { PickupMatchesController } from "./pickup-matches.controller";
import { PickupMatchesService } from "./pickup-matches.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { PaymentsModule } from "@/payments/payments.module";

@Module({
  imports: [
    PrismaModule,
    // forwardRef: NotificationsModule ↔ WebSocket ↔ 기타 의존 순환 방지
    forwardRef(() => NotificationsModule),
    PaymentsModule,
  ],
  controllers: [PickupMatchesController],
  providers: [PickupMatchesService],
  exports: [PickupMatchesService],
})
export class PickupMatchesModule {}
