import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClassesService } from "./classes.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { TeamsService } from "@/teams/teams.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "@/attendance/attendance-audit-log.service";
import { NotificationsService } from "@/notifications/notifications.service";

describe("ClassesService", () => {
  let service: ClassesService;
  let prismaService: PrismaService;

  const mockCoachUserId = "coach-123";
  const mockClubId = "club-456";
  const mockClassId = "class-789";
  const mockScheduleId = "schedule-101";

  const mockCoachProfile = {
    id: "coach-profile-1",
    userId: mockCoachUserId,
    teamId: mockClubId,
  };

  const mockClub = {
    id: mockClubId,
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
  };

  const mockClass = {
    id: mockClassId,
    teamId: mockClubId,
    className: "신규 수강생반",
    description: "초보자용 수업",
    instructorName: "김철수",
    capacity: 15,
    ageMin: 4,
    ageMax: 7,
    levelRequired: "beginner",
    startTime: new Date("2026-01-04T16:00:00Z"),
    endTime: new Date("2026-01-04T17:00:00Z"),
    isActive: true,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockSchedule = {
    id: mockScheduleId,
    classId: mockClassId,
    scheduledDate: new Date("2026-01-05T16:00:00Z"),
    isCancelled: false,
    cancellationReason: null,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockRedisService = {
    del: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "redis") {
        return {
          keyPrefix: {
            class: "class:",
          },
          cacheTTL: {
            classList: 300,
          },
        };
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        {
          provide: PrismaService,
          useValue: {
            coachProfile: {
              findFirst: jest.fn(),
            },
            team: {
              findUnique: jest.fn(),
            },
            class: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            classSchedule: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              createMany: jest.fn(),
            },
            classAttendance: {
              updateMany: jest.fn(),
            },
            academy: {
              findUnique: jest.fn(),
            },
            academyCoach: {
              findUnique: jest.fn(),
            },
            enrollment: {
              findMany: jest.fn(),
            },
            classRsvp: {
              findMany: jest.fn(),
              createMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        // 생성자 의존성(구성 전용) — 본 스위트 테스트 경로에서 호출되지 않아 빈 mock 으로 충분.
        { provide: TeamsService, useValue: {} },
        { provide: CreditDomainService, useValue: {} },
        { provide: AttendanceAuditLogService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createClass", () => {
    it("should successfully create a class", async () => {
      const createDto = {
        className: "신규 수강생반",
        description: "초보자용 수업",
        instructorName: "김철수",
        capacity: 15,
        ageMin: 4,
        ageMax: 7,
        levelRequired: "beginner",
        startTime: new Date("2026-01-04T16:00:00Z"),
        endTime: new Date("2026-01-04T17:00:00Z"),
      };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);
      jest
        .spyOn(prismaService.class, "create")
        .mockResolvedValue(mockClass as any);

      const result = await service.createClass(
        mockCoachUserId,
        mockClubId,
        createDto,
      );

      expect(result.className).toBe("신규 수강생반");
      expect(result.instructorName).toBe("김철수");
      expect(result.isActive).toBe(true);

      expect(prismaService.coachProfile.findFirst).toHaveBeenCalledWith({
        where: { userId: mockCoachUserId, teamId: mockClubId },
      });
    });

    it("should throw ForbiddenException if user is not coach of club", async () => {
      const createDto = {
        className: "신규 수강생반",
        instructorName: "김철수",
        capacity: 15,
        startTime: new Date("2026-01-04T16:00:00Z"),
        endTime: new Date("2026-01-04T17:00:00Z"),
      };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.createClass(mockCoachUserId, mockClubId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if club does not exist", async () => {
      const createDto = {
        className: "신규 수강생반",
        instructorName: "김철수",
        capacity: 15,
        startTime: new Date("2026-01-04T16:00:00Z"),
        endTime: new Date("2026-01-04T17:00:00Z"),
      };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest.spyOn(prismaService.team, "findUnique").mockResolvedValue(null);

      await expect(
        service.createClass(mockCoachUserId, mockClubId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if start time is after end time", async () => {
      const createDto = {
        className: "신규 수강생반",
        instructorName: "김철수",
        capacity: 15,
        startTime: new Date("2026-01-04T17:00:00Z"),
        endTime: new Date("2026-01-04T16:00:00Z"),
      };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);

      await expect(
        service.createClass(mockCoachUserId, mockClubId, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getClass", () => {
    it("should successfully retrieve class details", async () => {
      const classWithRelations = {
        ...mockClass,
        team: {
          id: mockClubId,
          name: "서울 아이스 클럽",
          coachName: "감독",
        },
        schedules: [],
        products: [],
      };

      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(classWithRelations as any);

      const result = await service.getClass(mockClassId);

      expect(result.className).toBe("신규 수강생반");
      // 2026-05-14: getClass() 반환 타입에 team 필드가 정의되지 않아 TS2339.
      //   기존 결함 — 본 PR 범위 외이나 spec 컴파일 통과를 위해 캐스팅. 별도 PR 필요.
      expect((result as any).team).toBeDefined();
    });

    it("should throw NotFoundException if class does not exist", async () => {
      jest.spyOn(prismaService.class, "findUnique").mockResolvedValue(null);

      await expect(service.getClass(mockClassId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getClubClasses", () => {
    // getClubClasses 매퍼가 참조하는 관계/집계 필드를 채운 목록용 mock 빌더.
    //   (_count·products·schedules 등 누락 시 매퍼가 throw.)
    const buildListClass = (overrides: Record<string, unknown>) => ({
      ...mockClass,
      team: null,
      academy: null,
      coach: null,
      venue: null,
      products: [],
      schedules: [],
      classDays: [],
      targetBirthYears: [],
      category: null,
      coachId: null,
      approvalStatus: "APPROVED",
      _count: { registrations: 0, waitlists: 0, enrollments: 0 },
      ...overrides,
    });

    it("should successfully retrieve club classes", async () => {
      const classes = [
        buildListClass({}),
        buildListClass({ id: "class-2", className: "중급반" }),
      ];

      jest
        .spyOn(prismaService.class, "findMany")
        .mockResolvedValue(classes as any);

      const result = await service.getClubClasses(mockClubId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it("should return empty array if club has no classes", async () => {
      jest.spyOn(prismaService.class, "findMany").mockResolvedValue([]);

      const result = await service.getClubClasses(mockClubId);

      expect(result).toEqual([]);
    });

    // 오픈클래스 로고 폴백 (2026-07-01): 팀이 없는 오픈클래스는 소속 아카데미
    //   대표 이미지(imageUrl)를 teamLogoUrl 로 내려 목록 카드 로고로 노출.
    it("오픈클래스는 소속 아카데미 대표 이미지를 teamLogoUrl 로 폴백한다", async () => {
      const openClass = buildListClass({
        id: "open-class-1",
        teamId: null,
        academyId: "academy-001",
        academy: { imageUrl: "/uploads/academy/logo.png" },
      });

      jest
        .spyOn(prismaService.class, "findMany")
        .mockResolvedValue([openClass] as any);

      const result = await service.getClubClasses(mockClubId);

      expect((result[0] as any).teamLogoUrl).toBe("/uploads/academy/logo.png");
    });

    it("팀 수업은 팀 로고를 우선 사용한다", async () => {
      const teamClass = buildListClass({
        id: "team-class-1",
        academyId: null,
        team: { logoUrl: "/uploads/team/logo.png" },
        academy: { imageUrl: "/uploads/academy/logo.png" },
      });

      jest
        .spyOn(prismaService.class, "findMany")
        .mockResolvedValue([teamClass] as any);

      const result = await service.getClubClasses(mockClubId);

      expect((result[0] as any).teamLogoUrl).toBe("/uploads/team/logo.png");
    });
  });

  describe("updateClass", () => {
    it("should successfully update class", async () => {
      const updateDto = {
        className: "중급반",
        capacity: 20,
      };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);
      jest.spyOn(prismaService.class, "update").mockResolvedValue({
        ...mockClass,
        className: "중급반",
        capacity: 20,
        team: { name: "서울 아이스 클럽" },
      } as any);

      const result = await service.updateClass(
        mockCoachUserId,
        mockClubId,
        mockClassId,
        updateDto,
      );

      expect(result.className).toBe("중급반");
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      const updateDto = { className: "중급반" };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.updateClass(
          mockCoachUserId,
          mockClubId,
          mockClassId,
          updateDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if class does not exist", async () => {
      const updateDto = { className: "중급반" };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest.spyOn(prismaService.class, "findUnique").mockResolvedValue(null);

      await expect(
        service.updateClass(
          mockCoachUserId,
          mockClubId,
          mockClassId,
          updateDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if time validation fails", async () => {
      const updateDto = {
        startTime: new Date("2026-01-04T17:00:00Z"),
        endTime: new Date("2026-01-04T16:00:00Z"),
      };

      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);

      await expect(
        service.updateClass(
          mockCoachUserId,
          mockClubId,
          mockClassId,
          updateDto,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("deleteClass", () => {
    it("should successfully delete class", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);
      jest
        .spyOn(prismaService.class, "delete")
        .mockResolvedValue(mockClass as any);

      const result = await service.deleteClass(
        mockCoachUserId,
        mockClubId,
        mockClassId,
      );

      expect(result.id).toBe(mockClassId);
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.deleteClass(mockCoachUserId, mockClubId, mockClassId),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if class does not exist", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest.spyOn(prismaService.class, "findUnique").mockResolvedValue(null);

      await expect(
        service.deleteClass(mockCoachUserId, mockClubId, mockClassId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("bulkAddAcademySchedules (오픈클래스 일정 일괄 추가)", () => {
    const mockAcademyId = "academy-001";
    const mockAcademyClassId = "academy-class-002";
    const mockAcademyDirectorId = "academy-director-1";
    const mockAcademy = {
      id: mockAcademyId,
      directorId: mockAcademyDirectorId,
    };
    const mockAcademyClass = {
      id: mockAcademyClassId,
      academyId: mockAcademyId,
      approvalStatus: "APPROVED",
      startTime: new Date("2026-05-15T18:00:00Z"),
    };

    it("기간·요일·시간 기반 일괄 생성 — 결제 학생 RSVP 자동 생성", async () => {
      jest
        .spyOn(prismaService.academy, "findUnique")
        .mockResolvedValue(mockAcademy as any);
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockAcademyClass as any);
      jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue([] as any);
      jest
        .spyOn(prismaService.enrollment, "findMany")
        .mockResolvedValue([
          { childId: "child-1", requestedBy: "parent-1" },
        ] as any);

      // $transaction mock — 콜백 호출 시 tx 객체 주입
      const txClassScheduleCreate = jest.fn().mockImplementation((args) =>
        Promise.resolve({
          id: `sched-${args.data.scheduledDate.getTime()}`,
          classId: args.data.classId,
          scheduledDate: args.data.scheduledDate,
          isCancelled: false,
          createdAt: new Date(),
        }),
      );
      const txRsvpCreateMany = jest.fn().mockResolvedValue({ count: 0 });
      jest.spyOn(prismaService, "$transaction").mockImplementation((cb: any) =>
        cb({
          classSchedule: { create: txClassScheduleCreate },
          classRsvp: { createMany: txRsvpCreateMany },
        }),
      );

      // 1주: 2026-05-15(금)~2026-05-21(목) — 화·목 → 2건(5/19, 5/21)
      const result = await service.bulkAddAcademySchedules(
        mockAcademyDirectorId,
        mockAcademyId,
        mockAcademyClassId,
        {
          startDate: "2026-05-15",
          endDate: "2026-05-21",
          classDays: ["화", "목"],
          startTime: "18:00",
        },
      );

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      expect(txClassScheduleCreate).toHaveBeenCalledTimes(2);
      expect(txRsvpCreateMany).toHaveBeenCalledTimes(1); // schedules x enrollments = 2 rows
    });

    it("기간 내 요일 매칭 0건이면 created=0", async () => {
      jest
        .spyOn(prismaService.academy, "findUnique")
        .mockResolvedValue(mockAcademy as any);
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockAcademyClass as any);

      // 2026-05-15(금) ~ 2026-05-15(금) 단일 일 · 요일 [월] → 0건
      const result = await service.bulkAddAcademySchedules(
        mockAcademyDirectorId,
        mockAcademyId,
        mockAcademyClassId,
        {
          startDate: "2026-05-15",
          endDate: "2026-05-15",
          classDays: ["월"],
          startTime: "18:00",
        },
      );

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("학원 감독·소속 코치 아니면 ForbiddenException", async () => {
      jest
        .spyOn(prismaService.academy, "findUnique")
        .mockResolvedValue(mockAcademy as any);
      jest
        .spyOn(prismaService.academyCoach, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.bulkAddAcademySchedules(
          "stranger-1",
          mockAcademyId,
          mockAcademyClassId,
          {
            startDate: "2026-05-15",
            endDate: "2026-05-21",
            classDays: ["화", "목"],
            startTime: "18:00",
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("cancelClassSchedule", () => {
    it("should successfully cancel schedule and update attendances", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...mockSchedule,
        class: mockClass,
      } as any);
      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(mockCoachProfile as any);
      jest.spyOn(prismaService.classSchedule, "update").mockResolvedValue({
        ...mockSchedule,
        isCancelled: true,
        cancellationReason: "강사 부재",
      } as any);
      jest
        .spyOn(prismaService.classAttendance, "updateMany")
        .mockResolvedValue({ count: 5 } as any);

      const result = await service.cancelClassSchedule(
        mockCoachUserId,
        mockScheduleId,
        "강사 부재",
      );

      expect(result.isCancelled).toBe(true);
      expect(result.cancellationReason).toBe("강사 부재");
    });

    it("should throw NotFoundException if schedule does not exist", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.cancelClassSchedule(mockCoachUserId, mockScheduleId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...mockSchedule,
        class: mockClass,
      } as any);
      jest
        .spyOn(prismaService.coachProfile, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.cancelClassSchedule(mockCoachUserId, mockScheduleId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getClassSchedulesByDateRange", () => {
    it("should retrieve schedules within date range", async () => {
      const schedules = [mockSchedule, { ...mockSchedule, id: "schedule-2" }];

      jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue(schedules as any);

      const result = await service.getClassSchedulesByDateRange(
        mockClassId,
        new Date("2026-01-05"),
        new Date("2026-01-10"),
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      expect(prismaService.classSchedule.findMany).toHaveBeenCalledWith({
        where: {
          classId: mockClassId,
          scheduledDate: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        include: {
          attendances: {
            select: {
              id: true,
              memberId: true,
              attendanceStatus: true,
            },
          },
        },
        orderBy: {
          scheduledDate: "asc",
        },
      });
    });

    it("should return empty array if no schedules in date range", async () => {
      jest.spyOn(prismaService.classSchedule, "findMany").mockResolvedValue([]);

      const result = await service.getClassSchedulesByDateRange(
        mockClassId,
        new Date("2026-02-01"),
        new Date("2026-02-10"),
      );

      expect(result).toEqual([]);
    });
  });
});
