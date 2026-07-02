import { Module } from "@nestjs/common";
import { TeamsService } from "./teams.service";
import { TeamsController } from "./teams.controller";
import { TeamsPublicController } from "./teams-public.controller";
import { TeamStatisticsController } from "./team-statistics.controller";
import { DirectorRevenueController } from "./director-revenue.controller";
import { DirectorRevenueService } from "./director-revenue.service";
import { TransferService } from "./transfer.service";
import { NotificationsModule } from "@/notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [
    TeamsPublicController,
    TeamsController,
    TeamStatisticsController,
    DirectorRevenueController,
  ],
  providers: [TeamsService, TransferService, DirectorRevenueService],
  exports: [TeamsService, TransferService],
})
export class TeamsModule {}
