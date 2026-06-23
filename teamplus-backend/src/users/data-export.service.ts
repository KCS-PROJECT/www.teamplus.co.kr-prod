import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

const RATE_LIMIT_DAYS = 30; // 30일에 1회 요청 가능
const EXPIRE_DAYS = 7; // 다운로드 7일 후 만료

@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** PIPA §35: 개인정보 열람 요청 생성 + 즉시 데이터 수집 */
  async requestExport(
    userId: string,
  ): Promise<{ id: string; status: string; expiresAt: Date }> {
    // Rate Limit: 30일 내 완료된 요청이 있으면 재요청 불가
    const since = new Date();
    since.setDate(since.getDate() - RATE_LIMIT_DAYS);
    const recent = await this.prisma.dataExportRequest.findFirst({
      where: {
        userId,
        status: { in: ["ready", "processing"] },
        requestedAt: { gte: since },
      },
      orderBy: { requestedAt: "desc" },
    });
    if (recent) {
      throw new BadRequestException(
        `최근 ${RATE_LIMIT_DAYS}일 이내에 이미 요청이 있습니다. (ID: ${recent.id})`,
      );
    }

    // 요청 레코드 생성 (processing)
    const request = await this.prisma.dataExportRequest.create({
      data: { userId, status: "processing" },
    });

    // 비동기로 데이터 수집 처리 (응답은 즉시 반환)
    setImmediate(() => this.processExport(request.id, userId));

    return {
      id: request.id,
      status: "processing",
      expiresAt: new Date(Date.now() + EXPIRE_DAYS * 86400_000),
    };
  }

  /** 최근 요청 상태 조회 */
  async getLatestStatus(userId: string) {
    const request = await this.prisma.dataExportRequest.findFirst({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        status: true,
        fileSize: true,
        requestedAt: true,
        readyAt: true,
        expiresAt: true,
        errorMessage: true,
      },
    });
    if (!request) return { hasRequest: false };

    const expired = request.expiresAt && request.expiresAt < new Date();
    return {
      hasRequest: true,
      ...request,
      status:
        expired && request.status === "ready" ? "expired" : request.status,
    };
  }

  /** 개인정보 다운로드 (JSON) — requestId 검증 후 데이터 반환 */
  async downloadExport(userId: string, requestId: string) {
    const request = await this.prisma.dataExportRequest.findUnique({
      where: { id: requestId },
      select: { userId: true, status: true, expiresAt: true },
    });
    if (!request) throw new NotFoundException("요청을 찾을 수 없습니다.");
    if (request.userId !== userId)
      throw new ForbiddenException("접근 권한이 없습니다.");
    if (request.status !== "ready")
      throw new BadRequestException("아직 준비되지 않은 요청입니다.");
    if (request.expiresAt && request.expiresAt < new Date()) {
      throw new BadRequestException("다운로드 링크가 만료되었습니다.");
    }

    return this.collectUserData(userId);
  }

  // ── 내부 처리 ──────────────────────────────────────────────────────────────

  private async processExport(
    requestId: string,
    userId: string,
  ): Promise<void> {
    try {
      const data = await this.collectUserData(userId);
      const jsonStr = JSON.stringify(data);
      const expiresAt = new Date(Date.now() + EXPIRE_DAYS * 86400_000);

      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: {
          status: "ready",
          fileSize: Buffer.byteLength(jsonStr, "utf8"),
          readyAt: new Date(),
          expiresAt,
        },
      });
    } catch (err) {
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private async collectUserData(userId: string) {
    const [
      user,
      attendances,
      memberCredits,
      enrollments,
      notifications,
      auditLogs,
    ] = await Promise.all([
      // 기본 프로필
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          userType: true,
          birthDate: true,
          gender: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      // 출석 이력 (최근 2년)
      this.prisma.classAttendance.findMany({
        where: {
          memberId: userId,
          createdAt: { gte: twoYearsAgo() },
        },
        select: {
          id: true,
          attendanceStatus: true,
          checkedInAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      // 크레딧 거래 이력 (MemberCredit → CreditTransaction 경유)
      this.prisma.memberCredit.findMany({
        where: { userId },
        select: {
          id: true,
          totalSessions: true,
          usedSessions: true,
          expiresAt: true,
          transactions: {
            select: {
              id: true,
              amount: true,
              type: true,
              reason: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          },
        },
      }),
      // 수업 등록 이력
      this.prisma.enrollment.findMany({
        where: { requestedBy: userId },
        select: {
          id: true,
          status: true,
          requestedAt: true,
          createdAt: true,
        },
        orderBy: { requestedAt: "desc" },
        take: 200,
      }),
      // 알림 이력 (최근 90일)
      this.prisma.notification.findMany({
        where: {
          userId,
          createdAt: { gte: ninetyDaysAgo() },
        },
        select: {
          id: true,
          title: true,
          message: true,
          notificationType: true,
          isRead: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      // 로그인 이력 (최근 1년)
      this.prisma.auditLog.findMany({
        where: {
          userId,
          action: { in: ["login_success", "login_failed"] },
          createdAt: { gte: oneYearAgo() },
        },
        select: {
          id: true,
          action: true,
          ipAddress: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      attendances,
      credits: memberCredits,
      enrollments,
      notifications,
      loginHistory: auditLogs,
    };
  }
}

function twoYearsAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d;
}
function oneYearAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
}
function ninetyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d;
}
