import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { acquireClassPostpaidLockIfNeeded } from "@/classes/utils/class-locks.util";
import { assertScheduleMonthNotSettled } from "@/payments/settlement/postpaid-attendance.util";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "@/attendance/attendance-audit-log.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  CreateTrainingDto,
  TRAINING_TYPES,
  TrainingTypeValue,
} from "./dto/create-training.dto";
import { UpdateTrainingDto } from "./dto/update-training.dto";
import { QueryTrainingDto } from "./dto/query-training.dto";
import {
  kstTodayUtcMidnight,
  dateOnlyToUtc,
} from "@/common/utils/kst-date.util";
import {
  deriveClassLifecycle,
  utcMonthStart,
} from "@/common/utils/class-lifecycle.util";
import { creditStartedWhere } from "@/common/billing/fee-type.constants";

/**
 * TrainingService
 *
 * 수업(Class) 모델을 재활용하되, trainingType이 훈련 전용 타입인 레코드만 관리합니다.
 * 훈련 타입: REGULAR_TRAINING | GAME | FUN | CAMP | PICKUP
 *
 * 기존 출석(ClassAttendance), RSVP(ClassRsvp) 등의 시스템과 자연스럽게 연동됩니다.
 */
@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  // ─── 권한 검증 (코치/감독) ─────────────────────────────────────

  private async validateCoachOrDirector(
    userId: string,
    teamId: string,
    action: string,
  ) {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 제거.
    //  가입 시 pending TeamMember 와 함께 자동 생성되어 pending coach 가 우회하던 결함.
    //  → owner(team.coachId) 또는 approved TeamMember(HEAD_COACH/COACH/MANAGER) 만 통과.
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, coachId: true },
    });

    if (!club) {
      throw new NotFoundException("클럽을 찾을 수 없습니다.");
    }

    const isDirector = club.coachId === userId;

    let isApprovedMember = false;
    if (!isDirector) {
      const member = await this.prisma.teamMember.findFirst({
        where: {
          userId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      });
      isApprovedMember = !!member;
    }

    if (!isDirector && !isApprovedMember) {
      throw new ForbiddenException(
        `이 클럽의 코치 또는 감독만 훈련을 ${action}할 수 있습니다.`,
      );
    }

    return club;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 훈련 도메인 수업권 단일 진입점
    private readonly auditLog: AttendanceAuditLogService, // PR-C (v0.6): AuditLog
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── 훈련 세션 CRUD ────────────────────────────────────────────

  /**
   * POST /api/v1/training/:teamId
   * 훈련 세션 생성 (코치/감독)
   */
  async createTraining(userId: string, teamId: string, dto: CreateTrainingDto) {
    await this.validateCoachOrDirector(userId, teamId, "생성");

    // 시간 검증
    if (new Date(dto.startTime) >= new Date(dto.endTime)) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }

    // 훈련 세션 생성 (Class 모델 활용, trainingType으로 구분)
    const training = await this.prisma.class.create({
      data: {
        teamId,
        className: dto.className,
        description: dto.description,
        trainingType: dto.trainingType,
        instructorName: dto.instructorName,
        capacity: dto.capacity,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        levelRequired: dto.levelRequired,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
      },
    });

    // 일괄 일정 생성 (scheduleDates가 제공된 경우)
    let schedules: any[] = [];
    if (dto.scheduleDates && dto.scheduleDates.length > 0) {
      schedules = await this.prisma.$transaction(
        dto.scheduleDates.map((dateStr) =>
          this.prisma.classSchedule.create({
            data: {
              classId: training.id,
              scheduledDate: dateOnlyToUtc(dateStr),
            },
          }),
        ),
      );
      // [Lifecycle v4.1 §9.3] 첫 수업 생성 = 첫 일정 달 자동 승인 (salesOpenMonth).
      //   ISO "YYYY-MM-DD" 는 사전순 최솟값 = 가장 이른 날짜.
      const firstDateStr = [...dto.scheduleDates].sort()[0];
      await this.prisma.class.update({
        where: { id: training.id },
        data: { salesOpenMonth: utcMonthStart(dateOnlyToUtc(firstDateStr)) },
      });
    }

    this.logger.log(
      `훈련 세션 생성: teamId=${teamId}, trainingType=${dto.trainingType}, schedules=${schedules.length}개`,
    );

    // 팀 소속 학생의 학부모에게 새 훈련 등록 알림 (실패 격리)
    void this.notificationsService.notifyTeamParents(teamId, {
      notificationType: "training_created",
      title: "새 훈련 일정",
      message: training.className,
      linkUrl: `/classes/${training.id}`,
    });

    return {
      id: training.id,
      teamId: training.teamId,
      className: training.className,
      description: training.description,
      trainingType: training.trainingType,
      instructorName: training.instructorName,
      capacity: training.capacity,
      ageMin: training.ageMin,
      ageMax: training.ageMax,
      levelRequired: training.levelRequired,
      startTime: training.startTime,
      endTime: training.endTime,
      isActive: training.isActive,
      createdAt: training.createdAt,
      schedules: schedules.map((s) => ({
        id: s.id,
        scheduledDate: s.scheduledDate,
        isCancelled: s.isCancelled,
      })),
    };
  }

  /**
   * GET /api/v1/training/club/:teamId
   * 클럽의 훈련 세션 목록 조회
   */
  async getClubTrainings(teamId: string, query: QueryTrainingDto) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const skip = (page - 1) * limit;

    // 훈련 전용 타입만 필터
    const where: any = {
      teamId,
      trainingType: {
        in: query.trainingType ? [query.trainingType] : [...TRAINING_TYPES],
      },
    };

    if (query.search) {
      where.OR = [
        { className: { contains: query.search, mode: "insensitive" } },
        { instructorName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({
        where,
        select: {
          id: true,
          className: true,
          description: true,
          trainingType: true,
          instructorName: true,
          capacity: true,
          ageMin: true,
          ageMax: true,
          startTime: true,
          endTime: true,
          isActive: true,
          endedAt: true,
          salesOpenMonth: true,
          createdAt: true,
          // 요일별 기본 일정 — 목록 카드 요일 패턴 표시용 (대표 startTime 대신 사용)
          dayScheduleEntries: {
            select: { dayOfWeek: true, startTime: true, endTime: true },
          },
          // 비취소 회차 전체 — 다음 회차 + 운영 기간(first/last) 산출용
          schedules: {
            where: { isCancelled: false },
            orderBy: { scheduledDate: "asc" },
            select: { scheduledDate: true, startTime: true, endTime: true },
          },
          _count: {
            select: {
              // "총 N회" 표기 정확성 — 취소 회차 제외 카운트
              schedules: { where: { isCancelled: false } },
              enrollments: true,
            },
          },
        },
        // 정렬 — 대표값(startTime) 날짜부는 등록일 오염이라 폐기, 등록순(createdAt)으로 대체.
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.class.count({ where }),
    ]);

    const sdToday = kstTodayUtcMidnight();
    const items = data.map(({ dayScheduleEntries, schedules, ...rest }) => {
      // [Lifecycle v4.1] 파생 상태 — 배지 판정 일원화 (class-lifecycle.util SoT).
      const lifecycle = deriveClassLifecycle({
        endedAt: rest.endedAt,
        salesOpenMonth: rest.salesOpenMonth,
        trainingType: rest.trainingType,
        schedules,
      });
      return {
        ...rest,
        lifecycleStatus: lifecycle.state,
        pendingReason: lifecycle.pendingReason,
        daySchedules: dayScheduleEntries,
        // 다음 회차(오늘 이후 첫) — 없으면 null → 프론트가 기간(first/last)으로 폴백 표기.
        nextSchedule: schedules.find((s) => s.scheduledDate >= sdToday) ?? null,
        firstScheduleDate: schedules[0]?.scheduledDate.toISOString() ?? null,
        lastScheduleDate:
          schedules[schedules.length - 1]?.scheduledDate.toISOString() ?? null,
      };
    });

    return {
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /api/v1/training/:id
   * 훈련 세션 상세 조회
   */
  async getTrainingDetail(trainingId: string) {
    const training = await this.prisma.class.findUnique({
      where: { id: trainingId },
      select: {
        id: true,
        teamId: true,
        className: true,
        description: true,
        trainingType: true,
        instructorName: true,
        capacity: true,
        ageMin: true,
        ageMax: true,
        levelRequired: true,
        startTime: true,
        endTime: true,
        isActive: true,
        endedAt: true,
        salesOpenMonth: true,
        createdAt: true,
        updatedAt: true,
        team: {
          select: {
            id: true,
            name: true,
            coach: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        dayScheduleEntries: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
        schedules: {
          select: {
            id: true,
            scheduledDate: true,
            startTime: true,
            endTime: true,
            isCancelled: true,
            cancellationReason: true,
            _count: {
              select: {
                attendances: true,
                rsvps: true,
              },
            },
          },
          orderBy: { scheduledDate: "asc" },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    });

    if (!training) {
      throw new NotFoundException("훈련 세션을 찾을 수 없습니다.");
    }

    // 훈련 타입인지 확인
    if (
      !training.trainingType ||
      !TRAINING_TYPES.includes(training.trainingType as TrainingTypeValue)
    ) {
      throw new NotFoundException(
        "훈련 세션을 찾을 수 없습니다. (수업 데이터입니다)",
      );
    }

    const { dayScheduleEntries, ...rest } = training;
    // [Lifecycle v4.1] 파생 상태 + 종료 가드 프리뷰 — 상세 화면의 [수업 종료] 버튼 활성 판정용.
    const lifecycle = deriveClassLifecycle({
      endedAt: training.endedAt,
      salesOpenMonth: training.salesOpenMonth,
      trainingType: training.trainingType,
      schedules: training.schedules.filter((s) => !s.isCancelled),
    });
    return {
      ...rest,
      lifecycleStatus: lifecycle.state,
      pendingReason: lifecycle.pendingReason,
      // 판매 승인 사이클의 대상 달 (확인 플로우 헤더 "N월분" 표기·패키지 복제 대상월)
      earliestRemainingMonth:
        lifecycle.earliestRemainingMonth?.toISOString() ?? null,
      daySchedules: dayScheduleEntries,
      coachName: training.team?.coach
        ? `${training.team.coach.lastName}${training.team.coach.firstName}`.trim()
        : "",
    };
  }

  /**
   * PATCH /api/v1/training/:id
   * 훈련 세션 수정 (코치/감독)
   */
  async updateTraining(
    userId: string,
    trainingId: string,
    dto: UpdateTrainingDto,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id: trainingId },
      select: {
        id: true,
        teamId: true,
        trainingType: true,
        className: true,
        description: true,
        instructorName: true,
        capacity: true,
        ageMin: true,
        ageMax: true,
        levelRequired: true,
        startTime: true,
        endTime: true,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("훈련 세션을 찾을 수 없습니다.");
    }

    if (
      !existing.trainingType ||
      !TRAINING_TYPES.includes(existing.trainingType as TrainingTypeValue)
    ) {
      throw new BadRequestException(
        "수업 데이터는 이 API로 수정할 수 없습니다. 수업 관리 API를 사용해주세요.",
      );
    }

    await this.validateCoachOrDirector(userId, existing.teamId!, "수정");

    // 시간 검증
    const newStart = dto.startTime
      ? new Date(dto.startTime)
      : existing.startTime;
    const newEnd = dto.endTime ? new Date(dto.endTime) : existing.endTime;
    if (newStart >= newEnd) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }

    const updated = await this.prisma.class.update({
      where: { id: trainingId },
      data: {
        className: dto.className ?? existing.className,
        description: dto.description ?? existing.description,
        trainingType: dto.trainingType ?? existing.trainingType,
        instructorName: dto.instructorName ?? existing.instructorName,
        capacity: dto.capacity ?? existing.capacity,
        ageMin: dto.ageMin ?? existing.ageMin,
        ageMax: dto.ageMax ?? existing.ageMax,
        levelRequired: dto.levelRequired ?? existing.levelRequired,
        startTime: dto.startTime ? new Date(dto.startTime) : existing.startTime,
        endTime: dto.endTime ? new Date(dto.endTime) : existing.endTime,
        isActive: dto.isActive ?? existing.isActive,
      },
      select: {
        id: true,
        teamId: true,
        className: true,
        description: true,
        trainingType: true,
        instructorName: true,
        capacity: true,
        ageMin: true,
        ageMax: true,
        levelRequired: true,
        startTime: true,
        endTime: true,
        isActive: true,
        updatedAt: true,
      },
    });

    this.logger.log(`훈련 세션 수정: id=${trainingId}`);

    return updated;
  }

  /**
   * DELETE /api/v1/training/:id
   * 훈련 세션 삭제 (소프트 삭제: isActive = false)
   */
  async deleteTraining(userId: string, trainingId: string) {
    const existing = await this.prisma.class.findUnique({
      where: { id: trainingId },
      select: { id: true, teamId: true, trainingType: true },
    });

    if (!existing) {
      throw new NotFoundException("훈련 세션을 찾을 수 없습니다.");
    }

    if (
      !existing.trainingType ||
      !TRAINING_TYPES.includes(existing.trainingType as TrainingTypeValue)
    ) {
      throw new BadRequestException(
        "수업 데이터는 이 API로 삭제할 수 없습니다.",
      );
    }

    await this.validateCoachOrDirector(userId, existing.teamId!, "삭제");

    await this.prisma.class.update({
      where: { id: trainingId },
      data: { isActive: false },
    });

    this.logger.log(`훈련 세션 삭제(비활성화): id=${trainingId}`);

    return {
      id: trainingId,
      message: "훈련 세션이 삭제되었습니다.",
      deletedAt: new Date(),
    };
  }

  // ─── 훈련 일정 관리 ────────────────────────────────────────────

  /**
   * POST /api/v1/training/:id/schedules
   * 훈련 일정 추가 (단일 또는 다건)
   */
  async addSchedules(userId: string, trainingId: string, dates: string[]) {
    const training = await this.prisma.class.findUnique({
      where: { id: trainingId },
      select: { id: true, teamId: true, trainingType: true },
    });

    if (!training) {
      throw new NotFoundException("훈련 세션을 찾을 수 없습니다.");
    }

    if (
      !training.trainingType ||
      !TRAINING_TYPES.includes(training.trainingType as TrainingTypeValue)
    ) {
      throw new BadRequestException("수업 데이터입니다.");
    }

    await this.validateCoachOrDirector(userId, training.teamId!, "일정 생성");

    if (!dates || dates.length === 0) {
      throw new BadRequestException("최소 1개 이상의 일정 날짜가 필요합니다.");
    }

    const schedules = await this.prisma.$transaction(
      dates.map((dateStr) =>
        this.prisma.classSchedule.create({
          data: {
            classId: trainingId,
            scheduledDate: dateOnlyToUtc(dateStr),
          },
        }),
      ),
    );

    this.logger.log(
      `훈련 일정 ${schedules.length}건 추가: trainingId=${trainingId}`,
    );

    return {
      trainingId,
      schedules: schedules.map((s) => ({
        id: s.id,
        scheduledDate: s.scheduledDate,
        isCancelled: s.isCancelled,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * PUT /api/v1/training/:id/schedules/:scheduleId/cancel
   * 훈련 일정 취소
   */
  async cancelSchedule(
    userId: string,
    trainingId: string,
    scheduleId: string,
    cancellationReason?: string,
  ) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: {
          select: { id: true, teamId: true, trainingType: true },
        },
      },
    });

    if (!schedule || schedule.classId !== trainingId) {
      throw new NotFoundException("훈련 일정을 찾을 수 없습니다.");
    }

    if (
      !schedule.class.trainingType ||
      !TRAINING_TYPES.includes(schedule.class.trainingType as TrainingTypeValue)
    ) {
      throw new BadRequestException("수업 일정입니다.");
    }

    await this.validateCoachOrDirector(
      userId,
      schedule.class.teamId!,
      "일정 취소",
    );

    if (schedule.isCancelled) {
      throw new BadRequestException("이미 취소된 일정입니다.");
    }

    // 원자적 트랜잭션: 일정 취소 + 출석 상태 변경 + 수업권 복원
    const classId = schedule.class.id;
    const cancelledSchedule = await this.prisma.$transaction(async (tx) => {
      // 가격 잠금 §4-0 B — 일정 취소는 present 집계를 바꾸므로 동일 lock 직렬화.
      await acquireClassPostpaidLockIfNeeded(tx, classId);
      // P3-H1 — 정산 확정 월의 출석 변경은 lock 안에서 재검증 후 거부.
      await assertScheduleMonthNotSettled(tx, scheduleId);
      const updated = await tx.classSchedule.update({
        where: { id: scheduleId },
        data: {
          isCancelled: true,
          cancellationReason,
        },
      });

      // 크레딧이 차감된 출석 기록 조회
      const deductedAttendances = await tx.classAttendance.findMany({
        where: { scheduleId, creditDeducted: true },
        select: { id: true, memberId: true },
      });

      // 출석 상태 일괄 변경
      await tx.classAttendance.updateMany({
        where: { scheduleId },
        data: { attendanceStatus: "cancelled" },
      });

      // N+1 해소: memberCredit 일괄 사전 조회 (memberId IN [...] 단일 쿼리)
      const memberIdsToRestore = deductedAttendances.map((a) => a.memberId);
      const candidateCredits =
        classId && memberIdsToRestore.length > 0
          ? await tx.memberCredit.findMany({
              where: {
                userId: { in: memberIdsToRestore },
                classId,
                expiresAt: { gte: new Date() },
              },
              orderBy: { expiresAt: "asc" },
              select: {
                id: true,
                userId: true,
                totalSessions: true,
                usedSessions: true,
              },
            })
          : [];
      const memberCreditMap = new Map<
        string,
        (typeof candidateCredits)[number]
      >();
      for (const c of candidateCredits) {
        if (!memberCreditMap.has(c.userId)) memberCreditMap.set(c.userId, c);
      }

      // 크레딧 복원 (차감되었던 출석 기록에 대해서만)
      // PR-B (v0.5): CreditDomainService.restoreOne 위임 (userId × classId FIFO)
      // PR-C (v0.6): AuditLog 동반 INSERT
      for (const attendance of deductedAttendances) {
        const memberCredit = memberCreditMap.get(attendance.memberId) ?? null;
        if (memberCredit) {
          await this.creditDomain.restoreOne(tx, {
            userId: attendance.memberId,
            classId,
            scheduleId,
            reason: `훈련 일정 취소 - 크레딧 복원 (사유: ${cancellationReason || "미기재"})`,
          });
        }
        await this.auditLog.record(tx, {
          attendanceId: attendance.id,
          scheduleId,
          memberId: attendance.memberId,
          actorUserId: userId,
          actionType: "clear",
          fromStatus: "present",
          toStatus: "cancelled",
          creditDelta: memberCredit ? 1 : 0,
          reason: `훈련 일정 취소 (사유: ${cancellationReason || "미기재"})`,
        });
      }

      return updated;
    });

    this.logger.log(
      `훈련 일정 취소: scheduleId=${scheduleId}, reason=${cancellationReason}`,
    );

    return {
      id: cancelledSchedule.id,
      scheduledDate: cancelledSchedule.scheduledDate,
      isCancelled: cancelledSchedule.isCancelled,
      cancellationReason: cancelledSchedule.cancellationReason,
    };
  }

  // ─── 훈련 출석 관리 ────────────────────────────────────────────

  /**
   * GET /api/v1/training/:id/schedules/:scheduleId/attendance
   * 특정 훈련 일정의 출석 현황 조회 (코치/감독)
   */
  async getScheduleAttendance(
    userId: string,
    trainingId: string,
    scheduleId: string,
  ) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: {
          select: {
            id: true,
            teamId: true,
            trainingType: true,
            className: true,
          },
        },
      },
    });

    if (!schedule || schedule.classId !== trainingId) {
      throw new NotFoundException("훈련 일정을 찾을 수 없습니다.");
    }

    await this.validateCoachOrDirector(
      userId,
      schedule.class.teamId!,
      "출석 조회",
    );

    const attendances = await this.prisma.classAttendance.findMany({
      where: { scheduleId },
      select: {
        id: true,
        memberId: true,
        attendanceStatus: true,
        creditDeducted: true,
        checkedInAt: true,
        member: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { checkedInAt: "asc" },
    });

    // 클럽 전체 회원 수 (참석율 계산용)
    const totalMembers = schedule.class.teamId
      ? await this.prisma.teamMember.count({
          where: {
            teamId: schedule.class.teamId,
            approvalStatus: "approved",
          },
        })
      : 0;

    const present = attendances.filter(
      (a) => a.attendanceStatus === "present",
    ).length;

    return {
      trainingId,
      trainingName: schedule.class.className,
      scheduleId,
      scheduledDate: schedule.scheduledDate,
      isCancelled: schedule.isCancelled,
      totalMembers,
      attendanceCount: present,
      attendanceRate:
        totalMembers > 0 ? ((present / totalMembers) * 100).toFixed(1) : "0.0",
      attendances: attendances.map((a) => ({
        id: a.id,
        memberId: a.memberId,
        userName: a.member
          ? `${a.member.lastName ?? ""}${a.member.firstName ?? ""}`.trim()
          : "",
        email: a.member?.email ?? "",
        status: a.attendanceStatus,
        creditDeducted: a.creditDeducted,
        checkedInAt: a.checkedInAt,
      })),
    };
  }

  /**
   * POST /api/v1/training/:id/schedules/:scheduleId/attendance
   * 수동 출석 체크 (코치가 직접 출석 기록)
   */
  async markAttendance(
    userId: string,
    trainingId: string,
    scheduleId: string,
    memberIds: string[],
  ) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: {
          select: { id: true, teamId: true, trainingType: true },
        },
      },
    });

    if (!schedule || schedule.classId !== trainingId) {
      throw new NotFoundException("훈련 일정을 찾을 수 없습니다.");
    }

    if (schedule.isCancelled) {
      throw new BadRequestException(
        "취소된 훈련 일정에는 출석을 기록할 수 없습니다.",
      );
    }

    await this.validateCoachOrDirector(
      userId,
      schedule.class.teamId!,
      "출석 기록",
    );

    if (!memberIds || memberIds.length === 0) {
      throw new BadRequestException("출석할 회원 ID가 필요합니다.");
    }

    // 2026-04-27 (N-9): 트랜잭션 외부에서 schedule.class.id 조회 (수업권 검증용)
    const scheduleForClass = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      select: { class: { select: { id: true } } },
    });
    if (!scheduleForClass) {
      throw new NotFoundException("훈련 일정을 찾을 수 없습니다.");
    }
    const classId = scheduleForClass.class.id;

    // 트랜잭션으로 출석 기록 (수업권 차감 포함)
    // N+1 해소: 사전 일괄 조회 (existingAttendance, memberCredit)
    const existingAttendances = await this.prisma.classAttendance.findMany({
      where: { scheduleId, memberId: { in: memberIds } },
      select: { id: true, memberId: true },
    });
    const existingAttendanceMap = new Map<string, { id: string }>();
    for (const a of existingAttendances) {
      existingAttendanceMap.set(a.memberId, { id: a.id });
    }

    const candidateCredits =
      classId && memberIds.length > 0
        ? await this.prisma.memberCredit.findMany({
            where: {
              userId: { in: memberIds },
              classId,
              expiresAt: { gte: new Date() },
              ...creditStartedWhere(),
            },
            orderBy: { expiresAt: "asc" },
            select: {
              id: true,
              userId: true,
              totalSessions: true,
              usedSessions: true,
            },
          })
        : [];
    const memberCreditMap = new Map<
      string,
      (typeof candidateCredits)[number]
    >();
    for (const c of candidateCredits) {
      if (!memberCreditMap.has(c.userId)) memberCreditMap.set(c.userId, c);
    }

    const results = await this.prisma.$transaction(async (tx) => {
      // 가격 잠금 §4-0 B — 후불(POSTPAID/BOTH) 수업의 출석 기록은 단가 수정·정산
      //   확정과 동일 lock 으로 직렬화한다 (PREPAID 수업은 미획득 — 영향 0).
      await acquireClassPostpaidLockIfNeeded(tx, classId);
      // P3-H1 — 정산 확정 월의 출석 변경은 lock 안에서 재검증 후 거부.
      await assertScheduleMonthNotSettled(tx, scheduleId);
      type AttendanceResult =
        | {
            memberId: string;
            status: "already_checked_in";
            attendanceId: string;
          }
        | {
            memberId: string;
            status: "checked_in";
            attendanceId: string;
            creditDeducted: boolean;
          };
      const attendanceResults: AttendanceResult[] = [];

      for (const memberId of memberIds) {
        // 이미 출석한 경우 스킵
        const existingAttendance = existingAttendanceMap.get(memberId) ?? null;

        if (existingAttendance) {
          attendanceResults.push({
            memberId,
            status: "already_checked_in",
            attendanceId: existingAttendance.id,
          });
          continue;
        }

        // 수업권 확인 및 차감 (User × Class 단위 — N-9, 사전 조회된 Map 사용)
        const memberCredit = memberCreditMap.get(memberId) ?? null;

        let creditDeducted = false;

        if (
          memberCredit &&
          memberCredit.totalSessions - memberCredit.usedSessions > 0
        ) {
          // PR-B (v0.5): CreditDomainService.deductOne 위임 + try-catch
          // 훈련 도메인은 무료 출석 허용 — 잔량 부족/race 시 creditDeducted=false 로 진행
          try {
            await this.creditDomain.deductOne(tx, {
              userId: memberId,
              classId,
              scheduleId,
              reason: "훈련 출석 - 수업권 차감",
              deductedVia: "coach_manual",
            });
            creditDeducted = true;
          } catch {
            // 잔량 부족 / race — 무료 출석 진행
            creditDeducted = false;
          }
        }

        // creditDeducted 결정 후 attendance 가 아래 줄에서 create 됨. AuditLog 는 attendance.id 가 필요하므로 attendance.create 이후 추가.

        // 출석 기록 생성 (코치 수동 — checkedInVia/By 기록)
        const attendance = await tx.classAttendance.create({
          data: {
            scheduleId,
            memberId,
            attendanceStatus: "present",
            creditDeducted,
            checkedInAt: new Date(),
            checkedInVia: "coach_manual",
          },
        });

        // PR-C (v0.6): AuditLog INSERT — 훈련 출석 마킹
        await this.auditLog.record(tx, {
          attendanceId: attendance.id,
          scheduleId,
          memberId,
          actorUserId: userId,
          actionType: "check_in",
          fromStatus: null,
          toStatus: "present",
          creditDelta: creditDeducted ? -1 : 0,
        });

        attendanceResults.push({
          memberId,
          status: "checked_in",
          attendanceId: attendance.id,
          creditDeducted,
        });
      }

      return attendanceResults;
    });

    this.logger.log(
      `훈련 수동 출석: scheduleId=${scheduleId}, members=${memberIds.length}명`,
    );

    return {
      scheduleId,
      results,
      checkedInCount: results.filter((r) => r.status === "checked_in").length,
      alreadyCheckedInCount: results.filter(
        (r) => r.status === "already_checked_in",
      ).length,
    };
  }

  // ─── 훈련 통계 ────────────────────────────────────────────────

  /**
   * GET /api/v1/training/stats/club/:teamId
   * 클럽 훈련 통계 (코치/감독)
   */
  async getClubTrainingStats(userId: string, teamId: string) {
    await this.validateCoachOrDirector(userId, teamId, "통계 조회");

    // 이번 달 범위
    const now = new Date();
    // scheduledDate(@db.Date) 이번 달 경계 — KST 달력 월의 UTC 자정 [monthStart, monthEnd] (lte 로 말일 포함).
    const kstNow = kstTodayUtcMidnight();
    const monthStart = new Date(
      Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + 1, 0),
    );

    // 훈련 세션 수
    const trainingCount = await this.prisma.class.count({
      where: {
        teamId,
        trainingType: { in: [...TRAINING_TYPES] },
        isActive: true,
      },
    });

    // 유형별 훈련 수
    const typeStats = await this.prisma.class.groupBy({
      by: ["trainingType"],
      where: {
        teamId,
        trainingType: { in: [...TRAINING_TYPES] },
        isActive: true,
      },
      _count: true,
    });

    // 이번 달 일정 수
    const monthlyScheduleCount = await this.prisma.classSchedule.count({
      where: {
        class: {
          teamId,
          trainingType: { in: [...TRAINING_TYPES] },
        },
        scheduledDate: { gte: monthStart, lte: monthEnd },
      },
    });

    // 이번 달 취소된 일정 수
    const cancelledCount = await this.prisma.classSchedule.count({
      where: {
        class: {
          teamId,
          trainingType: { in: [...TRAINING_TYPES] },
        },
        scheduledDate: { gte: monthStart, lte: monthEnd },
        isCancelled: true,
      },
    });

    // 이번 달 출석 수
    const monthlyAttendanceCount = await this.prisma.classAttendance.count({
      where: {
        schedule: {
          class: {
            teamId,
            trainingType: { in: [...TRAINING_TYPES] },
          },
          scheduledDate: { gte: monthStart, lte: monthEnd },
        },
        attendanceStatus: "present",
      },
    });

    return {
      teamId,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      totalTrainingSessions: trainingCount,
      typeBreakdown: Object.fromEntries(
        TRAINING_TYPES.map((type) => [
          type,
          typeStats.find((s) => s.trainingType === type)?._count ?? 0,
        ]),
      ),
      monthlySchedules: monthlyScheduleCount,
      monthlyCancelled: cancelledCount,
      monthlyAttendance: monthlyAttendanceCount,
      completionRate:
        monthlyScheduleCount > 0
          ? (
              ((monthlyScheduleCount - cancelledCount) / monthlyScheduleCount) *
              100
            ).toFixed(1)
          : "0.0",
    };
  }
}
