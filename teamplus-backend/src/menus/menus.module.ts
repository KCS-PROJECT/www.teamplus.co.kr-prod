import { Module } from "@nestjs/common";
import { MenusService } from "./menus.service";
import { MenusController } from "./menus.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
