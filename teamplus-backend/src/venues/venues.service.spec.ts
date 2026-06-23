import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { VenuesService } from "./venues.service";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateVenueDto } from "./dto/update-venue.dto";

/**
 * VenuesService 유닛 테스트
 *
 * 핵심 시나리오:
 *  1. createVenue RBAC
 *     - ADMIN / DIRECTOR 성공
 *     - COACH 본인 클럽 자동 주입
 *     - COACH 타 클럽 지정 시 ForbiddenException
 *     - PARENT 호출 시 ForbiddenException
 *  2. updateVenue 소유권
 *     - COACH 본인 클럽만 수정 가능
 *  3. deleteVenue
 *     - ADMIN / DIRECTOR 만 가능, COACH 차단
 *     - 활성 예약/계약 존재 시 Conflict
 *  4. updateVenueStatus
 *     - 동일 상태 유지 시 조회만
 */
describe("VenuesService", () => {
  let service: VenuesService;

  // 변경 가능하도록 readonly(as const) 해제 — 일부 스펙에서 venueBooking 모킹 구조를 재지정
  const mockPrismaService: {
    venue: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    venueBooking: {
      findUnique?: jest.Mock;
      findMany: jest.Mock;
      count?: jest.Mock;
      update?: jest.Mock;
    };
    venueHoliday: { findUnique: jest.Mock };
    coachProfile: { findUnique: jest.Mock };
    clubMember: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
  } = {
    venue: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    venueBooking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    venueHoliday: {
      findUnique: jest.fn(),
    },
    coachProfile: {
      findUnique: jest.fn(),
    },
    clubMember: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenuesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<VenuesService>(VenuesService);

    jest.clearAllMocks();
  });

  // ==================== createVenue ====================

  describe("createVenue", () => {
    const baseDto: CreateVenueDto = {
      name: "목동 아이스링크",
      address: "서울 양천구 안양천로 939",
      phone: "02-2649-8454",
    } as CreateVenueDto;

    it("ADMIN 이 임의 teamId 로 생성할 수 있다", async () => {
      mockPrismaService.venue.create.mockResolvedValueOnce({
        id: "v1",
        name: baseDto.name,
        status: "active",
      });

      const result = await service.createVenue("admin-id", "ADMIN", {
        ...baseDto,
        teamId: "club-a",
      });

      expect(result.id).toBe("v1");
      expect(mockPrismaService.venue.create).toHaveBeenCalledTimes(1);
      const arg = mockPrismaService.venue.create.mock.calls[0][0];
      expect(arg.data.team).toEqual({ connect: { id: "club-a" } });
    });

    it("COACH 는 본인 CoachProfile.teamId 가 강제 주입된다", async () => {
      mockPrismaService.coachProfile.findUnique.mockResolvedValueOnce({
        teamId: "my-club",
      });
      mockPrismaService.venue.create.mockResolvedValueOnce({
        id: "v2",
        name: baseDto.name,
      });

      await service.createVenue("coach-id", "COACH", baseDto);

      const arg = mockPrismaService.venue.create.mock.calls[0][0];
      expect(arg.data.team).toEqual({ connect: { id: "my-club" } });
    });

    it("COACH 가 타 팀 teamId 를 지정하면 ForbiddenException", async () => {
      mockPrismaService.coachProfile.findUnique.mockResolvedValueOnce({
        teamId: "my-club",
      });

      await expect(
        service.createVenue("coach-id", "COACH", {
          ...baseDto,
          teamId: "other-club",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockPrismaService.venue.create).not.toHaveBeenCalled();
    });

    it("COACH 가 소속 클럽이 전혀 없으면 ForbiddenException", async () => {
      mockPrismaService.coachProfile.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.clubMember.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createVenue("coach-id", "COACH", baseDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("PARENT 는 호출 시 ForbiddenException", async () => {
      await expect(
        service.createVenue("parent-id", "PARENT", baseDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ==================== updateVenue ====================

  describe("updateVenue", () => {
    it("COACH 는 본인 클럽 구장만 수정할 수 있다", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        teamId: "other-club",
      });
      mockPrismaService.coachProfile.findUnique.mockResolvedValueOnce({
        teamId: "my-club",
      });

      await expect(
        service.updateVenue("v1", "coach-id", "COACH", {
          name: "수정",
        } as UpdateVenueDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("DIRECTOR 는 임의 구장 수정 성공", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        teamId: "club-a",
      });
      mockPrismaService.venue.update.mockResolvedValueOnce({
        id: "v1",
        name: "수정",
      });

      const result = await service.updateVenue(
        "v1",
        "director-id",
        "DIRECTOR",
        { name: "수정" } as UpdateVenueDto,
      );
      expect(result.name).toBe("수정");
    });

    it("존재하지 않는 구장 ID 는 NotFoundException", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateVenue("none", "admin", "ADMIN", {} as UpdateVenueDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ==================== deleteVenue ====================

  describe("deleteVenue", () => {
    it("COACH 는 삭제 불가 (ForbiddenException)", async () => {
      await expect(service.deleteVenue("v1", "COACH")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("활성 예약이 남아있으면 Conflict", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        _count: { bookings: 2, rentalContracts: 0 },
      });

      await expect(service.deleteVenue("v1", "ADMIN")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("예약/계약 없으면 ADMIN 삭제 성공", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        _count: { bookings: 0, rentalContracts: 0 },
      });
      mockPrismaService.venue.delete.mockResolvedValueOnce({ id: "v1" });

      const result = await service.deleteVenue("v1", "ADMIN");
      expect(result).toEqual({ success: true, id: "v1" });
    });
  });

  // ==================== updateVenueImage ====================

  describe("updateVenueImage", () => {
    it("유효한 HTTPS URL 은 통과", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        teamId: null,
      });
      mockPrismaService.venue.update.mockResolvedValueOnce({
        id: "v1",
        imageUrl: "https://cdn.teamplus.com/venues/abc.jpg",
      });

      const result = await service.updateVenueImage(
        "v1",
        "admin-id",
        "ADMIN",
        "https://cdn.teamplus.com/venues/abc.jpg",
      );

      expect(result.imageUrl).toBe("https://cdn.teamplus.com/venues/abc.jpg");
    });

    it("업로드 경로 `/uploads/venues/...` 통과", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        teamId: null,
      });
      mockPrismaService.venue.update.mockResolvedValueOnce({
        id: "v1",
        imageUrl: "/uploads/venues/venue-1.jpg",
      });

      const result = await service.updateVenueImage(
        "v1",
        "admin-id",
        "ADMIN",
        "/uploads/venues/venue-1.jpg",
      );

      expect(result.imageUrl).toBe("/uploads/venues/venue-1.jpg");
    });

    it("잘못된 URL 스킴(ftp://...)은 BadRequest", async () => {
      const { BadRequestException } = await import("@nestjs/common");

      await expect(
        service.updateVenueImage(
          "v1",
          "admin-id",
          "ADMIN",
          "ftp://example.com/bad.jpg",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ==================== approveBooking ====================

  describe("approveBooking", () => {
    it("대기 중이 아닌 예약은 BadRequest", async () => {
      mockPrismaService.venueBooking.findUnique!.mockResolvedValueOnce({
        id: "b1",
        status: "confirmed",
        venueId: "v1",
        date: new Date("2026-05-01"),
        startTime: "10:00",
        endTime: "12:00",
      });
      const { BadRequestException } = await import("@nestjs/common");

      await expect(
        service.approveBooking("b1", "admin"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("충돌 없는 pending 예약은 confirmed 로 승인", async () => {
      mockPrismaService.venueBooking.findUnique!.mockResolvedValueOnce({
        id: "b1",
        status: "pending",
        venueId: "v1",
        date: new Date("2026-05-01"),
        startTime: "10:00",
        endTime: "12:00",
      });
      mockPrismaService.venueBooking.findMany.mockResolvedValueOnce([]);
      mockPrismaService.venueBooking.update!.mockResolvedValueOnce({
        id: "b1",
        status: "confirmed",
        date: new Date("2026-05-01"),
        startTime: "10:00",
        endTime: "12:00",
        purpose: null,
        totalPrice: null,
        venue: { id: "v1", name: "목동" },
        bookedBy: { id: "u1", firstName: "길", lastName: "홍" },
      });

      const result = await service.approveBooking("b1", "admin");
      expect(result.status).toBe("confirmed");
      expect(mockPrismaService.venueBooking.update).toHaveBeenCalled();
    });
  });

  // ==================== cancelBooking ====================

  describe("cancelBooking", () => {
    it("본인이 아닌 예약은 Forbidden", async () => {
      mockPrismaService.venueBooking.findUnique!.mockResolvedValueOnce({
        id: "b1",
        status: "pending",
        bookedById: "other-user",
      });

      await expect(
        service.cancelBooking("b1", "me-user"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("완료된 예약은 BadRequest", async () => {
      mockPrismaService.venueBooking.findUnique!.mockResolvedValueOnce({
        id: "b1",
        status: "completed",
        bookedById: "me-user",
      });
      const { BadRequestException } = await import("@nestjs/common");

      await expect(
        service.cancelBooking("b1", "me-user"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ==================== updateVenueStatus ====================

  describe("updateVenueStatus", () => {
    it("동일 상태 업데이트 시 update 대신 조회만 수행", async () => {
      mockPrismaService.venue.findUnique
        .mockResolvedValueOnce({
          id: "v1",
          teamId: null,
          status: "active",
        })
        .mockResolvedValueOnce({ id: "v1", status: "active" });

      await service.updateVenueStatus("v1", "admin-id", "ADMIN", "active");

      expect(mockPrismaService.venue.update).not.toHaveBeenCalled();
    });

    it("다른 상태로 전환 시 update 호출", async () => {
      mockPrismaService.venue.findUnique.mockResolvedValueOnce({
        id: "v1",
        teamId: null,
        status: "active",
      });
      mockPrismaService.venue.update.mockResolvedValueOnce({
        id: "v1",
        status: "maintenance",
      });

      const result = await service.updateVenueStatus(
        "v1",
        "admin-id",
        "ADMIN",
        "maintenance",
      );

      expect(mockPrismaService.venue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "v1" },
          data: { status: "maintenance" },
        }),
      );
      expect(result?.status).toBe("maintenance");
    });
  });
});
