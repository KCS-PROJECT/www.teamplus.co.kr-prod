import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * 모더레이션 서비스 — 사용자 차단/신고 (정보통신망법 대응)
 *
 * - UserBlock: blocker가 blocked를 차단. 유니크 쌍 (blockerId, blockedId)
 * - UserReport: 부적절 콘텐츠/사용자 신고. 24시간 내 동일 대상 재신고 방지
 *
 * 재사용 포인트:
 * - getBlockedUserIds(userId): 채팅/매치/커뮤니티 목록 쿼리에서 차단 사용자를 필터링할 때 사용 (후속 PR)
 */

type ReportStatus = "pending" | "reviewing" | "resolved" | "rejected";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────
  // 차단 (UserBlock)
  // ──────────────────────────────────────────────────────────────

  /**
   * 사용자 차단
   */
  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException("본인을 차단할 수 없습니다.");
    }

    // 대상 사용자 존재 확인
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException("대상 사용자를 찾을 수 없습니다.");
    }

    const block = await this.prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      create: { blockerId, blockedId, reason: reason ?? null },
      update: { reason: reason ?? null },
    });

    return {
      id: block.id,
      blockedId,
      createdAt: block.createdAt,
    };
  }

  /**
   * 차단 해제
   */
  async unblockUser(blockerId: string, blockId: string) {
    const block = await this.prisma.userBlock.findUnique({
      where: { id: blockId },
      select: { id: true, blockerId: true },
    });
    if (!block || block.blockerId !== blockerId) {
      throw new NotFoundException("차단 정보를 찾을 수 없습니다.");
    }

    await this.prisma.userBlock.delete({ where: { id: blockId } });
    return { success: true, id: blockId };
  }

  /**
   * 내 차단 목록
   */
  async getMyBlocks(blockerId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        blockedId: true,
        reason: true,
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
    });

    return {
      blocks: blocks.map((b) => ({
        id: b.id,
        reason: b.reason,
        createdAt: b.createdAt,
        user: {
          id: b.blocked.id,
          name: `${b.blocked.lastName}${b.blocked.firstName}`,
          userType: b.blocked.userType,
        },
      })),
      count: blocks.length,
    };
  }

  /**
   * 내가 차단한 사용자 ID 목록 (다른 서비스에서 필터링용으로 호출)
   * 재사용 대상: chat, pickup-matches, community 목록 쿼리에서 NOT IN
   */
  async getBlockedUserIds(blockerId: string): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId },
      select: { blockedId: true },
    });
    return blocks.map((b) => b.blockedId);
  }

  // ──────────────────────────────────────────────────────────────
  // 신고 (UserReport)
  // ──────────────────────────────────────────────────────────────

  private readonly allowedCategories = [
    "spam",
    "harassment",
    "inappropriate",
    "fake_profile",
    // 저작권·상표·초상권 등 지식재산권 침해 신고 (iOS 5.2 / AOS #9888072 — IP takedown 채널)
    "ip_infringement",
    "other",
  ];

  private readonly allowedTargetTypes = [
    "user",
    "chat_message",
    "gallery_photo",
    "pickup_match",
    "review",
    "notice",
  ];

  /**
   * 신고 생성
   * - 24시간 내 동일 대상(reportedId + targetType + targetId) 재신고 방지
   */
  async createReport(
    reporterId: string,
    data: {
      reportedId: string;
      targetType: string;
      targetId?: string;
      category: string;
      description?: string;
    },
  ) {
    const { reportedId, targetType, targetId, category, description } = data;

    if (reporterId === reportedId) {
      throw new BadRequestException("본인을 신고할 수 없습니다.");
    }
    if (!this.allowedCategories.includes(category)) {
      throw new BadRequestException("유효하지 않은 신고 카테고리입니다.");
    }
    if (!this.allowedTargetTypes.includes(targetType)) {
      throw new BadRequestException("유효하지 않은 신고 대상 유형입니다.");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: reportedId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException("신고 대상 사용자를 찾을 수 없습니다.");
    }

    // 24시간 내 중복 방지
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.userReport.findFirst({
      where: {
        reporterId,
        reportedId,
        targetType,
        targetId: targetId ?? null,
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { id: true },
    });
    if (recent) {
      throw new BadRequestException(
        "24시간 내에 같은 대상을 이미 신고했습니다. 운영팀이 검토 중입니다.",
      );
    }

    const report = await this.prisma.userReport.create({
      data: {
        reporterId,
        reportedId,
        targetType,
        targetId: targetId ?? null,
        category,
        description: description ?? null,
        status: "pending",
      },
    });

    return {
      id: report.id,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  /**
   * 내가 신고한 내역
   */
  async getMyReports(reporterId: string) {
    const reports = await this.prisma.userReport.findMany({
      where: { reporterId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        targetType: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        reported: {
          select: { id: true, firstName: true, lastName: true, userType: true },
        },
      },
    });

    return {
      reports: reports.map((r) => ({
        id: r.id,
        category: r.category,
        targetType: r.targetType,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        reportedUser: {
          id: r.reported.id,
          name: `${r.reported.lastName}${r.reported.firstName}`,
          userType: r.reported.userType,
        },
      })),
      count: reports.length,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // 어드민 전용
  // ──────────────────────────────────────────────────────────────

  async getAdminReports(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reporterId: true,
          reportedId: true,
          category: true,
          targetType: true,
          targetId: true,
          description: true,
          status: true,
          adminNote: true,
          createdAt: true,
          resolvedAt: true,
          reporter: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          reported: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.userReport.count({ where }),
    ]);

    return {
      data: reports,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateReportStatus(
    adminId: string,
    reportId: string,
    status: ReportStatus,
    adminNote?: string,
  ) {
    if (!["pending", "reviewing", "resolved", "rejected"].includes(status)) {
      throw new BadRequestException("유효하지 않은 상태입니다.");
    }
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException("신고를 찾을 수 없습니다.");
    }

    const updated = await this.prisma.userReport.update({
      where: { id: reportId },
      data: {
        status,
        adminNote: adminNote ?? report.adminNote,
        resolvedAt:
          status === "resolved" || status === "rejected"
            ? new Date()
            : report.resolvedAt,
      },
    });

    // adminId를 audit log에 남기지 않지만(별도 PR), 파라미터 유지 (향후 감사용)
    void adminId;
    return updated;
  }
}
