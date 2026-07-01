import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateVenueDto } from "./dto/update-venue.dto";
import { sanitizeStrict } from "@/common/utils/sanitize.util";

/**
 * 구장 관리 권한 체계
 * - SYSTEM / OPER: 어드민 대시보드 운영자 — 전체 구장 생성/수정/삭제 가능 (2026-07-01 추가)
 * - ADMIN / DIRECTOR / ACADEMY_DIRECTOR: 전체 구장에 대해 생성/수정/삭제 가능
 * - COACH: 본인 소속 클럽의 구장만 생성/수정 가능 (삭제 불가)
 * - PARENT / TEEN / CHILD: 조회 전용
 */
const FULL_MANAGE_ROLES = new Set([
  "SYSTEM",
  "OPER",
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
]);
const COACH_ROLE = "COACH";
const DELETE_ALLOWED_ROLES = new Set([
  "SYSTEM",
  "OPER",
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
]);

const VENUE_PUBLIC_SELECT = {
  id: true,
  teamId: true,
  name: true,
  address: true,
  addressDetail: true,
  city: true,
  zipCode: true,
  phone: true,
  latitude: true,
  longitude: true,
  capacity: true,
  rinkSize: true,
  amenities: true,
  operatingHours: true,
  status: true,
  imageUrl: true,
  hourlyRate: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VenueSelect;

@Injectable()
export class VenuesService {
  constructor(private prisma: PrismaService) {}

  // ==================== 구장 조회 ====================

  /**
   * 공개 구장 목록 조회 (운영중인 구장만)
   */
  async getPublicVenues(params: {
    search?: string;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, city, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.VenueWhereInput = {
      status: "active",
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    if (city) {
      where.city = city;
    }

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: VENUE_PUBLIC_SELECT,
      }),
      this.prisma.venue.count({ where }),
    ]);

    return {
      data: venues,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 구장 상세 조회 (공개)
   *
   * - VENUE_PUBLIC_SELECT + club 요약을 함께 반환해 프론트 `Venue` 타입과 1:1 매칭
   * - description / zipCode / createdAt / updatedAt 포함 (프론트 타입 동기화)
   */
  async getVenueDetail(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        ...VENUE_PUBLIC_SELECT,
        team: {
          select: { id: true, name: true },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    return venue;
  }

  // ==================== 대관 예약 ====================

  /**
   * 대관 예약 생성 + 시간대 충돌 검증
   */
  async createBooking(userId: string, venueId: string, dto: CreateBookingDto) {
    // 1) 구장 존재 확인
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, name: true, status: true, hourlyRate: true },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    if (venue.status !== "active") {
      throw new BadRequestException("현재 이용할 수 없는 구장입니다.");
    }

    // 2) 시간 유효성 검증
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException(
        "종료 시간은 시작 시간보다 이후여야 합니다.",
      );
    }

    // 3) 과거 날짜 검증
    const bookingDate = new Date(dto.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      throw new BadRequestException("과거 날짜에는 예약할 수 없습니다.");
    }

    // 4) 시간대 충돌 검증 (트랜잭션 내에서)
    return this.prisma.$transaction(async (tx) => {
      const conflicts = await tx.venueBooking.findMany({
        where: {
          venueId,
          date: bookingDate,
          status: { in: ["pending", "confirmed"] },
          AND: [
            { startTime: { lt: dto.endTime } },
            { endTime: { gt: dto.startTime } },
          ],
        },
        select: { id: true, startTime: true, endTime: true },
      });

      if (conflicts.length > 0) {
        throw new ConflictException("해당 시간대에 이미 예약이 있습니다.");
      }

      // 5) 대관료 계산 (hourlyRate 기반)
      let totalPrice: number | undefined;
      if (venue.hourlyRate) {
        const startMinutes = this.timeToMinutes(dto.startTime);
        const endMinutes = this.timeToMinutes(dto.endTime);
        const hours = (endMinutes - startMinutes) / 60;
        totalPrice = Math.round(venue.hourlyRate * hours);
      }

      // 6) 예약 생성
      const booking = await tx.venueBooking.create({
        data: {
          venueId,
          bookedById: userId,
          teamId: dto.teamId || null,
          date: bookingDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          purpose: dto.purpose || null,
          totalPrice: totalPrice ?? null,
          status: "pending",
          memo: dto.memo || null,
        },
        select: {
          id: true,
          venueId: true,
          date: true,
          startTime: true,
          endTime: true,
          purpose: true,
          totalPrice: true,
          status: true,
          memo: true,
          createdAt: true,
          venue: { select: { id: true, name: true } },
        },
      });

      return booking;
    });
  }

  /**
   * 구장별 예약 목록 조회
   */
  async getBookingsByVenue(
    venueId: string,
    params: { date?: string; status?: string; page?: number; limit?: number },
  ) {
    const { date, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    // 구장 존재 확인
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    const where: Prisma.VenueBookingWhereInput = { venueId };

    if (date) {
      where.date = new Date(date);
    }

    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      this.prisma.venueBooking.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          purpose: true,
          totalPrice: true,
          status: true,
          memo: true,
          cancelReason: true,
          createdAt: true,
          bookedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.venueBooking.count({ where }),
    ]);

    return {
      data: bookings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 내 예약 목록 조회
   */
  async getMyBookings(
    userId: string,
    params: { status?: string; page?: number; limit?: number },
  ) {
    const { status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.VenueBookingWhereInput = { bookedById: userId };

    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      this.prisma.venueBooking.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: "desc" }, { startTime: "asc" }],
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          purpose: true,
          totalPrice: true,
          status: true,
          memo: true,
          cancelReason: true,
          createdAt: true,
          venue: {
            select: { id: true, name: true, address: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.venueBooking.count({ where }),
    ]);

    return {
      data: bookings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 예약 승인 (ADMIN/DIRECTOR)
   */
  async approveBooking(bookingId: string, _approverId: string) {
    const booking = await this.prisma.venueBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        venueId: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    if (!booking) {
      throw new NotFoundException("예약을 찾을 수 없습니다.");
    }

    if (booking.status !== "pending") {
      throw new BadRequestException("대기 중인 예약만 승인할 수 있습니다.");
    }

    // 승인 시점에도 충돌 재검증
    const conflicts = await this.prisma.venueBooking.findMany({
      where: {
        venueId: booking.venueId,
        date: booking.date,
        status: "confirmed",
        id: { not: bookingId },
        AND: [
          { startTime: { lt: booking.endTime } },
          { endTime: { gt: booking.startTime } },
        ],
      },
      select: { id: true },
    });

    if (conflicts.length > 0) {
      throw new ConflictException(
        "해당 시간대에 이미 승인된 예약이 있어 승인할 수 없습니다.",
      );
    }

    const updated = await this.prisma.venueBooking.update({
      where: { id: bookingId },
      data: { status: "confirmed" },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        purpose: true,
        totalPrice: true,
        status: true,
        venue: { select: { id: true, name: true } },
        bookedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * 예약 거절 (ADMIN/DIRECTOR)
   */
  async rejectBooking(bookingId: string, _approverId: string, reason: string) {
    const booking = await this.prisma.venueBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });

    if (!booking) {
      throw new NotFoundException("예약을 찾을 수 없습니다.");
    }

    if (booking.status !== "pending") {
      throw new BadRequestException("대기 중인 예약만 거절할 수 있습니다.");
    }

    const updated = await this.prisma.venueBooking.update({
      where: { id: bookingId },
      data: {
        status: "cancelled",
        cancelReason: reason,
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        cancelReason: true,
        venue: { select: { id: true, name: true } },
        bookedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * 예약 취소 (본인만)
   */
  async cancelBooking(bookingId: string, userId: string) {
    const booking = await this.prisma.venueBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, bookedById: true },
    });

    if (!booking) {
      throw new NotFoundException("예약을 찾을 수 없습니다.");
    }

    if (booking.bookedById !== userId) {
      throw new ForbiddenException("본인의 예약만 취소할 수 있습니다.");
    }

    if (!["pending", "confirmed"].includes(booking.status)) {
      throw new BadRequestException(
        "대기 중이거나 승인된 예약만 취소할 수 있습니다.",
      );
    }

    const updated = await this.prisma.venueBooking.update({
      where: { id: bookingId },
      data: {
        status: "cancelled",
        cancelReason: "예약자 본인 취소",
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        cancelReason: true,
        venue: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  /**
   * 시간대 가용성 확인
   * 특정 구장의 특정 날짜에 예약 현황을 조회하여 가용 여부를 반환
   */
  async checkAvailability(
    venueId: string,
    date: string,
    startTime?: string,
    endTime?: string,
  ) {
    // 구장 존재 확인
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        operatingHours: true,
        hourlyRate: true,
      },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    // 해당 날짜의 휴무 확인
    const holiday = await this.prisma.venueHoliday.findUnique({
      where: {
        venueId_date: {
          venueId,
          date: new Date(date),
        },
      },
      select: {
        id: true,
        reason: true,
        isAllDay: true,
        startTime: true,
        endTime: true,
      },
    });

    if (holiday && holiday.isAllDay) {
      return {
        available: false,
        reason: `휴무일입니다. (사유: ${holiday.reason})`,
        bookings: [],
      };
    }

    // 해당 날짜의 예약 현황 조회
    const bookings = await this.prisma.venueBooking.findMany({
      where: {
        venueId,
        date: new Date(date),
        status: { in: ["pending", "confirmed"] },
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        purpose: true,
      },
    });

    // 특정 시간대 가용성 확인
    let isAvailable = true;
    if (startTime && endTime) {
      const conflicts = bookings.filter(
        (b) => b.startTime < endTime && b.endTime > startTime,
      );
      isAvailable = conflicts.length === 0;
    }

    return {
      available: isAvailable,
      venueId,
      date,
      hourlyRate: venue.hourlyRate,
      operatingHours: venue.operatingHours,
      holiday: holiday
        ? {
            reason: holiday.reason,
            isAllDay: holiday.isAllDay,
            startTime: holiday.startTime,
            endTime: holiday.endTime,
          }
        : null,
      bookings,
    };
  }

  // ==================== 구장 CRUD (ADMIN / DIRECTOR / COACH) ====================

  /**
   * 구장 생성
   * - ADMIN / DIRECTOR: 임의 teamId 지정 가능
   * - COACH: 본인 소속 clubId만 지정 가능 (dto.teamId 생략 시 자동 채움)
   */
  async createVenue(
    userId: string,
    userRole: string,
    dto: CreateVenueDto,
  ): Promise<Prisma.VenueGetPayload<{ select: typeof VENUE_PUBLIC_SELECT }>> {
    this.assertManageRole(userRole);

    // COACH 는 본인 teamId 로 강제
    let teamId = dto.teamId ?? null;
    if (userRole === COACH_ROLE) {
      const myClubId = await this.getUserClubId(userId);
      if (!myClubId) {
        throw new ForbiddenException(
          "소속 클럽 정보가 없어 구장을 등록할 수 없습니다.",
        );
      }
      if (teamId && teamId !== myClubId) {
        throw new ForbiddenException(
          "본인이 소속된 클럽의 구장만 등록할 수 있습니다.",
        );
      }
      teamId = myClubId;
    }

    const data: Prisma.VenueCreateInput = {
      name: sanitizeStrict(dto.name),
      address: dto.address ? sanitizeStrict(dto.address) : null,
      addressDetail: dto.addressDetail
        ? sanitizeStrict(dto.addressDetail)
        : null,
      city: dto.city ? sanitizeStrict(dto.city) : null,
      zipCode: dto.zipCode ?? null,
      phone: dto.phone ?? null,
      latitude:
        dto.latitude !== undefined ? new Prisma.Decimal(dto.latitude) : null,
      longitude:
        dto.longitude !== undefined ? new Prisma.Decimal(dto.longitude) : null,
      capacity: dto.capacity ?? null,
      rinkSize: dto.rinkSize ?? null,
      amenities: dto.amenities ?? Prisma.JsonNull,
      operatingHours: dto.operatingHours
        ? (dto.operatingHours as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      status: dto.status ?? "active",
      imageUrl: dto.imageUrl ?? null,
      hourlyRate: dto.hourlyRate ?? null,
      description: dto.description ? sanitizeStrict(dto.description) : null,
      team: teamId ? { connect: { id: teamId } } : undefined,
    };

    return this.prisma.venue.create({
      data,
      select: VENUE_PUBLIC_SELECT,
    });
  }

  /**
   * 구장 수정
   * - COACH: 본인 소속 클럽의 구장만 수정 가능
   * - teamId 변경은 ADMIN/DIRECTOR 만
   */
  async updateVenue(
    id: string,
    userId: string,
    userRole: string,
    dto: UpdateVenueDto,
  ) {
    this.assertManageRole(userRole);

    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: { id: true, teamId: true },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    await this.assertVenueOwnership(venue.teamId, userId, userRole);

    // COACH 는 teamId 변경 불가
    if (userRole === COACH_ROLE && dto.teamId && dto.teamId !== venue.teamId) {
      throw new ForbiddenException("코치는 소속 클럽을 변경할 수 없습니다.");
    }

    const data: Prisma.VenueUpdateInput = {};
    if (dto.name !== undefined) data.name = sanitizeStrict(dto.name);
    if (dto.address !== undefined)
      data.address = dto.address ? sanitizeStrict(dto.address) : null;
    if (dto.addressDetail !== undefined)
      data.addressDetail = dto.addressDetail
        ? sanitizeStrict(dto.addressDetail)
        : null;
    if (dto.city !== undefined)
      data.city = dto.city ? sanitizeStrict(dto.city) : null;
    if (dto.zipCode !== undefined) data.zipCode = dto.zipCode;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.latitude !== undefined)
      data.latitude =
        dto.latitude === null ? null : new Prisma.Decimal(dto.latitude);
    if (dto.longitude !== undefined)
      data.longitude =
        dto.longitude === null ? null : new Prisma.Decimal(dto.longitude);
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.rinkSize !== undefined) data.rinkSize = dto.rinkSize;
    if (dto.amenities !== undefined)
      data.amenities = dto.amenities === null ? Prisma.JsonNull : dto.amenities;
    if (dto.operatingHours !== undefined)
      data.operatingHours =
        dto.operatingHours === null
          ? Prisma.JsonNull
          : (dto.operatingHours as unknown as Prisma.InputJsonValue);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.hourlyRate !== undefined) data.hourlyRate = dto.hourlyRate;
    if (dto.description !== undefined)
      data.description = dto.description
        ? sanitizeStrict(dto.description)
        : null;
    if (
      dto.teamId !== undefined &&
      userRole !== COACH_ROLE &&
      dto.teamId !== venue.teamId
    ) {
      data.team = dto.teamId
        ? { connect: { id: dto.teamId } }
        : { disconnect: true };
    }

    return this.prisma.venue.update({
      where: { id },
      data,
      select: VENUE_PUBLIC_SELECT,
    });
  }

  /**
   * 구장 삭제
   * - ADMIN / DIRECTOR / ACADEMY_DIRECTOR 전용 (COACH 불가)
   * - 활성 예약 / 반복 스케줄이 남아있으면 409 Conflict
   */
  async deleteVenue(id: string, userRole: string) {
    if (!DELETE_ALLOWED_ROLES.has(userRole)) {
      throw new ForbiddenException("구장 삭제 권한이 없습니다.");
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            bookings: { where: { status: { in: ["pending", "confirmed"] } } },
            rentalContracts: { where: { status: { in: ["active"] } } },
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    if (venue._count.bookings > 0 || venue._count.rentalContracts > 0) {
      throw new ConflictException(
        "진행 중인 예약 또는 활성 대관 계약이 있어 구장을 삭제할 수 없습니다.",
      );
    }

    await this.prisma.venue.delete({ where: { id } });
    return { success: true, id };
  }

  /**
   * 구장 운영 상태 토글 (운영중/점검중/폐쇄)
   * - COACH: 본인 소속 클럽의 구장만
   */
  async updateVenueStatus(
    id: string,
    userId: string,
    userRole: string,
    status: "active" | "maintenance" | "closed",
  ) {
    this.assertManageRole(userRole);

    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: { id: true, teamId: true, status: true },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    await this.assertVenueOwnership(venue.teamId, userId, userRole);

    if (venue.status === status) {
      return this.prisma.venue.findUnique({
        where: { id },
        select: VENUE_PUBLIC_SELECT,
      });
    }

    return this.prisma.venue.update({
      where: { id },
      data: { status },
      select: VENUE_PUBLIC_SELECT,
    });
  }

  /**
   * 구장 대표 이미지 URL 업데이트
   * - 실제 이미지 바이너리는 별도 업로드 경로로 저장 후 URL 만 반영
   */
  async updateVenueImage(
    id: string,
    userId: string,
    userRole: string,
    imageUrl: string,
  ) {
    this.assertManageRole(userRole);

    if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/uploads/")) {
      throw new BadRequestException("이미지 URL 형식이 올바르지 않습니다.");
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: { id: true, teamId: true },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    await this.assertVenueOwnership(venue.teamId, userId, userRole);

    return this.prisma.venue.update({
      where: { id },
      data: { imageUrl },
      select: VENUE_PUBLIC_SELECT,
    });
  }

  // ==================== 내부 헬퍼 ====================

  private assertManageRole(userRole: string): void {
    if (!FULL_MANAGE_ROLES.has(userRole) && userRole !== COACH_ROLE) {
      throw new ForbiddenException("구장 관리 권한이 없습니다.");
    }
  }

  private async assertVenueOwnership(
    venueClubId: string | null,
    userId: string,
    userRole: string,
  ): Promise<void> {
    if (FULL_MANAGE_ROLES.has(userRole)) return;
    if (userRole !== COACH_ROLE) {
      throw new ForbiddenException("구장 관리 권한이 없습니다.");
    }

    const myClubId = await this.getUserClubId(userId);
    if (!myClubId) {
      throw new ForbiddenException("소속 클럽 정보를 찾을 수 없습니다.");
    }
    if (venueClubId && venueClubId !== myClubId) {
      throw new ForbiddenException(
        "본인 소속 클럽의 구장만 관리할 수 있습니다.",
      );
    }
    // venueClubId 가 null 이고 COACH 인 경우: 무소속 구장은 ADMIN/DIRECTOR만 관리
    if (!venueClubId) {
      throw new ForbiddenException(
        "소속 클럽이 없는 구장은 관리자만 관리할 수 있습니다.",
      );
    }
  }

  /**
   * COACH 의 소속 클럽 ID 조회
   * - CoachProfile.teamId 우선
   * - ClubMember 의 첫 번째 승인된 teamId 폴백
   */
  private async getUserClubId(userId: string): Promise<string | null> {
    // [보안 수정 2026-05-21] CoachProfile.teamId 우선 사용 제거.
    //  CoachProfile 은 가입 시 pending TeamMember 와 함께 자동 생성되므로 권한 증거 아님.
    //  → owner(team.coachId) 또는 approved TeamMember(매니저 역할) 만 본다.
    const ownedTeam = await this.prisma.team.findFirst({
      where: { coachId: userId },
      select: { id: true },
    });
    if (ownedTeam) return ownedTeam.id;

    const membership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        approvalStatus: "approved",
        leftAt: null,
        roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
      },
      select: { teamId: true },
      orderBy: { joinedAt: "desc" },
    });
    return membership?.teamId ?? null;
  }

  // ==================== 유틸리티 ====================

  /**
   * "HH:mm" 형식을 분(minutes) 단위로 변환
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }
}
