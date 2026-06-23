import { Module } from "@nestjs/common";
import { MainPopupsService } from "./main-popups.service";
import {
  MainPopupsPublicController,
  MainPopupsAdminController,
} from "./main-popups.controller";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [MainPopupsPublicController, MainPopupsAdminController],
  providers: [MainPopupsService],
  exports: [MainPopupsService],
})
export class MainPopupsModule {}
