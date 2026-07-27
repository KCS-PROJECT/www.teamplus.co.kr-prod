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
import { ResourceAccessService } from "@/common/access/resource-access.service";

// IDOR 가드 mock — 기본 전부 통과. 차단 케이스는 개별 테스트에서 mockRejectedValue 로 지정.
const mockResourceAccessService = {
  assertManageableClass: jest.fn().mockResolvedValue(undefined),
  assertManageableClassRecord: jest.fn().mockResolvedValue(undefined),
  assertTeamManager: jest.fn().mockResolvedValue(undefined),
  assertAcademyManager: jest.fn().mockResolvedValue(undefined),
  assertManageableTournament: jest.fn().mockResolvedValue(undefined),
  assertManageableTournamentRecord: jest.fn().mockResolvedValue(undefined),
};

describe("ClassesService", () => {
  let service: ClassesService;
  let prismaService: PrismaService;

  const mockCoachUserId = "coach-123";
  const mockClubId = "club-456";
  const mockClassId = "class-789";
  const mockScheduleId = "schedule-101";

  const mockClub = {
    id: mockClubId,
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
    coachId: mockCoachUserId,
  };

  const mockClass = {
    id: mockClassId,
    teamId: mockClubId,
    academyId: null,
    className: "신규 수강생반",
    description: "초보자용 수업",
    instructorName: "김철수",
    capacity: 15,
    ageMin: 4,
    ageMax: 7,
    targetBirthYears: [],
    levelRequired: "beginner",
    startTime: new Date("2026-01-04T16:00:00Z"),
    endTime: new Date("2026-01-04T17:00:00Z"),
    trainingType: "regular",
    billingMode: "BOTH",
    category: null,
    classDays: [],
    coachId: null,
    approvalStatus: "APPROVED",
    endedAt: null,
    salesOpenMonth: null,
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

  // 팀 매니저 권한 가드 — 성공 경로 기본값(resolve)은 beforeEach 에서 세팅,
  //   거부 케이스는 각 테스트에서 mockRejectedValueOnce 로 1회 한정 오버라이드.
  const mockTeamsService = {
    assertTeamManagerPermission: jest.fn(),
  };

  const mockNotificationsService = {
    notifyTeamParents: jest.fn(),
  };

  // $transaction 콜백에 주입되는 tx — 교차 오염 방지를 위해 매 테스트 새로 생성.
  let mockTx: {
    class: { create: jest.Mock; update: jest.Mock };
    classDaySchedule: { deleteMany: jest.Mock; createMany: jest.Mock };
    classSchedule: {
      create: jest.Mock;
      createMany: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
    };
    classProduct: { createMany: jest.Mock };
    classCoachAssignment: { createMany: jest.Mock };
    classAttendance: { findMany: jest.Mock; updateMany: jest.Mock };
    classRsvp: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    mockTx = {
      class: { create: jest.fn(), update: jest.fn() },
      classDaySchedule: { deleteMany: jest.fn(), createMany: jest.fn() },
      classSchedule: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      classProduct: { createMany: jest.fn() },
      classCoachAssignment: { createMany: jest.fn() },
      classAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      classRsvp: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    mockTeamsService.assertTeamManagerPermission
      .mockReset()
      .mockResolvedValue(undefined);

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
            user: {
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
              count: jest.fn(),
            },
            classAttendance: {
              updateMany: jest.fn(),
              count: jest.fn(),
            },
            academy: {
              findUnique: jest.fn(),
            },
            academyCoach: {
              findUnique: jest.fn(),
            },
            enrollment: {
              findMany: jest.fn(),
              count: jest.fn(),
            },
            memberCredit: {
              count: jest.fn(),
            },
            monthlyPostpaidBillingLine: {
              count: jest.fn(),
            },
            classCoachAssignment: {
              findMany: jest.fn(),
              createMany: jest.fn(),
              updateMany: jest.fn(),
            },
            notification: {
              createMany: jest.fn(),
            },
            classRsvp: {
              findMany: jest.fn(),
              createMany: jest.fn(),
            },
            // 콜백 형태만 본 스위트에서 사용 — tx 로 mockTx 주입. 배열 형태는 방어적 처리.
            $transaction: jest.fn((arg: unknown) =>
              typeof arg === "function"
                ? (arg as (tx: typeof mockTx) => unknown)(mockTx)
                : Promise.all(arg as Promise<unknown>[]),
            ),
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
        { provide: TeamsService, useValue: mockTeamsService },
        // 성공 경로에서 호출되지 않는 협력 서비스 — 시그니처만 유지.
        { provide: CreditDomainService, useValue: { bulkRestoreOne: jest.fn() } },
        { provide: AttendanceAuditLogService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: mockNotificationsService },
        {
          provide: ResourceAccessService,
          useValue: mockResourceAccessService,
        },
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
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);
      mockTx.class.create.mockResolvedValue(mockClass as any);

      const result = await service.createClass(
        mockCoachUserId,
        mockClubId,
        createDto,
      );

      expect(result.className).toBe("신규 수강생반");
      expect(result.instructorName).toBe("김철수");
      expect(result.isActive).toBe(true);

      expect(mockTeamsService.assertTeamManagerPermission).toHaveBeenCalledWith(
        mockCoachUserId,
        mockClubId,
        expect.any(String),
      );
      expect(mockTx.class.create).toHaveBeenCalledTimes(1);
    });

    it("should throw ForbiddenException if user is not coach of club", async () => {
      const createDto = {
        className: "신규 수강생반",
        instructorName: "김철수",
        capacity: 15,
        startTime: new Date("2026-01-04T16:00:00Z"),
        endTime: new Date("2026-01-04T17:00:00Z"),
      };

      mockTeamsService.assertTeamManagerPermission.mockRejectedValueOnce(
        new ForbiddenException("이 클럽의 감독/코치만 수업을 생성할 수 있습니다."),
      );

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
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);

      await expect(
        service.createClass(mockCoachUserId, mockClubId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    // [Lifecycle v4.1 §7.1] spot(1회용) 단일 일정 서버 가드
    it("spot(1회용) 수업에 일정을 2개 이상 담으면 BadRequestException", async () => {
      const createDto = {
        className: "1회 특강",
        trainingType: "spot",
        dateSchedules: [
          { date: "2099-01-05", startTime: "10:00", endTime: "11:00" },
          { date: "2099-01-06", startTime: "10:00", endTime: "11:00" },
        ],
      };

      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);

      await expect(
        service.createClass(mockCoachUserId, mockClubId, createDto as any),
      ).rejects.toThrow("1회용 수업은 일정을 1개만 등록할 수 있습니다.");
      expect(mockTx.class.create).not.toHaveBeenCalled();
    });
  });

  describe("getClass", () => {
    it("should successfully retrieve class details", async () => {
      const classWithRelations = {
        ...mockClass,
        team: {
          id: mockClubId,
          name: "서울 아이스 클럽",
          logoUrl: null,
          coach: { firstName: "독", lastName: "감", avatarUrl: null },
        },
        academy: null,
        coach: null,
        venue: null,
        schedules: [],
        products: [],
        registrations: [],
        waitlists: [],
        coachAssignments: [],
        teamVisibilities: [],
        dayScheduleEntries: [],
      };

      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(classWithRelations as any);
      // deletable 판정(countClassBlockingRefs 4종) + 결제이력 카운트 — 참조 0 = 삭제 가능.
      jest.spyOn(prismaService.enrollment, "count").mockResolvedValue(0);
      jest.spyOn(prismaService.memberCredit, "count").mockResolvedValue(0);
      jest
        .spyOn(prismaService.monthlyPostpaidBillingLine, "count")
        .mockResolvedValue(0);
      jest.spyOn(prismaService.classAttendance, "count").mockResolvedValue(0);

      const result = await service.getClass(mockClassId);

      expect(result.className).toBe("신규 수강생반");
      expect(result.club).toEqual({ id: mockClubId, name: "서울 아이스 클럽" });
      expect(result.trainingType).toBe("regular");
      expect(result.deletable).toBe(true);
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
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);
      mockTx.class.update.mockResolvedValue({
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
      expect(mockTeamsService.assertTeamManagerPermission).toHaveBeenCalledWith(
        mockCoachUserId,
        mockClubId,
        expect.any(String),
      );
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      const updateDto = { className: "중급반" };

      mockTeamsService.assertTeamManagerPermission.mockRejectedValueOnce(
        new ForbiddenException("이 클럽의 감독/코치만 수업을 수정할 수 있습니다."),
      );

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

    // [Lifecycle v4.1 §7.1] spot(1회용) 단일 일정 서버 가드 — 기존 저장값 기준 판정.
    it("spot(1회용) 수업 수정에 일정을 2개 이상 담으면 BadRequestException", async () => {
      const updateDto = {
        dateSchedules: [
          { date: "2099-01-05", startTime: "10:00", endTime: "11:00" },
          { date: "2099-01-06", startTime: "10:00", endTime: "11:00" },
        ],
      };

      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue({ ...mockClass, trainingType: "spot" } as any);

      await expect(
        service.updateClass(
          mockCoachUserId,
          mockClubId,
          mockClassId,
          updateDto as any,
        ),
      ).rejects.toThrow("1회용 수업은 일정을 1개만 등록할 수 있습니다.");
      expect(mockTx.class.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteClass", () => {
    it("should successfully delete class", async () => {
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);
      // 삭제 가드(countClassBlockingRefs) — 참조 0 = 삭제 허용.
      jest.spyOn(prismaService.enrollment, "count").mockResolvedValue(0);
      jest.spyOn(prismaService.memberCredit, "count").mockResolvedValue(0);
      jest
        .spyOn(prismaService.monthlyPostpaidBillingLine, "count")
        .mockResolvedValue(0);
      jest.spyOn(prismaService.classAttendance, "count").mockResolvedValue(0);
      jest
        .spyOn(prismaService.class, "delete")
        .mockResolvedValue(mockClass as any);

      const result = await service.deleteClass(
        mockCoachUserId,
        mockClubId,
        mockClassId,
      );

      expect(result.id).toBe(mockClassId);
      expect(prismaService.class.delete).toHaveBeenCalledWith({
        where: { id: mockClassId },
      });
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      mockTeamsService.assertTeamManagerPermission.mockRejectedValueOnce(
        new ForbiddenException("이 클럽의 감독/코치만 수업을 삭제할 수 있습니다."),
      );

      await expect(
        service.deleteClass(mockCoachUserId, mockClubId, mockClassId),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if class does not exist", async () => {
      jest.spyOn(prismaService.class, "findUnique").mockResolvedValue(null);

      await expect(
        service.deleteClass(mockCoachUserId, mockClubId, mockClassId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("createBulkClassSchedules (팀 수업 일정 일괄 생성)", () => {
    // [Lifecycle v4.1 §7.1] spot(1회용) — 기존 활성 일정 + 신규 합계 1개 초과 차단.
    it("spot(1회용) 수업에 활성 일정이 이미 있으면 추가 생성 시 BadRequestException", async () => {
      jest.spyOn(prismaService.class, "findUnique").mockResolvedValue({
        ...mockClass,
        trainingType: "spot",
        dayScheduleEntries: [],
      } as any);
      // candidate 날짜 범위 내 중복 없음 → toCreate 1건.
      jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue([] as any);
      // 전체 활성 일정 1건 존재 → 1 + 1 > 1 차단.
      jest.spyOn(prismaService.classSchedule, "count").mockResolvedValue(1);

      await expect(
        service.createBulkClassSchedules(mockCoachUserId, mockClubId, mockClassId, {
          dates: ["2099-01-05"],
        }),
      ).rejects.toThrow("1회용 수업은 일정을 1개만 등록할 수 있습니다.");
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

    // RSVP 자동 생성은 비활성 상태(RSVP_DISABLED_2026-05-28) — 재활성화 시 이 테스트를 갱신할 것.
    it("기간·요일·시간 기반 일괄 생성 — RSVP 자동 생성은 호출되지 않는다", async () => {
      jest
        .spyOn(prismaService.academy, "findUnique")
        .mockResolvedValue(mockAcademy as any);
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockAcademyClass as any);
      jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue([] as any);

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
      expect(txRsvpCreateMany).not.toHaveBeenCalled();
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
    // 지난 회차 취소 가드(kstTodayUtcMidnight 경계) — 성공 경로는 미래 회차여야 통과.
    const futureSchedule = {
      ...mockSchedule,
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    it("should successfully cancel schedule and update attendances", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      mockTx.classSchedule.update.mockResolvedValue({
        ...mockSchedule,
        isCancelled: true,
        cancellationReason: "강사 부재",
      } as any);
      // 크레딧 차감 출석 없음 → 복원 경로 미진입.
      mockTx.classAttendance.findMany.mockResolvedValue([] as any);
      mockTx.classAttendance.updateMany.mockResolvedValue({ count: 5 } as any);

      const result = await service.cancelClassSchedule(
        mockCoachUserId,
        mockScheduleId,
        "강사 부재",
      );

      expect(result.isCancelled).toBe(true);
      expect(result.cancellationReason).toBe("강사 부재");
      expect(mockTeamsService.assertTeamManagerPermission).toHaveBeenCalledWith(
        mockCoachUserId,
        mockClubId,
        expect.any(String),
      );
    });

    it("should throw ForbiddenException when cancelling a past schedule", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...mockSchedule,
        scheduledDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        class: mockClass,
      } as any);

      await expect(
        service.cancelClassSchedule(mockCoachUserId, mockScheduleId, "사유"),
      ).rejects.toThrow(ForbiddenException);
      // 가드가 트랜잭션 진입 전에 차단 — 출석 변경·크레딧 복원 미실행 확인.
      expect(mockTx.classSchedule.update).not.toHaveBeenCalled();
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
      mockTeamsService.assertTeamManagerPermission.mockRejectedValueOnce(
        new ForbiddenException("이 일정을 취소할 권한이 없습니다."),
      );

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
          venue: {
            select: {
              id: true,
              name: true,
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

  // ─── Phase 2a: 선수별 5-state 정산 계약 ─────────────────────────
  describe("getClassPayments (Phase 2a 선수별 billingTiming resolver)", () => {
    const requester = {
      id: "coach-123",
      email: "coach@t.dev",
      userType: "COACH",
    } as any;

    const bothClass = {
      id: mockClassId,
      className: "선택형 수업",
      teamId: mockClubId,
      academyId: null,
      billingMode: "BOTH",
      startTime: new Date("2026-06-01T16:00:00Z"),
      endTime: new Date("2026-06-01T17:00:00Z"),
      team: { id: mockClubId, name: "서울 아이스", teamCode: "ACE" },
      products: [
        {
          id: "prod-post",
          productName: "후불(회당)",
          price: 0,
          feeType: "PER_SESSION",
          billingTiming: "POSTPAID",
          feePerSession: 10000,
        },
      ],
    };

    const postpaidChildRegistration = {
      id: "reg-1",
      userId: "child-1",
      status: "active",
      registrationDate: new Date("2026-06-02T00:00:00Z"),
      user: {
        id: "child-1",
        firstName: "철",
        lastName: "김",
        email: "child1@t.dev",
        userType: "CHILD",
      },
    };

    const postpaidEnrollment = {
      id: "enr-1",
      childId: "child-1",
      status: "approved", // 후불은 approved 에 머물고 Payment 무연결
      paymentId: null,
      paidAt: null,
      classProductId: "prod-post",
      product: {
        id: "prod-post",
        productName: "후불(회당)",
        price: 0,
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        feePerSession: 10000,
      },
      payment: null,
    };

    /** 공유 prisma mock 에 없는 모델 메서드를 테스트 로컬로 주입한다. */
    const wireBillingMocks = (opts: {
      billing: unknown;
      attendanceSchedules?: unknown[];
      classRecord?: unknown;
      registrations?: unknown[];
      enrollments?: unknown[];
    }) => {
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue((opts.classRecord ?? bothClass) as any);
      (prismaService as any).classRegistration = {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.registrations ?? [postpaidChildRegistration]) as any,
          ),
      };
      jest
        .spyOn(prismaService.enrollment, "findMany")
        .mockResolvedValue((opts.enrollments ?? [postpaidEnrollment]) as any);
      (prismaService as any).monthlyPostpaidBilling = {
        findUnique: jest.fn().mockResolvedValue(opts.billing),
      };
      jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue((opts.attendanceSchedules ?? []) as any);
    };

    it("[회귀 증명] BOTH 후불 학생이 선택월 결제 완료 시 billingStatus=PAID·paymentState=paid", async () => {
      wireBillingMocks({
        billing: {
          status: "confirmed",
          items: [
            {
              userId: "child-1",
              amount: 30000,
              paymentStatus: "paid",
              payment: {
                paymentStatus: "completed",
                paymentMethod: "card",
                completedAt: new Date("2026-06-20T00:00:00Z"),
                user: {
                  id: "parent-1",
                  firstName: "부",
                  lastName: "학",
                  email: "parent1@t.dev",
                },
              },
            },
          ],
        },
      });

      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );

      const row = result.students[0];
      expect(row.billingTiming).toBe("POSTPAID");
      expect(row.billingStatus).toBe("PAID");
      // 하위호환 — 기존 프론트가 읽는 paymentState 는 paid.
      expect(row.paymentState).toBe("paid");
      expect(row.billedAmount).toBe(30000);
      expect(row.paidAmount).toBe(30000);
      expect(row.outstandingAmount).toBe(0);
      expect(row.estimatedAmount).toBeNull();
      expect(row.payerName).toBe("학부");
      // 상단 카운트 — 레거시 4키 + 신규 5키 병행.
      expect(result.counts.paid).toBe(1);
      expect(result.billingStatusCounts.PAID).toBe(1);
      expect(result.yearMonth).toBe("2026-06");
    });

    it("[미확정 월] 확정 정산 없으면 UNSETTLED + estimatedAmount = 출석수 × feePerSession", async () => {
      wireBillingMocks({
        billing: null, // 선택월 확정 정산 없음
        attendanceSchedules: [
          { attendances: [{ memberId: "child-1" }, { memberId: "child-1" }] },
          { attendances: [{ memberId: "child-1" }] },
        ],
      });

      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );

      const row = result.students[0];
      expect(row.billingTiming).toBe("POSTPAID");
      expect(row.billingStatus).toBe("UNSETTLED");
      expect(row.attendanceCount).toBe(3);
      expect(row.estimatedAmount).toBe(30000); // 3 × 10000
      expect(row.billedAmount).toBeNull();
      expect(row.paidAmount).toBe(0);
      expect(row.outstandingAmount).toBe(0);
      expect(row.paymentState).toBe("unpaid");
      expect(result.billingStatusCounts.UNSETTLED).toBe(1);
    });

    it("[월 범위 클램프] 형식만 맞는 무효월(2026-13)은 당월로 폴백 — 조용한 롤오버 차단", async () => {
      const billingFindUnique = jest.fn().mockResolvedValue(null);
      wireBillingMocks({ billing: null });
      (prismaService as any).monthlyPostpaidBilling = {
        findUnique: billingFindUnique,
      };

      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-13", // 형식(\d{4}-\d{2})은 통과하나 13월은 무효 — 인접 월(2027-01)로 롤오버되면 안 됨
      );

      // 무효월은 당월로 폴백 → 응답 yearMonth 가 2026-13/2027-01 이 아니어야 함.
      expect(result.yearMonth).not.toBe("2026-13");
      expect(result.yearMonth).not.toBe("2027-01");
      expect(result.yearMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      // BillingLine 조회도 폴백된 유효월로 수행됨(13월 경계로 조회 안 함).
      const queriedYm =
        billingFindUnique.mock.calls[0][0].where.classId_yearMonth.yearMonth;
      expect(queriedYm).not.toBe("2026-13");
      expect(queriedYm).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });

    // ── Codex Cycle 1 지적: 후불 환불·UNASSIGNED·복수상품 폴백 회귀 ──
    it("[환불1] 라인 stale=paid + Payment refunded → REFUNDED·미수금 0·순수납 0", async () => {
      wireBillingMocks({
        billing: {
          status: "confirmed",
          items: [
            {
              userId: "child-1",
              amount: 30000,
              paymentStatus: "paid", // stale (환불이 라인을 되돌리지 않음)
              payment: {
                paymentStatus: "refunded",
                paymentMethod: "card",
                completedAt: new Date("2026-06-20T00:00:00Z"),
                refundLogs: [{ refundAmount: 30000 }],
                user: null,
              },
            },
          ],
        },
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("REFUNDED");
      expect(row.paymentState).toBe("refunded");
      expect(row.billedAmount).toBeNull();
      expect(row.paidAmount).toBe(0);
      expect(row.outstandingAmount).toBe(0);
    });

    it("[환불2] 부분 환불(partially_refunded) → REFUNDED·순수납=청구−환불·미수 0", async () => {
      wireBillingMocks({
        billing: {
          status: "confirmed",
          items: [
            {
              userId: "child-1",
              amount: 30000,
              paymentStatus: "paid",
              payment: {
                paymentStatus: "partially_refunded",
                paymentMethod: "card",
                completedAt: new Date("2026-06-20T00:00:00Z"),
                refundLogs: [{ refundAmount: 10000 }],
                user: null,
              },
            },
          ],
        },
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("REFUNDED");
      expect(row.billedAmount).toBeNull();
      expect(row.paidAmount).toBe(20000); // 30000 − 10000
      expect(row.outstandingAmount).toBe(0);
    });

    it("[UNASSIGNED] BOTH + 상품 없는 enrollment → UNSETTLED·미수금 0(허위 미수 방지)", async () => {
      wireBillingMocks({
        billing: null,
        enrollments: [
          {
            id: "enr-x",
            childId: "child-1",
            status: "approved",
            paymentId: null,
            paidAt: null,
            classProductId: null,
            product: null, // 유효 상품 없음 → UNASSIGNED
            payment: null,
          },
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingTiming).toBe("UNASSIGNED");
      expect(row.billingStatus).toBe("UNSETTLED");
      expect(row.billedAmount).toBeNull();
      expect(row.outstandingAmount).toBe(0);
      expect(row.estimatedAmount).toBeNull();
    });

    it("[선불 미청구] PREPAID + enrollment + pending 결제 없음 → UNSETTLED(BILLED 아님)", async () => {
      const prepaidClass = {
        ...bothClass,
        billingMode: "PREPAID",
        products: [
          {
            id: "prod-pre",
            productName: "월권",
            price: 50000,
            feeType: "MONTHLY_FIXED",
            billingTiming: "PREPAID",
            feePerSession: null,
          },
        ],
      };
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClass,
        enrollments: [
          {
            id: "enr-p",
            childId: "child-1",
            status: "approved", // 결제 전 상태, Payment 무연결
            paymentId: null,
            paidAt: null,
            classProductId: "prod-pre",
            product: {
              id: "prod-pre",
              productName: "월권",
              price: 50000,
              feeType: "MONTHLY_FIXED",
              billingTiming: "PREPAID",
              feePerSession: null,
            },
            payment: null, // 실제 pending 결제 없음
          },
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingTiming).toBe("PREPAID");
      expect(row.billingStatus).toBe("UNSETTLED");
      expect(row.billedAmount).toBeNull();
      expect(row.outstandingAmount).toBe(0);
      expect(row.paymentState).toBe("unpaid"); // 레거시 Dual Emit 유지
    });

    it("[복수 후불상품] 학생 상품 A(단가 null) + 타 상품 B(단가 20000) → estimatedAmount=null(B 단가 폴백 금지)", async () => {
      // 실제 DB 재현: A(pp-1) 는 class.products·enrollment.product 양쪽에서 feePerSession=null 로 일치.
      const productA = {
        id: "pp-1",
        productName: "후불A",
        price: 0,
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        feePerSession: null, // 학생 상품 단가 없음 (동일 레코드 — class/enrollment 정합)
      };
      const productB = {
        id: "pp-2",
        productName: "후불B",
        price: 0,
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        feePerSession: 20000, // 타 상품 단가 (폴백되면 안 됨)
      };
      const multiPostpaidClass = {
        ...bothClass,
        products: [productA, productB],
      };
      wireBillingMocks({
        billing: null,
        classRecord: multiPostpaidClass,
        attendanceSchedules: [{ attendances: [{ memberId: "child-1" }] }],
        enrollments: [
          {
            id: "enr-nf",
            childId: "child-1",
            status: "approved",
            paymentId: null,
            paidAt: null,
            classProductId: "pp-1",
            product: productA, // 학생은 A 등록, A 단가 null
            payment: null,
          },
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("UNSETTLED");
      // 전체 후불 상품이 2개 → 학생 무관 B(20000) 단가 폴백 금지 → null
      expect(row.estimatedAmount).toBeNull();
    });

    // ── Codex Cycle 2 지적: 선불 terminal 상태 우선 회귀 ──
    const prepaidClassRecord = {
      ...bothClass,
      billingMode: "PREPAID",
      products: [
        {
          id: "prod-pre",
          productName: "월권",
          price: 50000,
          feeType: "MONTHLY_FIXED",
          billingTiming: "PREPAID",
          feePerSession: null,
        },
      ],
    };
    const prepaidProduct = {
      id: "prod-pre",
      productName: "월권",
      price: 50000,
      feeType: "MONTHLY_FIXED",
      billingTiming: "PREPAID",
      feePerSession: null,
    };
    const prepaidEnrollment = (payment: unknown, status = "paid") => ({
      id: "enr-pre",
      childId: "child-1",
      status, // Enrollment 는 결제 후 paid 로 남음(환불이 여기 반영 안 됨)
      paymentId: "pay-pre",
      paidAt: new Date("2026-06-05T00:00:00Z"),
      classProductId: "prod-pre",
      product: prepaidProduct,
      payment,
    });

    it("[선불 부분환불] Enrollment paid + Payment partially_refunded → REFUNDED·순수납·미수0·레거시 refunded", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [
          prepaidEnrollment({
            id: "pay-pre",
            amount: 50000,
            paymentStatus: "partially_refunded",
            paymentMethod: "card",
            completedAt: new Date("2026-06-05T00:00:00Z"),
            refundLogs: [{ refundAmount: 20000 }],
            user: null,
          }),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingTiming).toBe("PREPAID");
      expect(row.billingStatus).toBe("REFUNDED");
      expect(row.paymentState).toBe("refunded"); // billingStatus 파생 (Enrollment paid 우선 금지)
      expect(row.billedAmount).toBeNull();
      expect(row.paidAmount).toBe(30000); // 50000 − 20000
      expect(row.outstandingAmount).toBe(0);
    });

    it("[선불 전액환불+inactive] billingStatus·paymentState·counts 모두 환불 일치", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [
          prepaidEnrollment({
            id: "pay-pre",
            amount: 50000,
            paymentStatus: "refunded",
            paymentMethod: "card",
            completedAt: new Date("2026-06-05T00:00:00Z"),
            refundLogs: [{ refundAmount: 50000 }],
            user: null,
          }),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("REFUNDED");
      expect(row.paymentState).toBe("refunded");
      expect(row.paidAmount).toBe(0);
      expect(row.outstandingAmount).toBe(0);
      expect(result.counts.refunded).toBe(1);
      expect(result.counts.paid).toBe(0);
      expect(result.totalPaidAmount).toBe(0); // 전액 결제로 오집계 금지
    });

    it("[선불 결제취소] Payment cancelled + Enrollment approved → CANCELLED·cancelled", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [
          prepaidEnrollment(
            {
              id: "pay-pre",
              amount: 50000,
              paymentStatus: "cancelled",
              paymentMethod: "card",
              completedAt: null,
              refundLogs: [],
              user: null,
            },
            "approved", // Enrollment 는 취소 반영 안 됨
          ),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("CANCELLED");
      expect(row.paymentState).toBe("cancelled");
      expect(row.billedAmount).toBeNull();
      expect(row.outstandingAmount).toBe(0);
    });

    // ── 선불 월 스코프(B안) — yearMonth 명시 시에만 월귀속 필터 ──
    const juneCompletedPayment = {
      id: "pay-pre",
      amount: 50000,
      paymentStatus: "completed",
      paymentMethod: "card",
      completedAt: new Date("2026-06-05T00:00:00Z"),
      createdAt: new Date("2026-06-05T00:00:00Z"),
      refundLogs: [],
      user: null,
    };

    it("[선불 월스코프] 6월 완료 결제를 7월로 조회 → UNSETTLED·금액 0(타월 배제)", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-07",
      );
      const row = result.students[0];
      expect(row.billingTiming).toBe("PREPAID");
      expect(row.billingStatus).toBe("UNSETTLED");
      expect(row.paymentState).toBe("unpaid");
      expect(row.billedAmount).toBeNull();
      expect(row.paidAmount).toBe(0);
      expect(row.outstandingAmount).toBe(0);
      expect(row.amount).toBeNull();
      expect(row.paidAt).toBeNull();
      expect(result.totalPaidAmount).toBe(0); // 타월 수납이 이 달 총수납에 섞이지 않는다
    });

    it("[선불 월스코프] 같은 6월로 조회하면 PAID·총수납 유지", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("PAID");
      expect(row.paidAmount).toBe(50000);
      expect(result.totalPaidAmount).toBe(50000);
    });

    it("[레거시 스냅샷] yearMonth 미전송(admin 소비처) → 월 무관 최신 상태 유지", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      // 미전송 → 현재 KST 월 폴백이지만 선불 행은 월귀속 필터 없이 종전 스냅샷.
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        undefined,
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("PAID");
      expect(row.paidAmount).toBe(50000);
      expect(result.totalPaidAmount).toBe(50000);
    });

    it("[선불 월스코프·복수구매] 6월·7월 각각 결제 → 각 월 조회에 해당 거래만", async () => {
      const juneEnrollment = {
        ...prepaidEnrollment(juneCompletedPayment),
        id: "enr-jun",
      };
      const julyEnrollment = {
        ...prepaidEnrollment({
          ...juneCompletedPayment,
          id: "pay-jul",
          amount: 60000,
          completedAt: new Date("2026-07-03T00:00:00Z"),
          createdAt: new Date("2026-07-03T00:00:00Z"),
        }),
        id: "enr-jul",
        paidAt: new Date("2026-07-03T00:00:00Z"),
      };
      // updatedAt desc 정렬 계약 — 최신(7월) 이 먼저 온다.
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [julyEnrollment, juneEnrollment],
      });
      const june = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      expect(june.students[0].billingStatus).toBe("PAID");
      expect(june.students[0].paidAmount).toBe(50000);
      expect(june.students[0].enrollmentId).toBe("enr-jun");

      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [julyEnrollment, juneEnrollment],
      });
      const july = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-07",
      );
      expect(july.students[0].billingStatus).toBe("PAID");
      expect(july.students[0].paidAmount).toBe(60000);
      expect(july.students[0].enrollmentId).toBe("enr-jul");
    });

    // ── Codex Cycle 3 지적: 부분환불 총수금 누락·inactive 결제 수명주기 ──
    it("[총수금 정합] 부분환불 행의 순수납이 totalPaidAmount 에 반영 = sum(paidAmount)", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        enrollments: [
          prepaidEnrollment({
            id: "pay-pre",
            amount: 50000,
            paymentStatus: "partially_refunded",
            paymentMethod: "card",
            completedAt: new Date("2026-06-05T00:00:00Z"),
            refundLogs: [{ refundAmount: 20000 }],
            user: null,
          }),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const sumPaid = result.students.reduce((s, r) => s + r.paidAmount, 0);
      expect(result.students[0].paidAmount).toBe(30000);
      expect(result.totalPaidAmount).toBe(sumPaid); // 행/상단 일치
      expect(result.totalPaidAmount).toBe(30000); // 순수납 반영(0 아님)
    });

    it("[inactive 완납] PREPAID + Payment completed + registration inactive → PAID 유지·수납 보존", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [
          prepaidEnrollment(
            {
              id: "pay-pre",
              amount: 50000,
              paymentStatus: "completed",
              paymentMethod: "card",
              completedAt: new Date("2026-06-05T00:00:00Z"),
              refundLogs: [],
              user: null,
            },
            "paid",
          ),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("PAID"); // inactive 가 완료 결제를 덮어쓰지 않음
      expect(row.paymentState).toBe("paid");
      expect(row.paidAmount).toBe(50000);
      expect(result.totalPaidAmount).toBe(50000);
    });

    it("[크레딧 만료 수명주기] Enrollment completed + Payment completed + inactive → PAID 유지", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [
          prepaidEnrollment(
            {
              id: "pay-pre",
              amount: 50000,
              paymentStatus: "completed",
              paymentMethod: "card",
              completedAt: new Date("2026-06-05T00:00:00Z"),
              refundLogs: [],
              user: null,
            },
            "completed", // 크레딧 만료 배치가 paid→completed 전환
          ),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("PAID");
      expect(row.paymentState).toBe("paid");
      expect(row.paidAmount).toBe(50000);
    });

    it("[inactive + pending] PREPAID + pending Payment + inactive → BILLED 유지", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [
          prepaidEnrollment(
            {
              id: "pay-pre",
              amount: 50000,
              paymentStatus: "pending",
              paymentMethod: null,
              completedAt: null,
              refundLogs: [],
              user: null,
            },
            "approved",
          ),
        ],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      expect(row.billingStatus).toBe("BILLED");
      expect(row.billedAmount).toBe(50000);
      expect(row.outstandingAmount).toBe(50000);
    });

    it("[inactive + 결제없음] PREPAID + Payment 없음 + inactive → UNSETTLED", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [
          prepaidEnrollment(
            {
              // payment 없음
            } as any,
            "approved",
          ),
        ],
      });
      // payment 관계를 null 로 — helper 는 payment 인자를 그대로 넣으므로 별도 구성.
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      const row = result.students[0];
      // pending/completed/refunded/cancelled 어느 것도 아님 → UNSETTLED
      expect(["UNSETTLED"]).toContain(row.billingStatus);
      expect(row.paidAmount).toBe(0);
      expect(row.outstandingAmount).toBe(0);
    });
  });
});
