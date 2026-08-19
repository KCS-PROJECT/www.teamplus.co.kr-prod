import { Module } from "@nestjs/common";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { PaymentsModule } from "@/payments/payments.module";

@Module({
  imports: [PrismaModule, NotificationsModule, PaymentsModule],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
