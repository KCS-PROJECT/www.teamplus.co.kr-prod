import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { OsMonitorService } from "./os-monitor.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService, OsMonitorService],
  exports: [AdminService],
})
export class AdminModule {}
