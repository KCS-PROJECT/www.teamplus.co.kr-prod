import { Module } from "@nestjs/common";
import { ClassesController } from "./classes.controller";
import { ClassesListController } from "./classes-list.controller";
import { ClassesExploreController } from "./classes-explore.controller";
import { ClassProductsController } from "./class-products.controller";
import { ClassesService } from "./classes.service";
import { ClassesExploreService } from "./classes-explore.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { TeamsModule } from "@/teams/teams.module";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [PrismaModule, TeamsModule, NotificationsModule],
  controllers: [
    // ⚠️ 순서 의존: ClassesExploreController 가 ClassesListController 보다 먼저 와야 한다.
    //   후자에 `@Get(":classId")` 가 있어, 순서가 바뀌면 `/classes/explore` 요청이
    //   classId="explore" 로 잡혀 404 가 된다. NestJS 는 등록 순서대로 라우트를 매칭한다.
    ClassesExploreController,
    ClassesController,
    ClassesListController,
    ClassProductsController,
  ],
  providers: [ClassesService, ClassesExploreService],
  exports: [ClassesService],
})
export class ClassesModule {}
