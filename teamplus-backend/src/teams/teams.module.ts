import { Module } from "@nestjs/common";
import { TeamsService } from "./teams.service";
import { TeamsController } from "./teams.controller";
import { TeamsPublicController } from "./teams-public.controller";
import { TeamStatisticsController } from "./team-statistics.controller";
import { TransferService } from "./transfer.service";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [
    TeamsPublicController,
    TeamsController,
    TeamStatisticsController,
  ],
  providers: [TeamsService, TransferService],
  exports: [TeamsService, TransferService],
})
export class TeamsModule {}
