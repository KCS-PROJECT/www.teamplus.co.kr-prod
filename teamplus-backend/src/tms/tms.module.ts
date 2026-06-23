import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { TmsService } from "./tms.service";
import { TmsController } from "./tms.controller";

@Module({
  imports: [PrismaModule],
  controllers: [TmsController],
  providers: [TmsService],
  exports: [TmsService],
})
export class TmsModule {}
