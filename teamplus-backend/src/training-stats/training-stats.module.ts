import { Module } from "@nestjs/common";
import { TrainingStatsController } from "./training-stats.controller";
import { TrainingStatsService } from "./training-stats.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [TrainingStatsController],
  providers: [TrainingStatsService],
  exports: [TrainingStatsService],
})
export class TrainingStatsModule {}
