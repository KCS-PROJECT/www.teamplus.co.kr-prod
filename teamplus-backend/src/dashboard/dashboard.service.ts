import { Injectable } from "@nestjs/common";
import { CoachDashboardService } from "./coach-dashboard.service";
import { ParentDashboardService } from "./parent-dashboard.service";
import { DirectorDashboardService } from "./director-dashboard.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AnalyticsDashboardService } from "./analytics-dashboard.service";

/**
 * DashboardService — Facade
 *
 * 기존 DashboardController 호환을 위한 위임 레이어.
 * 모든 비즈니스 로직은 역할별 서비스에 구현되어 있으며,
 * 이 클래스는 메서드 시그니처만 유지하여 하위 호환을 보장합니다.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly coachDashboard: CoachDashboardService,
    private readonly parentDashboard: ParentDashboardService,
    private readonly directorDashboard: DirectorDashboardService,
    private readonly adminDashboard: AdminDashboardService,
    private readonly analyticsDashboard: AnalyticsDashboardService,
  ) {}

  // =========================================
  // Role-specific dashboards
  // =========================================

  async getCoachDashboard(coachId: string) {
    return this.coachDashboard.getCoachDashboard(coachId);
  }

  async getParentDashboard(parentId: string) {
    return this.parentDashboard.getParentDashboard(parentId);
  }

  async getDirectorDashboard(directorId: string) {
    return this.directorDashboard.getDirectorDashboard(directorId);
  }

  async getAdminDashboard(startDate?: Date, endDate?: Date) {
    return this.adminDashboard.getAdminDashboard(startDate, endDate);
  }

  // =========================================
  // Common
  // =========================================

  async getDashboardSummary(userId: string, userType: string) {
    switch (userType) {
      case "COACH": {
        const coachData = await this.coachDashboard.getCoachDashboard(userId);
        return {
          totalClubs: coachData.clubs.total,
          totalMembers: coachData.clubs.activeMembers,
          todaySchedules: coachData.classes.todaySchedules,
          monthRevenue: coachData.payments.monthRevenue,
        };
      }
      case "PARENT": {
        const parentData =
          await this.parentDashboard.getParentDashboard(userId);
        return {
          children: parentData.children.length,
          upcomingClasses: parentData.upcomingSchedules.length,
          monthAttendance: parentData.attendance.presentRate,
          totalPaidThisMonth: parentData.payments.totalPaidThisMonth,
        };
      }
      case "ADMIN": {
        const adminData = await this.adminDashboard.getAdminDashboard();
        return {
          totalUsers: adminData.users.total,
          totalClubs: adminData.clubs.total,
          monthRevenue: adminData.payments.monthRevenue,
          todayAttendance: adminData.attendance.presentRate,
        };
      }
      default:
        return {};
    }
  }

  async getRecentActivities(userId: string, limit: number = 10) {
    return this.coachDashboard.getRecentActivities(userId, limit);
  }

  // =========================================
  // Analytics (코치/감독/관리자 공용)
  // =========================================

  async getRevenueAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
    period: number = 6,
  ) {
    return this.analyticsDashboard.getRevenueAnalytics(
      userId,
      userType,
      teamId,
      period,
    );
  }

  async getAttendanceAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
    period: number = 3,
  ) {
    return this.analyticsDashboard.getAttendanceAnalytics(
      userId,
      userType,
      teamId,
      period,
    );
  }

  async getMemberAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
    period: number = 6,
  ) {
    return this.analyticsDashboard.getMemberAnalytics(
      userId,
      userType,
      teamId,
      period,
    );
  }

  async getClassPerformanceAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
  ) {
    return this.analyticsDashboard.getClassPerformanceAnalytics(
      userId,
      userType,
      teamId,
    );
  }
}
