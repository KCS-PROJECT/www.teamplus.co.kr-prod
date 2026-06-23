import { Test, TestingModule } from "@nestjs/testing";
import { OverseasTripsService } from "./overseas-trips.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Phase C-D (2026-05-20) — 4 매퍼 canonical only spec.
 *
 * 이력:
 *   - T3 라운드 2: `clubId`/`club` dual emit 도입.
 *   - Phase 6: web 3개 페이지에 `trip.team?.x ?? trip.club?.y` fallback 마이그레이션.
 *   - Phase C-D: alias clubId/club emit 완전 제거 + 응답 DTO OverseasTripClubDto 클래스 삭제.
 *
 * 4 매퍼:
 *   1. mapToOverseasTripResponse() (findOneTrip)
 *   2. findAllTrips() — Prisma include 결과 그대로 반환
 *   3. createTrip() — Prisma include 결과 그대로 반환
 *   4. updateTrip() — Prisma include 결과 그대로 반환
 *
 * 검증 포인트:
 *   - `team.{id,name}` canonical 보존
 *   - `clubId`/`club` alias 부재 (key 미존재)
 *   - Decimal → Number 변환 (null 유지)
 *   - 4 매퍼 일관성 (같은 team 입력 시 동일 형태)
 */

interface TripMapperShape {
  mapToOverseasTripResponse(trip: unknown): {
    id: string;
    team: { id: string; name: string };
    estimatedCost: number | null;
    depositAmount: number | null;
    clubId?: undefined;
    club?: undefined;
    [key: string]: unknown;
  };
  findAllTrips(
    teamId?: string,
    status?: string,
  ): Promise<
    Array<{
      id: string;
      team: { id: string; name: string };
      clubId?: undefined;
      club?: undefined;
      [key: string]: unknown;
    }>
  >;
  createTrip(
    userId: string,
    dto: unknown,
  ): Promise<{
    id: string;
    team: { id: string; name: string };
    clubId?: undefined;
    club?: undefined;
    [key: string]: unknown;
  }>;
  updateTrip(
    id: string,
    dto: unknown,
  ): Promise<{
    id: string;
    team: { id: string; name: string };
    clubId?: undefined;
    club?: undefined;
    [key: string]: unknown;
  }>;
}

const decimalMock = (n: number) =>
  ({
    valueOf: () => n,
    toNumber: () => n,
    toString: () => String(n),
  }) as unknown as import("@prisma/client/runtime/library").Decimal;

const baseTripInput = () => ({
  id: "trip-1",
  title: "캐나다 원정",
  country: "CA",
  city: "Vancouver",
  description: null,
  startDate: new Date("2026-06-01"),
  endDate: new Date("2026-06-15"),
  registrationDeadline: new Date("2026-05-01"),
  maxParticipants: 20,
  ageGroup: "15-16",
  estimatedCost: null,
  depositAmount: null,
  depositDeadline: null,
  flightInfo: null,
  hotelInfo: null,
  transportInfo: null,
  itinerary: null,
  status: "open",
  contactPhone: null,
  contactEmail: null,
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-04-15"),
  team: { id: "team-99", name: "강남빙상클럽" },
  createdBy: {
    id: "user-1",
    email: "creator@teamplus.com",
    phone: "010-1111-2222",
  },
  registrations: [],
  _count: { registrations: 0 },
});

/** findAllTrips/createTrip/updateTrip 이 include 로 받는 형태 (DB shape) */
const baseIncludedTrip = () => ({
  id: "trip-1",
  title: "캐나다 원정",
  country: "CA",
  city: "Vancouver",
  startDate: new Date("2026-06-01"),
  endDate: new Date("2026-06-15"),
  registrationDeadline: new Date("2026-05-01"),
  maxParticipants: 20,
  status: "open",
  teamId: "team-99",
  createdById: "user-1",
  team: { id: "team-99", name: "강남빙상클럽" },
  createdBy: {
    id: "user-1",
    email: "creator@teamplus.com",
    phone: "010-1111-2222",
  },
  _count: { registrations: 3 },
});

describe("OverseasTripsService — 4 매퍼 canonical only (Phase C-D)", () => {
  let service: TripMapperShape;
  const prismaMock = {
    overseasTrip: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    team: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    Object.values(prismaMock.overseasTrip).forEach((fn) => fn.mockReset());
    prismaMock.team.findUnique.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverseasTripsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<OverseasTripsService>(
      OverseasTripsService,
    ) as unknown as TripMapperShape;
  });

  // ============================================================
  // 매퍼 1: mapToOverseasTripResponse (findOneTrip)
  // ============================================================

  describe("매퍼 #1 — mapToOverseasTripResponse (findOneTrip)", () => {
    it("team.{id,name} canonical 노출, alias clubId/club 부재", () => {
      const input = baseTripInput();
      const result = service.mapToOverseasTripResponse(input);
      expect(result.team.id).toBe("team-99");
      expect(result.team.name).toBe("강남빙상클럽");
      expect("clubId" in result).toBe(false);
      expect("club" in result).toBe(false);
    });

    it("Decimal 필드 (estimatedCost, depositAmount)를 Number로 변환", () => {
      const input = baseTripInput();
      input.estimatedCost = decimalMock(1500000) as unknown as null;
      input.depositAmount = decimalMock(500000) as unknown as null;
      const result = service.mapToOverseasTripResponse(input);
      expect(typeof result.estimatedCost).toBe("number");
      expect(typeof result.depositAmount).toBe("number");
      expect(result.estimatedCost).toBe(1500000);
      expect(result.depositAmount).toBe(500000);
    });

    it("null Decimal은 null로 유지 (undefined 아님)", () => {
      const input = baseTripInput();
      const result = service.mapToOverseasTripResponse(input);
      expect(result.estimatedCost).toBeNull();
      expect(result.depositAmount).toBeNull();
    });
  });

  // ============================================================
  // 매퍼 2: findAllTrips
  // ============================================================

  describe("매퍼 #2 — findAllTrips", () => {
    it("빈 배열도 안전하게 처리", async () => {
      prismaMock.overseasTrip.findMany.mockResolvedValueOnce([]);
      const result = await service.findAllTrips("nonexistent-team");
      expect(result).toEqual([]);
    });

    it("다중 trip 모두 team.{id,name} 보존, alias 부재", async () => {
      const trip1 = baseIncludedTrip();
      const trip2 = {
        ...baseIncludedTrip(),
        id: "trip-2",
        teamId: "team-100",
        team: { id: "team-100", name: "분당빙상클럽" },
      };
      prismaMock.overseasTrip.findMany.mockResolvedValueOnce([trip1, trip2]);

      const result = await service.findAllTrips();
      expect(result).toHaveLength(2);
      expect(result[0].team.id).toBe("team-99");
      expect(result[1].team.id).toBe("team-100");
      expect("clubId" in result[0]).toBe(false);
      expect("club" in result[0]).toBe(false);
      expect("clubId" in result[1]).toBe(false);
      expect("club" in result[1]).toBe(false);
    });

    it("Prisma include 결과 그대로 반환 (페이로드 보존)", async () => {
      const trip = baseIncludedTrip();
      prismaMock.overseasTrip.findMany.mockResolvedValueOnce([trip]);
      const result = await service.findAllTrips();
      expect(result[0].team).toEqual({ id: "team-99", name: "강남빙상클럽" });
      expect(result[0].teamId).toBe("team-99");
      expect(result[0].createdBy).toEqual(trip.createdBy);
      expect(result[0]._count).toEqual({ registrations: 3 });
    });
  });

  // ============================================================
  // 매퍼 3: createTrip
  // ============================================================

  describe("매퍼 #3 — createTrip", () => {
    const validCreateDto = {
      teamId: "team-99",
      title: "캐나다 원정",
      country: "CA",
      city: "Vancouver",
      startDate: "2026-06-01",
      endDate: "2026-06-15",
      registrationDeadline: "2026-05-01",
      maxParticipants: 20,
    };

    it("성공 응답에 team.{id,name} 보존, alias 부재", async () => {
      prismaMock.team.findUnique.mockResolvedValueOnce({ id: "team-99" });
      prismaMock.overseasTrip.create.mockResolvedValueOnce(baseIncludedTrip());

      const result = await service.createTrip("user-1", validCreateDto);
      expect(result.team.id).toBe("team-99");
      expect(result.team.name).toBe("강남빙상클럽");
      expect("clubId" in result).toBe(false);
      expect("club" in result).toBe(false);
    });

    it("teamId 누락 시 clubId fallback (DTO 호환 유지)", async () => {
      const dtoWithClubId = {
        ...validCreateDto,
        teamId: undefined,
        clubId: "team-99",
      };
      prismaMock.team.findUnique.mockResolvedValueOnce({ id: "team-99" });
      prismaMock.overseasTrip.create.mockResolvedValueOnce(baseIncludedTrip());

      const result = await service.createTrip("user-1", dtoWithClubId);
      expect(result.team.id).toBe("team-99");
    });
  });

  // ============================================================
  // 매퍼 4: updateTrip
  // ============================================================

  describe("매퍼 #4 — updateTrip", () => {
    it("성공 응답에 team.{id,name} 보존, alias 부재", async () => {
      prismaMock.overseasTrip.findUnique.mockResolvedValueOnce(baseTripInput());
      prismaMock.overseasTrip.update.mockResolvedValueOnce({
        ...baseIncludedTrip(),
        title: "캐나다 원정 (수정)",
      });

      const result = await service.updateTrip("trip-1", {
        title: "캐나다 원정 (수정)",
      });
      expect(result.team.id).toBe("team-99");
      expect(result.team.name).toBe("강남빙상클럽");
      expect("clubId" in result).toBe(false);
      expect("club" in result).toBe(false);
    });
  });

  // ============================================================
  // 통합: 4 매퍼 일관성
  // ============================================================

  describe("통합 — 4 매퍼 일관성 (같은 team 데이터)", () => {
    it("같은 team 입력 시 모든 매퍼가 동일한 team.{id,name} 반환 + alias 부재", async () => {
      const r1 = service.mapToOverseasTripResponse(baseTripInput());

      prismaMock.overseasTrip.findMany.mockResolvedValueOnce([
        baseIncludedTrip(),
      ]);
      const r2 = (await service.findAllTrips())[0];

      prismaMock.team.findUnique.mockResolvedValueOnce({ id: "team-99" });
      prismaMock.overseasTrip.create.mockResolvedValueOnce(baseIncludedTrip());
      const r3 = await service.createTrip("user-1", {
        teamId: "team-99",
        title: "x",
        country: "CA",
        city: "y",
        startDate: "2026-06-01",
        endDate: "2026-06-15",
        registrationDeadline: "2026-05-01",
        maxParticipants: 20,
      });

      prismaMock.overseasTrip.findUnique.mockResolvedValueOnce(baseTripInput());
      prismaMock.overseasTrip.update.mockResolvedValueOnce(baseIncludedTrip());
      const r4 = await service.updateTrip("trip-1", { title: "x" });

      for (const r of [r1, r2, r3, r4]) {
        expect(r.team.id).toBe("team-99");
        expect(r.team.name).toBe("강남빙상클럽");
        expect("clubId" in r).toBe(false);
        expect("club" in r).toBe(false);
      }
    });
  });
});
