import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { LevelCalculatorService } from "./level-calculator.service";
import { MemberLevelController } from "./member-level.controller";

@Module({
  imports: [PrismaModule],
  controllers: [MemberLevelController],
  providers: [LevelCalculatorService],
  exports: [LevelCalculatorService],
})
export class MemberLevelModule {}
