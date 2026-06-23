import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { CommunityService } from "./community.service";
import { CommunityController } from "./community.controller";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
