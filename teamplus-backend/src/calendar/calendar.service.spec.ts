import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * CalendarService 스펙 — 학부모/학생 달력의 대회 노출 정책이 핵심 검증 대상.
 *
 * 정책: 일정(달력)에는 "참여한" 대회만 노출한다.
 *   · 선불(PREPAID) = 결제완료(PAID)만 · 후불(POSTPAID) = 신청(취소/환불 제외)
 *   · 명단(selectedParticipantIds) 선택만으로는 노출하지 않는다 (훈련 목록 전용).
 */
describe("CalendarService", () => {
  let service: CalendarService;

  const mockPrismaService = {
    parentChild: { findMany: jest.fn(), findFirst: jest.fn() },
    teamMember: { findMany: jest.fn() },
    academyMember: { findMany: jest.fn() },
    academyCoach: { findMany: jest.fn() },
    academy: { findMany: jest.fn() },
    classSchedule: { findMany: jest.fn() },
    tournament: { findMany: jest.fn() },
    tournamentRegistration: { findMany: jest.fn() },
    hockeyMatch: { findMany: jest.fn() },
  };

  /** 코치/감독 owner 조회(getUserOwnerIds) mock — team-1 소속 */
  const mockCoachOwner = () => {
    mockPrismaService.teamMember.findMany.mockResolvedValue([
      { teamId: "team-1" },
    ]);
    mockPrismaService.academyMember.findMany.mockResolvedValue([]);
    mockPrismaService.academyCoach.findMany.mockResolvedValue([]);
    mockPrismaService.academy.findMany.mockResolvedValue([]);
  };

  /** 학부모 자녀 1명(child-1) mock — resolveScopedChildUserIds 경유 */
  const mockParentWithChild = () => {
    mockPrismaService.parentChild.findMany.mockResolvedValue([
      { childId: "child-1" },
    ]);
  };

  const TOURNAMENT_ROW = {
    id: "t-1",
    name: "테스트 대회",
    startDate: new Date(Date.UTC(2026, 3, 10)),
    endDate: new Date(Date.UTC(2026, 3, 11)),
    location: null,
    venue: null,
    rink: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
    jest.clearAllMocks();
    // 공통 기본값 — 각 테스트에서 필요한 것만 override
    mockPrismaService.classSchedule.findMany.mockResolvedValue([]);
    mockPrismaService.hockeyMatch.findMany.mockResolvedValue([]);
    mockPrismaService.tournamentRegistration.findMany.mockResolvedValue([]);
  });

  // ── getMonthlyCalendar ────────────────────────────────────────────────────

  describe("getMonthlyCalendar", () => {
    it("month 형식이 잘못되면 BadRequestException을 던진다", async () => {
      await expect(
        service.getMonthlyCalendar("user-1", "PARENT", "2026/04"),
      ).rejects.toThrow(BadRequestException);
    });

    it("학부모: 자녀가 없으면 빈 달력을 반환하고 대회를 조회하지 않는다", async () => {
      mockPrismaService.parentChild.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyCalendar(
        "parent-1",
        "PARENT",
        "2026-04",
      );

      expect(result).toEqual([]);
      expect(mockPrismaService.tournament.findMany).not.toHaveBeenCalled();
      expect(
        mockPrismaService.tournamentRegistration.findMany,
      ).not.toHaveBeenCalled();
    });

    it("학부모: 선불 미결제(PENDING) 등록만 있으면 대회가 노출되지 않는다", async () => {
      mockParentWithChild();
      mockPrismaService.tournamentRegistration.findMany.mockResolvedValue([
        { tournamentId: "t-1", paymentStatus: "PENDING" },
      ]);
      // 참여 판정 유틸의 후불 확인 쿼리 — PREPAID 대회라 빈 결과
      mockPrismaService.tournament.findMany.mockResolvedValueOnce([]);

      const result = await service.getMonthlyCalendar(
        "parent-1",
        "PARENT",
        "2026-04",
      );

      expect(result).toEqual([]);
      // billingMode=POSTPAID 확인 1회만 — 대회 본조회는 하지 않는다
      expect(mockPrismaService.tournament.findMany).toHaveBeenCalledTimes(1);
    });

    it("학부모: 후불 대회는 신청(UNPAID)만으로 일정에 노출된다", async () => {
      mockParentWithChild();
      mockPrismaService.tournamentRegistration.findMany.mockResolvedValue([
        { tournamentId: "t-1", paymentStatus: "UNPAID" },
      ]);
      mockPrismaService.tournament.findMany
        .mockResolvedValueOnce([{ id: "t-1" }]) // 참여 판정 — POSTPAID 확인
        .mockResolvedValueOnce([TOURNAMENT_ROW]); // 대회 본조회

      const result = await service.getMonthlyCalendar(
        "parent-1",
        "PARENT",
        "2026-04",
      );

      const day = result.find((d) => d.date === "2026-04-10");
      expect(day?.events[0]?.type).toBe("TOURNAMENT");
      expect(day?.events[0]?.title).toBe("테스트 대회");
    });

    it("학부모: 결제완료(PAID) 대회는 일정에 노출된다", async () => {
      mockParentWithChild();
      mockPrismaService.tournamentRegistration.findMany.mockResolvedValue([
        { tournamentId: "t-1", paymentStatus: "PAID" },
      ]);
      // PAID 는 후불 확인 쿼리 없이 바로 대회 본조회 1회
      mockPrismaService.tournament.findMany.mockResolvedValueOnce([
        TOURNAMENT_ROW,
      ]);

      const result = await service.getMonthlyCalendar(
        "parent-1",
        "PARENT",
        "2026-04",
      );

      const day = result.find((d) => d.date === "2026-04-10");
      expect(day?.events[0]?.type).toBe("TOURNAMENT");
      expect(mockPrismaService.tournament.findMany).toHaveBeenCalledTimes(1);
    });

    it("코치: 관리 팀의 대회가 노출되고 참여(등록) 조회는 하지 않는다", async () => {
      mockCoachOwner();
      mockPrismaService.tournament.findMany.mockResolvedValue([
        TOURNAMENT_ROW,
      ]);

      const result = await service.getMonthlyCalendar(
        "coach-1",
        "COACH",
        "2026-04",
      );

      const day = result.find((d) => d.date === "2026-04-10");
      expect(day?.events[0]?.type).toBe("TOURNAMENT");
      expect(
        mockPrismaService.tournamentRegistration.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  // ── getYearlyHistory ──────────────────────────────────────────────────────

  describe("getYearlyHistory", () => {
    it("잘못된 연도 형식이면 BadRequestException을 던진다", async () => {
      await expect(
        service.getYearlyHistory("user-1", "PARENT", "abcd"),
      ).rejects.toThrow(BadRequestException);
    });

    it("코치: 12개월 집계 결과를 반환한다", async () => {
      mockCoachOwner();
      mockPrismaService.classSchedule.findMany.mockResolvedValue([
        { scheduledDate: new Date(Date.UTC(2026, 2, 10)) },
      ]);
      mockPrismaService.tournament.findMany.mockResolvedValue([
        {
          startDate: new Date(Date.UTC(2026, 5, 1)),
          endDate: new Date(Date.UTC(2026, 5, 3)),
        },
      ]);

      const result = await service.getYearlyHistory("user-1", "COACH", "2026");

      expect(result).toHaveLength(12);
      const march = result.find((r) => r.month === 3);
      expect(march?.classCount).toBe(1);
      const june = result.find((r) => r.month === 6);
      expect(june?.tournamentCount).toBe(1);
    });
  });
});
