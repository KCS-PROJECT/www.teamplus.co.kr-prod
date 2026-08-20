import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { CommunityService } from "./community.service";
import { CommunityController } from "./community.controller";
import { CommunityPostsService } from "./community-posts.service";
import { CommunityPostsController } from "./community-posts.controller";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CommunityController, CommunityPostsController],
  providers: [CommunityService, CommunityPostsService],
  exports: [CommunityService, CommunityPostsService],
})
export class CommunityModule {}
