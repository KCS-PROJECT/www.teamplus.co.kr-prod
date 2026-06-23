import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { MemberApprovalsService } from "./member-approvals.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";

describe("MemberApprovalsService", () => {
  let service: MemberApprovalsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockNotifications: any = {
    sendMembershipApproval: jest.fn().mockResolvedValue(undefined),
    notifyTeamManagers: jest.fn().mockResolvedValue(undefined),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    teamMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    memberApprovalLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    // 승인 알림 경로(sendApprovalNotification)용 — 기본 undefined 반환 시 조기 return
    parentChild: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    team: {
      findUnique: jest.fn(),
    },
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
        MemberApprovalsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<MemberApprovalsService>(MemberApprovalsService);
    jest.clearAllMocks();
    setupTransaction();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== getPending ====================

  describe("getPending", () => {
    it("대기 중인 회원 목록을 정상 반환한다", async () => {
      const mockItems = [
        {
          id: "m-1",
          playerName: "홍길동",
          playerAge: 12,
          playerLevel: "BEGINNER",
          teamId: "club-1",
          joinedAt: new Date(),
          createdAt: new Date(),
          user: {
            id: "u-1",
            firstName: "길동",
            lastName: "홍",
            email: "test@teamplus.com",
            phone: "010-1234-5678",
            gender: "M",
            koreanAge: 12,
            userType: "CHILD",
          },
          team: { id: "club-1", name: "Test Club" },
        },
      ];
      mockPrisma.teamMember.findMany.mockResolvedValue(mockItems);
      mockPrisma.teamMember.count.mockResolvedValue(1);

      const result = await service.getPending({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ approvalStatus: "pending" }),
        }),
      );
    });

    it("teamId 필터를 올바르게 적용한다", async () => {
      mockPrisma.teamMember.findMany.mockResolvedValue([]);
      mockPrisma.teamMember.count.mockResolvedValue(0);

      await service.getPending({ teamId: "club-1" });

      const callArgs = mockPrisma.teamMember.findMany.mock.calls[0][0];
      expect(callArgs.where.teamId).toBe("club-1");
    });

    it("페이지네이션을 올바르게 처리한다", async () => {
      mockPrisma.teamMember.findMany.mockResolvedValue([]);
      mockPrisma.teamMember.count.mockResolvedValue(50);

      const result = await service.getPending({ page: "3", pageSize: "10" });

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(5);
    });
  });

  // ==================== approve ====================

  describe("approve", () => {
    it("ClubMember 상태를 변경하고 MemberApprovalLog를 생성한다", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        id: "m-1",
        approvalStatus: "pending",
        playerName: "홍길동",
        teamId: "club-1",
      });
      mockPrisma.teamMember.update.mockResolvedValue({
        id: "m-1",
        playerName: "홍길동",
        approvalStatus: "approved",
        teamId: "club-1",
      });
      mockPrisma.memberApprovalLog.create.mockResolvedValue({});

      const result = await service.approve("m-1", "actor-1", "DIRECTOR");

      expect(result.status).toBe("approved");
      expect(mockPrisma.teamMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalStatus: "approved",
            rejectionReason: null,
          }),
        }),
      );
      expect(mockPrisma.memberApprovalLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberId: "m-1",
            action: "APPROVED",
            actorId: "actor-1",
          }),
        }),
      );
    });

    it("이미 승인된 회원이면 ConflictException", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        id: "m-1",
        approvalStatus: "approved",
        playerName: "홍길동",
        teamId: "club-1",
      });

      await expect(
        service.approve("m-1", "actor-1", "DIRECTOR"),
      ).rejects.toThrow(ConflictException);
    });

    it("존재하지 않는 회원이면 NotFoundException", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue(null);

      await expect(
        service.approve("not-exist", "actor-1", "DIRECTOR"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== reject ====================

  describe("reject", () => {
    it("거절 사유를 저장하고 로그를 생성한다", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        id: "m-1",
        approvalStatus: "pending",
        playerName: "홍길동",
      });
      mockPrisma.teamMember.update.mockResolvedValue({
        id: "m-1",
        playerName: "홍길동",
        approvalStatus: "rejected",
      });
      mockPrisma.memberApprovalLog.create.mockResolvedValue({});

      const result = await service.reject(
        "m-1",
        "actor-1",
        "DIRECTOR",
        "나이 미달",
      );

      expect(result.status).toBe("rejected");
      expect(mockPrisma.teamMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalStatus: "rejected",
            rejectionReason: "나이 미달",
          }),
        }),
      );
      expect(mockPrisma.memberApprovalLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "REJECTED",
            reason: "나이 미달",
          }),
        }),
      );
    });

    it("이미 거절된 회원이면 ConflictException", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        id: "m-1",
        approvalStatus: "rejected",
        playerName: "홍길동",
      });

      await expect(
        service.reject("m-1", "actor-1", "DIRECTOR", "사유"),
      ).rejects.toThrow(ConflictException);
    });

    it("존재하지 않는 회원이면 NotFoundException", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue(null);

      await expect(
        service.reject("not-exist", "actor-1", "DIRECTOR", "사유"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== bulkApprove ====================

  describe("bulkApprove", () => {
    it("다중 ID를 일괄 승인한다", async () => {
      const ids = ["m-1", "m-2", "m-3"];
      mockPrisma.teamMember.findMany.mockResolvedValue(
        ids.map((id) => ({ id, approvalStatus: "pending" })),
      );
      mockPrisma.teamMember.update.mockImplementation(
        (args: { where: { id: string } }) =>
          Promise.resolve({
            id: args.where.id,
            playerName: `Player-${args.where.id}`,
          }),
      );
      mockPrisma.memberApprovalLog.create.mockResolvedValue({});

      const result = await service.bulkApprove(ids, "actor-1", "DIRECTOR");

      expect(result.approvedCount).toBe(3);
      expect(result.approvedMembers).toHaveLength(3);
      expect(mockPrisma.memberApprovalLog.create).toHaveBeenCalledTimes(3);
    });

    it("일괄 승인 시 각 학부모에게 가입 승인 알림을 발송한다", async () => {
      const ids = ["m-1", "m-2"];
      mockPrisma.teamMember.findMany.mockResolvedValue(
        ids.map((id) => ({ id, approvalStatus: "pending" })),
      );
      mockPrisma.teamMember.update.mockImplementation(
        (args: { where: { id: string } }) =>
          Promise.resolve({
            id: args.where.id,
            playerName: `Player-${args.where.id}`,
          }),
      );
      mockPrisma.memberApprovalLog.create.mockResolvedValue({});
      // 승인 알림 경로(sendApprovalNotification) mock — 자녀 userId → 학부모 parentId 해석
      mockPrisma.teamMember.findUnique.mockImplementation(
        (args: { where: { id: string } }) =>
          Promise.resolve({
            userId: `child-${args.where.id}`,
            team: { name: "Test Team" },
          }),
      );
      mockPrisma.parentChild.findFirst.mockImplementation(
        (args: { where: { childId: string } }) =>
          Promise.resolve({ parentId: `parent-${args.where.childId}` }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        firstName: "코치",
        lastName: "김",
      });

      await service.bulkApprove(ids, "actor-1", "DIRECTOR");
      // fire-and-forget 알림 체인(다중 await) 완료 대기
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockNotifications.sendMembershipApproval).toHaveBeenCalledTimes(2);
      expect(mockNotifications.sendMembershipApproval).toHaveBeenCalledWith(
        expect.objectContaining({ clubName: "Test Team", coachName: "김코치" }),
      );
    });

    it("존재하지 않는 ID가 포함되면 NotFoundException", async () => {
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { id: "m-1", approvalStatus: "pending" },
      ]);

      await expect(
        service.bulkApprove(["m-1", "m-not-exist"], "actor-1", "DIRECTOR"),
      ).rejects.toThrow(NotFoundException);
    });

    it("pending 상태가 아닌 회원이 포함되면 BadRequestException", async () => {
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { id: "m-1", approvalStatus: "pending" },
        { id: "m-2", approvalStatus: "approved" },
      ]);

      await expect(
        service.bulkApprove(["m-1", "m-2"], "actor-1", "DIRECTOR"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== reapply ====================

  describe("reapply", () => {
    it("거절된 자녀 재신청 시 pending 전환 + 팀 감독/코치에게 알림한다", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        id: "m-1",
        approvalStatus: "rejected",
        userId: "child-1",
        teamId: "team-1",
        playerName: "홍길동",
        team: { name: "Test Team" },
      });
      mockPrisma.parentChild.findUnique.mockResolvedValue({ id: "pc-1" });
      mockPrisma.teamMember.update.mockResolvedValue({
        id: "m-1",
        playerName: "홍길동",
        approvalStatus: "pending",
        teamId: "team-1",
      });
      mockPrisma.memberApprovalLog.create.mockResolvedValue({});

      const result = await service.reapply("m-1", "parent-1");

      expect(result.status).toBe("pending");
      expect(mockNotifications.notifyTeamManagers).toHaveBeenCalledWith(
        "team-1",
        expect.objectContaining({ notificationType: "membership_requested" }),
      );
    });

    it("거절 상태가 아니면 ConflictException (알림 없음)", async () => {
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        id: "m-1",
        approvalStatus: "pending",
        userId: "child-1",
        teamId: "team-1",
        playerName: "홍길동",
        team: { name: "Test Team" },
      });

      await expect(service.reapply("m-1", "parent-1")).rejects.toThrow(
        ConflictException,
      );
      expect(mockNotifications.notifyTeamManagers).not.toHaveBeenCalled();
    });
  });
});
