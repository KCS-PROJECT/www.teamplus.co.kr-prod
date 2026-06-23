import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { MemberApprovalsController } from "./member-approvals.controller";
import { MemberApprovalsService } from "./member-approvals.service";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [MemberApprovalsController],
  providers: [MemberApprovalsService],
  exports: [MemberApprovalsService],
})
export class MemberApprovalsModule {}
