import { Module } from "@nestjs/common";
import { SkillEvaluationsController } from "./skill-evaluations.controller";
import { SkillEvaluationsService } from "./skill-evaluations.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [SkillEvaluationsController],
  providers: [SkillEvaluationsService],
  exports: [SkillEvaluationsService],
})
export class SkillEvaluationsModule {}
