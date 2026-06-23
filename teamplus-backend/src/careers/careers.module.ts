import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CareersController } from "./careers.controller";
import { CareersService } from "./careers.service";

@Module({
  imports: [PrismaModule],
  controllers: [CareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
