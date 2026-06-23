import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WaitlistService } from "./waitlist.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { CreateWaitlistDto } from "./dto/create-waitlist.dto";

describe("WaitlistService", () => {
  let service: WaitlistService;

  const mockPrismaService = {
    class: { findUnique: jest.fn() },
    waitlist: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockNotificationsService = {
    createNotification: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
    jest.clearAllMocks();
  });

  // ── createWaitlist ────────────────────────────────────────────────────────

  describe("createWaitlist", () => {
    const dto: CreateWaitlistDto = { classId: "class-1" };

    it("수업이 없으면 NotFoundException을 던진다", async () => {
      mockPrismaService.class.findUnique.mockResolvedValue(null);

      await expect(service.createWaitlist("user-1", dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("비활성 수업이면 NotFoundException을 던진다", async () => {
      mockPrismaService.class.findUnique.mockResolvedValue({
        id: "class-1",
        className: "테스트 수업",
        isActive: false,
      });

      await expect(service.createWaitlist("user-1", dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("이미 대기 중인 수업에 재등록 시 ConflictException을 던진다", async () => {
      mockPrismaService.class.findUnique.mockResolvedValue({
        id: "class-1",
        className: "테스트 수업",
        isActive: true,
      });
      mockPrismaService.waitlist.findFirst.mockResolvedValueOnce({
        id: "wait-existing",
        status: "WAITING",
      });

      await expect(service.createWaitlist("user-1", dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it("정상 대기 등록 시 position을 1부터 순차 할당한다", async () => {
      mockPrismaService.class.findUnique.mockResolvedValue({
        id: "class-1",
        className: "테스트 수업",
        isActive: true,
      });
      // 중복 대기 없음
      mockPrismaService.waitlist.findFirst
        .mockResolvedValueOnce(null) // 중복 확인
        .mockResolvedValueOnce(null); // 마지막 position (없음 → position=1)

      mockPrismaService.waitlist.create.mockResolvedValue({
        id: "wait-new",
        classId: "class-1",
        userId: "user-1",
        childId: null,
        position: 1,
        status: "WAITING",
        notifiedAt: null,
        confirmedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        scheduleId: null,
        class: { id: "class-1", className: "테스트 수업" },
        child: null,
      });

      const result = await service.createWaitlist("user-1", dto);

      expect(result.position).toBe(1);
      expect(result.status).toBe("WAITING");
    });

    it("이미 대기자가 있으면 마지막 position + 1로 등록한다", async () => {
      mockPrismaService.class.findUnique.mockResolvedValue({
        id: "class-1",
        className: "테스트 수업",
        isActive: true,
      });
      // 중복 없음, 마지막 position=3
      mockPrismaService.waitlist.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ position: 3 });

      mockPrismaService.waitlist.create.mockResolvedValue({
        id: "wait-new",
        classId: "class-1",
        userId: "user-1",
        childId: null,
        position: 4,
        status: "WAITING",
        notifiedAt: null,
        confirmedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        scheduleId: null,
        class: { id: "class-1", className: "테스트 수업" },
        child: null,
      });

      const result = await service.createWaitlist("user-1", dto);

      expect(result.position).toBe(4);
    });
  });

  // ── cancelWaitlist ────────────────────────────────────────────────────────

  describe("cancelWaitlist", () => {
    it("대기 정보가 없으면 NotFoundException을 던진다", async () => {
      mockPrismaService.waitlist.findUnique.mockResolvedValue(null);

      await expect(service.cancelWaitlist("user-1", "wait-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("다른 사용자의 대기를 취소하려 하면 ForbiddenException을 던진다", async () => {
      mockPrismaService.waitlist.findUnique.mockResolvedValue({
        id: "wait-1",
        userId: "user-other",
        status: "WAITING",
        classId: "class-1",
      });

      await expect(service.cancelWaitlist("user-1", "wait-1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("이미 CANCELLED 상태인 대기를 재취소하면 BadRequestException을 던진다", async () => {
      mockPrismaService.waitlist.findUnique.mockResolvedValue({
        id: "wait-1",
        userId: "user-1",
        status: "CANCELLED",
        classId: "class-1",
      });

      await expect(service.cancelWaitlist("user-1", "wait-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("정상 취소 시 status를 CANCELLED로 업데이트한다", async () => {
      mockPrismaService.waitlist.findUnique.mockResolvedValue({
        id: "wait-1",
        userId: "user-1",
        status: "WAITING",
        classId: "class-1",
      });
      mockPrismaService.waitlist.update.mockResolvedValue({});

      await service.cancelWaitlist("user-1", "wait-1");

      expect(mockPrismaService.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wait-1" },
          data: { status: "CANCELLED" },
        }),
      );
    });
  });

  // ── promoteNextWaitlist ───────────────────────────────────────────────────

  describe("promoteNextWaitlist", () => {
    it("대기자가 없으면 update를 호출하지 않는다", async () => {
      mockPrismaService.waitlist.findFirst.mockResolvedValue(null);

      await service.promoteNextWaitlist("class-1");

      expect(mockPrismaService.waitlist.update).not.toHaveBeenCalled();
    });

    it("WAITING 상태 중 position이 가장 낮은 대기자를 CONFIRMED로 승격한다", async () => {
      const nextWaiting = {
        id: "wait-1",
        userId: "user-1",
        classId: "class-1",
        position: 1,
        user: { id: "user-1" },
        class: { id: "class-1", className: "테스트 수업" },
      };

      mockPrismaService.waitlist.findFirst.mockResolvedValue(nextWaiting);
      mockPrismaService.waitlist.update.mockResolvedValue({});
      mockNotificationsService.createNotification.mockResolvedValue({});

      await service.promoteNextWaitlist("class-1");

      expect(mockPrismaService.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wait-1" },
          data: expect.objectContaining({
            status: "CONFIRMED",
            notifiedAt: expect.any(Date),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it("승격 시 waitlist_promoted 타입으로 알림을 발송한다", async () => {
      const nextWaiting = {
        id: "wait-1",
        userId: "user-1",
        classId: "class-1",
        position: 1,
        user: { id: "user-1" },
        class: { id: "class-1", className: "팀훈련" },
      };

      mockPrismaService.waitlist.findFirst.mockResolvedValue(nextWaiting);
      mockPrismaService.waitlist.update.mockResolvedValue({});

      await service.promoteNextWaitlist("class-1");

      // createNotification은 비동기(catch)이므로 약간의 지연 후 확인
      await new Promise((r) => setImmediate(r));

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          notificationType: "waitlist_promoted",
        }),
      );
    });
  });

  // ── processExpiredWaitlists ───────────────────────────────────────────────

  describe("processExpiredWaitlists", () => {
    it("만료된 CONFIRMED 대기를 EXPIRED로 변경하고 다음 대기자를 승격한다", async () => {
      const expiredItems = [
        { id: "wait-exp-1", classId: "class-1" },
        { id: "wait-exp-2", classId: "class-1" },
      ];

      mockPrismaService.waitlist.findMany.mockResolvedValue(expiredItems);
      mockPrismaService.waitlist.update.mockResolvedValue({});
      // promoteNextWaitlist 내부 findFirst → 없음
      mockPrismaService.waitlist.findFirst.mockResolvedValue(null);

      await service.processExpiredWaitlists();

      // 각 만료 항목마다 EXPIRED 업데이트
      expect(mockPrismaService.waitlist.update).toHaveBeenCalledTimes(2);
      expiredItems.forEach((item) => {
        expect(mockPrismaService.waitlist.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: item.id },
            data: { status: "EXPIRED" },
          }),
        );
      });
    });

    it("만료된 항목이 없으면 update를 호출하지 않는다", async () => {
      mockPrismaService.waitlist.findMany.mockResolvedValue([]);

      await service.processExpiredWaitlists();

      expect(mockPrismaService.waitlist.update).not.toHaveBeenCalled();
    });
  });

  // ── confirmWaitlist ───────────────────────────────────────────────────────

  describe("confirmWaitlist", () => {
    it("CONFIRMED가 아닌 대기를 확정하려 하면 BadRequestException을 던진다", async () => {
      mockPrismaService.waitlist.findUnique.mockResolvedValue({
        id: "wait-1",
        userId: "user-1",
        status: "WAITING",
        expiresAt: new Date(Date.now() + 86400_000),
        classId: "class-1",
        class: { id: "class-1", className: "수업" },
        child: null,
      });

      await expect(service.confirmWaitlist("user-1", "wait-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("응답 기한이 만료된 경우 EXPIRED 처리 후 BadRequestException을 던진다", async () => {
      mockPrismaService.waitlist.findUnique.mockResolvedValue({
        id: "wait-1",
        userId: "user-1",
        status: "CONFIRMED",
        expiresAt: new Date(Date.now() - 1000), // 이미 만료
        classId: "class-1",
        class: { id: "class-1", className: "수업" },
        child: null,
      });
      mockPrismaService.waitlist.update.mockResolvedValue({});
      mockPrismaService.waitlist.findFirst.mockResolvedValue(null);

      await expect(service.confirmWaitlist("user-1", "wait-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "EXPIRED" } }),
      );
    });
  });
});
