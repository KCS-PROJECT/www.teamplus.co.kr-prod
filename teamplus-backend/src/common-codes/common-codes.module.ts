import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CommonCodesService } from "./common-codes.service";
import {
  CodeGroupController,
  CommonCodeController,
} from "./common-codes.controller";

@Module({
  imports: [PrismaModule],
  controllers: [CodeGroupController, CommonCodeController],
  providers: [CommonCodesService],
  exports: [CommonCodesService],
})
export class CommonCodesModule {}
