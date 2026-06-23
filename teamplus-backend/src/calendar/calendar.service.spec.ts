import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("CalendarService", () => {
  let service: CalendarService;

  const mockPrismaService = {
    clubMember: { findMany: jest.fn() },
    parentChild: { findMany: jest.fn() },
    classSchedule: { findMany: jest.fn() },
    tournament: { findMany: jest.fn() },
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
  });

  // ── getMonthlyCalendar ────────────────────────────────────────────────────

  describe("getMonthlyCalendar", () => {
    it("PARENT 역할이면 자녀의 clubIds도 포함하여 조회한다", async () => {
      // 부모 본인 클럽
      mockPrismaService.clubMember.findMany
        .mockResolvedValueOnce([{ teamId: "club-parent" }]) // own
        .mockResolvedValueOnce([{ teamId: "club-child" }]); // child

      mockPrismaService.parentChild.findMany.mockResolvedValue([
        { childId: "child-1" },
      ]);
      mockPrismaService.classSchedule.findMany.mockResolvedValue([]);
      mockPrismaService.tournament.findMany.mockResolvedValue([]);

      await service.getMonthlyCalendar("parent-1", "PARENT", "2026-04");

      // parentChild.findMany 호출 확인
      expect(mockPrismaService.parentChild.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { parentId: "parent-1" } }),
      );
      // 두 번째 clubMember.findMany에 자녀 ID 포함 확인
      expect(mockPrismaService.clubMember.findMany).toHaveBeenCalledTimes(2);
    });

    it("PARENT가 아닌 역할이면 자녀 클럽 조회를 수행하지 않는다", async () => {
      mockPrismaService.clubMember.findMany.mockResolvedValue([
        { teamId: "club-1" },
      ]);
      mockPrismaService.classSchedule.findMany.mockResolvedValue([]);
      mockPrismaService.tournament.findMany.mockResolvedValue([]);

      await service.getMonthlyCalendar("coach-1", "COACH", "2026-04");

      expect(mockPrismaService.parentChild.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.clubMember.findMany).toHaveBeenCalledTimes(1);
    });

    it("소속 클럽이 없으면 빈 배열을 반환한다", async () => {
      mockPrismaService.clubMember.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyCalendar(
        "user-1",
        "PARENT",
        "2026-04",
      );

      expect(result).toEqual([]);
      // 클럽 없으면 classSchedule.findMany는 호출되지 않아야 함
      expect(mockPrismaService.classSchedule.findMany).not.toHaveBeenCalled();
    });

    it("날짜 범위 내의 일정만 반환하고 날짜순으로 정렬한다", async () => {
      mockPrismaService.clubMember.findMany.mockResolvedValue([
        { teamId: "club-1" },
      ]);
      mockPrismaService.classSchedule.findMany.mockResolvedValue([
        {
          id: "sched-2",
          scheduledDate: new Date("2026-04-15"),
          class: {
            id: "class-1",
            className: "팀훈련",
            trainingType: "team_training",
            startTime: new Date("2026-04-15T09:00:00"),
            endTime: new Date("2026-04-15T11:00:00"),
          },
        },
        {
          id: "sched-1",
          scheduledDate: new Date("2026-04-01"),
          class: {
            id: "class-2",
            className: "개인레슨",
            trainingType: "lesson",
            startTime: new Date("2026-04-01T14:00:00"),
            endTime: new Date("2026-04-01T15:00:00"),
          },
        },
      ]);
      mockPrismaService.tournament.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyCalendar(
        "user-1",
        "COACH",
        "2026-04",
      );

      // 날짜순 정렬 확인
      expect(result[0].date).toBe("2026-04-01");
      expect(result[1].date).toBe("2026-04-15");
    });

    it("lesson 타입 수업은 PERSONAL_LESSON 이벤트 타입으로 매핑된다", async () => {
      mockPrismaService.clubMember.findMany.mockResolvedValue([
        { teamId: "club-1" },
      ]);
      mockPrismaService.classSchedule.findMany.mockResolvedValue([
        {
          id: "sched-1",
          scheduledDate: new Date("2026-04-10"),
          class: {
            id: "class-1",
            className: "개인레슨",
            trainingType: "lesson",
            startTime: new Date("2026-04-10T09:00:00"),
            endTime: new Date("2026-04-10T10:00:00"),
          },
        },
      ]);
      mockPrismaService.tournament.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyCalendar(
        "user-1",
        "COACH",
        "2026-04",
      );

      expect(result[0].events[0].type).toBe("PERSONAL_LESSON");
      expect(result[0].events[0].color).toBe("#16A34A");
    });
  });

  // ── getYearlyHistory ──────────────────────────────────────────────────────

  describe("getYearlyHistory", () => {
    it("잘못된 연도 형식이면 BadRequestException을 던진다", async () => {
      await expect(
        service.getYearlyHistory("user-1", "PARENT", "abcd"),
      ).rejects.toThrow(BadRequestException);
    });

    it("12개월 집계 결과를 반환한다", async () => {
      mockPrismaService.clubMember.findMany.mockResolvedValue([
        { teamId: "club-1" },
      ]);
      mockPrismaService.classSchedule.findMany.mockResolvedValue([
        { scheduledDate: new Date("2026-03-10") },
      ]);
      mockPrismaService.tournament.findMany.mockResolvedValue([
        {
          startDate: new Date("2026-06-01"),
          endDate: new Date("2026-06-03"),
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
