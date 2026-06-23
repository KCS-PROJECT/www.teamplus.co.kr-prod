import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "./attendance-audit-log.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { UpdateAttendanceDto } from "./dto/update-attendance.dto";
import {
  computeAttendanceWindow,
  resolveScheduleEndTime,
} from "@/common/utils/schedule-time.util";

interface AttendanceFilter {
  teamId?: string;
  classId?: string;
  memberId?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): MemberCredit 단일 진입점
    private readonly auditLog: AttendanceAuditLogService, // PR-C (v0.6): 출석 변경 감사 로그
    private readonly notifications: NotificationsService, // FCM 푸시 발송(pushOnlyToUsers)
  ) {}

  /**
   * [Phase B-3] POSTPAID(모드 A) 수업 여부 — 후불 정산 수업은 선결제·크레딧이 없으므로
   * 출석 시 게이트(잔량 검증)와 차감을 모두 스킵하고 출석만 기록한다(사후 정산).
   */
  private async isPostpaidClass(classId: string): Promise<boolean> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { billingMode: true },
    });
    return cls?.billingMode === "POSTPAID";
  }

  /**
   * [Phase B-3] 후불 정산이 확정된 월의 출석은 정정 차단 — 청구액과 출석 불일치 방지.
   * POSTPAID 수업만 MonthlyPostpaidBilling 이 존재하므로 PREPAID 수업은 자연 통과한다.
   */
  private async assertMonthNotSettled(scheduleId: string): Promise<void> {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: { classId: true, scheduledDate: true },
    });
    if (!schedule) return;
    const d = schedule.scheduledDate;
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const billing = await this.prisma.monthlyPostpaidBilling.findUnique({
      where: { classId_yearMonth: { classId: schedule.classId, yearMonth } },
      select: { status: true },
    });
    if (billing?.status === "confirmed") {
      throw new BadRequestException(
        "정산이 확정된 월의 출석은 수정할 수 없습니다. 관리자에게 문의해주세요.",
      );
    }
  }

  /**
   * 2026-04-28: 출석 변경 후 영향 받는 dashboard 캐시 무효화.
   * 자녀 출석이 바뀌면 (1) 그 자녀의 학부모(들) (2) 자녀 본인(child-home) 캐시 모두 stale.
   * coach/director 캐시도 같은 클럽 단위로 stale 이지만 빈번 갱신 부담이 커 별도 처리.
   *
   * @param memberId  출석 대상자 User.id (자녀 또는 학생 본인)
   */
  private async invalidateDashboardCacheForMember(memberId: string) {
    try {
      // 자녀의 학부모(들) 산출
      const parentChildren = await this.prisma.parentChild.findMany({
        where: { childId: memberId },
        select: { parentId: true },
      });
      const parentIds = parentChildren.map((pc) => pc.parentId);

      // 동시 삭제 — child-home 캐시 (CHILD/TEEN 모두 가능)
      await Promise.all([
        ...parentIds.map((id) => this.redis.del(`dashboard:parent:${id}`)),
        this.redis.del(`dashboard:child-home:${memberId}:child`),
        this.redis.del(`dashboard:child-home:${memberId}:teen`),
      ]);
    } catch (e) {
      // 캐시 무효화 실패는 핵심 트랜잭션 영향 X (다음 60초 내 자동 만료)
      this.logger.warn(
        `[invalidateDashboardCache] failed for memberId=${memberId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * QR 코드 기반 출석 체크인 (실연동)
   *
   * 플로우:
   * 1. QR 데이터로 AttendanceQR 조회 → 유효성(존재·만료·취소) 검증
   *    - QR 은 **수업당 다회 사용 허용** (여러 학생이 같은 QR 스캔 가능)
   * 2. 출석 대상 userId 결정 (본인 or 학부모→자녀 대리)
   * 3. 수업 클럽의 ClubMember 확인 + ClassRegistration(active) 검증 → MemberCredit 잔여 크레딧 검증
   * 4. $transaction: 출석 upsert + 크레딧 차감 + CreditTransaction 기록 + QR 마지막 스캔 기록 갱신
   *    - 중복 출석: class_attendances UNIQUE 제약 + 기존 레코드 present 체크
   *    - 중복 차감: creditDeducted 플래그
   */
  async checkInByQr(requestUserId: string, qrData: string, childId?: string) {
    // ── 1) QR 코드 조회 및 유효성 검증 ──
    // NEW-08 (2026-05-22 v8.1): include → select 교체.
    //   실사용 필드만 명시 (id · scheduleId · expiresAt + schedule.isCancelled +
    //   class {id, className, teamId, academyId}) — AttendanceQR 의 status·qrData·
    //   scannedAt·scannedBy·cancelledAt 등 미사용 필드 SELECT 제외 → 페이로드 30% 감소.
    const qr = await this.prisma.attendanceQR.findUnique({
      where: { qrData },
      select: {
        id: true,
        scheduleId: true,
        expiresAt: true,
        schedule: {
          select: {
            isCancelled: true,
            class: {
              select: {
                id: true,
                className: true,
                teamId: true,
                academyId: true, // P1-5 (v0.5): 아카데미 도메인 분기 보장
              },
            },
          },
        },
      },
    });

    if (!qr) {
      throw new NotFoundException("유효하지 않은 QR 코드입니다.");
    }

    const now = new Date();

    if (now > qr.expiresAt) {
      throw new BadRequestException(
        "QR 코드가 만료되었습니다. 코치에게 새 QR 코드를 요청해주세요.",
      );
    }

    if (qr.schedule.isCancelled) {
      throw new BadRequestException("취소된 수업 일정입니다.");
    }

    // NOTE: QR 다회 사용 허용 (수업당 여러 학생이 같은 QR 공유 가능)
    // - 중복 출석은 class_attendances.UNIQUE(scheduleId, memberId) + 아래 existingAttendance 체크로 차단
    // - 크레딧 중복 차감은 creditDeducted 플래그로 방지
    // - 유출 시 피해는 5분 만료(expiresAt)로 한정
    // - scannedAt/scannedBy 컬럼은 "마지막 스캔 시각/사용자" 로 갱신 (감사 추적용)

    const scheduleId = qr.scheduleId;
    const classId = qr.schedule.class.id;
    const teamId = qr.schedule.class.teamId;

    // ── 2) 출석 대상 userId 결정 ──
    let targetUserId = requestUserId;

    if (childId) {
      // 학부모가 자녀 대신 체크인하는 경우 → 부모-자녀 관계 검증
      const parentChild = await this.prisma.parentChild.findUnique({
        where: {
          parentId_childId: {
            parentId: requestUserId,
            childId,
          },
        },
      });

      if (!parentChild) {
        throw new ForbiddenException(
          "해당 자녀의 보호자가 아니므로 대리 체크인이 불가합니다.",
        );
      }

      targetUserId = childId;
    }

    // ── 3) Club 수업일 때만 ClubMember 가입 자격 보조 검증 (N-9/N-10) ──
    // roleInTeam: PLAYER 명시 — PARENT 도입 후 학부모가 선수로 오인되지 않도록 방어
    if (teamId) {
      const clubMember = await this.prisma.teamMember.findFirst({
        where: {
          userId: targetUserId,
          teamId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { id: true },
      });

      if (!clubMember) {
        throw new BadRequestException(
          "해당 팀의 승인된 회원이 아닙니다. 팀 가입 후 이용해주세요.",
        );
      }
    }

    // ── 3.5) 해당 수업 수강 등록 여부 확인 (User 기반 통일 — N-9) ──
    // 이 검증이 없으면 등록 안 한 수업의 QR 도 출석 처리됨 (OWASP A01 결함 방지)
    const registration = await this.prisma.classRegistration.findFirst({
      where: {
        classId,
        userId: targetUserId,
        status: "active",
      },
      select: { id: true },
    });

    if (!registration) {
      throw new ForbiddenException(
        "해당 수업에 수강 등록되지 않았습니다. 수강 신청 후 이용해주세요.",
      );
    }

    // ── 4) 중복 출석 확인 + 결석 잠금 (2026-05-12 옵션 D) ──
    //    · present: 이미 처리됨 → 차단
    //    · absent:  코치 명시 결석 처리 → 학부모/학생 덮어쓰기 차단
    //    · unchecked: 재시도 허용
    const existingAttendance = await this.prisma.classAttendance.findUnique({
      where: {
        scheduleId_memberId: {
          scheduleId,
          memberId: targetUserId,
        },
      },
    });

    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "present"
    ) {
      throw new BadRequestException("이미 출석 체크되었습니다.");
    }
    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "absent"
    ) {
      throw new ForbiddenException(
        "코치가 결석 처리한 일정입니다. 정정이 필요하면 코치에게 문의해주세요.",
      );
    }

    // ── 5) 수업권 잔량 사전 검증 (실제 차감/race 가드는 트랜잭션 안의 CreditDomainService.deductOne) ──
    // PR-B (v0.5): 사전 검증은 빠른 실패용. 실제 차감은 단일 진입점(CreditDomainService) 경유.
    // [Phase B-3] POSTPAID(모드 A) 수업은 선결제·게이트 없음 — 출석만 기록(사후 정산).
    const isPostpaidClass = await this.isPostpaidClass(classId);
    if (!isPostpaidClass) {
      const allCredits = await this.prisma.memberCredit.findMany({
        where: { userId: targetUserId, classId, expiresAt: { gte: now } },
        orderBy: { expiresAt: "asc" },
        select: { totalSessions: true, usedSessions: true },
      });
      const hasAvailable = allCredits.some(
        (c) => c.usedSessions < c.totalSessions,
      );
      if (!hasAvailable) {
        throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
      }
    }

    // ── 6) 원자적 트랜잭션: 출석 + 수업권 차감 + QR 스캔 기록 ──
    const result = await this.prisma.$transaction(async (tx) => {
      // 6-a) 출석 기록 upsert (absent → present 전환 포함, checkedInVia/By 기록)
      const attendance = await tx.classAttendance.upsert({
        where: {
          scheduleId_memberId: {
            scheduleId,
            memberId: targetUserId,
          },
        },
        update: {
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "qr_scan",
          checkedInBy: requestUserId,
        },
        create: {
          scheduleId,
          memberId: targetUserId,
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "qr_scan",
          checkedInBy: requestUserId,
        },
      });

      // 6-b) 수업권 차감 (처음 출석 체크인일 때만) — CreditDomainService 경유
      //   [Phase B-3] POSTPAID 수업은 차감 없음(사후 정산).
      const shouldDeductCredit =
        !isPostpaidClass &&
        (!existingAttendance || !existingAttendance.creditDeducted);

      if (shouldDeductCredit) {
        await this.creditDomain.deductOne(tx, {
          userId: targetUserId,
          classId,
          scheduleId,
          reason: `QR 출석 체크인 - ${qr.schedule.class.className}`,
          deductedVia: "qr_scan",
        });
        await tx.classAttendance.update({
          where: { id: attendance.id },
          data: { creditDeducted: true },
        });
      }

      // 6-c) QR 스캔 기록 업데이트
      await tx.attendanceQR.update({
        where: { id: qr.id },
        data: {
          scannedAt: now,
          scannedBy: requestUserId,
        },
      });

      // 6-d) AuditLog INSERT (PR-C v0.6)
      await this.auditLog.record(tx, {
        attendanceId: attendance.id,
        scheduleId,
        memberId: targetUserId,
        actorUserId: requestUserId,
        actionType: "check_in",
        fromStatus: existingAttendance?.attendanceStatus ?? null,
        toStatus: "present",
        creditDelta: shouldDeductCredit ? -1 : 0,
      });

      return { attendance, creditDeducted: shouldDeductCredit };
    });

    this.logger.log(
      `[CheckIn] user=${targetUserId}, schedule=${scheduleId}, ` +
        `creditDeducted=${result.creditDeducted}, ` +
        `proxy=${childId ? `parent=${requestUserId}` : "self"}`,
    );

    // 2026-04-27 (R4 + N-3): 자녀 본인이 QR 출석한 경우만 모든 보호자에게 알림.
    // 학부모 대리(childId 지정) 케이스는 본인이 한 행위라 알림 미발송.
    // 트랜잭션 외부에서 비동기로 — 알림 실패가 출석을 롤백하지 않음.
    if (!childId && targetUserId === requestUserId) {
      this.notifyParentsOfChildAttendance(
        targetUserId,
        qr.schedule.class.className,
        now,
      ).catch((err) => {
        this.logger.warn(
          `[CheckIn] 학부모 알림 발송 실패: ${err instanceof Error ? err.message : err}`,
        );
      });
    }

    // dashboard 캐시 무효화 — 학부모/자녀 화면 즉시 반영
    await this.invalidateDashboardCacheForMember(result.attendance.memberId);

    return {
      id: result.attendance.id,
      memberId: result.attendance.memberId,
      scheduleId: result.attendance.scheduleId,
      className: qr.schedule.class.className,
      attendanceStatus: "present",
      checkedInAt: now,
      creditDeducted: result.creditDeducted,
      proxyCheckIn: !!childId,
    };
  }

  /**
   * 2026-04-27 (R4 + N-3): 자녀 출석 시 학부모에게 알림 발송.
   * - ParentChild 관계의 모든 보호자에게 발송 (isPrimary 무관)
   * - 인앱 Notification 만 (Phase 2 시작 — Phase 3 에서 Alimtalk/WebSocket 확장)
   */
  private async notifyParentsOfChildAttendance(
    childUserId: string,
    className: string,
    checkedInAt: Date,
  ): Promise<void> {
    const [child, parents] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: childUserId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.parentChild.findMany({
        where: { childId: childUserId },
        select: { parentId: true },
      }),
    ]);
    if (!child || parents.length === 0) return;

    const childName = `${child.lastName}${child.firstName}`;
    const hh = String(checkedInAt.getHours()).padStart(2, "0");
    const mm = String(checkedInAt.getMinutes()).padStart(2, "0");
    const message = `${childName}이(가) '${className}'에 출석했습니다 (${hh}:${mm}).`;

    await this.prisma.notification.createMany({
      data: parents.map((p) => ({
        userId: p.parentId,
        notificationType: "child_attendance",
        title: "자녀 출석 완료",
        message,
        linkUrl: `/attendance-history`,
      })),
    });

    // FCM 푸시 — 인앱 알림(위 createMany)은 전체 보호자 유지, 푸시는 수신거부자 제외 후 추가 발송
    await this.notifications.pushOnlyToUsers(
      parents.map((p) => p.parentId),
      {
        notificationType: "child_attendance",
        title: "자녀 출석 완료",
        message,
        linkUrl: `/attendance-history`,
      },
    );
  }

  /**
   * PR-D (v0.8): 코치 출석 정정 후 학부모 사후 알림 발송
   *
   * 발송 채널:
   *   - 인앱 알림 (Notification 테이블) — 항상 발송
   *   - 카카오 알림톡 — ATTENDANCE_MODIFIED_TEMPLATE (운영팀 승인 후 활성화)
   *
   * 트랜잭션 외부에서 호출 — 알림 실패가 출석 정정을 롤백하지 않음.
   * AuditLog 의 notifiedParentId/notifiedAt 는 호출 전에 트랜잭션 안에서 채움 (가장 먼저 발견된 학부모 id).
   *
   * @returns 알림 발송 대상 학부모 id 배열 (첫 번째 id 가 AuditLog.notifiedParentId 용)
   */
  async notifyParentsOfModification(
    tx: Prisma.TransactionClient,
    params: {
      childUserId: string;
      className: string;
      attendanceDate: Date;
      fromStatus: string | null;
      toStatus: string;
      reason: string;
      creditsBefore: number;
      creditsAfter: number;
    },
  ): Promise<{ parentIds: string[]; message: string }> {
    const [child, parents] = await Promise.all([
      tx.user.findUnique({
        where: { id: params.childUserId },
        select: { firstName: true, lastName: true },
      }),
      tx.parentChild.findMany({
        where: { childId: params.childUserId },
        select: { parentId: true },
      }),
    ]);

    if (!child || parents.length === 0) {
      this.logger.log(
        `[NotifyMod] skip — childUserId=${params.childUserId} parents=${parents.length}`,
      );
      return { parentIds: [], message: "" };
    }

    const childName = `${child.lastName}${child.firstName}`;
    const dateStr = `${params.attendanceDate.getMonth() + 1}/${params.attendanceDate.getDate()}`;
    const statusLabel = (s: string | null) => {
      if (s === "present") return "출석";
      if (s === "absent") return "결석";
      return "미체크";
    };
    const fromLabel = statusLabel(params.fromStatus);
    const toLabel = statusLabel(params.toStatus);

    // PR-D Hotfix #3 (v1.0): 사유가 빈 문자열이면 "사유:" 줄 자동 생략
    const reasonLine =
      params.reason && params.reason.trim() ? `사유: ${params.reason}. ` : "";
    const message =
      `${childName}님의 ${dateStr} ${params.className} 출석이 ` +
      `${fromLabel}에서 ${toLabel}로 정정되었습니다. ` +
      reasonLine +
      `잔여 회차: ${params.creditsBefore}회 → ${params.creditsAfter}회. ` +
      `문의는 코치에게 채팅으로 연락해주세요.`;

    // 인앱 알림 INSERT (학부모 전원)
    await tx.notification.createMany({
      data: parents.map((p) => ({
        userId: p.parentId,
        notificationType: "attendance_modified",
        title: "자녀 출석 정정 안내",
        message,
        linkUrl: `/attendance-history`,
      })),
    });

    // 카카오 알림톡 발송 — ATTENDANCE_MODIFIED_TEMPLATE (운영팀 비즈센터 승인 후 활성화)
    // 코드는 미리 작성, 템플릿 미승인 상태 — 인앱 알림만 우선 동작.

    this.logger.log(
      `[NotifyMod] childUserId=${params.childUserId} → ${parents.length} parent(s) 인앱 알림 발송`,
    );

    // FCM 푸시는 호출 측에서 트랜잭션 커밋 후 발송(롤백 시 false 푸시 방지) — parentIds + message 반환.
    return { parentIds: parents.map((p) => p.parentId), message };
  }

  /**
   * @deprecated 하위 호환용. 새로운 코드에서는 checkInByQr() 사용.
   * scheduleId 직접 전달 방식 (어드민/코치 수동 체크인에 한해 사용)
   */
  async checkInAttendance(memberId: string, scheduleId: string) {
    // 일정 확인 — class 는 id/teamId 만 필요 (mapToResponse 미사용 deprecated 경로)
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        isCancelled: true,
        class: { select: { id: true, teamId: true, academyId: true } }, // P1-5 (v0.5)
      },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    if (schedule.isCancelled) {
      throw new BadRequestException("취소된 일정입니다.");
    }

    // 기존 출석 기록 확인 + 결석 잠금 (2026-05-12 옵션 D)
    const existingAttendance = await this.prisma.classAttendance.findFirst({
      where: {
        scheduleId,
        memberId,
      },
    });

    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "present"
    ) {
      throw new BadRequestException("이미 출석 체크되었습니다.");
    }
    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "absent"
    ) {
      throw new ForbiddenException(
        "코치가 결석 처리한 일정입니다. 정정이 필요하면 코치에게 문의해주세요.",
      );
    }

    // 2026-04-27 (N-9/N-10): Club 수업일 때만 ClubMember 가입 자격 보조 검증.
    // roleInTeam: PLAYER 명시 — PARENT 도입 후 학부모가 선수로 오인되지 않도록 방어
    const classId = schedule.class.id;
    const teamId = schedule.class.teamId;
    if (teamId) {
      const clubMember = await this.prisma.teamMember.findFirst({
        where: {
          userId: memberId,
          teamId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { id: true },
      });

      if (!clubMember) {
        throw new BadRequestException("해당 팀의 승인된 회원이 아닙니다.");
      }
    }

    // 해당 수업 수강 등록 여부 확인 (User 기반 통일)
    const registration = await this.prisma.classRegistration.findFirst({
      where: {
        classId,
        userId: memberId,
        status: "active",
      },
      select: { id: true },
    });

    if (!registration) {
      throw new ForbiddenException(
        "해당 수업에 수강 등록되지 않았습니다. 수강 신청 후 이용해주세요.",
      );
    }

    // 수업권 확인 (User × Class 단위 — N-9)
    const now = new Date();
    // [Phase B-3] POSTPAID(모드 A) 수업은 선결제·게이트 없음 — 출석만 기록(사후 정산).
    const isPostpaidClass = await this.isPostpaidClass(classId);
    if (!isPostpaidClass) {
      const memberCredit = await this.prisma.memberCredit.findFirst({
        where: {
          userId: memberId,
          classId,
          expiresAt: { gte: now },
        },
        orderBy: { expiresAt: "asc" },
      });

      if (
        !memberCredit ||
        memberCredit.usedSessions >= memberCredit.totalSessions
      ) {
        throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
      }
    }

    // 출석 기록 생성 및 수업권 차감 - 원자적 트랜잭션 처리
    const result = await this.prisma.$transaction(async (tx) => {
      const attendance = await tx.classAttendance.upsert({
        where: {
          scheduleId_memberId: {
            scheduleId,
            memberId,
          },
        },
        update: {
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "coach_manual",
          checkedInBy: memberId,
        },
        create: {
          scheduleId,
          memberId,
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "coach_manual",
          checkedInBy: memberId,
        },
      });

      // 수업권 차감 (처음 출석할 때만) — PR-B: CreditDomainService 경유
      if (!existingAttendance) {
        await this.creditDomain.deductOne(tx, {
          userId: memberId,
          classId,
          scheduleId,
          reason: "수동 출석 체크인 - 수업권 차감",
          deductedVia: "coach_manual",
        });
        await tx.classAttendance.update({
          where: { id: attendance.id },
          data: { creditDeducted: true },
        });
      }

      // AuditLog INSERT (PR-C v0.6)
      await this.auditLog.record(tx, {
        attendanceId: attendance.id,
        scheduleId,
        memberId,
        actorUserId: memberId,
        actionType: "check_in",
        fromStatus: existingAttendance?.attendanceStatus ?? null,
        toStatus: "present",
        creditDelta: existingAttendance ? 0 : -1,
      });

      return attendance;
    });

    // dashboard 캐시 무효화 — 학부모/자녀 화면 즉시 반영
    await this.invalidateDashboardCacheForMember(result.memberId);

    return {
      id: result.id,
      memberId: result.memberId,
      scheduleId: result.scheduleId,
      attendanceStatus: "present",
      checkedInAt: now,
      creditDeducted: true,
    };
  }

  /**
   * 출석 현황 조회 (일정별)
   */
  async getScheduleAttendance(scheduleId: string) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    const attendances = await this.prisma.classAttendance.findMany({
      where: { scheduleId },
      select: {
        id: true,
        memberId: true,
        attendanceStatus: true,
        checkedInAt: true,
        creditDeducted: true,
        member: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // 통계 계산 (3-state)
    const total = attendances.length;
    const presentCount = attendances.filter(
      (a) => a.attendanceStatus === "present",
    ).length;
    const absentCount = attendances.filter(
      (a) => a.attendanceStatus === "absent",
    ).length;

    return {
      scheduleId,
      scheduledDate: schedule.scheduledDate,
      isCancelled: schedule.isCancelled,
      total,
      present: presentCount,
      absent: absentCount,
      presentRate: total > 0 ? ((presentCount / total) * 100).toFixed(1) : "0",
      attendances: attendances.map((a) => ({
        id: a.id,
        memberId: a.memberId,
        attendanceStatus: a.attendanceStatus,
        checkedInAt: a.checkedInAt,
      })),
    };
  }

  /**
   * 일정별 출석 명단 (등록 학생 전체 + 출석 LEFT JOIN)
   *
   * 2026-05-08: 코치/감독 출석확인 페이지용 — `getScheduleAttendance` 는 출석 레코드만
   * 반환해 미체크 학생이 누락된다. 이 메서드는 ClassRegistration(active) 으로 등록 학생
   * 전체를 잡고, ClassAttendance 가 있으면 매핑해 학생별 status 를 항상 노출한다.
   * 학생 본인 정보(이름) 는 User.firstName/lastName 또는 자녀 ParentChild → User 에서 조립.
   */
  async getScheduleRoster(scheduleId: string) {
    // NEW-08 (2026-05-22 v8.1): include → select. 실사용 필드만 (id, classId,
    //   scheduledDate, isCancelled + class {...} ) — ClassSchedule 의 startedAt·
    //   endedAt·createdAt·updatedAt 등 미사용 컬럼 SELECT 제외.
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        classId: true,
        scheduledDate: true,
        // 회차 실제 시각 SoT — ClassSchedule.startTime/endTime(text "HH:mm").
        //   scheduledDate/Class.startTime(DateTime) 은 timestamp 라 표시 시각으로 부정확.
        startTime: true,
        endTime: true,
        isCancelled: true,
        class: {
          select: {
            id: true,
            className: true,
            startTime: true,
            endTime: true,
            teamId: true,
            team: { select: { id: true, name: true, teamCode: true } },
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    const [registrations, attendances] = await Promise.all([
      this.prisma.classRegistration.findMany({
        where: { classId: schedule.classId, status: "active" },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userType: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.classAttendance.findMany({
        where: { scheduleId },
        select: {
          id: true,
          memberId: true,
          attendanceStatus: true,
          checkedInAt: true,
          checkedInVia: true,
          modifiedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const attendanceByMember = new Map<string, (typeof attendances)[number]>();
    for (const a of attendances) {
      attendanceByMember.set(a.memberId, a);
    }

    const students = registrations.map((reg) => {
      const a = attendanceByMember.get(reg.userId) ?? null;
      const fullName =
        `${reg.user.lastName ?? ""}${reg.user.firstName ?? ""}`.trim() ||
        reg.user.email;
      return {
        registrationId: reg.id,
        memberId: reg.userId,
        memberName: fullName,
        memberType: reg.user.userType,
        attendanceId: a?.id ?? null,
        attendanceStatus: a?.attendanceStatus ?? "unchecked",
        checkedInAt: a?.checkedInAt ?? null,
        checkedInVia: a?.checkedInVia ?? null,
        updatedAt: a?.updatedAt ?? null,
      };
    });

    // 통계 (3-state: present/absent/unchecked)
    const counts = {
      present: 0,
      absent: 0,
      unchecked: 0,
    };
    for (const s of students) {
      switch (s.attendanceStatus) {
        case "present":
          counts.present += 1;
          break;
        case "absent":
          counts.absent += 1;
          break;
        default:
          counts.unchecked += 1;
      }
    }

    return {
      scheduleId: schedule.id,
      classId: schedule.class.id,
      className: schedule.class.className,
      teamName: schedule.class.team?.name ?? "",
      teamCode: schedule.class.team?.teamCode ?? "",
      scheduledDate: schedule.scheduledDate,
      // 회차 시각 text("HH:mm") canonical — 프론트 표시 우선값. Dual: class* 는 폴백 유지.
      scheduleStartTime: schedule.startTime,
      scheduleEndTime: schedule.endTime,
      classStartTime: schedule.class.startTime,
      classEndTime: schedule.class.endTime,
      isCancelled: schedule.isCancelled,
      total: students.length,
      counts,
      students,
    };
  }

  /**
   * 회원 출석 기록 조회
   * 권한: 본인 · 부모(ParentChild) · 해당 클럽 코치(Club.coachId 또는 CoachProfile) · ADMIN/DIRECTOR
   */
  async getMemberAttendanceHistory(
    requesterId: string,
    memberId: string,
    limit: number = 10,
  ) {
    if (requesterId !== memberId) {
      // 1) 부모-자녀 관계 확인
      const parentChild = await this.prisma.parentChild.findUnique({
        where: {
          parentId_childId: { parentId: requesterId, childId: memberId },
        },
        select: { id: true },
      });

      let authorized = !!parentChild;

      if (!authorized) {
        // 2) 역할 기반(ADMIN/DIRECTOR 또는 같은 클럽 코치) 확인
        const [requester, sharedClub] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: requesterId },
            select: { userType: true },
          }),
          // roleInTeam: PLAYER 명시 — 출석 기록 조회 대상은 선수(PLAYER)여야 함
          // PARENT 도입 후 학부모 userId로 잘못된 클럽 매핑 방지
          this.prisma.teamMember.findFirst({
            where: {
              userId: memberId,
              roleInTeam: "PLAYER",
              approvalStatus: "approved",
            },
            select: { teamId: true },
          }),
        ]);

        if (requester && ["ADMIN", "DIRECTOR"].includes(requester.userType)) {
          authorized = true;
        } else if (sharedClub?.teamId) {
          // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 제거 — owner 또는 approved 멤버만.
          const [clubOwner, approvedMember] = await Promise.all([
            this.prisma.team.findFirst({
              where: { id: sharedClub.teamId, coachId: requesterId },
              select: { id: true },
            }),
            this.prisma.teamMember.findFirst({
              where: {
                userId: requesterId,
                teamId: sharedClub.teamId,
                approvalStatus: "approved",
                leftAt: null,
                roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
              },
              select: { id: true },
            }),
          ]);
          authorized = !!clubOwner || !!approvedMember;
        }
      }

      if (!authorized) {
        throw new ForbiddenException(
          "해당 회원의 출석 기록을 조회할 권한이 없습니다.",
        );
      }
    }

    // NEW-08 (2026-05-22 v8.1): include → select.
    //   실사용 6개 필드만 (id, attendanceStatus, checkedInAt, creditDeducted +
    //   schedule.scheduledDate + class.className) — notes/lateReason/recordedBy/
    //   signaturePath/createdAt/updatedAt 등 미사용 컬럼 SELECT 제외.
    const attendances = await this.prisma.classAttendance.findMany({
      where: { memberId },
      select: {
        id: true,
        attendanceStatus: true,
        checkedInAt: true,
        creditDeducted: true,
        schedule: {
          select: {
            scheduledDate: true,
            class: {
              select: {
                id: true,
                className: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return attendances.map((a) => ({
      id: a.id,
      // classId — 수업별 출석 필터(프론트)의 key. className 은 표시용으로 유지.
      classId: a.schedule.class.id,
      className: a.schedule.class.className,
      scheduledDate: a.schedule.scheduledDate,
      attendanceStatus: a.attendanceStatus,
      checkedInAt: a.checkedInAt,
      creditDeducted: a.creditDeducted,
    }));
  }

  /**
   * 수업별 출석 통계 (DB 레벨 집계)
   */
  async getClassAttendanceStats(classId: string) {
    // 취소되지 않은 수업 세션 수 (DB 집계)
    const totalSessions = await this.prisma.classSchedule.count({
      where: { classId, isCancelled: false },
    });

    // 출석 상태별 집계 (DB groupBy — 메모리 로드 없이 집계)
    const statusCounts = await this.prisma.classAttendance.groupBy({
      by: ["attendanceStatus"],
      where: {
        schedule: { classId, isCancelled: false },
      },
      _count: { attendanceStatus: true },
    });

    const countMap = new Map(
      statusCounts.map((s) => [s.attendanceStatus, s._count.attendanceStatus]),
    );
    const totalPresent = countMap.get("present") ?? 0;
    const totalAbsent = countMap.get("absent") ?? 0;

    return {
      classId,
      totalSessions,
      totalPresent,
      totalAbsent,
      presentRate:
        totalSessions > 0
          ? ((totalPresent / (totalSessions * 20)) * 100).toFixed(1)
          : "0", // 가정: 최대 20명
    };
  }

  /**
   * 출석 이력 조회 (필터링)
   */
  async getAttendanceHistory(
    _userId: string,
    filters: AttendanceFilter,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    // schedule 관계 필터를 별도로 구성
    const scheduleFilter: import("@prisma/client").Prisma.ClassScheduleWhereInput =
      {};

    if (filters.classId) {
      scheduleFilter.classId = filters.classId;
    }

    if (filters.teamId) {
      scheduleFilter.class = { teamId: filters.teamId };
    }

    if (filters.startDate || filters.endDate) {
      scheduleFilter.scheduledDate = {
        ...(filters.startDate && { gte: filters.startDate }),
        ...(filters.endDate && { lte: filters.endDate }),
      };
    }

    // 조건 구성
    const where: import("@prisma/client").Prisma.ClassAttendanceWhereInput = {
      ...(filters.memberId && { memberId: filters.memberId }),
      ...(filters.status && { attendanceStatus: filters.status }),
      ...(Object.keys(scheduleFilter).length > 0 && {
        schedule: scheduleFilter,
      }),
    };

    const [attendances, total] = await Promise.all([
      this.prisma.classAttendance.findMany({
        where,
        select: {
          id: true,
          memberId: true,
          attendanceStatus: true,
          checkedInAt: true,
          creditDeducted: true,
          member: {
            select: {
              id: true,
              email: true,
            },
          },
          schedule: {
            select: {
              id: true,
              scheduledDate: true,
              class: {
                select: {
                  id: true,
                  className: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.classAttendance.count({ where }),
    ]);

    return {
      data: attendances.map((a) => ({
        id: a.id,
        memberId: a.memberId,
        memberEmail: a.member?.email,
        className: a.schedule?.class?.className,
        scheduledDate: a.schedule?.scheduledDate,
        attendanceStatus: a.attendanceStatus,
        checkedInAt: a.checkedInAt,
        creditDeducted: a.creditDeducted,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 출석 상세 조회
   */
  async getAttendanceDetail(
    attendanceId: string,
    requesterId?: string,
    requesterType?: string,
  ) {
    const attendance = await this.prisma.classAttendance.findUnique({
      where: { id: attendanceId },
      select: {
        id: true,
        memberId: true,
        scheduleId: true,
        attendanceStatus: true,
        checkedInAt: true,
        creditDeducted: true,
        member: {
          select: {
            id: true,
            email: true,
          },
        },
        schedule: {
          select: {
            id: true,
            scheduledDate: true,
            class: {
              select: {
                id: true,
                className: true,
                teamId: true,
              },
            },
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException("출석 기록을 찾을 수 없습니다.");
    }

    // [2026-06-10 SECURITY] 소유권/클럽 스코프 검증 (IDOR 차단).
    //   본인 / 부모-자녀 / ADMIN·DIRECTOR / 해당 수업 팀의 owner·승인 코치만 조회 가능.
    //   기존: attendanceId 만으로 조회 → 타 회원 출석·이메일 열람 가능.
    if (requesterId) {
      const memberId = attendance.memberId;
      let authorized =
        requesterId === memberId ||
        requesterType === "ADMIN" ||
        requesterType === "DIRECTOR";
      if (!authorized) {
        const parentChild = await this.prisma.parentChild.findUnique({
          where: {
            parentId_childId: { parentId: requesterId, childId: memberId },
          },
          select: { id: true },
        });
        authorized = !!parentChild;
      }
      if (!authorized && attendance.schedule?.class?.teamId) {
        const teamId = attendance.schedule.class.teamId;
        const [owner, approvedCoach] = await Promise.all([
          this.prisma.team.findFirst({
            where: { id: teamId, coachId: requesterId },
            select: { id: true },
          }),
          this.prisma.teamMember.findFirst({
            where: {
              userId: requesterId,
              teamId,
              approvalStatus: "approved",
              leftAt: null,
              roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
            },
            select: { id: true },
          }),
        ]);
        authorized = !!owner || !!approvedCoach;
      }
      if (!authorized) {
        throw new ForbiddenException(
          "해당 출석 기록을 조회할 권한이 없습니다.",
        );
      }
    }

    return {
      id: attendance.id,
      memberId: attendance.memberId,
      memberEmail: attendance.member?.email,
      scheduleId: attendance.scheduleId,
      className: attendance.schedule?.class?.className,
      scheduledDate: attendance.schedule?.scheduledDate,
      attendanceStatus: attendance.attendanceStatus,
      checkedInAt: attendance.checkedInAt,
      creditDeducted: attendance.creditDeducted,
    };
  }

  /**
   * 출석 상태 수정
   */
  async updateAttendance(
    userId: string,
    attendanceId: string,
    updateDto: UpdateAttendanceDto,
  ) {
    const attendance = await this.prisma.classAttendance.findUnique({
      where: { id: attendanceId },
      include: {
        schedule: {
          select: {
            scheduledDate: true, // PR-D (v0.8): 학부모 알림 메시지에 사용
            class: {
              select: {
                id: true,
                className: true, // PR-D (v0.8): 학부모 알림 메시지에 사용
                teamId: true,
                academyId: true,
              },
            },
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException("출석 기록을 찾을 수 없습니다.");
    }

    // 권한 검증 — 팀 수업 / 학원 수업 / 둘 다 아닌 케이스(ADMIN·DIRECTOR fallback)
    // (PR-E C1 fix: 기존 teamId 분기만 있어 학원 수업 무단 수정 가능했음 — OWASP A01)
    const teamId = attendance.schedule?.class?.teamId;
    const academyId = attendance.schedule?.class?.academyId;
    let hasPermission = false;

    if (teamId) {
      // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 제거 — owner 또는 approved 멤버만.
      const [clubOwner, approvedMember] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: teamId, coachId: userId },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId,
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      hasPermission = !!clubOwner || !!approvedMember;
    } else if (academyId) {
      hasPermission = await this.checkAcademyManagerPermission(
        userId,
        academyId,
      );
    }

    if (!hasPermission) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      });
      hasPermission = !!user && ["ADMIN", "DIRECTOR"].includes(user.userType);
    }

    if (!hasPermission) {
      throw new ForbiddenException("출석 상태를 수정할 권한이 없습니다.");
    }

    // [Phase B-3] 후불 정산 확정 월의 출석 정정 차단 (청구-출석 불일치 방지).
    await this.assertMonthNotSettled(attendance.scheduleId);

    // 2026-05-12: 3-state 단순화. present ↔ absent 전환 시 수업권 자동 복원/차감.
    const wasPresent = attendance.attendanceStatus === "present";
    const willBePresent = updateDto.attendanceStatus === "present";
    const now = new Date();

    // PR-D Hotfix #3 (v1.0): 사유 의무 검증 폐기.
    // 사유는 선택 입력 — 프론트 바텀시트의 아코디언으로 펼침/접힘.
    // 길이 검증은 DTO 의 @MinLength/@MaxLength 가 처리 (입력 시에만 검증).
    // 분쟁 예방은 학부모 사후 알림 + AuditLog 영구 보존으로 충분.

    // PR-D: 출석 정정 FCM 푸시는 tx 커밋 후 발송(롤백 시 false 푸시 방지). tx 내부에서 페이로드만 채운다.
    let modificationPush: { parentIds: string[]; message: string } | null =
      null;
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.classAttendance.update({
        where: { id: attendanceId },
        data: {
          attendanceStatus: updateDto.attendanceStatus,
          modifiedBy: userId,
          modifiedAt: now,
          modifiedReason: updateDto.modifiedReason ?? null,
          checkedInAt: willBePresent
            ? (attendance.checkedInAt ?? now)
            : attendance.checkedInAt,
        },
      });

      // 수업권 복원 (present → absent) — PR-B: CreditDomainService 경유
      if (wasPresent && !willBePresent && attendance.creditDeducted) {
        const restored = await this.creditDomain.restoreOne(tx, {
          userId: attendance.memberId,
          classId: attendance.schedule!.class!.id,
          scheduleId: attendance.scheduleId,
          reason: `코치 수정 (${attendance.attendanceStatus}→${updateDto.attendanceStatus}) - 수업권 복원`,
          adjustedBy: userId,
        });
        if (restored) {
          await tx.classAttendance.update({
            where: { id: attendanceId },
            data: { creditDeducted: false },
          });
        }
      }

      // 수업권 차감 (absent → present) — PR-B: CreditDomainService 경유
      //   [Phase B-3] POSTPAID 수업은 차감 없음(사후 정산).
      if (
        !wasPresent &&
        willBePresent &&
        !attendance.creditDeducted &&
        !(await this.isPostpaidClass(attendance.schedule!.class!.id))
      ) {
        await this.creditDomain.deductOne(tx, {
          userId: attendance.memberId,
          classId: attendance.schedule!.class!.id,
          scheduleId: attendance.scheduleId,
          reason: `코치 수정 (${attendance.attendanceStatus}→${updateDto.attendanceStatus}) - 수업권 차감`,
          adjustedBy: userId,
          deductedVia: "coach_manual",
        });
        await tx.classAttendance.update({
          where: { id: attendanceId },
          data: { creditDeducted: true },
        });
      }

      // 코치 정정 (modify) — 수업권 변동 동반 시 학부모 사후 알림 + AuditLog notifiedParentId 채움
      const creditDelta =
        wasPresent && !willBePresent
          ? 1 // 복원
          : !wasPresent && willBePresent
            ? -1 // 차감
            : 0;

      // PR-D (v0.8): 수업권 변동 시 학부모 사후 알림 (트랜잭션 내부 — 인앱 알림만)
      let notifiedParentIds: string[] = [];
      if (creditDelta !== 0 && attendance.schedule?.class?.className) {
        // 잔여 회차 계산 (정정 전/후) — 학부모 메시지에 포함
        const currentCredits = await tx.memberCredit.aggregate({
          where: {
            userId: attendance.memberId,
            classId: attendance.schedule.class.id,
            expiresAt: { gte: now },
          },
          _sum: { totalSessions: true, usedSessions: true },
        });
        const creditsAfter =
          (currentCredits._sum.totalSessions ?? 0) -
          (currentCredits._sum.usedSessions ?? 0);
        const creditsBefore = creditsAfter - creditDelta; // 정정 전 잔여

        const mod = await this.notifyParentsOfModification(tx, {
          childUserId: attendance.memberId,
          className: attendance.schedule.class.className,
          attendanceDate: attendance.schedule.scheduledDate ?? now,
          fromStatus: attendance.attendanceStatus,
          toStatus: updateDto.attendanceStatus,
          reason: updateDto.modifiedReason ?? "",
          creditsBefore,
          creditsAfter,
        });
        notifiedParentIds = mod.parentIds;
        modificationPush = mod;
      }

      // AuditLog INSERT (PR-C v0.6 + PR-D v0.8)
      await this.auditLog.record(tx, {
        attendanceId,
        scheduleId: attendance.scheduleId,
        memberId: attendance.memberId,
        actorUserId: userId,
        actionType: "modify",
        fromStatus: attendance.attendanceStatus,
        toStatus: updateDto.attendanceStatus,
        creditDelta,
        reason: updateDto.modifiedReason ?? null,
        notifiedParentId: notifiedParentIds[0] ?? null,
        notifiedAt: notifiedParentIds.length > 0 ? now : null,
      });

      return updated;
    });

    // 트랜잭션 커밋 후 FCM 푸시 — 롤백 시 발송 안 됨(레이스 제거). 인앱 알림은 tx 내부에서 원자 적재됨.
    // modificationPush 는 tx 콜백(클로저) 내부에서 채워져 TS 흐름분석이 null 로 좁히므로 명시 단언으로 받는다.
    const modPush = modificationPush as {
      parentIds: string[];
      message: string;
    } | null;
    if (modPush && modPush.parentIds.length > 0) {
      void this.notifications.pushOnlyToUsers(modPush.parentIds, {
        notificationType: "attendance_modified",
        title: "자녀 출석 정정 안내",
        message: modPush.message,
        linkUrl: `/attendance-history`,
      });
    }

    // dashboard 캐시 무효화 — 학부모/자녀 화면 즉시 반영
    await this.invalidateDashboardCacheForMember(attendance.memberId);

    return {
      id: result.id,
      attendanceStatus: result.attendanceStatus,
      modifiedAt: result.modifiedAt,
      modifiedBy: result.modifiedBy,
      modifiedReason: result.modifiedReason,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * 클럽 출석 통계
   */
  async getClubAttendanceStats(
    userId: string,
    teamId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // 권한 확인
    const club = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        coachId: userId,
      },
    });

    if (!club) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      });
      if (user?.userType !== "ADMIN") {
        throw new ForbiddenException("클럽 통계를 조회할 권한이 없습니다.");
      }
    }

    // 날짜 필터 조건
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    // 클럽의 모든 수업 조회 (통계 계산에 필요한 필드만 select)
    const classes = await this.prisma.class.findMany({
      where: { teamId },
      select: {
        id: true,
        className: true,
        schedules: {
          where: {
            isCancelled: false,
            ...(Object.keys(dateFilter).length > 0 && {
              scheduledDate: dateFilter,
            }),
          },
          select: {
            id: true,
            attendances: {
              select: { attendanceStatus: true },
            },
          },
        },
      },
    });

    let totalSessions = 0;
    let totalAttendances = 0;
    let presentCount = 0;
    let absentCount = 0;

    const byClass = classes.map((cls) => {
      let classSessions = 0;
      let classPresent = 0;
      let classTotal = 0;

      cls.schedules.forEach((schedule) => {
        classSessions++;
        totalSessions++;
        schedule.attendances.forEach((a) => {
          totalAttendances++;
          classTotal++;
          switch (a.attendanceStatus) {
            case "present":
              presentCount++;
              classPresent++;
              break;
            case "absent":
              absentCount++;
              break;
          }
        });
      });

      return {
        classId: cls.id,
        className: cls.className,
        sessions: classSessions,
        presentRate:
          classTotal > 0 ? ((classPresent / classTotal) * 100).toFixed(1) : "0",
      };
    });

    return {
      teamId,
      totalSessions,
      totalAttendances,
      presentCount,
      absentCount,
      presentRate:
        totalAttendances > 0
          ? ((presentCount / totalAttendances) * 100).toFixed(1)
          : "0",
      byClass,
    };
  }

  /**
   * 관리자 전체 출석 통계 (기간별 집계)
   * 클럽 제한 없이 전체 또는 특정 클럽의 출석 통계를 집계
   */
  async getAdminAttendanceStatistics(params: {
    teamId?: string;
    classId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { teamId, classId, startDate, endDate } = params;

    const dateFilter: import("@prisma/client").Prisma.ClassScheduleWhereInput =
      {};

    if (startDate || endDate) {
      dateFilter.scheduledDate = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    // 클럽/수업 필터를 포함한 수업 조회
    const classes = await this.prisma.class.findMany({
      where: {
        ...(teamId ? { teamId } : {}),
        ...(classId ? { id: classId } : {}),
      },
      include: {
        team: {
          select: { id: true, name: true },
        },
        schedules: {
          where: {
            isCancelled: false,
            ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
          },
          select: {
            id: true,
            scheduledDate: true,
            attendances: {
              select: { attendanceStatus: true, checkedInAt: true },
            },
          },
        },
      },
    });

    // 전체 합산 집계 (3-state)
    let totalSessions = 0;
    let totalAttendances = 0;
    let presentCount = 0;
    let absentCount = 0;

    // 클럽별 통계
    const clubMap = new Map<
      string,
      {
        teamId: string;
        name: string;
        sessions: number;
        present: number;
        total: number;
      }
    >();

    // 날짜별 통계 (일별 추이, 3-state)
    const dailyMap = new Map<
      string,
      {
        present: number;
        absent: number;
        total: number;
      }
    >();

    // 수업별 통계
    const classMap = new Map<
      string,
      {
        classId: string;
        className: string;
        sessions: number;
        present: number;
        total: number;
      }
    >();

    for (const cls of classes) {
      for (const schedule of cls.schedules) {
        totalSessions++;

        const dateKey = schedule.scheduledDate.toISOString().split("T")[0];
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            present: 0,
            absent: 0,
            total: 0,
          });
        }
        const dailyStat = dailyMap.get(dateKey)!;

        const clubKey = cls.teamId ?? "no-club";
        if (!clubMap.has(clubKey) && cls.team) {
          clubMap.set(clubKey, {
            teamId: cls.team.id,
            name: cls.team.name,
            sessions: 0,
            present: 0,
            total: 0,
          });
        }
        const clubStat = clubMap.get(clubKey);
        if (clubStat) clubStat.sessions++;

        // 수업별 집계
        if (!classMap.has(cls.id)) {
          classMap.set(cls.id, {
            classId: cls.id,
            className: cls.className,
            sessions: 0,
            present: 0,
            total: 0,
          });
        }
        const classStat = classMap.get(cls.id)!;
        classStat.sessions++;

        for (const a of schedule.attendances) {
          totalAttendances++;
          dailyStat.total++;
          if (clubStat) clubStat.total++;
          classStat.total++;

          switch (a.attendanceStatus) {
            case "present":
              presentCount++;
              if (clubStat) clubStat.present++;
              dailyStat.present++;
              classStat.present++;
              break;
            case "absent":
              absentCount++;
              dailyStat.absent++;
              break;
          }
        }
      }
    }

    const byClub = Array.from(clubMap.values()).map((c) => ({
      teamId: c.teamId,
      name: c.name,
      sessions: c.sessions,
      totalAttendances: c.total,
      presentRate: c.total > 0 ? ((c.present / c.total) * 100).toFixed(1) : "0",
    }));

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stat]) => ({ date, ...stat }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // dailyStats: 요청된 형식에 맞춰 date, count, rate 포함 (3-state)
    const dailyStats = dailyTrend.map((d) => ({
      date: d.date,
      count: d.total,
      rate: d.total > 0 ? ((d.present / d.total) * 100).toFixed(1) : "0",
      present: d.present,
      absent: d.absent,
    }));

    // 수업별 통계
    const classStats = Array.from(classMap.values()).map((c) => ({
      classId: c.classId,
      className: c.className,
      rate: c.total > 0 ? ((c.present / c.total) * 100).toFixed(1) : "0",
      sessions: c.sessions,
      totalAttendances: c.total,
    }));

    const attendanceRate =
      totalAttendances > 0
        ? ((presentCount / totalAttendances) * 100).toFixed(1)
        : "0";

    return {
      period: {
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      totalAttendances,
      attendanceRate,
      summary: {
        totalSessions,
        totalAttendances,
        presentCount,
        absentCount,
        presentRate: attendanceRate,
      },
      dailyStats,
      classStats,
      byClub,
      dailyTrend,
    };
  }

  /**
   * QR 코드 생성 (코치/감독/관리자 전용, 5분 유효)
   *
   * - 해당 수업 클럽의 코치이거나, ADMIN/DIRECTOR 역할이면 생성 가능
   * - 기존 미만료 QR이 있으면 재사용하지 않고 새로 발급 (보안)
   */
  async generateQr(scheduleId: string, userId: string) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: {
          select: {
            id: true,
            className: true,
            team: { select: { id: true, coachId: true } },
            academyId: true,
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    if (schedule.isCancelled) {
      throw new BadRequestException("취소된 일정입니다.");
    }

    // 권한: 팀 수업 — Club.coachId 본인 · CoachProfile 소속 코치
    //       학원 수업 — Academy.directorId 본인 · AcademyCoach 활성 코치
    //       공통 fallback — ADMIN/DIRECTOR
    // (PR-E H1 fix: 학원 수업에서 학원 감독/코치 권한 누락되어 QR 생성 불가했던 결함 해소)
    const teamId = schedule.class.team?.id;
    const academyId = schedule.class.academyId;
    let hasPermission = false;

    if (teamId) {
      hasPermission = schedule.class.team?.coachId === userId;
      if (!hasPermission) {
        // [보안 수정 2026-05-21] CoachProfile → approved TeamMember 로 교체.
        const approvedMember = await this.prisma.teamMember.findFirst({
          where: {
            userId,
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        });
        hasPermission = !!approvedMember;
      }
    } else if (academyId) {
      hasPermission = await this.checkAcademyManagerPermission(
        userId,
        academyId,
      );
    }

    if (!hasPermission) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      });
      hasPermission = !!user && ["ADMIN", "DIRECTOR"].includes(user.userType);
    }

    if (!hasPermission) {
      throw new ForbiddenException(
        "해당 수업의 코치 또는 관리자만 QR 코드를 생성할 수 있습니다.",
      );
    }

    const qrData = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 유효

    const qr = await this.prisma.attendanceQR.create({
      data: {
        scheduleId,
        generatedBy: userId,
        qrData,
        expiresAt,
      },
    });

    this.logger.log(
      `[QR Generate] user=${userId}, schedule=${scheduleId}, ` +
        `class=${schedule.class.className}, expires=${expiresAt.toISOString()}`,
    );

    return {
      qrData: qr.qrData,
      scheduleId: qr.scheduleId,
      className: schedule.class.className,
      expiresAt: qr.expiresAt,
      generatedAt: qr.generatedAt,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // 2026-04-27 (Phase 2 · D-A/B/C/D/E + N-9): 학부모/코치 출석 통합
  // ────────────────────────────────────────────────────────────────────

  /**
   * 시간 윈도우 검증: 수업 시작 −60min ~ 종료시각(endTime). endTime 미존재 시 시작 +120min 폴백.
   * 규칙은 `@/common/utils/schedule-time.util` 의 computeAttendanceWindow 단일 SoT —
   * 프론트 노출(`teamplus-web/src/lib/attendance-window.ts`)과 동일.
   */
  private validateTimeWindow(
    scheduledDate: Date,
    startTime?: string | null,
    endTime?: string | null,
  ): void {
    const { state } = computeAttendanceWindow(
      scheduledDate,
      startTime,
      endTime,
      Date.now(),
    );
    if (state === "before") {
      throw new BadRequestException(
        "아직 출석 체크 시간이 아닙니다. 수업 시작 1시간 전부터 가능합니다.",
      );
    }
    if (state === "closed") {
      throw new BadRequestException("출석 체크 가능 시간이 종료되었습니다.");
    }
  }

  /**
   * 학부모가 자녀를 대신 출석 체크 (Phase 2 · D-A~E).
   * QR 없이 scheduleId + childId 만으로 호출. checkedInVia='parent_button'.
   */
  async parentCheckIn(parentId: string, scheduleId: string, childId: string) {
    // 1) 일정 + 수업 조회
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        scheduledDate: true,
        startTime: true,
        endTime: true,
        isCancelled: true,
        class: {
          select: {
            id: true,
            className: true,
            teamId: true,
            academyId: true,
            endTime: true,
          }, // P1-5 (v0.5)
        },
      },
    });
    if (!schedule) {
      throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
    }
    if (schedule.isCancelled) {
      throw new BadRequestException("취소된 수업 일정입니다.");
    }

    // 2) 시간 윈도우 검증 (D-A)
    this.validateTimeWindow(
      schedule.scheduledDate,
      schedule.startTime,
      resolveScheduleEndTime(schedule.endTime, schedule.class.endTime),
    );

    // 3) 학부모-자녀 관계 검증
    const parentChild = await this.prisma.parentChild.findUnique({
      where: { parentId_childId: { parentId, childId } },
      select: { id: true },
    });
    if (!parentChild) {
      throw new ForbiddenException(
        "해당 자녀의 보호자가 아니므로 대리 출석이 불가합니다.",
      );
    }

    const classId = schedule.class.id;
    const teamId = schedule.class.teamId;

    // 4) Club 수업이면 ClubMember 가입 자격 보조 검증 (N-10)
    // roleInTeam: PLAYER 명시 — 자녀(선수)만 출석 가능, 학부모 오인 방지
    if (teamId) {
      const clubMember = await this.prisma.teamMember.findFirst({
        where: {
          userId: childId,
          teamId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { id: true },
      });
      if (!clubMember) {
        throw new BadRequestException(
          "자녀가 해당 팀의 승인된 회원이 아닙니다.",
        );
      }
    }

    // 5) 수업 등록 자격 검증 (User × Class 단위)
    const registration = await this.prisma.classRegistration.findFirst({
      where: { classId, userId: childId, status: "active" },
      select: { id: true },
    });
    if (!registration) {
      throw new ForbiddenException(
        "자녀가 해당 수업에 수강 등록되어 있지 않습니다.",
      );
    }

    // 6) 중복 출석 확인 + 결석 잠금 (2026-05-12 회의록 정합 — 옵션 D)
    //    · present: 이미 처리됨 → 차단
    //    · absent:  코치가 명시적으로 결석 처리한 상태 → 학부모 덮어쓰기 차단
    //    · unchecked: 학부모 재시도 허용 (코치 "처리 취소"의 의도)
    const existingAttendance = await this.prisma.classAttendance.findUnique({
      where: { scheduleId_memberId: { scheduleId, memberId: childId } },
    });
    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "present"
    ) {
      throw new BadRequestException("이미 출석 체크되었습니다.");
    }
    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "absent"
    ) {
      throw new ForbiddenException(
        "코치가 결석 처리한 일정입니다. 정정이 필요하면 코치에게 문의해주세요.",
      );
    }

    // 7) 수업권 잔량 확인 (D-D — 부족 시 차단, 충전 CTA 미노출)
    //   [Phase B-3] POSTPAID(후불) 수업은 선결제·게이트 없음 — 출석만 기록(사후 정산).
    const now = new Date();
    const isPostpaidClass = await this.isPostpaidClass(classId);
    if (!isPostpaidClass) {
      const credits = await this.prisma.memberCredit.findMany({
        where: { userId: childId, classId, expiresAt: { gte: now } },
        orderBy: { expiresAt: "asc" },
      });
      const availableCredit = credits.find(
        (c) => c.usedSessions < c.totalSessions,
      );
      if (!availableCredit) {
        throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
      }
    }

    // 8) 트랜잭션: 출석 + 수업권 차감 + 이력
    const result = await this.prisma.$transaction(async (tx) => {
      const attendance = await tx.classAttendance.upsert({
        where: { scheduleId_memberId: { scheduleId, memberId: childId } },
        update: {
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "parent_button",
          checkedInBy: parentId,
        },
        create: {
          scheduleId,
          memberId: childId,
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "parent_button",
          checkedInBy: parentId,
        },
      });

      //   [Phase B-3] POSTPAID 수업은 차감 없음(사후 정산).
      const shouldDeduct =
        !isPostpaidClass &&
        (!existingAttendance || !existingAttendance.creditDeducted);
      if (shouldDeduct) {
        await this.creditDomain.deductOne(tx, {
          userId: childId,
          classId,
          scheduleId,
          reason: `학부모 출석 체크 - ${schedule.class.className}`,
          deductedVia: "parent_button",
        });
        await tx.classAttendance.update({
          where: { id: attendance.id },
          data: { creditDeducted: true },
        });
      }

      // AuditLog INSERT (PR-C v0.6)
      await this.auditLog.record(tx, {
        attendanceId: attendance.id,
        scheduleId,
        memberId: childId,
        actorUserId: parentId,
        actionType: "check_in",
        fromStatus: existingAttendance?.attendanceStatus ?? null,
        toStatus: "present",
        creditDelta: shouldDeduct ? -1 : 0,
      });

      return { attendance, deducted: shouldDeduct };
    });

    // 9) 잔여 회차 조회 (응답용)
    const after = await this.prisma.memberCredit.findMany({
      where: { userId: childId, classId, expiresAt: { gte: now } },
      select: { totalSessions: true, usedSessions: true },
    });
    const remainingSessions = after.reduce(
      (sum, c) => sum + Math.max(0, c.totalSessions - c.usedSessions),
      0,
    );

    this.logger.log(
      `[ParentCheckIn] parentId=${parentId} → childId=${childId} schedule=${scheduleId} deducted=${result.deducted}`,
    );

    // dashboard 캐시 무효화 — 학부모 화면 즉시 반영
    await this.invalidateDashboardCacheForMember(childId);

    return {
      id: result.attendance.id,
      scheduleId,
      childId,
      className: schedule.class.className,
      attendanceStatus: "present" as const,
      checkedInAt: now,
      checkedInVia: "parent_button" as const,
      creditDeducted: result.deducted,
      remainingSessions,
    };
  }

  /**
   * 학생 본인 출석 체크 (Phase 2 · D-1=B — 2026-04-28).
   * QR 없이 scheduleId 만으로 본인 출석 처리. checkedInVia='self_button'.
   * 학부모 parentCheckIn 과 동일한 검증/트랜잭션 패턴 (ParentChild 관계 검증만 제외).
   */
  async selfCheckIn(studentId: string, scheduleId: string) {
    // 1) 일정 + 수업 조회
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        scheduledDate: true,
        startTime: true,
        endTime: true,
        isCancelled: true,
        class: {
          select: {
            id: true,
            className: true,
            teamId: true,
            academyId: true,
            endTime: true,
          }, // P1-5 (v0.5)
        },
      },
    });
    if (!schedule) {
      throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
    }
    if (schedule.isCancelled) {
      throw new BadRequestException("취소된 수업 일정입니다.");
    }

    // 2) 시간 윈도우 검증 (D-A · 학부모와 동일)
    this.validateTimeWindow(
      schedule.scheduledDate,
      schedule.startTime,
      resolveScheduleEndTime(schedule.endTime, schedule.class.endTime),
    );

    const classId = schedule.class.id;
    const teamId = schedule.class.teamId;

    // 3) Club 수업이면 ClubMember 가입 자격 보조 검증 (N-10)
    // roleInTeam: PLAYER 명시 — 학생(선수)만 출석 가능, PARENT 오인 방지
    if (teamId) {
      const clubMember = await this.prisma.teamMember.findFirst({
        where: {
          userId: studentId,
          teamId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { id: true },
      });
      if (!clubMember) {
        throw new BadRequestException("해당 팀의 승인된 회원이 아닙니다.");
      }
    }

    // 4) 수업 등록 자격 검증 (User × Class 단위)
    const registration = await this.prisma.classRegistration.findFirst({
      where: { classId, userId: studentId, status: "active" },
      select: { id: true },
    });
    if (!registration) {
      throw new ForbiddenException("해당 수업에 수강 등록되어 있지 않습니다.");
    }

    // 5) 중복 출석 확인 + 결석 잠금 (2026-05-12 회의록 정합 — 옵션 D)
    const existingAttendance = await this.prisma.classAttendance.findUnique({
      where: { scheduleId_memberId: { scheduleId, memberId: studentId } },
    });
    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "present"
    ) {
      throw new BadRequestException("이미 출석 체크되었습니다.");
    }
    if (
      existingAttendance &&
      existingAttendance.attendanceStatus === "absent"
    ) {
      throw new ForbiddenException(
        "코치가 결석 처리한 일정입니다. 정정이 필요하면 코치에게 문의해주세요.",
      );
    }

    // 6) 수업권 잔량 확인 (D-D — 부족 시 차단)
    //   [Phase B-3] POSTPAID(후불) 수업은 선결제·게이트 없음 — 출석만 기록(사후 정산).
    const now = new Date();
    const isPostpaidClass = await this.isPostpaidClass(classId);
    if (!isPostpaidClass) {
      const credits = await this.prisma.memberCredit.findMany({
        where: { userId: studentId, classId, expiresAt: { gte: now } },
        orderBy: { expiresAt: "asc" },
      });
      const availableCredit = credits.find(
        (c) => c.usedSessions < c.totalSessions,
      );
      if (!availableCredit) {
        throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
      }
    }

    // 7) 트랜잭션: 출석 + 수업권 차감 + 이력
    const result = await this.prisma.$transaction(async (tx) => {
      const attendance = await tx.classAttendance.upsert({
        where: { scheduleId_memberId: { scheduleId, memberId: studentId } },
        update: {
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "self_button",
          checkedInBy: studentId,
        },
        create: {
          scheduleId,
          memberId: studentId,
          attendanceStatus: "present",
          checkedInAt: now,
          checkedInVia: "self_button",
          checkedInBy: studentId,
        },
      });

      //   [Phase B-3] POSTPAID 수업은 차감 없음(사후 정산).
      const shouldDeduct =
        !isPostpaidClass &&
        (!existingAttendance || !existingAttendance.creditDeducted);
      if (shouldDeduct) {
        await this.creditDomain.deductOne(tx, {
          userId: studentId,
          classId,
          scheduleId,
          reason: `학생 본인 출석 체크 - ${schedule.class.className}`,
          deductedVia: "self_button",
        });
        await tx.classAttendance.update({
          where: { id: attendance.id },
          data: { creditDeducted: true },
        });
      }

      // AuditLog INSERT (PR-C v0.6)
      await this.auditLog.record(tx, {
        attendanceId: attendance.id,
        scheduleId,
        memberId: studentId,
        actorUserId: studentId,
        actionType: "check_in",
        fromStatus: existingAttendance?.attendanceStatus ?? null,
        toStatus: "present",
        creditDelta: shouldDeduct ? -1 : 0,
      });

      return { attendance, deducted: shouldDeduct };
    });

    // 8) 잔여 회차 조회 (응답용)
    const after = await this.prisma.memberCredit.findMany({
      where: { userId: studentId, classId, expiresAt: { gte: now } },
      select: { totalSessions: true, usedSessions: true },
    });
    const remainingSessions = after.reduce(
      (sum, c) => sum + Math.max(0, c.totalSessions - c.usedSessions),
      0,
    );

    this.logger.log(
      `[SelfCheckIn] studentId=${studentId} schedule=${scheduleId} deducted=${result.deducted}`,
    );

    return {
      id: result.attendance.id,
      scheduleId,
      studentId,
      className: schedule.class.className,
      attendanceStatus: "present" as const,
      checkedInAt: now,
      checkedInVia: "self_button" as const,
      creditDeducted: result.deducted,
      remainingSessions,
    };
  }

  /**
   * 감독/코치가 일괄 출석 체크 (Phase 2 · N-4).
   * 부분 성공 허용 — 각 회원별 결과를 results 배열로 반환.
   */
  async coachCheckIn(
    coachUserId: string,
    scheduleId: string,
    memberIds: string[],
  ) {
    // 1) 일정 + 수업 조회
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        scheduledDate: true,
        isCancelled: true,
        class: {
          select: { id: true, className: true, teamId: true, academyId: true },
        }, // P1-5 (v0.5)
      },
    });
    if (!schedule) {
      throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
    }
    if (schedule.isCancelled) {
      throw new BadRequestException("취소된 수업 일정입니다.");
    }

    // 2) 코치 권한 검증 (Club.coachId / CoachProfile / ADMIN/DIRECTOR)
    const teamId = schedule.class.teamId;
    let hasPermission = false;
    if (teamId) {
      // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 제거 — owner 또는 approved 멤버만.
      const [clubOwner, approvedMember] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: teamId, coachId: coachUserId },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: coachUserId,
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      hasPermission = !!clubOwner || !!approvedMember;
    }
    if (!hasPermission) {
      const user = await this.prisma.user.findUnique({
        where: { id: coachUserId },
        select: { userType: true },
      });
      hasPermission = !!user && ["ADMIN", "DIRECTOR"].includes(user.userType);
    }
    if (!hasPermission) {
      throw new ForbiddenException("이 수업의 출석을 체크할 권한이 없습니다.");
    }

    const classId = schedule.class.id;
    const now = new Date();
    // [Phase B-3] POSTPAID(후불) 수업은 선결제·차감 없음 — 출석만 기록(사후 정산).
    const isPostpaidClass = await this.isPostpaidClass(classId);

    type CoachResult = {
      memberId: string;
      status:
        | "checked_in"
        | "already_checked_in"
        | "no_registration"
        | "credit_insufficient";
      attendanceId?: string;
      creditDeducted?: boolean;
    };
    const results: CoachResult[] = [];

    for (const memberId of memberIds) {
      try {
        // 등록 자격 검증
        const registration = await this.prisma.classRegistration.findFirst({
          where: { classId, userId: memberId, status: "active" },
          select: { id: true },
        });
        if (!registration) {
          results.push({ memberId, status: "no_registration" });
          continue;
        }

        // 중복 출석
        const existing = await this.prisma.classAttendance.findUnique({
          where: { scheduleId_memberId: { scheduleId, memberId } },
        });
        if (existing && existing.attendanceStatus === "present") {
          results.push({
            memberId,
            status: "already_checked_in",
            attendanceId: existing.id,
          });
          continue;
        }

        // 수업권 잔량 (후불 수업은 게이트 없음 — 사후 정산)
        if (!isPostpaidClass) {
          const credits = await this.prisma.memberCredit.findMany({
            where: { userId: memberId, classId, expiresAt: { gte: now } },
            orderBy: { expiresAt: "asc" },
          });
          const avail = credits.find((c) => c.usedSessions < c.totalSessions);
          if (!avail) {
            results.push({ memberId, status: "credit_insufficient" });
            continue;
          }
        }

        // 트랜잭션 (개별 처리 — 한 명 실패가 다른 명 차단 안 함, N-4)
        const tr = await this.prisma.$transaction(async (tx) => {
          const att = await tx.classAttendance.upsert({
            where: { scheduleId_memberId: { scheduleId, memberId } },
            update: {
              attendanceStatus: "present",
              checkedInAt: now,
              checkedInVia: "coach_manual",
              checkedInBy: coachUserId,
            },
            create: {
              scheduleId,
              memberId,
              attendanceStatus: "present",
              checkedInAt: now,
              checkedInVia: "coach_manual",
              checkedInBy: coachUserId,
            },
          });
          //   [Phase B-3] POSTPAID 수업은 차감 없음(사후 정산).
          const shouldDeduct =
            !isPostpaidClass && (!existing || !existing.creditDeducted);
          if (shouldDeduct) {
            // PR-B: CreditDomainService 경유 — race 시 BadRequestException throw → catch 에서 처리
            await this.creditDomain.deductOne(tx, {
              userId: memberId,
              classId,
              scheduleId,
              reason: `코치 출석 체크 - ${schedule.class.className}`,
              deductedVia: "coach_manual",
            });
            await tx.classAttendance.update({
              where: { id: att.id },
              data: { creditDeducted: true },
            });
          }
          // AuditLog INSERT (PR-C v0.6)
          await this.auditLog.record(tx, {
            attendanceId: att.id,
            scheduleId,
            memberId,
            actorUserId: coachUserId,
            actionType: "check_in",
            fromStatus: existing?.attendanceStatus ?? null,
            toStatus: "present",
            creditDelta: shouldDeduct ? -1 : 0,
          });
          return { attendanceId: att.id, deducted: shouldDeduct };
        });

        results.push({
          memberId,
          status: "checked_in",
          attendanceId: tr.attendanceId,
          creditDeducted: tr.deducted,
        });
      } catch (err) {
        // race condition / 잔량 부족 / 알 수 없는 에러 — 부분 실패로 처리 (다른 학생은 영향 X)
        const msg = err instanceof Error ? err.message : String(err);
        const isCreditFail =
          msg.includes("결제가 필요합니다") || msg.includes("소진되었습니다");
        if (!isCreditFail) {
          this.logger.warn(
            `[CoachCheckIn] memberId=${memberId} 처리 실패: ${msg}`,
          );
        }
        results.push({ memberId, status: "credit_insufficient" });
      }
    }

    const checkedInCount = results.filter(
      (r) => r.status === "checked_in",
    ).length;
    const alreadyCheckedInCount = results.filter(
      (r) => r.status === "already_checked_in",
    ).length;
    const failedCount = results.length - checkedInCount - alreadyCheckedInCount;

    this.logger.log(
      `[CoachCheckIn] coach=${coachUserId} schedule=${scheduleId} ` +
        `checked=${checkedInCount} already=${alreadyCheckedInCount} failed=${failedCount}`,
    );

    return {
      scheduleId,
      results,
      checkedInCount,
      alreadyCheckedInCount,
      failedCount,
    };
  }

  /**
   * 2026-04-28 (Phase B): 코치/감독/관리자 권한 검증 (단일 클럽 기준).
   * - Club.coachId 본인 OR 해당 클럽 CoachProfile 소속 OR ADMIN/DIRECTOR
   * - updateAttendance · checkInAttendance 의 권한 패턴을 재사용 가능한 헬퍼로 추출.
   */
  private async assertClubManagerOrThrow(
    userId: string,
    teamId: string,
    classId?: string,
  ) {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 제거 — owner 또는 approved 멤버만.
    const [clubOwner, approvedMember] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: userId },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);
    if (clubOwner || approvedMember) return;

    // 2026-05-12: ClassCoachAssignment 다중 코치 권한 검사 (LEAD/ASSISTANT 모두 통과).
    // classId 가 전달되면 폼 등록 시 ACCEPTED 된 배정자도 권한 인정.
    if (classId) {
      const assignment = await this.prisma.classCoachAssignment.findFirst({
        where: { classId, coachUserId: userId, status: "ACCEPTED" },
        select: { id: true },
      });
      if (assignment) return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    if (
      user &&
      ["ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR"].includes(user.userType)
    )
      return;

    throw new ForbiddenException("해당 클럽의 출석 관리 권한이 없습니다.");
  }

  /**
   * 2026-04-28 (Phase B · /attendance-manage 페이지용):
   * 코치 본인이 담당하는 오늘의 schedule + 등록 학생 + 출석 현황을 한 번에 조회.
   *
   * 응답 schedule[].students 의 attendanceStatus 가 'unchecked' 면 아직 출석 레코드 없음.
   */
  async getCoachTodaySchedules(coachUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: coachUserId },
      select: { id: true, userType: true },
    });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");

    const isPrivileged = ["ADMIN", "DIRECTOR"].includes(user.userType);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 권한 클럽·학원 ID 집합 — ADMIN/DIRECTOR 는 전체, 코치/학원감독은 본인 소속/소유만
    // PR-E2 (2026-05-15): 학원 컨텍스트 호환 — 학원 감독·코치도 본인 학원 수업 일정 조회 가능
    let allowedTeamIds: string[] | null = null;
    let allowedAcademyIds: string[] | null = null;
    if (!isPrivileged) {
      const [ownedClubs, coachProfiles, directedAcademies, academyCoaches] =
        await Promise.all([
          this.prisma.team.findMany({
            where: { coachId: coachUserId },
            select: { id: true },
          }),
          this.prisma.coachProfile.findMany({
            where: { userId: coachUserId },
            select: { teamId: true },
          }),
          this.prisma.academy.findMany({
            where: { directorId: coachUserId },
            select: { id: true },
          }),
          this.prisma.academyCoach.findMany({
            where: { userId: coachUserId, isActive: true },
            select: { academyId: true },
          }),
        ]);
      const teamSet = new Set<string>([
        ...ownedClubs.map((c) => c.id),
        ...coachProfiles.map((p) => p.teamId).filter((v): v is string => !!v),
      ]);
      const academySet = new Set<string>([
        ...directedAcademies.map((a) => a.id),
        ...academyCoaches.map((ac) => ac.academyId),
      ]);
      allowedTeamIds = Array.from(teamSet);
      allowedAcademyIds = Array.from(academySet);
      if (allowedTeamIds.length === 0 && allowedAcademyIds.length === 0) {
        return { schedules: [] };
      }
    }

    const classFilter = isPrivileged
      ? undefined
      : {
          class: {
            OR: [
              ...(allowedTeamIds && allowedTeamIds.length > 0
                ? [{ teamId: { in: allowedTeamIds } }]
                : []),
              ...(allowedAcademyIds && allowedAcademyIds.length > 0
                ? [{ academyId: { in: allowedAcademyIds } }]
                : []),
            ],
          },
        };

    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        scheduledDate: { gte: today, lt: tomorrow },
        isCancelled: false,
        ...(classFilter ?? {}),
      },
      select: {
        id: true,
        scheduledDate: true,
        class: {
          select: {
            id: true,
            className: true,
            startTime: true,
            endTime: true,
            // PR-D 후속 (v0.8): 출석 입력 명단에서 만료(inactive) 학생 제외
            // getScheduleRoster 와 동작 일치 — 수강생 명단(수업 관리 화면)에는 inactive 도 노출
            registrations: {
              where: { status: "active" },
              select: {
                userId: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        attendances: {
          select: {
            id: true,
            memberId: true,
            attendanceStatus: true,
            checkedInVia: true,
            checkedInAt: true,
            updatedAt: true, // 2026-04-28: 마지막 처리 시각 (Prisma @updatedAt 자동 갱신)
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return {
      schedules: schedules.map((s) => {
        const attByMember = new Map<string, (typeof s.attendances)[number]>();
        for (const a of s.attendances) {
          attByMember.set(a.memberId, a);
        }

        const startD = s.scheduledDate;
        const startHHMM = `${String(startD.getHours()).padStart(2, "0")}:${String(
          startD.getMinutes(),
        ).padStart(2, "0")}`;

        const students = s.class.registrations.map((r) => {
          const att = attByMember.get(r.userId);
          const memberName = r.user
            ? `${r.user.lastName}${r.user.firstName}`
            : "회원";
          return {
            attendanceId: att?.id ?? null,
            memberId: r.userId,
            memberName,
            attendanceStatus: (att?.attendanceStatus ?? "unchecked") as
              | "present"
              | "absent"
              | "unchecked",
            checkedInVia: (att?.checkedInVia ?? null) as
              | "qr_scan"
              | "parent_button"
              | "coach_manual"
              | null,
            checkedInAt: att?.checkedInAt
              ? att.checkedInAt.toISOString()
              : null,
            // 2026-05-12: 마지막 처리 시각 — present/absent 모든 상태에서 표시.
            // attendance 레코드가 없는(unchecked) 학생은 null.
            updatedAt: att?.updatedAt ? att.updatedAt.toISOString() : null,
          };
        });

        return {
          scheduleId: s.id,
          classId: s.class.id,
          className: s.class.className,
          scheduledDate: s.scheduledDate.toISOString(),
          startHHMM,
          students,
        };
      }),
    };
  }

  /**
   * 2026-05-12: 코치 수동 출석 마킹/취소 (3-state 단순화).
   *  - 기존 레코드 있음 → updateAttendance() 위임 (F-1 수업권 자동 복원/차감)
   *  - 없음 → 신규 생성. present 면 수업권 1회 차감 + creditTransaction 기록.
   *
   * 동시성: 신규 생성은 unique(scheduleId, memberId) 위반 시 updateAttendance 로 폴백.
   */
  async coachManualMark(
    coachUserId: string,
    scheduleId: string,
    memberId: string,
    attendanceStatus: "present" | "absent",
    modifiedReason?: string,
  ) {
    // PR-D Hotfix #3 (v1.0): 사유 의무 검증 폐기 — 사유는 선택 입력 (바텀시트 아코디언).

    // 1) schedule + class 정보 + 권한 검증
    //    PR-E2 (2026-05-15): 학원 컨텍스트 호환 — teamId 없으면 academyId 분기로 권한 확인
    //    PR-D (v0.8): className/scheduledDate select 추가 — 학부모 알림 메시지에 사용
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        scheduledDate: true,
        class: {
          select: {
            id: true,
            className: true,
            teamId: true,
            academyId: true,
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException("수업 일정을 찾을 수 없습니다.");

    const { teamId, academyId, id: classIdForAuth } = schedule.class;
    if (teamId) {
      await this.assertClubManagerOrThrow(coachUserId, teamId, classIdForAuth);
    } else if (academyId) {
      const ok = await this.checkAcademyManagerPermission(
        coachUserId,
        academyId,
      );
      if (!ok) {
        const user = await this.prisma.user.findUnique({
          where: { id: coachUserId },
          select: { userType: true },
        });
        if (!user || !["ADMIN", "DIRECTOR"].includes(user.userType)) {
          throw new ForbiddenException(
            "해당 학원의 출석 관리 권한이 없습니다.",
          );
        }
      }
    } else {
      throw new ForbiddenException(
        "클럽 또는 학원 정보가 없는 수업은 수정할 수 없습니다.",
      );
    }

    // 2) 등록 검증 — 미등록 학생을 코치가 강제 출석 처리하지 못하도록 차단
    // P1-2 (v0.5): inactive(미납/만료/환불) 학생도 차단하여 7개 진입점 일관성 보장
    const registration = await this.prisma.classRegistration.findUnique({
      where: {
        classId_userId: { classId: schedule.class.id, userId: memberId },
      },
      select: { id: true, status: true },
    });
    if (!registration) {
      throw new ForbiddenException(
        "해당 학생은 이 수업에 등록되어 있지 않습니다.",
      );
    }
    if (registration.status !== "active") {
      throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
    }

    // 3) 기존 레코드 조회
    const existing = await this.prisma.classAttendance.findUnique({
      where: { scheduleId_memberId: { scheduleId, memberId } },
      select: { id: true },
    });

    // 4) 있으면 updateAttendance 위임 (수업권 복원/차감 자동)
    if (existing) {
      // attendanceStatus 는 string union → AttendanceStatus enum 으로 좁힘.
      // (DTO 검증을 통과한 값이므로 안전.)
      const dto: UpdateAttendanceDto = {
        attendanceStatus:
          attendanceStatus as unknown as UpdateAttendanceDto["attendanceStatus"],
        modifiedReason,
      };
      const updated = await this.updateAttendance(
        coachUserId,
        existing.id,
        dto,
      );
      return {
        attendanceId: updated.id,
        attendanceStatus: updated.attendanceStatus,
        action: "updated" as const,
      };
    }

    // 5) 신규 생성 — present 면 수업권 차감 트랜잭션
    //   [Phase B-3] POSTPAID(후불) 수업은 선결제·차감 없음 — 출석만 기록(사후 정산).
    //   present 표기(checkedInAt)는 유지하되 수업권 조회/차감만 건너뛴다.
    const isPostpaidClass = await this.isPostpaidClass(schedule.class.id);
    const isPresent = attendanceStatus === "present";
    const willDeduct = isPresent && !isPostpaidClass;
    const now = new Date();

    // 출석 정정 FCM 푸시는 tx 커밋 후 발송(롤백 시 false 푸시 방지). tx 내부에서 페이로드만 채운다.
    let modificationPush: { parentIds: string[]; message: string } | null =
      null;
    const result = await this.prisma.$transaction(async (tx) => {
      // 5-1) 차감 대상 수업권 조회 (만료 안 된 것 중 잔량 > 0)
      let memberCredit: {
        id: string;
        totalSessions: number;
        usedSessions: number;
      } | null = null;
      if (willDeduct) {
        memberCredit = await tx.memberCredit.findFirst({
          where: {
            userId: memberId,
            classId: schedule.class.id,
            expiresAt: { gte: now },
          },
          orderBy: { expiresAt: "asc" },
          select: { id: true, totalSessions: true, usedSessions: true },
        });
        if (
          !memberCredit ||
          memberCredit.usedSessions >= memberCredit.totalSessions
        ) {
          throw new BadRequestException(
            "해당 학생은 이번 달 결제가 필요합니다.",
          );
        }
      }

      // 5-2) attendance 생성
      const created = await tx.classAttendance.create({
        data: {
          scheduleId,
          memberId,
          attendanceStatus,
          checkedInVia: "coach_manual",
          checkedInBy: coachUserId,
          checkedInAt: isPresent ? now : null,
          creditDeducted: willDeduct,
          modifiedBy: coachUserId,
          modifiedAt: now,
          modifiedReason: modifiedReason ?? null,
        },
        select: { id: true, attendanceStatus: true },
      });

      // 5-3) 수업권 차감 — PR-B: CreditDomainService 경유
      if (willDeduct && memberCredit) {
        await this.creditDomain.deductOne(tx, {
          userId: memberId,
          classId: schedule.class.id,
          scheduleId,
          reason: `코치 수동 출석 (${attendanceStatus}) - 수업권 차감`,
          adjustedBy: coachUserId,
          deductedVia: "coach_manual",
        });
      }

      // 5-4) 학부모 사후 알림 — PR-D (v0.8): 신규 present (수업권 차감 동반) 시
      let notifiedParentIds: string[] = [];
      if (willDeduct && schedule.class.className) {
        const currentCredits = await tx.memberCredit.aggregate({
          where: {
            userId: memberId,
            classId: schedule.class.id,
            expiresAt: { gte: now },
          },
          _sum: { totalSessions: true, usedSessions: true },
        });
        const creditsAfter =
          (currentCredits._sum.totalSessions ?? 0) -
          (currentCredits._sum.usedSessions ?? 0);
        const creditsBefore = creditsAfter + 1; // 정정 전 잔여 (1 차감됨)

        const mod = await this.notifyParentsOfModification(tx, {
          childUserId: memberId,
          className: schedule.class.className,
          attendanceDate: schedule.scheduledDate ?? now,
          fromStatus: null,
          toStatus: attendanceStatus,
          reason: modifiedReason ?? "",
          creditsBefore,
          creditsAfter,
        });
        notifiedParentIds = mod.parentIds;
        modificationPush = mod;
      }

      // 5-5) AuditLog INSERT (PR-C v0.6 + PR-D v0.8)
      await this.auditLog.record(tx, {
        attendanceId: created.id,
        scheduleId,
        memberId,
        actorUserId: coachUserId,
        actionType: "modify",
        fromStatus: null, // 신규 생성
        toStatus: attendanceStatus,
        creditDelta: willDeduct ? -1 : 0,
        reason: modifiedReason ?? null,
        notifiedParentId: notifiedParentIds[0] ?? null,
        notifiedAt: notifiedParentIds.length > 0 ? now : null,
      });

      return created;
    });

    // 트랜잭션 커밋 후 FCM 푸시 — 롤백 시 발송 안 됨(레이스 제거). 인앱 알림은 tx 내부에서 원자 적재됨.
    // modificationPush 는 tx 콜백(클로저) 내부에서 채워져 TS 흐름분석이 null 로 좁히므로 명시 단언으로 받는다.
    const modPush = modificationPush as {
      parentIds: string[];
      message: string;
    } | null;
    if (modPush && modPush.parentIds.length > 0) {
      void this.notifications.pushOnlyToUsers(modPush.parentIds, {
        notificationType: "attendance_modified",
        title: "자녀 출석 정정 안내",
        message: modPush.message,
        linkUrl: `/attendance-history`,
      });
    }

    this.logger.log(
      `[CoachManualMark] coach=${coachUserId} schedule=${scheduleId} ` +
        `member=${memberId} status=${attendanceStatus} action=created`,
    );

    // dashboard 캐시 무효화 — 학부모/자녀 화면 즉시 반영
    await this.invalidateDashboardCacheForMember(memberId);

    return {
      attendanceId: result.id,
      attendanceStatus: result.attendanceStatus,
      action: "created" as const,
    };
  }

  /**
   * 2026-04-28 (Phase B · 옵션 A): 코치 출석 처리 취소 (미체크 복귀).
   * - attendance 레코드 자체를 삭제 → '미체크' 상태(레코드 없음) 로 복귀
   * - creditDeducted=true 였으면 수업권 1회 복원 + creditTransaction 'restored' 기록
   * - 권한: COACH/DIRECTOR/ADMIN + 해당 클럽 소속/소유
   *
   * 사용 시나리오: 학생 도착 전 코치가 실수로 '출석' 처리한 경우 즉시 되돌리기.
   * (반대로 학부모/QR 자가 출석은 학부모 측에서 별도 취소 흐름이 있어 이 endpoint 와 무관)
   */
  async coachClearAttendance(coachUserId: string, attendanceId: string) {
    const attendance = await this.prisma.classAttendance.findUnique({
      where: { id: attendanceId },
      include: {
        schedule: {
          select: {
            id: true,
            class: { select: { id: true, teamId: true, academyId: true } },
          },
        },
      },
    });
    if (!attendance) {
      throw new NotFoundException("출석 기록을 찾을 수 없습니다.");
    }

    // PR-E2 (2026-05-15): 학원 컨텍스트 호환 — teamId 없으면 academyId 분기로 권한 확인
    const teamId = attendance.schedule?.class?.teamId;
    const academyId = attendance.schedule?.class?.academyId;
    const classId = attendance.schedule?.class?.id;
    if (teamId) {
      await this.assertClubManagerOrThrow(coachUserId, teamId, classId);
    } else if (academyId) {
      const ok = await this.checkAcademyManagerPermission(
        coachUserId,
        academyId,
      );
      if (!ok) {
        const user = await this.prisma.user.findUnique({
          where: { id: coachUserId },
          select: { userType: true },
        });
        if (!user || !["ADMIN", "DIRECTOR"].includes(user.userType)) {
          throw new ForbiddenException(
            "해당 학원의 출석 관리 권한이 없습니다.",
          );
        }
      }
    } else {
      throw new ForbiddenException(
        "클럽 또는 학원 정보가 없는 수업은 처리 취소할 수 없습니다.",
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 1) 수업권 복원 (차감되어 있던 경우만) — PR-B: CreditDomainService 경유
      if (attendance.creditDeducted) {
        await this.creditDomain.restoreOne(tx, {
          userId: attendance.memberId,
          classId: attendance.schedule!.class!.id,
          scheduleId: attendance.scheduleId,
          reason: `코치 처리 취소 (${attendance.attendanceStatus}→미체크) - 수업권 복원`,
          adjustedBy: coachUserId,
        });
      }

      // 2) attendance 레코드 삭제 → 미체크 상태(레코드 없음) 로 복귀
      await tx.classAttendance.delete({ where: { id: attendanceId } });

      // 3) AuditLog INSERT (PR-C v0.6) — clear 액션
      //    attendanceId 는 삭제됐지만 참조용으로 보존 (외래키 아닌 단순 컬럼)
      await this.auditLog.record(tx, {
        attendanceId,
        scheduleId: attendance.scheduleId,
        memberId: attendance.memberId,
        actorUserId: coachUserId,
        actionType: "clear",
        fromStatus: attendance.attendanceStatus,
        toStatus: "unchecked",
        creditDelta: attendance.creditDeducted ? 1 : 0,
      });
    });

    this.logger.log(
      `[CoachClearAttendance] coach=${coachUserId} attendanceId=${attendanceId} ` +
        `member=${attendance.memberId} schedule=${attendance.scheduleId} ` +
        `restoredCredit=${attendance.creditDeducted} at=${now.toISOString()}`,
    );

    // dashboard 캐시 무효화 — 학부모/자녀 화면 즉시 반영
    await this.invalidateDashboardCacheForMember(attendance.memberId);

    return {
      attendanceId,
      cleared: true as const,
      creditRestored: attendance.creditDeducted,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // 2026-05-12: 수업별 일정 출석 이력 (3단 섹션 + 페이징)
  // 회의록 결정 — /attendance-manage?classId=X 페이지 1차 데이터 소스.
  // ────────────────────────────────────────────────────────────────

  /**
   * 시점 윈도우 상수 — 회의록 22:31 (학부모 도착 직전 출석) 정합.
   */
  private readonly IN_PROGRESS_BEFORE_MS = 60 * 60_000; // start - 60min
  private readonly IN_PROGRESS_AFTER_MS = 120 * 60_000; // start + 120min

  /**
   * 수업별 일정 출석 이력 — 진행 중 / 완료(역순 페이징) / 예정 카운트.
   *
   * 응답:
   *   - classInfo: 수업 메타 (이름, 코치, 학생 수, 진행률)
   *   - stats: 평균 출석률, 누적 결석, 이월 예상액
   *   - inProgress: 진행 중 일정 (최대 3건, 페이징 X)
   *   - completed: 완료 일정 (cursor 기반 페이징, 최신순)
   *   - upcomingCount: 예정 일정 카운트 (lazy load 용)
   */
  async getClassScheduleHistory(
    classId: string,
    cursor: string | undefined,
    pageSize: number,
  ) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        className: true,
        instructorName: true,
        startTime: true,
        endTime: true,
        billingMode: true,
        registrations: {
          where: { status: "active" },
          select: { id: true },
        },
        _count: {
          select: { schedules: true },
        },
      },
    });

    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const now = new Date();
    const nowMs = now.getTime();
    const studentCount = cls.registrations.length;

    // 1) 전체 통계 집계 (출석 상태별 카운트)
    const statusCounts = await this.prisma.classAttendance.groupBy({
      by: ["attendanceStatus"],
      where: {
        schedule: { classId, isCancelled: false },
      },
      _count: { attendanceStatus: true },
    });
    const countMap = new Map(
      statusCounts.map((s) => [s.attendanceStatus, s._count.attendanceStatus]),
    );
    const presentTotal = countMap.get("present") ?? 0;
    const absentTotal = countMap.get("absent") ?? 0;
    const attendanceTotal = presentTotal + absentTotal;

    // 2) 완료된 일정 수 (now > scheduledDate + 120min)
    const completedDateThreshold = new Date(nowMs - this.IN_PROGRESS_AFTER_MS);
    const completedCount = await this.prisma.classSchedule.count({
      where: {
        classId,
        isCancelled: false,
        scheduledDate: { lt: completedDateThreshold },
      },
    });

    // 3) 진행 중 일정 (페이징 X, 최대 3건)
    const inProgressLower = new Date(nowMs - this.IN_PROGRESS_AFTER_MS);
    const inProgressUpper = new Date(nowMs + this.IN_PROGRESS_BEFORE_MS);
    const inProgressRaw = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        isCancelled: false,
        scheduledDate: {
          gte: inProgressLower,
          lte: inProgressUpper,
        },
      },
      orderBy: { scheduledDate: "asc" },
      take: 3,
      select: {
        id: true,
        scheduledDate: true,
        // 회차 시각 text("HH:mm") — 표시 시각 SoT.
        startTime: true,
        endTime: true,
        attendances: {
          select: { attendanceStatus: true },
        },
      },
    });

    // 4) 완료 일정 (cursor 페이징, 역순)
    const completedRaw = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        isCancelled: false,
        scheduledDate: {
          lt: cursor ? new Date(cursor) : completedDateThreshold,
        },
      },
      orderBy: { scheduledDate: "desc" },
      take: pageSize + 1, // hasMore 판정용 +1
      select: {
        id: true,
        scheduledDate: true,
        // 회차 시각 text("HH:mm") — 표시 시각 SoT.
        startTime: true,
        endTime: true,
        attendances: {
          select: { attendanceStatus: true },
        },
      },
    });
    const hasMore = completedRaw.length > pageSize;
    const completedItems = hasMore
      ? completedRaw.slice(0, pageSize)
      : completedRaw;
    const nextCursor = hasMore
      ? completedItems[completedItems.length - 1]!.scheduledDate.toISOString()
      : null;

    // 5) 예정 일정 카운트 (lazy load 용)
    const upcomingCount = await this.prisma.classSchedule.count({
      where: {
        classId,
        isCancelled: false,
        scheduledDate: { gt: inProgressUpper },
      },
    });

    // 6) 통계 계산
    const avgAttendanceRate =
      attendanceTotal > 0
        ? Math.round((presentTotal / attendanceTotal) * 100)
        : 0;

    // 7) 응답 매핑
    const mapItem = (s: {
      id: string;
      scheduledDate: Date;
      startTime: string | null;
      endTime: string | null;
      attendances: { attendanceStatus: string }[];
    }) => {
      const present = s.attendances.filter(
        (a) => a.attendanceStatus === "present",
      ).length;
      const absent = s.attendances.filter(
        (a) => a.attendanceStatus === "absent",
      ).length;
      const unchecked = studentCount - present - absent;
      const rate =
        studentCount > 0 ? Math.round((present / studentCount) * 100) : 0;
      return {
        scheduleId: s.id,
        scheduledDate: s.scheduledDate.toISOString(),
        // 회차 시각 text("HH:mm") — 표시 시각 SoT (scheduledDate 는 timestamp 라 부정확).
        startTime: s.startTime,
        endTime: s.endTime,
        present,
        absent,
        unchecked: unchecked > 0 ? unchecked : 0,
        total: studentCount,
        rate,
      };
    };

    return {
      classInfo: {
        classId: cls.id,
        className: cls.className,
        coachName: cls.instructorName,
        studentCount,
        completedCount,
        totalScheduleCount: cls._count.schedules,
        // [Phase C] 선불(PREPAID)·후불(POSTPAID) 분기 — 출석관리 화면이
        //   후불=정산 섹션 / 선불=출석 횟수 섹션을 택일 노출하는 데 사용.
        billingMode: cls.billingMode,
      },
      stats: {
        totalSchedules: cls._count.schedules,
        completedCount,
        avgAttendanceRate,
        totalPresent: presentTotal,
        totalAbsent: absentTotal,
      },
      inProgress: inProgressRaw.map(mapItem),
      completed: {
        items: completedItems.map(mapItem),
        nextCursor,
        hasMore,
      },
      upcomingCount,
    };
  }

  /**
   * [Phase C] 수업×월 회원별 출석 횟수 (선불 출석 가시화).
   *
   * 후불 정산(PostpaidSettlementService.getDraft)과 동일한 present 집계를
   * 단가 곱셈 없이 "출석 횟수"만 반환한다. 선불 수업 출석관리 화면의
   * 회원별 참여 확인용(읽기 전용) — 신규 모델 불필요.
   */
  async getClassMonthlyAttendanceCounts(classId: string, yearMonth: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, className: true, billingMode: true },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // "YYYY-MM" → 해당 월 [start, end]
    const [y, m] = yearMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);

    // present 출석 회원별 집계 (취소 일정 제외)
    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: { gte: start, lte: end },
        isCancelled: false,
      },
      select: {
        attendances: {
          where: { attendanceStatus: "present" },
          select: { memberId: true },
        },
      },
    });
    const counts = new Map<string, number>();
    for (const s of schedules) {
      for (const a of s.attendances) {
        counts.set(a.memberId, (counts.get(a.memberId) ?? 0) + 1);
      }
    }

    // 회원 이름 조회
    const userIds = [...counts.keys()];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = new Map(
      users.map((u) => [u.id, `${u.lastName ?? ""}${u.firstName ?? ""}`]),
    );

    // 명목 회수(참고 표시) — 정기 패키지의 월 포함 회수
    const product = await this.prisma.classProduct.findFirst({
      where: { classId, isActive: true, feeType: "MONTHLY_FIXED" },
      select: { sessionsPerMonth: true },
      orderBy: { sessionsPerMonth: "desc" },
    });

    const items = [...counts.entries()]
      .map(([userId, attendanceCount]) => ({
        userId,
        name: nameOf.get(userId) ?? "",
        attendanceCount,
      }))
      .sort((a, b) => b.attendanceCount - a.attendanceCount);

    return {
      classId,
      yearMonth,
      billingMode: cls.billingMode,
      nominalSessions: product?.sessionsPerMonth ?? null,
      totalPresent: items.reduce((sum, i) => sum + i.attendanceCount, 0),
      items,
    };
  }

  /**
   * 수업별 예정 일정 lazy load (정순 페이징).
   */
  async getClassScheduleUpcoming(
    classId: string,
    cursor: string | undefined,
    pageSize: number,
  ) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        registrations: {
          where: { status: "active" },
          select: { id: true },
        },
      },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    const studentCount = cls.registrations.length;

    const now = new Date();
    const upcomingLower = new Date(now.getTime() + this.IN_PROGRESS_BEFORE_MS);

    const upcoming = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        isCancelled: false,
        scheduledDate: {
          gt: cursor ? new Date(cursor) : upcomingLower,
        },
      },
      orderBy: { scheduledDate: "asc" },
      take: pageSize + 1,
      select: {
        id: true,
        scheduledDate: true,
        // 회차 시각 text("HH:mm") — 표시 시각 SoT.
        startTime: true,
        endTime: true,
      },
    });
    const hasMore = upcoming.length > pageSize;
    const items = hasMore ? upcoming.slice(0, pageSize) : upcoming;
    const nextCursor = hasMore
      ? items[items.length - 1]!.scheduledDate.toISOString()
      : null;

    return {
      items: items.map((s) => ({
        scheduleId: s.id,
        scheduledDate: s.scheduledDate.toISOString(),
        startTime: s.startTime,
        endTime: s.endTime,
        total: studentCount,
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * 학원(아카데미) 권한 확인 — 감독 본인 또는 활성 코치이면 true.
   *
   * ClassesService.assertAcademyManagerPermission(라인 2132) 와 동일 로직.
   * AttendanceService 가 ClassesService 를 주입하면 모듈 순환 우려가 있어
   * 동일 헬퍼를 복제. throw 대신 boolean 반환하여 호출부의 다단 권한 체인에 합류.
   */
  private async checkAcademyManagerPermission(
    userId: string,
    academyId: string,
  ): Promise<boolean> {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, directorId: true },
    });
    if (!academy) return false;
    if (academy.directorId === userId) return true;

    const academyCoach = await this.prisma.academyCoach.findUnique({
      where: { academyId_userId: { academyId, userId } },
      select: { userId: true, isActive: true },
    });
    return !!academyCoach && academyCoach.isActive;
  }
}
