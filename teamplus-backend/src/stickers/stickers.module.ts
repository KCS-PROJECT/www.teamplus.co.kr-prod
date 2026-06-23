import { Module } from "@nestjs/common";
import { StickersController } from "./stickers.controller";
import { StickersService } from "./stickers.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [StickersController],
  providers: [StickersService],
  exports: [StickersService],
})
export class StickersModule {}
