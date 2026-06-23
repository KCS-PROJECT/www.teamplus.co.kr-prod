import { Module } from "@nestjs/common";
import { WorkScheduleController } from "./work-schedule.controller";
import { WorkScheduleService } from "./work-schedule.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [WorkScheduleController],
  providers: [WorkScheduleService],
  exports: [WorkScheduleService],
})
export class WorkScheduleModule {}
