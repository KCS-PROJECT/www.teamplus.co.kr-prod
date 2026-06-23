import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OverseasTripsService } from "./overseas-trips.service";
import { OverseasTripsController } from "./overseas-trips.controller";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [OverseasTripsController],
  providers: [OverseasTripsService],
  exports: [OverseasTripsService],
})
export class OverseasTripsModule {}
