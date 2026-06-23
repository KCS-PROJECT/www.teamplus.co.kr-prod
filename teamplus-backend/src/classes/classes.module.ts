import { Module } from "@nestjs/common";
import { ClassesController } from "./classes.controller";
import { ClassesListController } from "./classes-list.controller";
import { ClassProductsController } from "./class-products.controller";
import { ClassesService } from "./classes.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { TeamsModule } from "@/teams/teams.module";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, TeamsModule, NotificationsModule],
  controllers: [
    ClassesController,
    ClassesListController,
    ClassProductsController,
  ],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
