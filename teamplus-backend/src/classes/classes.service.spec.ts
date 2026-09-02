import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { buildClassProducts, ClassesService } from "./classes.service";
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
    createNotification: jest.fn(),
  };

  // $transaction 콜백에 주입되는 tx — 교차 오염 방지를 위해 매 테스트 새로 생성.
  let mockTx: {
    $queryRaw: jest.Mock;
    class: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    teamPost: { deleteMany: jest.Mock };
    classDaySchedule: { deleteMany: jest.Mock; createMany: jest.Mock };
    classSchedule: {
      create: jest.Mock;
      createMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    classProduct: {
      createMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    classCoachAssignment: { createMany: jest.Mock };
    classAttendance: { findMany: jest.Mock; updateMany: jest.Mock };
    classRsvp: { createMany: jest.Mock };
    memberCredit: { findMany: jest.Mock };
    scheduleApplyOperation: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    mockTx = {
      // 가격 잠금 §4-0 A — sales lock(advisory) + tx 내 재조회 기본값.
      //   salesOpenMonth null = 판매 이력 없음 → 잠금 가드 전부 통과(기존 동작 보존).
      $queryRaw: jest.fn().mockResolvedValue([]),
      class: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        // postpaid lock 판정용(§4-0 B) — 기본 undefined = PREPAID 취급, lock 미획득.
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          endedAt: null,
          salesOpenMonth: null,
          trainingType: null,
          schedules: [],
          products: [],
        }),
      },
      classDaySchedule: { deleteMany: jest.fn(), createMany: jest.fn() },
      classSchedule: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        // P3-H1 재검증용 — 기본 undefined = 일정 미조회 취급, 통과.
        findUnique: jest.fn(),
        // 취소 tx 의 fresh 재조회/updated 재조회 (설계 v4 §4.3-①).
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        update: jest.fn(),
        // 취소 승자 게이트(isCancelled:false 조건부) — 기본 승자(count 1).
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      classProduct: {
        createMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      classCoachAssignment: { createMany: jest.fn() },
      classAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      classRsvp: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // 취소 크레딧 복원 경로 — 기본 유효 수업권 없음(복원 대상 0건).
      memberCredit: { findMany: jest.fn().mockResolvedValue([]) },
      // apply-draft 멱등 ledger — 기본 신규 operation.
      scheduleApplyOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      // [H-04] 삭제 트랜잭션의 단위 공지 잔재 정리
      teamPost: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
            classProduct: {
              findUnique: jest.fn(),
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
              // selector 분리 — paid 유효성 batch 판정용 크레딧 일괄 조회 기본값
              findMany: jest.fn().mockResolvedValue([]),
            },
            monthlyPostpaidBillingLine: {
              count: jest.fn(),
            },
            // [H-04] countClassBlockingRefs 5번째 축 — 게시 중 단위 공지 (기본 0 = 차단 없음)
            teamPost: {
              count: jest.fn().mockResolvedValue(0),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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

    // [가격 잠금 §3-7] 신규 MONTHLY_FIXED 귀속월 계약 — 생성 경로
    it("일정 + 월 정액: 첫 일정의 달이 귀속월로 기록된다", async () => {
      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);
      mockTx.class.create.mockResolvedValue(mockClass as any);
      (mockTx.classSchedule.findFirst as jest.Mock).mockResolvedValue({
        scheduledDate: new Date("2026-08-05T00:00:00.000Z"),
      });

      await service.createClass(mockCoachUserId, mockClubId, {
        className: "월정액반",
        monthlyPrice: 200000,
        dateSchedules: [
          { date: "2026-08-05", startTime: "10:00", endTime: "11:00" },
        ],
      } as any);

      expect(mockTx.classProduct.createMany).toHaveBeenCalledTimes(1);
      const rows = (mockTx.classProduct.createMany as jest.Mock).mock
        .calls[0][0].data as Array<{ feeType: string; billingMonth?: Date }>;
      const monthly = rows.find((r) => r.feeType === "MONTHLY_FIXED");
      expect(monthly?.billingMonth).toEqual(
        new Date("2026-08-01T00:00:00.000Z"),
      );
    });

    it("일정 없음 + 월 정액: fail-fast 400 — 상품 row 미생성", async () => {
      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);
      mockTx.class.create.mockResolvedValue(mockClass as any);
      (mockTx.classSchedule.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createClass(mockCoachUserId, mockClubId, {
          className: "일정 없는 월정액반",
          monthlyPrice: 200000,
        } as any),
      ).rejects.toThrow("첫 일정을 먼저 등록해주세요");
      expect(mockTx.classProduct.createMany).not.toHaveBeenCalled();
    });

    it("일정 없음 + 월 정액 없음: 기존대로 생성 허용 (과차단 방지)", async () => {
      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);
      mockTx.class.create.mockResolvedValue(mockClass as any);
      (mockTx.classSchedule.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.createClass(mockCoachUserId, mockClubId, {
        className: "일정 없는 수업",
      } as any);

      expect(result.isActive).toBe(true);
      expect(mockTx.classProduct.createMany).not.toHaveBeenCalled();
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
      mockTx.class.delete.mockResolvedValue(mockClass as any);

      const result = await service.deleteClass(
        mockCoachUserId,
        mockClubId,
        mockClassId,
      );

      expect(result.id).toBe(mockClassId);
      // [H-04·R2] 삭제 tx 는 inactive 공지 잔재만 정리 후 delete (레이스 active 보존)
      expect(mockTx.teamPost.deleteMany).toHaveBeenCalledWith({
        where: { targetClassId: mockClassId, isActive: false },
      });
      expect(mockTx.class.delete).toHaveBeenCalledWith({
        where: { id: mockClassId },
      });
    });

    it("[R2 H-04] count 이후 레이스로 남은 active 공지의 FK 실패(P2003) — 제어된 Conflict", async () => {
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);
      jest.spyOn(prismaService.enrollment, "count").mockResolvedValue(0);
      jest.spyOn(prismaService.memberCredit, "count").mockResolvedValue(0);
      jest
        .spyOn(prismaService.monthlyPostpaidBillingLine, "count")
        .mockResolvedValue(0);
      jest.spyOn(prismaService.classAttendance, "count").mockResolvedValue(0);
      // 가드 통과(0건) 후 tx 안에서 FK RESTRICT 가 delete 를 막는 레이스 재현
      mockTx.class.delete.mockRejectedValue({ code: "P2003" });

      await expect(
        service.deleteClass(mockCoachUserId, mockClubId, mockClassId),
      ).rejects.toThrow("공지 이력이 있는 수업은 삭제할 수 없습니다");
    });

    it("[H-04] 게시 중 단위 공지가 있으면 Conflict 로 제어 차단 (FK 오류 방지)", async () => {
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue(mockClass as any);
      jest.spyOn(prismaService.enrollment, "count").mockResolvedValue(0);
      jest.spyOn(prismaService.memberCredit, "count").mockResolvedValue(0);
      jest
        .spyOn(prismaService.monthlyPostpaidBillingLine, "count")
        .mockResolvedValue(0);
      jest.spyOn(prismaService.classAttendance, "count").mockResolvedValue(0);
      jest.spyOn(prismaService.teamPost, "count").mockResolvedValue(1); // 게시 중 공지 1건

      await expect(
        service.deleteClass(mockCoachUserId, mockClubId, mockClassId),
      ).rejects.toThrow("공지 이력이 있는 수업은 삭제할 수 없습니다");
      expect(mockTx.class.delete).not.toHaveBeenCalled();
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
          // schedule writer 공용 lock(설계 v4 §4.3-③) + lock 안 중복 재검증.
          $queryRaw: jest.fn().mockResolvedValue([]),
          classSchedule: {
            create: txClassScheduleCreate,
            findMany: jest.fn().mockResolvedValue([]),
          },
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

    // tx 내 fresh/updated 재조회 공용 세팅 (설계 v4 §4.3-① — lock 후 재조회 흐름).
    const primeCancelTx = (freshCancelled = false) => {
      mockTx.classSchedule.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: mockScheduleId,
          scheduledDate: futureSchedule.scheduledDate,
          isCancelled: freshCancelled,
          cancellationReason: freshCancelled ? "기존 사유" : null,
        } as any)
        .mockResolvedValueOnce({
          id: mockScheduleId,
          scheduledDate: futureSchedule.scheduledDate,
          isCancelled: true,
          cancellationReason: "강사 부재",
        } as any);
    };

    it("should successfully cancel schedule and update attendances", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx();
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
      // 승자 게이트 — isCancelled:false 조건부 update 로만 취소 전환.
      expect(mockTx.classSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: mockScheduleId, isCancelled: false },
        data: { isCancelled: true, cancellationReason: "강사 부재" },
      });
      expect(mockTeamsService.assertTeamManagerPermission).toHaveBeenCalledWith(
        mockCoachUserId,
        mockClubId,
        expect.any(String),
      );
    });

    it("이미 취소된 회차 재취소는 no-op(멱등) — 부수효과 미실행 (설계 v4 §4.3-①)", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx(true); // fresh 재조회가 이미 취소됨을 반환

      const result = await service.cancelClassSchedule(
        mockCoachUserId,
        mockScheduleId,
        "재시도",
      );

      expect(result.isCancelled).toBe(true);
      // 게이트·출석 변경·크레딧 복원 전부 미실행 — 중복 복원 차단의 핵심.
      expect(mockTx.classSchedule.updateMany).not.toHaveBeenCalled();
      expect(mockTx.classAttendance.updateMany).not.toHaveBeenCalled();
      expect(mockTx.classAttendance.findMany).not.toHaveBeenCalled();
    });

    it("동시 취소 패자(게이트 count=0)는 부수효과를 실행하지 않는다 — PREPAID 동시 취소 1회 복원 (QA 20)", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx();
      mockTx.classSchedule.updateMany.mockResolvedValueOnce({ count: 0 } as any);

      const result = await service.cancelClassSchedule(
        mockCoachUserId,
        mockScheduleId,
        "동시 취소",
      );

      expect(result.isCancelled).toBe(true);
      expect(mockTx.classAttendance.updateMany).not.toHaveBeenCalled();
      expect(mockTx.classAttendance.findMany).not.toHaveBeenCalled();
    });

    // [Codex R2-B1] flag/creditDelta 는 실제 복원 성공에만 결합 — 3케이스.
    const creditDomainMock = () =>
      (service as unknown as {
        creditDomain: { bulkRestoreOne: jest.Mock };
      }).creditDomain.bulkRestoreOne;
    const auditRecordMock = () =>
      (service as unknown as { auditLog: { record: jest.Mock } }).auditLog
        .record;

    it("전부 복원 성공 — 성공 출석만 플래그 해제 + creditDelta:1 (R2-B1)", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx();
      mockTx.classAttendance.findMany.mockResolvedValue([
        { id: "att-1", memberId: "user-1" },
      ] as any);
      mockTx.memberCredit.findMany.mockResolvedValue([
        { id: "credit-1", userId: "user-1", totalSessions: 4, usedSessions: 1 },
      ] as any);
      creditDomainMock().mockResolvedValue({
        restoredCount: 1,
        restoredCreditIds: ["credit-1"],
      });

      await service.cancelClassSchedule(mockCoachUserId, mockScheduleId, "휴강");

      // 성공 출석 id 기반 해제 (scheduleId 전체 일괄 해제 아님).
      expect(mockTx.classAttendance.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["att-1"] } },
        data: { creditDeducted: false },
      });
      expect(auditRecordMock()).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attendanceId: "att-1", creditDelta: 1 }),
      );
    });

    it("유효 수업권 없음 — 복원 미호출·플래그 보존·creditDelta:0 (R2-B1)", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx();
      mockTx.classAttendance.findMany.mockResolvedValue([
        { id: "att-1", memberId: "user-1" },
      ] as any);
      // mockTx.memberCredit 기본값 [] — 유효 수업권 없음.

      await service.cancelClassSchedule(mockCoachUserId, mockScheduleId, "휴강");

      expect(creditDomainMock()).not.toHaveBeenCalled();
      // 플래그 해제 updateMany 미호출 — 미복원 상태가 복원 완료처럼 고착되지 않음.
      expect(mockTx.classAttendance.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { creditDeducted: false },
        }),
      );
      expect(auditRecordMock()).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attendanceId: "att-1", creditDelta: 0 }),
      );
    });

    it("부분 복원 — 성공분만 플래그 해제, creditDelta 1/0 분리 (R2-B1)", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx();
      mockTx.classAttendance.findMany.mockResolvedValue([
        { id: "att-1", memberId: "user-1" },
        { id: "att-2", memberId: "user-2" },
      ] as any);
      mockTx.memberCredit.findMany.mockResolvedValue([
        { id: "credit-1", userId: "user-1", totalSessions: 4, usedSessions: 1 },
        { id: "credit-2", userId: "user-2", totalSessions: 4, usedSessions: 0 },
      ] as any);
      // credit-2 는 usedSessions=0 이라 감소 실패 — 성공 id 에 미포함.
      creditDomainMock().mockResolvedValue({
        restoredCount: 1,
        restoredCreditIds: ["credit-1"],
      });

      await service.cancelClassSchedule(mockCoachUserId, mockScheduleId, "휴강");

      expect(mockTx.classAttendance.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["att-1"] } },
        data: { creditDeducted: false },
      });
      expect(auditRecordMock()).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attendanceId: "att-1", creditDelta: 1 }),
      );
      expect(auditRecordMock()).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attendanceId: "att-2", creditDelta: 0 }),
      );
    });

    it("정산 확정 월의 일정 취소는 lock 안 재검증으로 거부한다 (P3-H1)", async () => {
      jest.spyOn(prismaService.classSchedule, "findUnique").mockResolvedValue({
        ...futureSchedule,
        class: mockClass,
      } as any);
      primeCancelTx();
      (mockTx.classSchedule.findUnique as jest.Mock).mockResolvedValue({
        classId: mockClassId,
        scheduledDate: futureSchedule.scheduledDate,
      });
      (mockTx as unknown as Record<string, unknown>).monthlyPostpaidBilling = {
        findUnique: jest.fn().mockResolvedValue({ status: "confirmed" }),
      };

      await expect(
        service.cancelClassSchedule(mockCoachUserId, mockScheduleId, "사유"),
      ).rejects.toThrow("정산이 확정된 월");
      expect(mockTx.classSchedule.updateMany).not.toHaveBeenCalled();
      expect(mockTx.classAttendance.updateMany).not.toHaveBeenCalled();
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

  describe("applyScheduleDraft (설계 v4 §4.1 — draft 일괄 반영)", () => {
    const OP_ID = "11111111-2222-3333-4444-555555555555";
    const BASE_AT = new Date("2026-09-01T10:00:00.000Z");
    const FUTURE_DATE = (() => {
      const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    const primeClassLookup = () => {
      jest.spyOn(prismaService.class, "findUnique").mockResolvedValue({
        id: mockClassId,
        teamId: mockClubId,
        academyId: null,
        trainingType: "regular",
      } as any);
    };

    it("추가+수정+취소를 한 트랜잭션으로 반영하고 ledger 를 기록한다", async () => {
      primeClassLookup();
      // 대상 row 재조회 — edit 1건 + cancel 1건 (버전 일치, 미취소, 미래 일정).
      mockTx.classSchedule.findMany.mockResolvedValue([
        {
          id: "sch-e1",
          classId: mockClassId,
          scheduledDate: new Date(Date.now() + 7 * 86400000),
          isCancelled: false,
          updatedAt: BASE_AT,
        },
        {
          id: "sch-c1",
          classId: mockClassId,
          scheduledDate: new Date(Date.now() + 8 * 86400000),
          isCancelled: false,
          updatedAt: BASE_AT,
        },
      ] as any);
      mockTx.classSchedule.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.applyScheduleDraft(
        mockCoachUserId,
        mockClassId,
        {
          operationId: OP_ID,
          additions: [
            { date: FUTURE_DATE, startTime: "17:00", endTime: "18:00" },
          ],
          edits: [
            {
              scheduleId: "sch-e1",
              baseUpdatedAt: BASE_AT.toISOString(),
              startTime: "19:00",
              endTime: "20:00",
              venueId: "",
            },
          ],
          cancellations: [
            {
              scheduleId: "sch-c1",
              baseUpdatedAt: BASE_AT.toISOString(),
              reason: "감독/코치 취소",
            },
          ],
        } as any,
        { teamId: mockClubId },
      );

      expect(result).toEqual({
        applied: true,
        created: 1,
        skipped: 0,
        edited: 1,
        cancelled: 1,
      });
      // 조건부 mutation — 버전·미취소 조건이 where 에 포함(§4.1-7).
      expect(mockTx.classSchedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "sch-e1",
            isCancelled: false,
            updatedAt: BASE_AT,
          }),
        }),
      );
      // 취소 부수효과 — 출석 cancelled 전환 실행.
      expect(mockTx.classAttendance.updateMany).toHaveBeenCalled();
      // additions 는 createMany+skipDuplicates — 개별 create+catch 는 PostgreSQL
      //   aborted tx 로 성립 불가 (Codex R1-1).
      expect(mockTx.classSchedule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
      // 멱등 ledger 기록.
      expect(mockTx.scheduleApplyOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: OP_ID, classId: mockClassId }),
        }),
      );
    });

    it("같은 operationId·같은 payload 재요청은 저장된 결과를 replay 한다(쓰기 0)", async () => {
      primeClassLookup();
      const stored = {
        applied: true,
        created: 3,
        skipped: 0,
        edited: 0,
        cancelled: 0,
      };
      const dto = {
        operationId: OP_ID,
        additions: [{ date: FUTURE_DATE }],
        edits: [],
        cancellations: [],
      } as any;
      // digest 는 서비스와 동일 재료(actor 포함 — Codex R1-5)로 산출해 일치 상태 재현.
      const { createHash } = await import("crypto");
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            classId: mockClassId,
            actorId: mockCoachUserId,
            additions: dto.additions,
            edits: [],
            cancellations: [],
          }),
        )
        .digest("hex");
      mockTx.scheduleApplyOperation.findUnique.mockResolvedValue({
        id: OP_ID,
        payloadDigest: digest,
        result: stored,
      } as any);

      const result = await service.applyScheduleDraft(
        mockCoachUserId,
        mockClassId,
        dto,
        { teamId: mockClubId },
      );

      expect(result).toEqual(stored);
      expect(mockTx.classSchedule.create).not.toHaveBeenCalled();
      expect(mockTx.scheduleApplyOperation.create).not.toHaveBeenCalled();
    });

    it("같은 operationId 에 다른 payload 는 409 OPERATION_MISMATCH", async () => {
      primeClassLookup();
      mockTx.scheduleApplyOperation.findUnique.mockResolvedValue({
        id: OP_ID,
        payloadDigest: "different-digest",
        result: {},
      } as any);

      await expect(
        service.applyScheduleDraft(
          mockCoachUserId,
          mockClassId,
          {
            operationId: OP_ID,
            additions: [{ date: FUTURE_DATE }],
            edits: [],
            cancellations: [],
          } as any,
          { teamId: mockClubId },
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.classSchedule.create).not.toHaveBeenCalled();
    });

    it("버전 불일치는 전체 롤백 + 409 DRAFT_CONFLICT — mutation 미실행", async () => {
      primeClassLookup();
      mockTx.classSchedule.findMany.mockResolvedValue([
        {
          id: "sch-e1",
          classId: mockClassId,
          scheduledDate: new Date(Date.now() + 7 * 86400000),
          isCancelled: false,
          updatedAt: new Date("2026-09-01T11:00:00.000Z"), // base 와 다름
        },
      ] as any);

      await expect(
        service.applyScheduleDraft(
          mockCoachUserId,
          mockClassId,
          {
            operationId: OP_ID,
            additions: [],
            edits: [
              {
                scheduleId: "sch-e1",
                baseUpdatedAt: BASE_AT.toISOString(),
                startTime: "19:00",
              },
            ],
            cancellations: [],
          } as any,
          { teamId: mockClubId },
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.classSchedule.updateMany).not.toHaveBeenCalled();
      expect(mockTx.scheduleApplyOperation.create).not.toHaveBeenCalled();
    });

    it("지난 날짜 addition 은 400 (소급 일정 생성 금지)", async () => {
      primeClassLookup();
      await expect(
        service.applyScheduleDraft(
          mockCoachUserId,
          mockClassId,
          {
            operationId: OP_ID,
            additions: [{ date: "2020-01-01" }],
            edits: [],
            cancellations: [],
          } as any,
          { teamId: mockClubId },
        ),
      ).rejects.toThrow("지난 날짜에는 일정을 추가할 수 없습니다.");
    });

    it("빈 변경 요청은 400 — 조기 200 이 멱등 계약을 우회하지 않도록 (Codex R1-2)", async () => {
      primeClassLookup();
      await expect(
        service.applyScheduleDraft(
          mockCoachUserId,
          mockClassId,
          { operationId: OP_ID, additions: [], edits: [], cancellations: [] } as any,
          { teamId: mockClubId },
        ),
      ).rejects.toThrow("반영할 변경이 없습니다.");
    });

    it("무효 달력 날짜(자동 보정 케이스)는 400 (Codex R1-4)", async () => {
      primeClassLookup();
      await expect(
        service.applyScheduleDraft(
          mockCoachUserId,
          mockClassId,
          {
            operationId: OP_ID,
            additions: [{ date: "2099-02-30" }],
            edits: [],
            cancellations: [],
          } as any,
          { teamId: mockClubId },
        ),
      ).rejects.toThrow("유효한 달력 날짜");
    });

    it("같은 operationId·같은 body 라도 행위자가 다르면 409 (digest actor 결합 — Codex R1-5)", async () => {
      primeClassLookup();
      const dto = {
        operationId: OP_ID,
        additions: [{ date: FUTURE_DATE }],
        edits: [],
        cancellations: [],
      } as any;
      // 다른 행위자 기준으로 저장된 digest — 현재 요청(coach) digest 와 불일치해야 한다.
      const { createHash } = await import("crypto");
      const otherActorDigest = createHash("sha256")
        .update(
          JSON.stringify({
            classId: mockClassId,
            actorId: "someone-else",
            additions: dto.additions,
            edits: [],
            cancellations: [],
          }),
        )
        .digest("hex");
      mockTx.scheduleApplyOperation.findUnique.mockResolvedValue({
        id: OP_ID,
        payloadDigest: otherActorDigest,
        result: {},
      } as any);

      await expect(
        service.applyScheduleDraft(mockCoachUserId, mockClassId, dto, {
          teamId: mockClubId,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("같은 회차에 수정+취소 동시 지시는 400 (invariant 서버 이중 방어)", async () => {
      primeClassLookup();
      await expect(
        service.applyScheduleDraft(
          mockCoachUserId,
          mockClassId,
          {
            operationId: OP_ID,
            additions: [],
            edits: [
              {
                scheduleId: "sch-1",
                baseUpdatedAt: BASE_AT.toISOString(),
                startTime: "19:00",
              },
            ],
            cancellations: [
              {
                scheduleId: "sch-1",
                baseUpdatedAt: BASE_AT.toISOString(),
                reason: "취소",
              },
            ],
          } as any,
          { teamId: mockClubId },
        ),
      ).rejects.toThrow("중복 지시");
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

  // ─── 달력 배치 일정 조회 (수업당 1요청 → 1요청) ──────────────────
  describe("getSchedulesByClassIds", () => {
    it("여러 수업을 IN 절 1회로 조회하고 classId 를 함께 반환한다", async () => {
      const findMany = jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue([] as any);

      await service.getSchedulesByClassIds(
        ["class-a", "class-b", "class-c"],
        new Date("2026-05-01"),
        new Date("2026-05-31"),
      );

      // 수업 수와 무관하게 조회는 정확히 1회.
      expect(findMany).toHaveBeenCalledTimes(1);
      const arg = findMany.mock.calls[0][0] as any;
      expect(arg.where.classId).toEqual({
        in: ["class-a", "class-b", "class-c"],
      });
      // 호출측 재분배 키(classId) 필수 · 달력 미사용 출석은 제외.
      expect(arg.select.classId).toBe(true);
      expect(arg.select.attendances).toBeUndefined();
    });

    it("종료일 경계는 단건 조회와 동일하게 그 날 끝까지 포함한다", async () => {
      const findMany = jest
        .spyOn(prismaService.classSchedule, "findMany")
        .mockResolvedValue([] as any);

      await service.getSchedulesByClassIds(
        ["class-a"],
        new Date("2026-05-01"),
        new Date("2026-05-31"),
      );

      const arg = findMany.mock.calls[0][0] as any;
      const lte: Date = arg.where.scheduledDate.lte;
      expect(lte.toISOString()).toBe("2026-05-31T23:59:59.999Z");
    });

    it("빈 목록은 조회 없이 빈 배열을 반환한다", async () => {
      const findMany = jest.spyOn(prismaService.classSchedule, "findMany");

      const result = await service.getSchedulesByClassIds([]);

      expect(result).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
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

    it("[명단 밖 확정 청구] registration 없는 학생의 확정 청구 라인도 행 생성(미수 가시성)", async () => {
      wireBillingMocks({
        billing: {
          status: "confirmed",
          items: [
            {
              userId: "ghost-1",
              amount: 30000,
              paymentStatus: "pending",
              payment: null,
            },
          ],
        },
        registrations: [], // 명단 비어 있음 — 청구 라인만 존재
        enrollments: [],
      });
      (
        prismaService.user as unknown as Record<string, jest.Mock>
      ).findMany = jest.fn().mockResolvedValue([
        {
          id: "ghost-1",
          firstName: "령",
          lastName: "유",
          email: "ghost@t.dev",
          userType: "CHILD",
        },
      ]);
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      expect(result.students).toHaveLength(1);
      const row = result.students[0];
      expect(row.memberId).toBe("ghost-1");
      expect(row.memberName).toBe("유령");
      expect(row.billingTiming).toBe("POSTPAID");
      expect(row.billingStatus).toBe("BILLED");
      expect(row.outstandingAmount).toBe(30000);
      expect(result.total).toBe(1);
      expect(result.totalPaidAmount).toBe(0);
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

    // ── 선택월 로스터 멤버십 (허브 규칙 공유) ──
    it("[명단 월스코프] inactive + 선택월 무활동 → 행 제외(그만둔 학생 잔존 해소)", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      // 등록 6월·결제 6월·inactive — 7월엔 활동 없음 → 명단 제외.
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-07",
      );
      expect(result.students).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPaidAmount).toBe(0);
    });

    it("[명단 월스코프] 등록월이 선택월보다 미래 → 제외(그 달엔 등록 전)", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [
          {
            ...postpaidChildRegistration,
            registrationDate: new Date("2026-07-10T00:00:00Z"),
          },
        ],
        enrollments: [],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      expect(result.students).toHaveLength(0);
    });

    it("[만료 회원] expired 는 월 명단에서 빠지고 expiredMembers 목록에 마지막 결제월과 함께 노출", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "expired" }],
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-07",
      );
      // 7월 무활동 expired → 월 명단 제외
      expect(result.students).toHaveLength(0);
      // 재등록 대상 관리 목록에는 월 필터와 무관하게 노출
      expect(result.expiredMembers).toEqual([
        {
          userId: "child-1",
          memberName: "김철",
          lastPaidYearMonth: "2026-06",
        },
      ]);
    });

    it("[명단 월스코프] yearMonth 미전송(admin) → inactive 무활동도 전체 명단 유지", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: prepaidClassRecord,
        registrations: [{ ...postpaidChildRegistration, status: "inactive" }],
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      const result = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        undefined,
      );
      expect(result.students).toHaveLength(1);
    });

    it("[명단 월스코프] 종료 수업(endedAt 6월)의 7월 조회 → active 무활동 학생 제외", async () => {
      wireBillingMocks({
        billing: null,
        classRecord: {
          ...prepaidClassRecord,
          isActive: false,
          endedAt: new Date("2026-06-15T00:00:00Z"),
        },
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      const july = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-07",
      );
      expect(july.students).toHaveLength(0);

      // 종료월(6월) 조회는 진행 중으로 인정 — 그 달 결제 활동도 있어 포함.
      wireBillingMocks({
        billing: null,
        classRecord: {
          ...prepaidClassRecord,
          isActive: false,
          endedAt: new Date("2026-06-15T00:00:00Z"),
        },
        enrollments: [prepaidEnrollment(juneCompletedPayment)],
      });
      const june = await service.getClassPayments(
        mockClassId,
        requester,
        undefined,
        "2026-06",
      );
      expect(june.students).toHaveLength(1);
      expect(june.students[0].billingStatus).toBe("PAID");
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

    describe("[selector 분리] 계약/거래 대표 행 — 이탈·종결 행이 결제 이력을 가리지 않음", () => {
      const refundedJuneEnrollment = {
        id: "enr-refunded",
        childId: "child-1",
        status: "refunded",
        paymentId: "pay-refunded",
        paidAt: new Date("2026-06-05T00:00:00Z"),
        classProductId: "prod-pre",
        product: {
          id: "prod-pre",
          productName: "월권",
          price: 50000,
          feeType: "MONTHLY_FIXED",
          billingTiming: "PREPAID",
          feePerSession: null,
          billingMonth: null,
        },
        payment: {
          id: "pay-refunded",
          amount: 50000,
          paymentStatus: "refunded",
          paymentMethod: "card",
          completedAt: new Date("2026-06-05T00:00:00Z"),
          createdAt: new Date("2026-06-05T00:00:00Z"),
          refundLogs: [{ refundAmount: 50000 }],
          user: {
            id: "parent-1",
            firstName: "부",
            lastName: "학",
            email: "parent1@t.dev",
            userType: "PARENT",
          },
        },
      };
      // 재결제 시도 이탈 흔적 — updatedAt 최신(배열 첫 번째)이지만 완료 결제 없음.
      const expiredJulyEnrollment = {
        id: "enr-expired",
        childId: "child-1",
        status: "expired",
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
          billingMonth: null,
        },
        payment: null,
      };

      it("[반례 1] refunded(구)+expired(신) — 무거래 월 행의 결제자·상태가 이탈 행에 가려지지 않음", async () => {
        wireBillingMocks({
          billing: null,
          classRecord: prepaidClassRecord,
          // updatedAt desc 모사 — 이탈 expired 가 첫 번째(최신).
          enrollments: [expiredJulyEnrollment, refundedJuneEnrollment],
        });
        const result = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-07", // 6월 환불 거래는 7월에 귀속되지 않음 → 무거래 행
        );
        const row = result.students[0];
        expect(row.billingStatus).toBe("UNSETTLED");
        // 종전(최신 행 스냅샷)은 expired 행이라 결제자 null·상태 expired 로 오표기됐다.
        expect(row.payerName).toBe("학부");
        expect(row.enrollmentStatus).toBe("refunded");
      });

      it("[반례 1-b] refunded 귀속월 조회 시 REFUNDED·순수납 유지 (거래 이력 보존)", async () => {
        wireBillingMocks({
          billing: null,
          classRecord: prepaidClassRecord,
          enrollments: [expiredJulyEnrollment, refundedJuneEnrollment],
        });
        const result = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-06",
        );
        const row = result.students[0];
        expect(row.billingStatus).toBe("REFUNDED");
        expect(row.paidAmount).toBe(0); // 전액 환불 → 순수납 0
      });

      it("[BOTH 전환] paid 선불(구)+approved 후불(신) → 현재 계약 POSTPAID (H-02 회귀 없음)", async () => {
        const oldPrepaidPaid = {
          ...refundedJuneEnrollment,
          id: "enr-old-paid",
          status: "paid",
          payment: {
            ...refundedJuneEnrollment.payment,
            paymentStatus: "completed",
            refundLogs: [],
          },
        };
        wireBillingMocks({
          billing: null,
          classRecord: bothClass,
          // 후불 approved 가 최신 — 종전 코드도 통과하던 케이스(비회귀 확인).
          enrollments: [postpaidEnrollment, oldPrepaidPaid],
        });
        const result = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-07",
        );
        const row = result.students[0];
        expect(row.billingTiming).toBe("POSTPAID");
        expect(row.productName).toBe("후불(회당)");
      });

      it("[BOTH 전환] completed 선불이 updatedAt 최신이어도 approved 후불 계약이 이김", async () => {
        const completedPrepaid = {
          ...refundedJuneEnrollment,
          id: "enr-completed",
          status: "completed", // 크레딧 만료 cron 이 updatedAt 을 건드려 최신이 된 케이스
          payment: {
            ...refundedJuneEnrollment.payment,
            paymentStatus: "completed",
            refundLogs: [],
          },
        };
        wireBillingMocks({
          billing: null,
          classRecord: bothClass,
          // completed 선불이 첫 번째(최신) — 종전 최신 스냅샷은 PREPAID 로 오판했다.
          enrollments: [completedPrepaid, postpaidEnrollment],
        });
        const result = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-07",
        );
        const row = result.students[0];
        expect(row.billingTiming).toBe("POSTPAID");
      });

      it("[동월 공존] 같은 달의 환불 거래가 최신 이탈(pending→expired) 흔적에 가려지지 않음", async () => {
        // 실측 반례(임선수): 7/15 결제→전액환불 + 7/16 재결제 이탈(만료). 둘 다 7월 귀속인데
        //   최신 이탈 행이 먼저 매칭되어 '취소·-' 로 오표기되던 결함 — 완료 결제 행 우선 2-pass 검증.
        const expiredWithPendingPay = {
          ...expiredJulyEnrollment,
          payment: {
            id: "pay-abandoned",
            amount: 600000,
            paymentStatus: "pending",
            paymentMethod: "card",
            completedAt: null,
            createdAt: new Date("2026-07-16T00:00:00Z"),
            refundLogs: [],
            user: null,
          },
        };
        const refundedJuly = {
          ...refundedJuneEnrollment,
          payment: {
            ...refundedJuneEnrollment.payment,
            amount: 600000,
            completedAt: new Date("2026-07-15T00:00:00Z"),
            createdAt: new Date("2026-07-15T00:00:00Z"),
            refundLogs: [{ refundAmount: 600000 }],
          },
        };
        wireBillingMocks({
          billing: null,
          classRecord: prepaidClassRecord,
          // updatedAt desc — 이탈 흔적이 최신(첫 번째).
          enrollments: [expiredWithPendingPay, refundedJuly],
        });
        const result = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-07",
        );
        const row = result.students[0];
        expect(row.billingStatus).toBe("REFUNDED");
        expect(row.paymentState).toBe("refunded"); // '취소' 아님
        expect(row.paidAmount).toBe(0); // 전액 환불 → 순수납 0
        expect(result.billingStatusCounts.REFUNDED).toBe(1);
        expect(result.billingStatusCounts.CANCELLED).toBe(0);
      });

      it("[환불 후 재구매] 월별 조회에서 최신 paid 와 과거 refunded 이력이 각자 보존됨", async () => {
        const julyRepurchase = {
          ...refundedJuneEnrollment,
          id: "enr-july-paid",
          status: "paid",
          paidAt: new Date("2026-07-03T00:00:00Z"),
          payment: {
            ...refundedJuneEnrollment.payment,
            id: "pay-july",
            paymentStatus: "completed",
            completedAt: new Date("2026-07-03T00:00:00Z"),
            createdAt: new Date("2026-07-03T00:00:00Z"),
            refundLogs: [],
          },
        };
        wireBillingMocks({
          billing: null,
          classRecord: prepaidClassRecord,
          enrollments: [julyRepurchase, refundedJuneEnrollment],
        });
        const july = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-07",
        );
        expect(july.students[0].billingStatus).toBe("PAID");
        expect(july.students[0].paidAmount).toBe(50000);

        wireBillingMocks({
          billing: null,
          classRecord: prepaidClassRecord,
          enrollments: [julyRepurchase, refundedJuneEnrollment],
        });
        const june = await service.getClassPayments(
          mockClassId,
          requester,
          undefined,
          "2026-06",
        );
        expect(june.students[0].billingStatus).toBe("REFUNDED");
      });
    });
  });

  describe("openClassSales (Phase 2 — 판매 시작 시 미갱신 선불 배치 해제)", () => {
    // 날짜 픽스처 — 실행일(KST) 기준 동적 산출. 고정 연월은 일정이 과거가 되는 순간
    //   잔여 일정 판정이 달라져 깨진다 (2026-09-01 롤오버로 실측).
    //   대상월 = 다음 달(잔여 일정 5일) · 직전 판매월 = 이번 달.
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const monthDay = (offset: number, day: number) =>
      new Date(
        Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + offset, day),
      );
    const prevSaleMonth = monthDay(0, 1); // 직전 판매월(salesOpenMonth) = 이번 달
    const saleTargetSchedule = monthDay(1, 5); // 잔여 일정 → 대상월 = 다음 달
    const renewedPaidAtIso = monthDay(0, 3).toISOString(); // 직전 판매월 결제 → 유지
    const unrenewedPaidAtIso = monthDay(-1, 5).toISOString(); // 그 전달 결제 → 해제
    const mkUser = (id: string, name: string) => ({
      userId: id,
      user: { firstName: name, lastName: "김", email: `${id}@t.dev` },
    });
    const prepaidEnroll = (childId: string, completedAtIso: string) => ({
      childId,
      status: "paid",
      paidAt: new Date(completedAtIso),
      product: {
        billingTiming: "PREPAID",
        feeType: "MONTHLY_FIXED",
        billingMonth: null,
        price: 50000,
      },
      payment: {
        amount: 50000,
        paymentStatus: "completed",
        completedAt: new Date(completedAtIso),
        createdAt: new Date(completedAtIso),
        refundLogs: [],
      },
    });
    const postpaidEnroll = (childId: string) => ({
      childId,
      status: "approved",
      paidAt: null,
      product: {
        billingTiming: "POSTPAID",
        feeType: "PER_SESSION",
        billingMonth: null,
        price: 0,
      },
      payment: null,
    });

    /** 다음 달 판매 시작(직전 판매월=이번 달) 상황의 공통 mock 배선. */
    const wireOpenSalesMocks = (opts: {
      salesOpenMonth: Date | null;
      registrations: ReturnType<typeof mkUser>[];
      enrollments: unknown[];
    }) => {
      jest
        .spyOn(service as never as { assertClassManagerPermission: () => unknown }, "assertClassManagerPermission" as never)
        .mockResolvedValue({ ownerType: "team", ownerId: mockClubId } as never);
      jest
        .spyOn(service as never as { invalidateClassCache: () => unknown }, "invalidateClassCache" as never)
        .mockResolvedValue(undefined as never);
      (prismaService.class as unknown as Record<string, jest.Mock>).findUniqueOrThrow =
        jest.fn().mockResolvedValue({
          endedAt: null,
          salesOpenMonth: opts.salesOpenMonth,
          trainingType: null,
          billingMode: "BOTH",
          schedules: [{ scheduledDate: saleTargetSchedule }],
          products: [],
        });
      (prismaService as unknown as Record<string, unknown>).classRegistration = {
        findMany: jest.fn().mockResolvedValue(opts.registrations),
      };
      jest
        .spyOn(prismaService.enrollment, "findMany")
        .mockResolvedValue(opts.enrollments as never);
      (mockTx.class.update as jest.Mock).mockResolvedValue({
        id: mockClassId,
        salesOpenMonth: monthDay(1, 1),
      });
      // tx 내 재조회(§4-0 A)도 외부 조회와 동일 상태를 반환하도록 배선 —
      //   lifecycle 재산출용 trainingType·schedules 포함.
      (mockTx.class.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        endedAt: null,
        salesOpenMonth: opts.salesOpenMonth,
        trainingType: null,
        schedules: [{ scheduledDate: saleTargetSchedule }],
        products: [],
      });
      (mockTx as unknown as Record<string, unknown>).classProduct = {
        createMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      const regUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      (mockTx as unknown as Record<string, unknown>).classRegistration = {
        updateMany: regUpdateMany,
      };
      return { regUpdateMany };
    };

    it("미갱신 선불만 해제 — 직전월 결제·후불·배치전용은 유지", async () => {
      const { regUpdateMany } = wireOpenSalesMocks({
        salesOpenMonth: prevSaleMonth,
        registrations: [
          mkUser("u-june", "미갱신"),
          mkUser("u-july", "갱신"),
          mkUser("u-post", "후불"),
          mkUser("u-roster", "배치"),
        ],
        enrollments: [
          prepaidEnroll("u-june", unrenewedPaidAtIso), // 그 전달 결제 후 미갱신 → 해제
          prepaidEnroll("u-july", renewedPaidAtIso), // 직전 판매월 결제 → 유지
          postpaidEnroll("u-post"), // 활성 후불 구독 → 유지
          // u-roster: enrollment 없음(감독 배치 전용) → 유지
        ],
      });
      const result = (await service.openClassSales(
        mockCoachUserId,
        "COACH",
        mockClassId,
      )) as { releasedCount: number; releasedNames: string[] };
      expect(regUpdateMany).toHaveBeenCalledTimes(1);
      expect(regUpdateMany.mock.calls[0][0].where.userId.in).toEqual([
        "u-june",
      ]);
      // 만료(expired) 상태로 기록 — 감독 수동 해제(inactive)와 구분.
      expect(regUpdateMany.mock.calls[0][0].data).toEqual({
        status: "expired",
      });
      expect(result.releasedCount).toBe(1);
      expect(result.releasedNames).toEqual(["김미갱신"]);
    });

    it("dryRun — 해제 대상 미리보기만 반환, 쓰기 0", async () => {
      const { regUpdateMany } = wireOpenSalesMocks({
        salesOpenMonth: prevSaleMonth,
        registrations: [mkUser("u-june", "미갱신")],
        enrollments: [prepaidEnroll("u-june", unrenewedPaidAtIso)],
      });
      const result = await service.openClassSales(
        mockCoachUserId,
        "COACH",
        mockClassId,
        true,
      );
      expect(result).toMatchObject({
        dryRun: true,
        releaseCandidates: [{ userId: "u-june", name: "김미갱신" }],
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
      expect(regUpdateMany).not.toHaveBeenCalled();
      expect(mockTx.class.update).not.toHaveBeenCalled();
    });

    it("첫 판매(직전 판매월 없음) — 해제 대상 산출 없이 판매만 시작", async () => {
      const { regUpdateMany } = wireOpenSalesMocks({
        salesOpenMonth: null,
        registrations: [mkUser("u-june", "미갱신")],
        enrollments: [prepaidEnroll("u-june", unrenewedPaidAtIso)],
      });
      const result = (await service.openClassSales(
        mockCoachUserId,
        "COACH",
        mockClassId,
      )) as { releasedCount: number; releasedNames: string[] };
      expect(regUpdateMany).not.toHaveBeenCalled();
      expect(result.releasedCount).toBe(0);
      expect(result.releasedNames).toEqual([]);
    });

    it("tx 재산출 대상월이 외부 산출과 다르면 낡은 월을 커밋하지 않음 (P2-H1)", async () => {
      wireOpenSalesMocks({
        salesOpenMonth: prevSaleMonth,
        registrations: [],
        enrollments: [],
      });
      // 외부 조회는 다음 달 일정 → 대상월 다음 달. lock 획득 후 재조회는 다다음달
      //   일정만 — 그 사이 일정이 변경된 상황 재현.
      (mockTx.class.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        endedAt: null,
        salesOpenMonth: prevSaleMonth,
        trainingType: null,
        schedules: [{ scheduledDate: monthDay(2, 5) }],
        products: [],
      });
      await expect(
        service.openClassSales(mockCoachUserId, "COACH", mockClassId),
      ).rejects.toThrow("수업 일정이 방금 변경되었습니다");
      expect(mockTx.class.update).not.toHaveBeenCalled();
    });
  });

  describe("가격 잠금 가드 (Phase 2 — 판매 시작된 월분 수정 거부)", () => {
    // 날짜 픽스처 — 실행일(KST) 기준 동적 산출. 고정 연월은 실행 시점이 그 달을
    //   지나는 순간 지난 월분 가드에 걸려 깨진다 (2026-09-01 롤오버로 실측).
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const monthStart = (offset: number) =>
      new Date(
        Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + offset, 1),
      );
    const CUR_MONTH = monthStart(0); // 판매 시작된 현재 월분
    const NEXT_MONTH = monthStart(1); // 미판매 미래 월분
    const PREV_MONTH = monthStart(-1); // 지난 월분
    const productId = "prod-lock-1";

    const wireProductMocks = (fresh: {
      feeType: string;
      billingMonth: Date | null;
      salesOpenMonth: Date | null;
      billingTiming?: string | null;
      billingMode?: string;
      feePerSession?: number | null;
    }) => {
      jest
        .spyOn(
          service as never as { assertClassManagerPermission: () => unknown },
          "assertClassManagerPermission" as never,
        )
        .mockResolvedValue({
          ownerType: "team",
          ownerId: mockClubId,
          billingMode: fresh.billingMode,
        } as never);
      jest
        .spyOn(
          service as never as { invalidateClassCache: () => unknown },
          "invalidateClassCache" as never,
        )
        .mockResolvedValue(undefined as never);
      (prismaService.classProduct.findUnique as jest.Mock).mockResolvedValue({
        id: productId,
        classId: mockClassId,
        billingMonth: fresh.billingMonth,
      });
      (mockTx.classProduct.findUnique as jest.Mock).mockResolvedValue({
        feeType: fresh.feeType,
        billingTiming: fresh.billingTiming ?? null,
        billingMonth: fresh.billingMonth,
        price: 100000,
        feePerSession: fresh.feePerSession ?? null,
        sessionsPerMonth: 8,
        sessionsPerWeek: null,
        durationDays: 28,
        class: { salesOpenMonth: fresh.salesOpenMonth },
      });
      (mockTx.classProduct.update as jest.Mock).mockResolvedValue({
        id: productId,
      });
    };

    it("판매 시작된 현재 월분의 가격 변경 → 400 + 미반영", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: CUR_MONTH,
        salesOpenMonth: CUR_MONTH,
      });
      await expect(
        service.updateClassProductByClassId("u-1", "COACH", mockClassId, productId, {
          price: 120000,
        }),
      ).rejects.toThrow("이미 판매가 시작된 수강권");
      expect(mockTx.classProduct.update).not.toHaveBeenCalled();
    });

    it("잠긴 상품이라도 이름·설명만 변경하면 통과", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: CUR_MONTH,
        salesOpenMonth: CUR_MONTH,
      });
      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { productName: "새 이름", description: "설명" },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
    });

    it("동일 값 재저장(가격 불변)은 잠긴 상품에서도 통과", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: CUR_MONTH,
        salesOpenMonth: CUR_MONTH,
      });
      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { price: 100000, sessionsPerMonth: 8 },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
    });

    it("미판매 미래 월분은 가격 변경 허용", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: NEXT_MONTH,
        salesOpenMonth: CUR_MONTH,
      });
      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { price: 130000 },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
    });

    it("PER_SESSION 일반 단가 수정은 Phase 3 전까지 허용", async () => {
      wireProductMocks({
        feeType: "PER_SESSION",
        billingMonth: null,
        salesOpenMonth: CUR_MONTH,
      });
      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { price: 60000, feePerSession: 60000 },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
    });

    it("판매 시작 후 PER_SESSION → MONTHLY_FIXED 전환은 거부 (P2-C1)", async () => {
      wireProductMocks({
        feeType: "PER_SESSION",
        billingMonth: null,
        salesOpenMonth: CUR_MONTH,
      });
      await expect(
        service.updateClassProductByClassId("u-1", "COACH", mockClassId, productId, {
          feeType: "MONTHLY_FIXED",
        }),
      ).rejects.toThrow("이미 판매가 시작된 수강권");
      expect(mockTx.classProduct.update).not.toHaveBeenCalled();
    });

    it("후불 단가 — 미정산 출석 존재 시 수정 거부 (Phase 3)", async () => {
      wireProductMocks({
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        billingMode: "POSTPAID",
        billingMonth: null,
        salesOpenMonth: null,
        feePerSession: 50000,
      });
      (mockTx.classSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          scheduledDate: new Date("2026-06-10T00:00:00.000Z"),
          attendances: [{ memberId: "m1" }],
        },
      ]);
      (mockTx.class.findUnique as jest.Mock).mockResolvedValue({
        billingMode: "POSTPAID",
      });
      (mockTx as unknown as Record<string, unknown>).monthlyPostpaidBilling = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      await expect(
        service.updateClassProductByClassId("u-1", "COACH", mockClassId, productId, {
          price: 70000,
          feePerSession: 70000,
        }),
      ).rejects.toThrow("정산되지 않은 출석");
      expect(mockTx.classProduct.update).not.toHaveBeenCalled();
    });

    it("후불 단가 — 경과월 정산이 전부 확정이면 수정 허용 (Phase 3)", async () => {
      wireProductMocks({
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        billingMode: "POSTPAID",
        billingMonth: null,
        salesOpenMonth: null,
        feePerSession: 50000,
      });
      (mockTx.classSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          scheduledDate: new Date("2026-06-10T00:00:00.000Z"),
          attendances: [{ memberId: "m1" }],
        },
      ]);
      (mockTx.class.findUnique as jest.Mock).mockResolvedValue({
        billingMode: "POSTPAID",
      });
      (mockTx as unknown as Record<string, unknown>).monthlyPostpaidBilling = {
        findMany: jest.fn().mockResolvedValue([{ yearMonth: "2026-06" }]),
      };
      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { price: 70000, feePerSession: 70000 },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
      // dual lock 고정 순서 (§4-0) — sales → postpaid, 역순 획득 없음.
      const lockKeys = (mockTx.$queryRaw as jest.Mock).mock.calls.map(
        (c) => c[1],
      );
      expect(lockKeys).toEqual([
        `class-sales:${mockClassId}`,
        `class-postpaid:${mockClassId}`,
      ]);
    });

    it("월별 판매 중 무월 legacy 재활성화는 거부 (§3-1 단서, Phase 4)", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: null,
        salesOpenMonth: CUR_MONTH,
      });
      (mockTx.classProduct.findUnique as jest.Mock).mockResolvedValue({
        feeType: "MONTHLY_FIXED",
        billingTiming: null,
        billingMonth: null,
        isActive: false,
        price: 100000,
        feePerSession: null,
        sessionsPerMonth: 8,
        sessionsPerWeek: null,
        durationDays: 28,
        class: { salesOpenMonth: CUR_MONTH },
      });
      // 현재 판매월 월분 상품 존재 (isActive 무관 조회).
      (mockTx.classProduct.findFirst as jest.Mock).mockResolvedValue({
        id: "cur-month-prod",
      });

      await expect(
        service.updateClassProductByClassId("u-1", "COACH", mockClassId, productId, {
          isActive: true,
        }),
      ).rejects.toThrow("이전 방식 수강권을 다시 판매할 수 없습니다");
      expect(mockTx.classProduct.update).not.toHaveBeenCalled();
    });

    it("미판매 월분 가격 변경 시 학부모에게 가격 변경 알림 발송 (Phase 5)", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: NEXT_MONTH,
        salesOpenMonth: CUR_MONTH,
      });
      mockNotificationsService.createNotification.mockClear();
      jest
        .spyOn(prismaService.class, "findUnique")
        .mockResolvedValue({ className: "주니어반" } as any);
      jest.spyOn(prismaService.enrollment, "findMany").mockResolvedValue([
        { childId: "kid-1" },
        { childId: "kid-2" },
      ] as any);
      (prismaService as unknown as Record<string, unknown>).parentChild = {
        findMany: jest.fn().mockResolvedValue([
          { childId: "kid-1", parentId: "parent-1", isPrimary: true },
          // kid-2 는 보호자 없음 → 학부모 전용 계약이라 수신자에서 제외(자녀 발송 금지).
        ]),
      };

      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { price: 130000 },
      );

      const calls = mockNotificationsService.createNotification.mock.calls.map(
        (c) => c[0] as {
          userId: string;
          notificationType: string;
          message: string;
          linkUrl: string;
        },
      );
      expect(calls).toHaveLength(1);
      expect(calls.map((c) => c.userId)).toEqual(["parent-1"]);
      expect(calls[0].notificationType).toBe("class_price_changed");
      expect(calls[0].message).toContain("100,000원 → 130,000원");
      expect(calls[0].linkUrl).toBe(`/classes/${mockClassId}`);
    });

    it("이름·설명만 변경하면 가격 변경 알림 미발송 (Phase 5)", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: NEXT_MONTH,
        salesOpenMonth: CUR_MONTH,
      });
      mockNotificationsService.createNotification.mockClear();

      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { productName: "이름만 변경" },
      );

      expect(mockNotificationsService.createNotification).not.toHaveBeenCalled();
    });

    it("지난 월분도 판매 중지 단독 변경(isActive:false)은 허용 — 갱신 원본 소진 경로", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: PREV_MONTH,
        salesOpenMonth: PREV_MONTH,
      });
      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { isActive: false },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
    });

    it("지난 월분에 판매 중지 외 필드가 섞이면 여전히 거부", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: PREV_MONTH,
        salesOpenMonth: PREV_MONTH,
      });
      await expect(
        service.updateClassProductByClassId("u-1", "COACH", mockClassId, productId, {
          isActive: false,
          price: 90000,
        }),
      ).rejects.toThrow("지난 월분");
      expect(mockTx.classProduct.update).not.toHaveBeenCalled();
    });

    it("월분 상품이 없는 legacy 수업의 재활성화는 허용 (과차단 방지)", async () => {
      wireProductMocks({
        feeType: "MONTHLY_FIXED",
        billingMonth: null,
        salesOpenMonth: CUR_MONTH,
      });
      (mockTx.classProduct.findUnique as jest.Mock).mockResolvedValue({
        feeType: "MONTHLY_FIXED",
        billingTiming: null,
        billingMonth: null,
        isActive: false,
        price: 100000,
        feePerSession: null,
        sessionsPerMonth: 8,
        sessionsPerWeek: null,
        durationDays: 28,
        class: { salesOpenMonth: CUR_MONTH },
      });
      (mockTx.classProduct.findFirst as jest.Mock).mockResolvedValue(null);

      await service.updateClassProductByClassId(
        "u-1",
        "COACH",
        mockClassId,
        productId,
        { isActive: true },
      );
      expect(mockTx.classProduct.update).toHaveBeenCalledTimes(1);
    });
  });
});

describe("buildClassProducts — spot 선불 단건", () => {
  it("spot(선불)은 판매 1회권 1행만 생성하고 정기권 입력을 무시한다", () => {
    const rows = buildClassProducts("c1", {
      trainingType: "spot",
      billingMode: "PREPAID",
      singlePrice: 50000,
      monthlyPrice: 180000,
      packageWeeks: 4,
      packageTotalSessions: 4,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productName: "1회 수업료",
      feeType: "PER_SESSION",
      billingTiming: "PREPAID",
      price: 50000,
      sessionsPerMonth: 0,
    });
    // isActive 미지정 = DB 기본 true(판매) — 일반 선불의 비판매(false)와 구분되는 핵심.
    expect(rows[0].isActive).toBeUndefined();
    // feePerSession 미설정 → 결제 옵션 수량 선택 자동 숨김(1회 고정).
    expect(rows[0].feePerSession).toBeUndefined();
  });

  it("spot(후불)은 기존 후불 규칙 그대로 — 1회권 후불 판매 1행", () => {
    const rows = buildClassProducts("c1", {
      trainingType: "spot",
      billingMode: "POSTPAID",
      singlePrice: 60000,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feeType: "PER_SESSION",
      billingTiming: "POSTPAID",
      price: 60000,
      feePerSession: 60000,
    });
  });

  it("레거시 spot(BOTH)은 기존 선택형 규칙을 그대로 탄다 — 수정 저장이 구성을 뒤집지 않는다", () => {
    const rows = buildClassProducts("c1", {
      trainingType: "spot",
      billingMode: "BOTH",
      singlePrice: 70000,
      monthlyPrice: 70000,
    });
    const per = rows.find((r) => r.feeType === "PER_SESSION");
    expect(per).toMatchObject({ billingTiming: "POSTPAID", isActive: true });
    expect(rows.some((r) => r.feeType === "MONTHLY_FIXED")).toBe(true);
  });

  it("일반 선불은 기존 규칙 유지 — 1회권 비판매 + 정기권 판매", () => {
    const rows = buildClassProducts("c1", {
      billingMode: "PREPAID",
      singlePrice: 50000,
      monthlyPrice: 180000,
      packageWeeks: 4,
    });
    const per = rows.find((r) => r.feeType === "PER_SESSION");
    expect(per).toMatchObject({ billingTiming: "PREPAID", isActive: false });
    expect(rows.some((r) => r.feeType === "MONTHLY_FIXED")).toBe(true);
  });
});
