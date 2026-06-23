import { Global, Module } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceAuditLogService } from "./attendance-audit-log.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";

/**
 * PR-C (v0.6): AttendanceAuditLogService 신설 + @Global() 처리.
 * 다른 모듈(payments / credits / classes / training) 에서 imports 없이 주입 가능.
 */
@Global()
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceAuditLogService],
  exports: [AttendanceService, AttendanceAuditLogService],
})
export class AttendanceModule {}
