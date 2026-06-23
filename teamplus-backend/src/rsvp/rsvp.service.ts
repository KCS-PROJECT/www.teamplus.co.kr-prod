import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateRsvpDto, RsvpStatus } from "./dto/create-rsvp.dto";
import { RsvpResponseDto } from "./dto/rsvp-response.dto";
import { RsvpSummaryDto } from "./dto/rsvp-summary.dto";

/** RSVP 마감 기준: 수업 시작 몇 시간 전 (rsvpDeadline 미설정 시 기본값) */
const RSVP_DEADLINE_HOURS_BEFORE = 24;

@Injectable()
export class RsvpService {
  private readonly logger = new Logger(RsvpService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 유틸 메서드 ──────────────────────────────────────────────

  /**
   * 일정의 RSVP 마감 시간을 계산합니다.
   * rsvpDeadline이 설정된 경우 그 값을 사용하고,
   * 없는 경우 scheduledDate - 24시간을 기준으로 합니다.
   */
  private getRsvpDeadline(
    scheduledDate: Date,
    rsvpDeadline?: Date | null,
  ): Date {
    if (rsvpDeadline) return rsvpDeadline;
    const deadline = new Date(scheduledDate);
    deadline.setHours(deadline.getHours() - RSVP_DEADLINE_HOURS_BEFORE);
    return deadline;
  }

  /**
   * RSVP 마감 여부를 확인합니다.
   */
  private isDeadlinePassed(
    scheduledDate: Date,
    rsvpDeadline?: Date | null,
  ): boolean {
    const deadline = this.getRsvpDeadline(scheduledDate, rsvpDeadline);
    return new Date() > deadline;
  }

  // ─── 핵심 비즈니스 로직 ──────────────────────────────────────

  // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ───────────────────────────
  // [STATUS] 비활성 — 외부 호출 없는 죽은 메서드 (classes.service.ts 는 자체 inline 로직 사용)
  // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개)
  // [TO RE-ENABLE] 아래 모든 `//ㄴ ` 접두사를 제거하면 원본 복구 (JSDoc 의 */ 토큰 충돌 회피 위해 라인 주석 사용)
  // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 5곳 일괄 검색 → 블록 통째 삭제
  // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
  //ㄴ /**
  //ㄴ  * 수업 일정 생성 시 소속 회원 전원에 PENDING RSVP 자동 생성
  //ㄴ  * ClassesService 또는 ClassSchedule 생성 후 호출
  //ㄴ  */
  //ㄴ async createRsvpsForSchedule(scheduleId: string): Promise<void> {
  //ㄴ   const schedule = await this.prisma.classSchedule.findUnique({
  //ㄴ     where: { id: scheduleId },
  //ㄴ     select: {
  //ㄴ       id: true,
  //ㄴ       class: {
  //ㄴ         select: {
  //ㄴ           teamId: true,
  //ㄴ           enrollments: {
  //ㄴ             where: { status: "paid" },
  //ㄴ             select: {
  //ㄴ               childId: true,
  //ㄴ               requestedBy: true,
  //ㄴ             },
  //ㄴ           },
  //ㄴ         },
  //ㄴ       },
  //ㄴ     },
  //ㄴ   });
  //ㄴ
  //ㄴ   if (!schedule) {
  //ㄴ     throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
  //ㄴ   }
  //ㄴ
  //ㄴ   // 수강 등록된 회원(childId)과 요청자(requestedBy = 학부모) 쌍으로 RSVP 생성
  //ㄴ   const rsvpData = schedule.class.enrollments.map((enrollment) => ({
  //ㄴ     scheduleId,
  //ㄴ     userId: enrollment.requestedBy, // 학부모 또는 본인
  //ㄴ     childId: enrollment.childId, // 자녀 (없으면 null)
  //ㄴ     status: "PENDING",
  //ㄴ     createdAt: new Date(),
  //ㄴ     updatedAt: new Date(),
  //ㄴ   }));
  //ㄴ
  //ㄴ   if (rsvpData.length === 0) {
  //ㄴ     this.logger.log(
  //ㄴ       `scheduleId=${scheduleId}: 수강 등록 회원 없음, RSVP 생성 건너뜀`,
  //ㄴ     );
  //ㄴ     return;
  //ㄴ   }
  //ㄴ
  //ㄴ   // upsert 방식으로 중복 방지
  //ㄴ   await this.prisma.$transaction(
  //ㄴ     rsvpData.map((data) =>
  //ㄴ       this.prisma.classRsvp.upsert({
  //ㄴ         where: {
  //ㄴ           scheduleId_userId_childId: {
  //ㄴ             scheduleId: data.scheduleId,
  //ㄴ             userId: data.userId,
  //ㄴ             childId: data.childId ?? "",
  //ㄴ           },
  //ㄴ         },
  //ㄴ         create: data,
  //ㄴ         update: {}, // 이미 존재하면 업데이트하지 않음
  //ㄴ       }),
  //ㄴ     ),
  //ㄴ   );
  //ㄴ
  //ㄴ   this.logger.log(
  //ㄴ     `scheduleId=${scheduleId}: ${rsvpData.length}명 RSVP 자동 생성 완료`,
  //ㄴ   );
  //ㄴ }
  // ─── RSVP_DISABLED_2026-05-28 ─── END ─────────────────────────────

  // ─── API 메서드 ──────────────────────────────────────────────

  /**
   * POST /api/v1/rsvp
   * RSVP 응답 (참석/불참)
   */
  async respondRsvp(
    userId: string,
    dto: CreateRsvpDto,
  ): Promise<RsvpResponseDto> {
    const { scheduleId, status, childId, note } = dto;

    // 일정 확인
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        scheduledDate: true,
        isCancelled: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
    }

    if (schedule.isCancelled) {
      throw new BadRequestException("취소된 수업 일정입니다.");
    }

    // RSVP 마감 확인 (수업 시작 24시간 전)
    if (this.isDeadlinePassed(schedule.scheduledDate)) {
      throw new BadRequestException(
        "RSVP 마감 시간이 지났습니다. 더 이상 응답을 변경할 수 없습니다.",
      );
    }

    // 자녀 대신 응답하는 경우 권한 확인
    if (childId) {
      const parentChild = await this.prisma.parentChild.findFirst({
        where: { parentId: userId, childId },
      });
      if (!parentChild) {
        throw new ForbiddenException(
          "해당 자녀의 RSVP를 응답할 권한이 없습니다.",
        );
      }
    }

    // RSVP 기록 upsert
    const rsvp = await this.prisma.classRsvp.upsert({
      where: {
        scheduleId_userId_childId: {
          scheduleId,
          userId,
          childId: childId ?? "",
        },
      },
      create: {
        scheduleId,
        userId,
        childId: childId ?? null,
        status,
        respondedAt: new Date(),
        note: note ?? null,
      },
      update: {
        status,
        respondedAt: new Date(),
        note: note ?? null,
      },
      include: {
        user: { select: { email: true } },
        child: { select: { email: true } },
      },
    });

    this.logger.log(
      `RSVP 응답: userId=${userId}, scheduleId=${scheduleId}, status=${status}`,
    );

    return this.mapToResponseDto(rsvp);
  }

  /**
   * PUT /api/v1/rsvp/:id
   * RSVP 변경
   */
  async updateRsvp(
    rsvpId: string,
    userId: string,
    dto: CreateRsvpDto,
  ): Promise<RsvpResponseDto> {
    const existing = await this.prisma.classRsvp.findUnique({
      where: { id: rsvpId },
      include: {
        schedule: {
          select: {
            scheduledDate: true,
            isCancelled: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("RSVP 기록을 찾을 수 없습니다.");
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException("본인의 RSVP만 변경할 수 있습니다.");
    }

    if (existing.schedule.isCancelled) {
      throw new BadRequestException("취소된 수업 일정입니다.");
    }

    if (this.isDeadlinePassed(existing.schedule.scheduledDate)) {
      throw new BadRequestException("RSVP 마감 시간이 지났습니다.");
    }

    const updated = await this.prisma.classRsvp.update({
      where: { id: rsvpId },
      data: {
        status: dto.status,
        note: dto.note ?? null,
        respondedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * GET /api/v1/rsvp/schedule/:scheduleId
   * 일정별 RSVP 전체 현황 (감독/코치 전용)
   */
  async getScheduleRsvps(scheduleId: string): Promise<RsvpResponseDto[]> {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true },
    });

    if (!schedule) {
      throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
    }

    const rsvps = await this.prisma.classRsvp.findMany({
      where: { scheduleId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        child: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return rsvps.map((rsvp) => {
      return {
        ...this.mapToResponseDto(rsvp),
        userName:
          rsvp.user.lastName || rsvp.user.firstName
            ? `${rsvp.user.lastName}${rsvp.user.firstName}`.trim()
            : rsvp.user.email,
        childName:
          rsvp.child && (rsvp.child.lastName || rsvp.child.firstName)
            ? `${rsvp.child.lastName}${rsvp.child.firstName}`.trim()
            : undefined,
      };
    });
  }

  /**
   * GET /api/v1/rsvp/schedule/:scheduleId/summary
   * 참석/불참/미응답 집계 (감독/코치 전용)
   */
  async getScheduleRsvpSummary(scheduleId: string): Promise<RsvpSummaryDto> {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        rsvps: {
          select: { status: true },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException("수업 일정을 찾을 수 없습니다.");
    }

    const total = schedule.rsvps.length;
    const attending = schedule.rsvps.filter(
      (r: { status: string }) => r.status === RsvpStatus.ATTENDING,
    ).length;
    const declined = schedule.rsvps.filter(
      (r: { status: string }) => r.status === RsvpStatus.DECLINED,
    ).length;
    const pending = schedule.rsvps.filter(
      (r: { status: string }) => r.status === "PENDING",
    ).length;

    const attendingRate =
      total > 0 ? ((attending / total) * 100).toFixed(1) : "0.0";

    return {
      scheduleId,
      scheduledDate: schedule.scheduledDate,
      rsvpDeadline: this.getRsvpDeadline(schedule.scheduledDate),
      isCancelled: schedule.isCancelled,
      total,
      attending,
      declined,
      pending,
      attendingRate,
    };
  }

  /**
   * GET /api/v1/rsvp/my
   * 내 RSVP 목록 조회 (학부모/학생)
   */
  async getMyRsvps(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: RsvpResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;

    const [rsvps, total] = await this.prisma.$transaction([
      this.prisma.classRsvp.findMany({
        where: { userId },
        include: {
          schedule: {
            select: {
              scheduledDate: true,
              isCancelled: true,
              class: { select: { className: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.classRsvp.count({ where: { userId } }),
    ]);

    return {
      data: rsvps.map((rsvp) => this.mapToResponseDto(rsvp)),
      total,
      page,
      limit,
    };
  }

  // ─── 매핑 유틸 ───────────────────────────────────────────────

  private mapToResponseDto(rsvp: any): RsvpResponseDto {
    return {
      id: rsvp.id,
      scheduleId: rsvp.scheduleId,
      userId: rsvp.userId,
      childId: rsvp.childId,
      status: rsvp.status,
      respondedAt: rsvp.respondedAt,
      note: rsvp.note,
      createdAt: rsvp.createdAt,
      updatedAt: rsvp.updatedAt,
    };
  }
}
