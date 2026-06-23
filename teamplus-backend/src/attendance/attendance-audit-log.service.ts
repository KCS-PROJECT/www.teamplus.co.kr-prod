import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  AuditActorRole,
  AuditActionType,
  UserType,
} from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * AttendanceAuditLogService — 출석 변경 감사 로그 단일 진입점
 *
 * ATTENDANCE_CREDIT_REFORM.md v0.6 §4 P2-2 구현.
 *
 * 책임:
 *   - 모든 출석 변경 (check_in / modify / clear / auto_expire / refund) 시 1줄 INSERT
 *   - append-only (UPDATE/DELETE 금지)
 *   - actorRole 자동 매핑 (User.userType → AuditActorRole) — 호출자는 actorUserId 만 전달
 *   - SYSTEM 사용자 id lazy load + 캐시 (cron actor 매핑용)
 *
 * 24h 이의제기 워크플로우는 v0.5 에서 폐기 — 본 서비스는 단순 추적 용도.
 */
@Injectable()
export class AttendanceAuditLogService {
  private readonly logger = new Logger(AttendanceAuditLogService.name);

  /** SYSTEM 사용자 id 캐시 — cron actor 매핑용 (lazy load) */
  private cachedSystemUserId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * SYSTEM 사용자 id 를 lazy load + 캐시. cron 호출자 actor 매핑용.
   */
  async getSystemUserId(): Promise<string> {
    if (this.cachedSystemUserId) return this.cachedSystemUserId;
    const sys = await this.prisma.user.findFirst({
      where: { userType: "SYSTEM" },
      select: { id: true },
    });
    if (!sys) {
      throw new Error(
        "SYSTEM 사용자 시드가 없습니다. seed.ts 의 SYSTEM 계정 생성을 확인하세요.",
      );
    }
    this.cachedSystemUserId = sys.id;
    return this.cachedSystemUserId;
  }

  /**
   * UserType → AuditActorRole 매핑
   *
   * 두 enum 의 값이 일치하므로 단순 캐스트로 변환 가능하지만, 명시적 매핑으로 안전성 확보.
   */
  private mapUserTypeToRole(userType: UserType): AuditActorRole {
    switch (userType) {
      case "COACH":
        return "COACH";
      case "DIRECTOR":
        return "DIRECTOR";
      case "ACADEMY_DIRECTOR":
        return "ACADEMY_DIRECTOR";
      case "PARENT":
        return "PARENT";
      case "CHILD":
        return "CHILD";
      case "TEEN":
        return "TEEN";
      case "ADMIN":
        return "ADMIN";
      case "SYSTEM":
      case "OPER":
        return "SYSTEM";
      default:
        // 신규 UserType 추가 시 컴파일러가 알려줌 (TS exhaustive check)
        return "SYSTEM";
    }
  }

  /**
   * 감사 로그 INSERT — 모든 출석 변경 진입점에서 트랜잭션 마지막에 호출
   *
   * 동작:
   *   - actorRole 명시 제공 시 그대로 사용 (cron 의 SYSTEM 등)
   *   - 미제공 시 actorUserId → User.userType 조회 → 매핑
   *   - 단일 INSERT (append-only)
   */
  async record(
    tx: Prisma.TransactionClient,
    params: {
      attendanceId?: string | null;
      scheduleId: string;
      memberId: string;
      actorUserId: string;
      actorRole?: AuditActorRole; // 미제공 시 자동 조회
      actionType: AuditActionType;
      fromStatus?: string | null;
      toStatus: string;
      creditDelta?: number;
      notifiedParentId?: string | null;
      notifiedAt?: Date | null;
      reason?: string | null;
      requestId?: string | null;
      clientIp?: string | null;
      userAgent?: string | null;
    },
  ): Promise<void> {
    let actorRole = params.actorRole;
    if (!actorRole) {
      const actor = await tx.user.findUnique({
        where: { id: params.actorUserId },
        select: { userType: true },
      });
      if (!actor) {
        this.logger.warn(
          `[AuditLog] actorUserId=${params.actorUserId} 사용자 미존재 — SYSTEM 으로 fallback`,
        );
        actorRole = "SYSTEM";
      } else {
        actorRole = this.mapUserTypeToRole(actor.userType);
      }
    }

    await tx.attendanceAuditLog.create({
      data: {
        attendanceId: params.attendanceId ?? null,
        scheduleId: params.scheduleId,
        memberId: params.memberId,
        actorUserId: params.actorUserId,
        actorRole,
        actionType: params.actionType,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus,
        creditDelta: params.creditDelta ?? 0,
        notifiedParentId: params.notifiedParentId ?? null,
        notifiedAt: params.notifiedAt ?? null,
        reason: params.reason ?? null,
        requestId: params.requestId ?? null,
        clientIp: params.clientIp ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  /**
   * 학생별 출석 이력 조회 (학부모 대시보드 / 분쟁 추적)
   */
  async findMemberHistory(memberId: string, limit = 50) {
    return this.prisma.attendanceAuditLog.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * 특정 출석 레코드의 정정 이력 조회
   */
  async findAttendanceHistory(attendanceId: string) {
    return this.prisma.attendanceAuditLog.findMany({
      where: { attendanceId },
      orderBy: { createdAt: "asc" },
    });
  }
}
