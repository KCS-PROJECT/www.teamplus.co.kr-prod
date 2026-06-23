import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
