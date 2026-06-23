import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DailyMetricsService } from "./daily-metrics.service";
import { CoachDashboardService } from "./coach-dashboard.service";
import { ParentDashboardService } from "./parent-dashboard.service";
import { DirectorDashboardService } from "./director-dashboard.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { ChildDashboardService } from "./child-dashboard.service";
import { AnalyticsDashboardService } from "./analytics-dashboard.service";
import { CalendarDashboardService } from "./calendar-dashboard.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DailyMetricsService,
    CoachDashboardService,
    ParentDashboardService,
    DirectorDashboardService,
    AdminDashboardService,
    ChildDashboardService,
    AnalyticsDashboardService,
    CalendarDashboardService,
  ],
  exports: [
    DashboardService,
    DailyMetricsService,
    CalendarDashboardService,
    CoachDashboardService,
  ],
})
export class DashboardModule {}
