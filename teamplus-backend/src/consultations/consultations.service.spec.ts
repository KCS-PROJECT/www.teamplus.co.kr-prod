import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConsultationsService } from "./consultations.service";
import { PrismaService } from "@/prisma/prisma.service";
import { ConsultationStatus } from "@prisma/client";

describe("ConsultationsService", () => {
  let service: ConsultationsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    consultation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    chatRoom: { create: jest.fn(), update: jest.fn() },
    chatMessage: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const setupTransaction = () => {
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
    jest.clearAllMocks();
    setupTransaction();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== createConsultation ====================

  describe("createConsultation", () => {
    const parentId = "parent-1";
    const dto = { coachId: "coach-1", category: "GENERAL" as const };

    it("정상적으로 상담을 생성한다", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "coach-1",
        userType: "COACH",
      });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);
      mockPrisma.chatRoom.create.mockResolvedValue({ id: "room-1" });
      mockPrisma.consultation.create = jest.fn().mockResolvedValue({
        id: "consult-1",
        chatRoomId: "room-1",
        category: "GENERAL",
        status: ConsultationStatus.ACTIVE,
        createdAt: new Date(),
      });

      const result = await service.createConsultation(parentId, dto as any);

      expect(result.isExisting).toBe(false);
      expect(result.id).toBe("consult-1");
    });

    it("동일 조합의 ACTIVE 상담이 있으면 기존 상담을 반환한다", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "coach-1",
        userType: "COACH",
      });
      mockPrisma.consultation.findFirst.mockResolvedValue({
        id: "existing-1",
        chatRoomId: "room-1",
        category: "GENERAL",
        status: ConsultationStatus.ACTIVE,
        createdAt: new Date(),
      });

      const result = await service.createConsultation(parentId, dto as any);

      expect(result.isExisting).toBe(true);
      expect(result.id).toBe("existing-1");
    });

    it("코치가 아닌 사용자를 대상으로 하면 BadRequestException", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "coach-1",
        userType: "PARENT",
      });

      await expect(
        service.createConsultation(parentId, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("존재하지 않는 코치면 NotFoundException", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createConsultation(parentId, dto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("자기 자신에게 상담 요청하면 BadRequestException", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "parent-1",
        userType: "COACH",
      });

      await expect(
        service.createConsultation("parent-1", {
          coachId: "parent-1",
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== getMyConsultations ====================

  describe("getMyConsultations", () => {
    const mockItems = [
      {
        id: "c-1",
        category: "GENERAL",
        status: ConsultationStatus.ACTIVE,
        lastMessageAt: new Date(),
        unreadCountForParent: 2,
        unreadCountForCoach: 0,
        createdAt: new Date(),
        chatRoomId: "room-1",
        parent: { id: "p-1", firstName: "길동", lastName: "홍" },
        coach: { id: "co-1", firstName: "코치", lastName: "김" },
        student: null,
      },
    ];

    it("COACH 역할은 coachId로 필터링된다", async () => {
      mockPrisma.consultation.findMany.mockResolvedValue(mockItems);
      mockPrisma.consultation.count.mockResolvedValue(1);

      const result = await service.getMyConsultations("co-1", "COACH", {});

      expect(mockPrisma.consultation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ coachId: "co-1" }),
        }),
      );
      // COACH 역할에서는 unreadCountForCoach를 unreadCount로 매핑
      expect(result.data[0].unreadCount).toBe(0);
    });

    it("PARENT 역할은 parentId로 필터링된다", async () => {
      mockPrisma.consultation.findMany.mockResolvedValue(mockItems);
      mockPrisma.consultation.count.mockResolvedValue(1);

      const result = await service.getMyConsultations("p-1", "PARENT", {});

      expect(mockPrisma.consultation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentId: "p-1" }),
        }),
      );
      expect(result.data[0].unreadCount).toBe(2);
    });

    it("ADMIN 역할은 전체를 조회한다 (필터 없음)", async () => {
      mockPrisma.consultation.findMany.mockResolvedValue([]);
      mockPrisma.consultation.count.mockResolvedValue(0);

      await service.getMyConsultations("admin-1", "ADMIN", {});

      const callArgs = mockPrisma.consultation.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("coachId");
      expect(callArgs.where).not.toHaveProperty("parentId");
    });

    it("페이지네이션 메타 정보를 올바르게 반환한다", async () => {
      mockPrisma.consultation.findMany.mockResolvedValue([]);
      mockPrisma.consultation.count.mockResolvedValue(50);

      const result = await service.getMyConsultations("p-1", "PARENT", {
        page: 2,
        pageSize: 10,
      } as any);

      expect(result.meta).toEqual({
        total: 50,
        page: 2,
        pageSize: 10,
        totalPages: 5,
      });
    });
  });

  // ==================== closeConsultation ====================

  describe("closeConsultation", () => {
    it("정상적으로 상담을 종료한다", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: "c-1",
        parentId: "parent-1",
        coachId: "coach-1",
        status: ConsultationStatus.ACTIVE,
      });
      mockPrisma.consultation.update.mockResolvedValue({
        id: "c-1",
        status: ConsultationStatus.CLOSED,
        closedAt: new Date(),
      });

      const result = await service.closeConsultation("c-1", "parent-1");

      expect(result.message).toBe("상담이 종료되었습니다.");
      expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConsultationStatus.CLOSED,
          }),
        }),
      );
    });

    it("권한 없는 사용자가 종료 시도하면 ForbiddenException", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: "c-1",
        parentId: "parent-1",
        coachId: "coach-1",
        status: ConsultationStatus.ACTIVE,
      });

      await expect(
        service.closeConsultation("c-1", "stranger-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("이미 종료된 상담이면 BadRequestException", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: "c-1",
        parentId: "parent-1",
        coachId: "coach-1",
        status: ConsultationStatus.CLOSED,
      });

      await expect(
        service.closeConsultation("c-1", "parent-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("존재하지 않는 상담이면 NotFoundException", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(null);

      await expect(
        service.closeConsultation("not-exist", "parent-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== getConsultationById ====================

  describe("getConsultationById", () => {
    it("참여자(parent)는 상담 상세를 조회할 수 있다", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: "c-1",
        parentId: "parent-1",
        coachId: "coach-1",
        studentId: null,
        chatRoomId: "room-1",
        category: "GENERAL",
        status: ConsultationStatus.ACTIVE,
        lastMessageAt: new Date(),
        unreadCountForParent: 0,
        unreadCountForCoach: 0,
        createdAt: new Date(),
        closedAt: null,
        parent: { id: "parent-1", firstName: "길동", lastName: "홍" },
        coach: { id: "coach-1", firstName: "코치", lastName: "김" },
        student: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ userType: "PARENT" });

      const result = await service.getConsultationById("c-1", "parent-1");

      expect(result.id).toBe("c-1");
    });

    it("비참여자이면서 비관리자이면 ForbiddenException", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: "c-1",
        parentId: "parent-1",
        coachId: "coach-1",
        studentId: null,
        chatRoomId: "room-1",
        category: "GENERAL",
        status: ConsultationStatus.ACTIVE,
        lastMessageAt: null,
        unreadCountForParent: 0,
        unreadCountForCoach: 0,
        createdAt: new Date(),
        closedAt: null,
        parent: { id: "parent-1", firstName: "길동", lastName: "홍" },
        coach: { id: "coach-1", firstName: "코치", lastName: "김" },
        student: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ userType: "TEEN" });

      await expect(
        service.getConsultationById("c-1", "stranger-1"),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
