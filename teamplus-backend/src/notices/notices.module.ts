import { Module } from "@nestjs/common";
import { NoticesController } from "./notices.controller";
import { NoticesService } from "./notices.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { RedisModule } from "@/redis/redis.module";
import { ViewCounterModule } from "@/common/view-counter/view-counter.module";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, RedisModule, ViewCounterModule, NotificationsModule],
  controllers: [NoticesController],
  providers: [NoticesService],
  exports: [NoticesService],
})
export class NoticesModule {}
