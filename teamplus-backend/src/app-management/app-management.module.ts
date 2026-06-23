import { Module } from "@nestjs/common";
import { AppManagementController } from "./app-management.controller";
import { AppManagementService } from "./app-management.service";
import { GalleryController } from "./gallery.controller";
import { PrismaModule } from "@/prisma/prisma.module";
import { GalleryModule } from "@/gallery/gallery.module";

@Module({
  imports: [PrismaModule, GalleryModule],
  controllers: [AppManagementController, GalleryController],
  providers: [AppManagementService],
  exports: [AppManagementService],
})
export class AppManagementModule {}
