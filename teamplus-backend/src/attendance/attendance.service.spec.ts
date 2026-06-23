import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("AttendanceService", () => {
  let service: AttendanceService;
  let prismaService: PrismaService;

  const mockMemberId = "member-123";
  const mockScheduleId = "schedule-456";
  const mockClassId = "class-789";

  const mockSchedule = {
    id: mockScheduleId,
    classId: mockClassId,
    scheduledDate: new Date("2026-01-05T16:00:00Z"),
    isCancelled: false,
    cancellationReason: null,
    createdAt: new Date("2026-01-04T10:00:00Z"),
    class: {
      id: mockClassId,
      teamId: "club-123",
      className: "신규 수강생반",
    },
  };

  const mockMemberCredit = {
    id: "credit-123",
    memberId: mockMemberId,
    totalCredits: 8,
    usedCredits: 2,
    expiresAt: new Date("2026-04-04T23:59:59Z"),
  };

  const mockAttendance = {
    id: "attendance-123",
    scheduleId: mockScheduleId,
    memberId: mockMemberId,
    attendanceStatus: "present",
    checkedInAt: new Date("2026-01-05T16:05:00Z"),
    creditDeducted: true,
    createdAt: new Date("2026-01-05T16:05:00Z"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: PrismaService,
          useValue: {
            classSchedule: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
            },
            memberCredit: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            classAttendance: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              upsert: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn(),
              groupBy: jest.fn(),
            },
            creditTransaction: {
              create: jest.fn(),
            },
            clubMember: {
              findFirst: jest.fn(),
            },
            classRegistration: {
              findFirst: jest.fn(),
            },
            attendanceQR: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            team: {
              findFirst: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            class: {
              findMany: jest.fn(),
            },
            parentChild: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockClubMember = { id: "clubmember-123" };
  const mockActiveRegistration = { id: "registration-123" };

  describe("checkInAttendance", () => {
    it("should successfully check in attendance and deduct credit", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findFirst")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(mockActiveRegistration as any);
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(mockMemberCredit as any);

      const mockTxAttendance = { ...mockAttendance };
      const mockTxCredit = { ...mockMemberCredit, usedCredits: 3 };
      jest
        .spyOn(prismaService, "$transaction")
        .mockImplementation(async (fn: any) =>
          fn({
            classAttendance: {
              upsert: jest.fn().mockResolvedValue(mockTxAttendance),
              update: jest.fn().mockResolvedValue(mockTxAttendance),
            },
            memberCredit: {
              update: jest.fn().mockResolvedValue(mockTxCredit),
            },
            creditTransaction: {
              create: jest.fn().mockResolvedValue({}),
            },
          }),
        );

      const result = await service.checkInAttendance(
        mockMemberId,
        mockScheduleId,
      );

      expect(result.attendanceStatus).toBe("present");
      expect(result.creditDeducted).toBe(true);
    });

    it("should throw NotFoundException if schedule does not exist", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if schedule is cancelled", async () => {
      const cancelledSchedule = { ...mockSchedule, isCancelled: true };
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(cancelledSchedule as any);

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if attendance already marked present", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(prismaService.classAttendance, "findFirst").mockResolvedValue({
        ...mockAttendance,
        attendanceStatus: "present",
      } as any);

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if member is not an approved club member", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findFirst")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.clubMember, "findFirst").mockResolvedValue(null);

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw ForbiddenException if not registered for the class", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findFirst")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(null); // 수강등록 없음

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw BadRequestException if member has no available credits", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findFirst")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(mockActiveRegistration as any);
      // checkInAttendance 는 memberCredit.findFirst 사용 (service.ts:313)
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if credits are all used", async () => {
      const noCreditLeft = { ...mockMemberCredit, usedCredits: 8 };
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findFirst")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(mockActiveRegistration as any);
      // checkInAttendance 는 memberCredit.findFirst 사용 (service.ts:313)
      // 서비스 로직: findFirst → null 체크 → usedCredits >= totalCredits 확인
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(noCreditLeft as any);

      await expect(
        service.checkInAttendance(mockMemberId, mockScheduleId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should not deduct credit if attendance already exists", async () => {
      const existingAttendance = {
        ...mockAttendance,
        attendanceStatus: "absent",
        creditDeducted: false,
      };
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findFirst")
        .mockResolvedValue(existingAttendance as any);
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(mockActiveRegistration as any);
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(mockMemberCredit as any);

      const mockTxAttendance = { ...mockAttendance };
      jest
        .spyOn(prismaService, "$transaction")
        .mockImplementation(async (fn: any) =>
          fn({
            classAttendance: {
              upsert: jest.fn().mockResolvedValue(mockTxAttendance),
              update: jest.fn().mockResolvedValue(mockTxAttendance),
            },
            memberCredit: {
              update: jest.fn().mockResolvedValue(mockMemberCredit),
            },
            creditTransaction: {
              create: jest.fn().mockResolvedValue({}),
            },
          }),
        );

      const result = await service.checkInAttendance(
        mockMemberId,
        mockScheduleId,
      );

      expect(result.creditDeducted).toBe(true);
    });
  });

  describe("checkInByQr", () => {
    const mockRequestUserId = "requester-1";
    const mockQrData = "qr-uuid-valid";

    const buildMockQr = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: "qr-1",
      scheduleId: mockScheduleId,
      qrData: mockQrData,
      generatedBy: "coach-1",
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      scannedAt: null,
      scannedBy: null,
      schedule: {
        id: mockScheduleId,
        isCancelled: false,
        class: {
          id: mockClassId,
          className: "신규 수강생반",
          teamId: "club-123",
        },
      },
      ...overrides,
    });

    it("should throw ForbiddenException if not registered for the class", async () => {
      jest
        .spyOn(prismaService.attendanceQR, "findUnique")
        .mockResolvedValue(buildMockQr() as any);
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(null); // 수강등록 없음

      await expect(
        service.checkInByQr(mockRequestUserId, mockQrData),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if QR code does not exist", async () => {
      jest
        .spyOn(prismaService.attendanceQR, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.checkInByQr(mockRequestUserId, mockQrData),
      ).rejects.toThrow(NotFoundException);
    });

    it("should allow re-scan by another user and proceed to ClassRegistration check", async () => {
      // 정책 변경: QR 다회 사용 허용 (수업당 여러 학생이 같은 QR 공유)
      // scannedAt 이 존재해도 차단하지 않고, 다음 검증 단계(ClassRegistration)로 진행됨.
      // ClassRegistration=null 로 설정하여 "수강 등록" 에러 메시지까지 도달함을
      // 정규식 매칭으로 직접 검증 → 재스캔 1차 차단 제거가 실제로 이뤄졌음을 증명.
      jest.spyOn(prismaService.attendanceQR, "findUnique").mockResolvedValue(
        buildMockQr({
          scannedAt: new Date(),
          scannedBy: "another-user",
        }) as any,
      );
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(null);

      // 에러 원인이 "수강 등록" 이어야 함. "이미 사용된 QR" 에서 조기 차단되면 실패.
      await expect(
        service.checkInByQr(mockRequestUserId, mockQrData),
      ).rejects.toThrow(/수강 등록/);
    });

    it("should successfully check-in when QR was previously scanned by another user", async () => {
      // 정책 변경의 양성 경로 직접 검증:
      // 1차 학생이 이미 스캔한 QR(scannedAt 존재)이어도 2차 학생이 전체 플로우를 통과하여
      // attendanceStatus='present' + creditDeducted=true 로 성공 체크인되어야 함.
      const firstStudentScannedAt = new Date(Date.now() - 60_000);
      jest.spyOn(prismaService.attendanceQR, "findUnique").mockResolvedValue(
        buildMockQr({
          scannedAt: firstStudentScannedAt,
          scannedBy: "first-student",
        }) as any,
      );
      jest
        .spyOn(prismaService.clubMember, "findFirst")
        .mockResolvedValue(mockClubMember as any);
      jest
        .spyOn(prismaService.classRegistration, "findFirst")
        .mockResolvedValue(mockActiveRegistration as any);
      jest
        .spyOn(prismaService.classAttendance, "findUnique")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue([mockMemberCredit] as any);

      const mockTxAttendance = {
        ...mockAttendance,
        memberId: mockRequestUserId,
      };
      jest
        .spyOn(prismaService, "$transaction")
        .mockImplementation(async (fn: any) =>
          fn({
            classAttendance: {
              upsert: jest.fn().mockResolvedValue(mockTxAttendance),
              update: jest.fn().mockResolvedValue(mockTxAttendance),
            },
            memberCredit: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findUniqueOrThrow: jest
                .fn()
                .mockResolvedValue({ totalCredits: 8, usedCredits: 3 }),
            },
            creditTransaction: {
              create: jest.fn().mockResolvedValue({}),
            },
            attendanceQR: {
              update: jest.fn().mockResolvedValue({}),
            },
          }),
        );

      const result = await service.checkInByQr(mockRequestUserId, mockQrData);

      expect(result.attendanceStatus).toBe("present");
      expect(result.creditDeducted).toBe(true);
      expect(result.proxyCheckIn).toBe(false);
    });
  });

  describe("getScheduleAttendance", () => {
    it("should successfully retrieve schedule attendance with statistics", async () => {
      const mockAttendances = [
        {
          ...mockAttendance,
          id: "att-1",
          memberId: "mem-1",
          attendanceStatus: "present",
          member: { id: "mem-1", email: "mem1@test.com" },
        },
        {
          ...mockAttendance,
          id: "att-2",
          memberId: "mem-2",
          attendanceStatus: "present",
          member: { id: "mem-2", email: "mem2@test.com" },
        },
        {
          ...mockAttendance,
          id: "att-3",
          memberId: "mem-3",
          attendanceStatus: "absent",
          member: { id: "mem-3", email: "mem3@test.com" },
        },
      ];

      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue(mockAttendances as any);

      const result = await service.getScheduleAttendance(mockScheduleId);

      expect(result.scheduleId).toBe(mockScheduleId);
      expect(result.total).toBe(3);
      expect(result.present).toBe(2);
      expect(result.absent).toBe(1);
      expect(result.late).toBe(0);
      expect(result.presentRate).toBe("66.7");
    });

    it("should return 0 presentRate if no attendances", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue([] as any);

      const result = await service.getScheduleAttendance(mockScheduleId);

      expect(result.total).toBe(0);
      expect(result.presentRate).toBe("0");
    });

    it("should throw NotFoundException if schedule does not exist", async () => {
      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.getScheduleAttendance(mockScheduleId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should correctly calculate statistics with mixed attendance statuses", async () => {
      const mockAttendances = [
        { ...mockAttendance, id: "att-1", attendanceStatus: "present" },
        { ...mockAttendance, id: "att-2", attendanceStatus: "present" },
        { ...mockAttendance, id: "att-3", attendanceStatus: "late" },
        { ...mockAttendance, id: "att-4", attendanceStatus: "absent" },
        { ...mockAttendance, id: "att-5", attendanceStatus: "absent" },
      ];

      jest
        .spyOn(prismaService.classSchedule, "findUnique")
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue(mockAttendances as any);

      const result = await service.getScheduleAttendance(mockScheduleId);

      expect(result.present).toBe(2);
      expect(result.late).toBe(1);
      expect(result.absent).toBe(2);
    });
  });

  describe("getMemberAttendanceHistory", () => {
    it("should successfully retrieve member attendance history with default limit", async () => {
      const mockHistories = [
        {
          id: "att-1",
          scheduleId: "sched-1",
          attendanceStatus: "present",
          checkedInAt: new Date("2026-01-05T16:05:00Z"),
          creditDeducted: true,
          schedule: {
            scheduledDate: new Date("2026-01-05T16:00:00Z"),
            class: {
              className: "신규 수강생반",
            },
          },
        },
        {
          id: "att-2",
          scheduleId: "sched-2",
          attendanceStatus: "late",
          checkedInAt: new Date("2026-01-04T16:15:00Z"),
          creditDeducted: true,
          schedule: {
            scheduledDate: new Date("2026-01-04T16:00:00Z"),
            class: {
              className: "신규 수강생반",
            },
          },
        },
      ];

      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue(mockHistories as any);

      const result = await service.getMemberAttendanceHistory(
        mockMemberId,
        mockMemberId,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].className).toBe("신규 수강생반");
      expect(result[0].attendanceStatus).toBe("present");
    });

    it("should respect custom limit parameter", async () => {
      const mockHistories = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `att-${i}`,
          scheduleId: `sched-${i}`,
          attendanceStatus: "present",
          checkedInAt: new Date(),
          creditDeducted: true,
          schedule: {
            scheduledDate: new Date(),
            class: {
              className: "수업명",
            },
          },
        }));

      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue(mockHistories as any);

      await service.getMemberAttendanceHistory(mockMemberId, mockMemberId, 5);

      expect(prismaService.classAttendance.findMany).toHaveBeenCalledWith({
        where: { memberId: mockMemberId },
        include: {
          schedule: {
            select: {
              id: true,
              scheduledDate: true,
              class: {
                select: {
                  id: true,
                  className: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      });
    });

    it("should return empty array if member has no attendance history", async () => {
      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue([] as any);

      const result = await service.getMemberAttendanceHistory(
        mockMemberId,
        mockMemberId,
      );

      expect(result).toEqual([]);
    });

    it("should include creditDeducted flag in history", async () => {
      const mockHistories = [
        {
          id: "att-1",
          scheduleId: "sched-1",
          attendanceStatus: "present",
          checkedInAt: new Date(),
          creditDeducted: true,
          schedule: {
            scheduledDate: new Date(),
            class: {
              className: "신규 수강생반",
            },
          },
        },
        {
          id: "att-2",
          scheduleId: "sched-2",
          attendanceStatus: "absent",
          checkedInAt: null,
          creditDeducted: false,
          schedule: {
            scheduledDate: new Date(),
            class: {
              className: "신규 수강생반",
            },
          },
        },
      ];

      jest
        .spyOn(prismaService.classAttendance, "findMany")
        .mockResolvedValue(mockHistories as any);

      const result = await service.getMemberAttendanceHistory(
        mockMemberId,
        mockMemberId,
      );

      expect(result[0].creditDeducted).toBe(true);
      expect(result[1].creditDeducted).toBe(false);
    });
  });

  describe("getClassAttendanceStats", () => {
    it("should successfully calculate class attendance statistics", async () => {
      jest.spyOn(prismaService.classSchedule, "count").mockResolvedValue(2);
      jest.spyOn(prismaService.classAttendance, "groupBy").mockResolvedValue([
        { attendanceStatus: "present", _count: { attendanceStatus: 3 } },
        { attendanceStatus: "absent", _count: { attendanceStatus: 2 } },
        { attendanceStatus: "late", _count: { attendanceStatus: 1 } },
      ] as any);

      const result = await service.getClassAttendanceStats(mockClassId);

      expect(result.classId).toBe(mockClassId);
      expect(result.totalSessions).toBe(2);
      expect(result.totalPresent).toBe(3);
      expect(result.totalAbsent).toBe(2);
      expect(result.totalLate).toBe(1);
    });

    it("should return zero statistics if class has no schedules", async () => {
      jest.spyOn(prismaService.classSchedule, "count").mockResolvedValue(0);
      jest
        .spyOn(prismaService.classAttendance, "groupBy")
        .mockResolvedValue([]);

      const result = await service.getClassAttendanceStats(mockClassId);

      expect(result.totalSessions).toBe(0);
      expect(result.totalPresent).toBe(0);
      expect(result.totalAbsent).toBe(0);
      expect(result.totalLate).toBe(0);
      expect(result.presentRate).toBe("0");
    });

    it("should correctly calculate presentRate based on capacity", async () => {
      jest.spyOn(prismaService.classSchedule, "count").mockResolvedValue(1);
      jest.spyOn(prismaService.classAttendance, "groupBy").mockResolvedValue([
        { attendanceStatus: "present", _count: { attendanceStatus: 2 } },
        { attendanceStatus: "absent", _count: { attendanceStatus: 1 } },
      ] as any);

      const result = await service.getClassAttendanceStats(mockClassId);

      // 2 present out of (1 session * 20) = 2/20 * 100 = 10%
      expect(result.presentRate).toBeDefined();
      expect(result.totalPresent).toBe(2);
    });

    it("should handle multiple sessions with various attendance statuses", async () => {
      jest.spyOn(prismaService.classSchedule, "count").mockResolvedValue(3);
      jest.spyOn(prismaService.classAttendance, "groupBy").mockResolvedValue([
        { attendanceStatus: "present", _count: { attendanceStatus: 3 } },
        { attendanceStatus: "late", _count: { attendanceStatus: 2 } },
        { attendanceStatus: "absent", _count: { attendanceStatus: 4 } },
      ] as any);

      const result = await service.getClassAttendanceStats(mockClassId);

      expect(result.totalSessions).toBe(3);
      expect(result.totalPresent).toBe(3);
      expect(result.totalLate).toBe(2);
      expect(result.totalAbsent).toBe(4);
    });
  });
});
