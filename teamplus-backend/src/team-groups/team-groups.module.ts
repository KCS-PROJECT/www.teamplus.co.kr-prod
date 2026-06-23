import { Module } from "@nestjs/common";
import { TeamGroupsController } from "./team-groups.controller";
import { TeamGroupsService } from "./team-groups.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [TeamGroupsController],
  providers: [TeamGroupsService],
  exports: [TeamGroupsService],
})
export class TeamGroupsModule {}
