import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

const REPORT_RATE_LIMIT_HOURS = 24; // 동일 대상 재신고 24시간 제한
const BLOCK_MAX = 500; // 차단 최대 500명

@Injectable()
export class UserSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 차단 ──────────────────────────────────────────────────────────────────

  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId)
      throw new BadRequestException("자기 자신을 차단할 수 없습니다.");

    // 대상 사용자 존재 확인
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("사용자를 찾을 수 없습니다.");

    // 최대 차단 수 확인
    const count = await this.prisma.userBlock.count({ where: { blockerId } });
    if (count >= BLOCK_MAX)
      throw new BadRequestException(
        `최대 ${BLOCK_MAX}명까지 차단할 수 있습니다.`,
      );

    try {
      const block = await this.prisma.userBlock.create({
        data: { blockerId, blockedId, reason },
        select: { id: true, blockedId: true, createdAt: true },
      });
      return {
        success: true,
        id: block.id,
        blockedId: block.blockedId,
        createdAt: block.createdAt,
      };
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        throw new ConflictException("이미 차단된 사용자입니다.");
      }
      throw e;
    }
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const block = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    if (!block) throw new NotFoundException("차단 목록에 없는 사용자입니다.");
    await this.prisma.userBlock.delete({ where: { id: block.id } });
    return { success: true };
  }

  async getBlockList(blockerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { blockerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          blocked: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userType: true,
            },
          },
        },
      }),
      this.prisma.userBlock.count({ where: { blockerId } }),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        blockedUserId: b.blocked.id,
        name: `${b.blocked.lastName}${b.blocked.firstName}`,
        userType: b.blocked.userType,
        blockedAt: b.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    return !!block;
  }

  // ── 신고 ──────────────────────────────────────────────────────────────────

  async reportUser(
    reporterId: string,
    data: {
      reportedId: string;
      targetType: string;
      targetId?: string;
      category: string;
      description?: string;
    },
  ) {
    if (reporterId === data.reportedId)
      throw new BadRequestException("자기 자신을 신고할 수 없습니다.");

    // Rate Limit: 24시간 내 동일 대상+targetType 중복 신고 방지
    const since = new Date(Date.now() - REPORT_RATE_LIMIT_HOURS * 3600_000);
    const recentReport = await this.prisma.userReport.findFirst({
      where: {
        reporterId,
        reportedId: data.reportedId,
        targetType: data.targetType,
        ...(data.targetId ? { targetId: data.targetId } : {}),
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recentReport) {
      throw new BadRequestException(
        `${REPORT_RATE_LIMIT_HOURS}시간 이내 동일 대상에 대한 중복 신고는 불가합니다.`,
      );
    }

    const report = await this.prisma.userReport.create({
      data: {
        reporterId,
        reportedId: data.reportedId,
        targetType: data.targetType,
        targetId: data.targetId,
        category: data.category,
        description: data.description,
        status: "pending",
      },
      select: { id: true, status: true, createdAt: true },
    });

    return {
      success: true,
      id: report.id,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  // ── Admin 처리 ────────────────────────────────────────────────────────────

  async getAdminReports(filters: {
    status?: string;
    category?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, category, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          category: true,
          status: true,
          createdAt: true,
          reporter: { select: { id: true, firstName: true, lastName: true } },
          reported: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.userReport.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        category: r.category,
        status: r.status,
        createdAt: r.createdAt,
        reporter: {
          id: r.reporter.id,
          name: `${r.reporter.lastName}${r.reporter.firstName}`,
        },
        reported: {
          id: r.reported.id,
          name: `${r.reported.lastName}${r.reported.firstName}`,
        },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminReportDetail(reportId: string) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        description: true,
        status: true,
        adminNote: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        reporter: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reported: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!report) throw new NotFoundException("신고를 찾을 수 없습니다.");
    return report;
  }

  async resolveReport(
    adminId: string,
    reportId: string,
    action: { status: "resolved" | "rejected"; adminNote?: string },
  ) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      select: { status: true },
    });
    if (!report) throw new NotFoundException("신고를 찾을 수 없습니다.");
    if (report.status !== "pending" && report.status !== "reviewing") {
      throw new BadRequestException("이미 처리된 신고입니다.");
    }

    // Admin 본인 체크 (ADMIN/DIRECTOR만)
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { userType: true },
    });
    if (!admin || !["ADMIN", "DIRECTOR"].includes(admin.userType)) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }

    const updated = await this.prisma.userReport.update({
      where: { id: reportId },
      data: {
        status: action.status,
        adminNote: action.adminNote,
        resolvedAt: new Date(),
      },
      select: { id: true, status: true, resolvedAt: true },
    });

    return { success: true, ...updated };
  }
}
