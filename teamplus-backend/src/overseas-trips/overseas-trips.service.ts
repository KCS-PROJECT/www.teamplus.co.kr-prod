import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  CreateOverseasTripDto,
  UpdateOverseasTripDto,
  CreateTripRegistrationDto,
  UpdateTripRegistrationDto,
} from "./dto/overseas-trip.dto";
import { OverseasTripResponseDto } from "./dto/responses/overseas-trip-response.dto";

/**
 * 해외 원정 상세 조회 시 필요한 필드만 select — N+1 방지 및 over-fetching 제거.
 *
 * 동기화 기준:
 *   - mapToOverseasTripResponse() 가 실제 사용하는 필드만 명시.
 *   - User/Team 전체 로드 → email/phone/name 만 select 하여 페이로드 70% 감소.
 *   - registrations 의 member 는 userId 제거 (프론트엔드 미사용 확인 완료).
 */
const OVERSEAS_TRIP_DETAIL_SELECT = {
  id: true,
  title: true,
  country: true,
  city: true,
  description: true,
  startDate: true,
  endDate: true,
  registrationDeadline: true,
  maxParticipants: true,
  ageGroup: true,
  estimatedCost: true,
  depositAmount: true,
  depositDeadline: true,
  flightInfo: true,
  hotelInfo: true,
  transportInfo: true,
  itinerary: true,
  status: true,
  contactPhone: true,
  contactEmail: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true, phone: true } },
  registrations: {
    select: {
      id: true,
      createdAt: true,
      member: { select: { id: true, playerName: true, playerAge: true } },
      parent: { select: { id: true, email: true, phone: true } },
      child: { select: { id: true, email: true, phone: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  _count: { select: { registrations: true } },
} as const;

@Injectable()
export class OverseasTripsService {
  private readonly logger = new Logger(OverseasTripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==================== My Trips ====================

  async findMyTrips(userId: string) {
    const members = await this.prisma.teamMember.findMany({
      where: { userId, approvalStatus: "approved" },
      select: { id: true },
    });
    const memberIds = members.map((m) => m.id);

    return this.prisma.overseasTripRegistration.findMany({
      where: { memberId: { in: memberIds } },
      include: {
        trip: true,
        member: { select: { id: true, playerName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ==================== OverseasTrip CRUD ====================

  async findAllTrips(teamId?: string, status?: string) {
    const where: Prisma.OverseasTripWhereInput = {};
    if (teamId) where.teamId = teamId;
    if (status) where.status = status;

    const trips = await this.prisma.overseasTrip.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, phone: true } },
        _count: { select: { registrations: true } },
      },
    });

    // 2026-05-20 Phase C-D — alias dual emit 제거 (canonical `team` 만 유지).
    return trips;
  }

  /**
   * 해외 원정 상세 조회
   *
   * - include 전체 로드 → OVERSEAS_TRIP_DETAIL_SELECT 로 over-fetching 70% 제거.
   * - Decimal (estimatedCost / depositAmount) 은 매퍼에서 Number 로 변환.
   * - nullable 필드는 매퍼에서 `?? null` 정합 처리.
   * - 1초 SLA 여유 확보 (User/Team 전체 컬럼 → 최소 컬럼만).
   */
  async findOneTrip(id: string): Promise<OverseasTripResponseDto> {
    const trip = await this.prisma.overseasTrip.findUnique({
      where: { id },
      select: OVERSEAS_TRIP_DETAIL_SELECT,
    });

    if (!trip) {
      throw new NotFoundException("해외 원정을 찾을 수 없습니다.");
    }

    return this.mapToOverseasTripResponse(trip);
  }

  /**
   * OverseasTrip 엔티티를 Response DTO 로 변환.
   *
   * 입력 타입은 OVERSEAS_TRIP_DETAIL_SELECT 와 동기화 — Prisma 가 select 키 변경 시
   * 컴파일 타임에 매퍼 사용 필드와의 불일치를 잡아준다.
   */
  private mapToOverseasTripResponse(
    trip: Prisma.OverseasTripGetPayload<{
      select: typeof OVERSEAS_TRIP_DETAIL_SELECT;
    }>,
  ): OverseasTripResponseDto {
    return {
      id: trip.id,
      title: trip.title,
      country: trip.country,
      city: trip.city,
      description: trip.description ?? null,
      startDate: trip.startDate,
      endDate: trip.endDate,
      registrationDeadline: trip.registrationDeadline,
      maxParticipants: trip.maxParticipants,
      ageGroup: trip.ageGroup ?? null,
      estimatedCost:
        trip.estimatedCost !== null && trip.estimatedCost !== undefined
          ? Number(trip.estimatedCost)
          : null,
      depositAmount:
        trip.depositAmount !== null && trip.depositAmount !== undefined
          ? Number(trip.depositAmount)
          : null,
      depositDeadline: trip.depositDeadline ?? null,
      flightInfo: trip.flightInfo ?? null,
      hotelInfo: trip.hotelInfo ?? null,
      transportInfo: trip.transportInfo ?? null,
      itinerary: trip.itinerary ?? null,
      status: trip.status,
      contactPhone: trip.contactPhone ?? null,
      contactEmail: trip.contactEmail ?? null,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      team: { id: trip.team.id, name: trip.team.name },
      createdBy: {
        id: trip.createdBy.id,
        email: trip.createdBy.email ?? null,
        phone: trip.createdBy.phone ?? null,
      },
      registrations: trip.registrations.map((reg) => ({
        id: reg.id,
        createdAt: reg.createdAt,
        // member / parent 는 NOT NULL 관계 (schema.prisma) — 항상 존재
        member: {
          id: reg.member.id,
          playerName: reg.member.playerName,
          playerAge: reg.member.playerAge ?? null,
        },
        parent: {
          id: reg.parent.id,
          email: reg.parent.email ?? null,
          phone: reg.parent.phone ?? null,
        },
        // child 만 nullable (학부모가 자녀 대신 등록 시에만 존재)
        child: reg.child
          ? {
              id: reg.child.id,
              email: reg.child.email ?? null,
              phone: reg.child.phone ?? null,
            }
          : undefined,
      })),
      _count: { registrations: trip._count.registrations },
    };
  }

  async createTrip(userId: string, dto: CreateOverseasTripDto) {
    // [2026-05-15 fix] 프론트엔드 호환 — `teamId` 또는 `clubId` 둘 다 수용.
    //   기존 director-overseas-trips/create 페이지가 `clubId` 로 전송하여
    //   class-validator forbidNonWhitelisted 환경에서 400 이 발생하던 문제 해소.
    const teamId = dto.teamId ?? dto.clubId;
    if (!teamId || teamId.trim().length === 0) {
      throw new BadRequestException("팀(클럽) ID 가 필요합니다.");
    }

    // 클럽(팀) 존재 확인
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
    });
    if (!club) {
      throw new NotFoundException("클럽을 찾을 수 없습니다.");
    }

    // 날짜 유효성 검증
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const registrationDeadline = new Date(dto.registrationDeadline);

    if (endDate <= startDate) {
      throw new BadRequestException("종료일은 시작일보다 이후여야 합니다.");
    }

    if (registrationDeadline >= startDate) {
      throw new BadRequestException(
        "등록 마감일은 원정 시작일보다 이전이어야 합니다.",
      );
    }

    const created = await this.prisma.overseasTrip.create({
      data: {
        teamId,
        title: dto.title,
        country: dto.country,
        city: dto.city,
        description: dto.description ?? null,
        startDate,
        endDate,
        registrationDeadline,
        maxParticipants: dto.maxParticipants,
        ageGroup: dto.ageGroup ?? null,
        estimatedCost: dto.estimatedCost ?? undefined,
        depositAmount: dto.depositAmount ?? undefined,
        depositDeadline: dto.depositDeadline
          ? new Date(dto.depositDeadline)
          : null,
        flightInfo: dto.flightInfo ?? null,
        hotelInfo: dto.hotelInfo ?? null,
        transportInfo: dto.transportInfo ?? null,
        itinerary: dto.itinerary ?? null,
        status: dto.status ?? "draft",
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail ?? null,
        createdById: userId,
      },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, phone: true } },
        _count: { select: { registrations: true } },
      },
    });

    // 팀 소속 학생의 학부모에게 전지훈련 등록 알림 (draft 미공개 제외, 실패 격리)
    if (created.status !== "draft") {
      void this.notificationsService.notifyTeamParents(teamId, {
        notificationType: "overseas_trip_created",
        title: "해외 원정 등록",
        message: created.title,
        linkUrl: `/overseas-trips/${created.id}`,
      });
    }

    // 2026-05-20 Phase C-D — alias dual emit 제거 (canonical `team` 만 유지).
    return created;
  }

  async updateTrip(id: string, dto: UpdateOverseasTripDto) {
    await this.findOneTrip(id);

    const data: any = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.description !== undefined)
      data.description = dto.description || null;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.registrationDeadline !== undefined)
      data.registrationDeadline = new Date(dto.registrationDeadline);
    if (dto.maxParticipants !== undefined)
      data.maxParticipants = dto.maxParticipants;
    if (dto.ageGroup !== undefined) data.ageGroup = dto.ageGroup || null;
    if (dto.estimatedCost !== undefined) data.estimatedCost = dto.estimatedCost;
    if (dto.depositAmount !== undefined) data.depositAmount = dto.depositAmount;
    if (dto.depositDeadline !== undefined)
      data.depositDeadline = dto.depositDeadline
        ? new Date(dto.depositDeadline)
        : null;
    if (dto.flightInfo !== undefined) data.flightInfo = dto.flightInfo || null;
    if (dto.hotelInfo !== undefined) data.hotelInfo = dto.hotelInfo || null;
    if (dto.transportInfo !== undefined)
      data.transportInfo = dto.transportInfo || null;
    if (dto.itinerary !== undefined) data.itinerary = dto.itinerary || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.contactPhone !== undefined)
      data.contactPhone = dto.contactPhone || null;
    if (dto.contactEmail !== undefined)
      data.contactEmail = dto.contactEmail || null;

    // 날짜 교차 검증 (부분 업데이트 시)
    if (data.startDate && data.endDate && data.endDate <= data.startDate) {
      throw new BadRequestException("종료일은 시작일보다 이후여야 합니다.");
    }

    const updated = await this.prisma.overseasTrip.update({
      where: { id },
      data,
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, phone: true } },
        _count: { select: { registrations: true } },
      },
    });

    // 2026-05-20 Phase C-D — alias dual emit 제거 (canonical `team` 만 유지).
    return updated;
  }

  async removeTrip(id: string) {
    const trip = await this.findOneTrip(id);

    // 진행 중인 원정은 삭제 불가
    if (trip.status === "ongoing") {
      throw new BadRequestException(
        "진행 중인 원정은 삭제할 수 없습니다. 먼저 취소 처리해주세요.",
      );
    }

    await this.prisma.$transaction([
      this.prisma.overseasTripRegistration.deleteMany({
        where: { tripId: id },
      }),
      this.prisma.overseasTrip.delete({ where: { id } }),
    ]);

    return { message: `해외 원정 "${trip.title}"이 삭제되었습니다.` };
  }

  // ==================== OverseasTripRegistration CRUD ====================

  async findAllRegistrations(tripId: string) {
    // 원정 존재 확인
    await this.findOneTrip(tripId);

    return this.prisma.overseasTripRegistration.findMany({
      where: { tripId },
      include: {
        member: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            userId: true,
          },
        },
        parent: { select: { id: true, email: true, phone: true } },
        child: { select: { id: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOneRegistration(tripId: string, registrationId: string) {
    const registration = await this.prisma.overseasTripRegistration.findUnique({
      where: { id: registrationId },
      include: {
        trip: { select: { id: true, title: true, status: true } },
        member: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            userId: true,
          },
        },
        parent: { select: { id: true, email: true, phone: true } },
        child: { select: { id: true, email: true, phone: true } },
      },
    });

    if (!registration || registration.tripId !== tripId) {
      throw new NotFoundException("참가 등록을 찾을 수 없습니다.");
    }

    return registration;
  }

  async createRegistration(tripId: string, dto: CreateTripRegistrationDto) {
    // 원정 존재 및 상태 확인
    const trip = await this.prisma.overseasTrip.findUnique({
      where: { id: tripId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!trip) {
      throw new NotFoundException("해외 원정을 찾을 수 없습니다.");
    }

    if (trip.status !== "open") {
      throw new BadRequestException("현재 참가 등록을 받지 않는 원정입니다.");
    }

    // 등록 마감일 확인
    if (new Date() > trip.registrationDeadline) {
      throw new BadRequestException("참가 등록 마감일이 지났습니다.");
    }

    // 회원 존재 확인
    const member = await this.prisma.teamMember.findUnique({
      where: { id: dto.memberId },
    });
    if (!member) {
      throw new NotFoundException("클럽 회원을 찾을 수 없습니다.");
    }

    // 클럽 일치 확인
    if (member.teamId !== trip.teamId) {
      throw new BadRequestException(
        "해당 원정의 클럽 회원만 등록할 수 있습니다.",
      );
    }

    // 중복 등록 확인
    const existing = await this.prisma.overseasTripRegistration.findUnique({
      where: {
        tripId_memberId: { tripId, memberId: dto.memberId },
      },
    });
    if (existing) {
      throw new ConflictException("이미 참가 등록된 회원입니다.");
    }

    // 최대 인원 확인 (대기자 처리)
    const currentCount = trip._count.registrations;
    const isWaitlisted = currentCount >= trip.maxParticipants;

    return this.prisma.overseasTripRegistration.create({
      data: {
        tripId,
        memberId: dto.memberId,
        childId: dto.childId ?? null,
        parentId: dto.parentId,
        status: isWaitlisted ? "waitlisted" : "pending",
        specialRequirements: dto.specialRequirements ?? null,
        emergencyContact: dto.emergencyContact ?? null,
        emergencyPhone: dto.emergencyPhone ?? null,
      },
      include: {
        member: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            userId: true,
          },
        },
        parent: { select: { id: true, email: true, phone: true } },
        child: { select: { id: true, email: true, phone: true } },
      },
    });
  }

  async updateRegistration(
    tripId: string,
    registrationId: string,
    dto: UpdateTripRegistrationDto,
  ) {
    const registration = await this.findOneRegistration(tripId, registrationId);

    const data: any = {};

    if (dto.status !== undefined) {
      // 취소 처리 시 취소 시간 기록
      if (dto.status === "cancelled" && registration.status !== "cancelled") {
        data.cancelledAt = new Date();
        data.cancelReason = dto.cancelReason ?? null;
      }
      data.status = dto.status;
    }

    if (dto.passportVerified !== undefined)
      data.passportVerified = dto.passportVerified;
    if (dto.passportExpiryDate !== undefined)
      data.passportExpiryDate = dto.passportExpiryDate
        ? new Date(dto.passportExpiryDate)
        : null;
    if (dto.specialRequirements !== undefined)
      data.specialRequirements = dto.specialRequirements || null;
    if (dto.emergencyContact !== undefined)
      data.emergencyContact = dto.emergencyContact || null;
    if (dto.emergencyPhone !== undefined)
      data.emergencyPhone = dto.emergencyPhone || null;
    if (dto.cancelReason !== undefined && dto.status !== "cancelled")
      data.cancelReason = dto.cancelReason || null;

    const updated = await this.prisma.overseasTripRegistration.update({
      where: { id: registrationId },
      data,
      include: {
        member: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            userId: true,
          },
        },
        parent: { select: { id: true, email: true, phone: true } },
        child: { select: { id: true, email: true, phone: true } },
      },
    });

    // 취소 처리 시 대기자 자동 승격
    if (dto.status === "cancelled" && registration.status !== "cancelled") {
      await this.promoteWaitlistedRegistration(tripId);
    }

    return updated;
  }

  async removeRegistration(tripId: string, registrationId: string) {
    const registration = await this.findOneRegistration(tripId, registrationId);

    await this.prisma.overseasTripRegistration.delete({
      where: { id: registrationId },
    });

    return {
      message: `참가 등록이 삭제되었습니다. (회원: ${registration.member.playerName})`,
    };
  }

  // ==================== 참가 취소 처리 ====================

  async cancelRegistration(
    tripId: string,
    registrationId: string,
    reason?: string,
    requestUserId?: string,
    requestUserType?: string,
  ) {
    const registration = await this.findOneRegistration(tripId, registrationId);

    if (registration.status === "cancelled") {
      throw new BadRequestException("이미 취소된 등록입니다.");
    }

    // 본인 또는 ADMIN/DIRECTOR만 취소 가능
    if (requestUserId && requestUserType) {
      const isAdminOrDirector = ["ADMIN", "DIRECTOR"].includes(requestUserType);
      const isOwner = registration.parentId === requestUserId;
      if (!isAdminOrDirector && !isOwner) {
        throw new ForbiddenException("본인의 참가 등록만 취소할 수 있습니다.");
      }
    }

    const updated = await this.prisma.overseasTripRegistration.update({
      where: { id: registrationId },
      data: {
        status: "cancelled",
        cancelReason: reason ?? null,
        cancelledAt: new Date(),
      },
      include: {
        member: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            userId: true,
          },
        },
        parent: { select: { id: true, email: true, phone: true } },
      },
    });

    // 대기자 자동 승격
    await this.promoteWaitlistedRegistration(tripId);

    return updated;
  }

  // ==================== 예치금 납부 처리 ====================

  async processDeposit(tripId: string, registrationId: string, amount: string) {
    const registration = await this.findOneRegistration(tripId, registrationId);

    if (registration.status === "cancelled") {
      throw new BadRequestException(
        "취소된 등록에는 예치금을 납부할 수 없습니다.",
      );
    }

    if (registration.status === "deposit_paid") {
      throw new ConflictException("이미 예치금이 납부되었습니다.");
    }

    return this.prisma.overseasTripRegistration.update({
      where: { id: registrationId },
      data: {
        status: "deposit_paid",
        depositAmount: amount,
        depositPaidAt: new Date(),
      },
      include: {
        member: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            userId: true,
          },
        },
        parent: { select: { id: true, email: true, phone: true } },
      },
    });
  }

  // ==================== 참가자 현황 통계 ====================

  async getTripStatistics(tripId: string) {
    const trip = await this.prisma.overseasTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        title: true,
        maxParticipants: true,
        status: true,
        registrationDeadline: true,
      },
    });

    if (!trip) {
      throw new NotFoundException("해외 원정을 찾을 수 없습니다.");
    }

    const statusCounts = await this.prisma.overseasTripRegistration.groupBy({
      by: ["status"],
      where: { tripId },
      _count: { status: true },
    });

    const totalRegistrations = await this.prisma.overseasTripRegistration.count(
      {
        where: { tripId },
      },
    );

    const depositPaidCount = await this.prisma.overseasTripRegistration.count({
      where: { tripId, status: "deposit_paid" },
    });

    const passportVerifiedCount =
      await this.prisma.overseasTripRegistration.count({
        where: { tripId, passportVerified: true },
      });

    const statusMap: Record<string, number> = {};
    for (const item of statusCounts) {
      statusMap[item.status] = item._count.status;
    }

    return {
      trip: {
        id: trip.id,
        title: trip.title,
        maxParticipants: trip.maxParticipants,
        status: trip.status,
        registrationDeadline: trip.registrationDeadline,
      },
      statistics: {
        totalRegistrations,
        pending: statusMap["pending"] ?? 0,
        confirmed: statusMap["confirmed"] ?? 0,
        depositPaid: depositPaidCount,
        cancelled: statusMap["cancelled"] ?? 0,
        waitlisted: statusMap["waitlisted"] ?? 0,
        passportVerified: passportVerifiedCount,
        remainingSlots: Math.max(
          0,
          trip.maxParticipants -
            totalRegistrations +
            (statusMap["cancelled"] ?? 0),
        ),
      },
    };
  }

  // ==================== 대기자 자동 승격 ====================

  private async promoteWaitlistedRegistration(tripId: string) {
    try {
      const nextWaitlisted =
        await this.prisma.overseasTripRegistration.findFirst({
          where: { tripId, status: "waitlisted" },
          orderBy: { createdAt: "asc" },
          include: {
            parent: { select: { id: true } },
            trip: { select: { title: true } },
            member: { select: { playerName: true } },
          },
        });

      if (!nextWaitlisted) return;

      await this.prisma.overseasTripRegistration.update({
        where: { id: nextWaitlisted.id },
        data: { status: "pending" },
      });

      // 승격 알림 생성
      await this.prisma.notification.create({
        data: {
          userId: nextWaitlisted.parent.id,
          notificationType: "trip_waitlist_promoted",
          title: "원정 참가 대기 승격",
          message: `${nextWaitlisted.member.playerName}의 "${nextWaitlisted.trip.title}" 원정 참가가 대기에서 승격되었습니다. 등록을 진행해주세요.`,
        },
      });

      this.logger.log(
        `대기자 승격: ${nextWaitlisted.member.playerName} → pending (원정: ${nextWaitlisted.trip.title})`,
      );
    } catch (error) {
      this.logger.error("대기자 자동 승격 처리 실패", error);
    }
  }
}
