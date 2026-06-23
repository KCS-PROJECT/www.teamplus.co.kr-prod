import { Test, TestingModule } from "@nestjs/testing";
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PickupMatchesService } from "./pickup-matches.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { PaymentsService } from "@/payments/payments.service";

/**
 * PickupMatchesService 단위 테스트.
 *
 * 핵심 검증 포인트:
 * 1. 매치 생성/수정 정상 동작
 * 2. 참가 신청 시 중복/정원 초과 방어
 * 3. 신청자 목록 권한: 주최자 또는 ADMIN/DIRECTOR만 가능
 * 4. 신청 상태 변경 권한 + 알림 발송 Side Effect + rejectionReason 저장
 * 5. 매치 취소 권한 + 환불 트랜잭션 + 전체 알림 fanout
 * 6. 일괄 거절 트랜잭션 + skip 카운트
 * 7. 조회수 증가 1일 1회 제한
 */
describe("PickupMatchesService", () => {
  let service: PickupMatchesService;
  let prisma: jest.Mocked<
    Pick<
      PrismaService,
      "pickupMatch" | "pickupMatchApplicant" | "dailyViewLog" | "$transaction"
    >
  >;
  let notifications: jest.Mocked<
    Pick<NotificationsService, "createNotification">
  >;
  let paymentsService: jest.Mocked<Pick<PaymentsService, "cancelPayment">>;

  const managerId = "manager_1";
  const otherUserId = "user_2";
  const matchId = "match_1";
  const applicantId = "app_1";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PickupMatchesService,
        {
          provide: PrismaService,
          useValue: {
            pickupMatch: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            pickupMatchApplicant: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            dailyViewLog: {
              create: jest.fn(),
            },
            // $transaction: 기본 구현은 콜백을 바로 tx=prisma로 실행
            $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
              typeof cb === "function"
                ? Promise.resolve(cb(prisma as unknown as PrismaService))
                : Promise.resolve(cb),
            ),
          },
        },
        {
          provide: PaymentsService,
          useValue: {
            cancelPayment: jest.fn().mockResolvedValue({
              id: "refund_1",
              paymentId: "pay_1",
              refundAmount: 35000,
              refundReason: "매치 취소에 따른 환불",
              paymentStatus: "refunded",
              processedAt: new Date(),
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            createNotification: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PickupMatchesService>(PickupMatchesService);
    prisma = module.get(PrismaService);
    paymentsService = module.get(PaymentsService);
    notifications = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== create ====================
  describe("create", () => {
    it("매치를 생성하고 매니저 ID를 저장한다", async () => {
      const dto = {
        title: "테스트 매치",
        scheduledAt: "2026-05-01T10:00:00.000Z",
        rinkName: "강남 빙상장",
        price: 35000,
        level: "중급",
        maxParticipants: 20,
      };
      (prisma.pickupMatch.create as jest.Mock).mockResolvedValue({
        id: matchId,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        status: "recruiting",
      });

      const result = await service.create(managerId, dto);

      expect(prisma.pickupMatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ managerId, title: dto.title }),
        }),
      );
      expect(result.id).toBe(matchId);
    });
  });

  // ==================== update ====================
  describe("update", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const baseMatch = {
      id: matchId,
      managerId,
      status: "recruiting",
      title: "테스트 매치",
      scheduledAt: futureDate,
      maxParticipants: 20,
      price: 35000,
    };

    it("주최자가 아니고 ADMIN도 아니면 ForbiddenException", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);

      await expect(
        service.update(
          matchId,
          { id: otherUserId, userType: "COACH" },
          { title: "변경된 제목" },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("취소된 매치는 수정할 수 없다 (BadRequest)", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        ...baseMatch,
        status: "cancelled",
      });

      await expect(
        service.update(
          matchId,
          { id: managerId, userType: "COACH" },
          { title: "변경" },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("이미 시작된 매치는 수정할 수 없다 (BadRequest)", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        ...baseMatch,
        scheduledAt: pastDate,
      });

      await expect(
        service.update(
          matchId,
          { id: managerId, userType: "COACH" },
          { title: "변경" },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("maxParticipants를 현재 승인 인원보다 낮게 변경하면 BadRequest", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatchApplicant.count as jest.Mock).mockResolvedValue(10);

      await expect(
        service.update(
          matchId,
          { id: managerId, userType: "COACH" },
          { maxParticipants: 5 },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("정상 수정 시 updatedByUserId가 자동 설정된다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatch.update as jest.Mock).mockResolvedValue({
        id: matchId,
        title: "새 제목",
        updatedByUserId: managerId,
      });
      // 알림 fanout 대상 없음
      (prisma.pickupMatchApplicant.findMany as jest.Mock).mockResolvedValue([]);

      await service.update(
        matchId,
        { id: managerId, userType: "COACH" },
        { title: "새 제목" },
      );

      expect(prisma.pickupMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: matchId },
          data: expect.objectContaining({
            title: "새 제목",
            updatedBy: { connect: { id: managerId } },
          }),
        }),
      );
    });

    it("정상 수정 시 승인/대기 신청자 전원에게 match_updated 알림 fanout", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatch.update as jest.Mock).mockResolvedValue({
        id: matchId,
        title: "새 제목",
      });
      (prisma.pickupMatchApplicant.findMany as jest.Mock).mockResolvedValue([
        { userId: "u1" },
        { userId: "u2" },
        { userId: managerId }, // 본인은 제외되어야 함
      ]);

      await service.update(
        matchId,
        { id: managerId, userType: "COACH" },
        { title: "새 제목" },
      );
      await new Promise((r) => setImmediate(r));

      // 본인 제외 2건만 발송
      expect(notifications.createNotification).toHaveBeenCalledTimes(2);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationType: "match_updated",
        }),
      );
    });
  });

  // ==================== apply ====================
  describe("apply", () => {
    const baseMatch = {
      id: matchId,
      title: "테스트 매치",
      managerId,
      maxParticipants: 20,
      status: "recruiting",
      _count: { applicants: 5 },
    };

    it("정원 초과 시 ForbiddenException을 던진다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        ...baseMatch,
        _count: { applicants: 20 },
      });

      await expect(
        service.apply(matchId, otherUserId, { position: "FW" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("이미 신청한 경우 ConflictException을 던진다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatchApplicant.findUnique as jest.Mock).mockResolvedValue({
        id: applicantId,
      });

      await expect(service.apply(matchId, otherUserId, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it("정상 신청 시 매니저에게 알림을 발송한다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatchApplicant.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (prisma.pickupMatchApplicant.create as jest.Mock).mockResolvedValue({
        id: applicantId,
        matchId,
        status: "pending",
        paymentStatus: "pending",
        appliedAt: new Date(),
      });

      await service.apply(matchId, otherUserId, { position: "FW" });

      // 비동기 safeNotify catch 때문에 microtask 대기
      await new Promise((r) => setImmediate(r));

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: managerId,
          notificationType: "match_applied",
        }),
      );
    });
  });

  // ==================== getApplicants ====================
  describe("getApplicants", () => {
    it("주최자가 아니고 ADMIN도 아닌 경우 ForbiddenException을 던진다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        maxParticipants: 20,
        status: "recruiting",
      });

      await expect(
        service.getApplicants(matchId, otherUserId, "PARENT"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("ADMIN 역할은 주최자가 아니어도 조회 가능하다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        maxParticipants: 20,
        status: "recruiting",
      });
      (prisma.pickupMatchApplicant.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        service.getApplicants(matchId, otherUserId, "ADMIN"),
      ).resolves.toEqual(
        expect.objectContaining({ matchId, approvedCount: 0 }),
      );
    });

    it("주최자 본인은 조회 가능하다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        maxParticipants: 20,
        status: "recruiting",
      });
      (prisma.pickupMatchApplicant.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getApplicants(matchId, managerId, "COACH");
      expect(result.matchId).toBe(matchId);
    });
  });

  // ==================== updateApplicantStatus ====================
  describe("updateApplicantStatus", () => {
    it("권한 없는 사용자는 ForbiddenException을 받는다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        title: "테스트 매치",
        status: "recruiting",
      });

      await expect(
        service.updateApplicantStatus(
          matchId,
          applicantId,
          otherUserId,
          "approved",
          "PARENT",
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("DIRECTOR는 승인 후 신청자에게 알림을 발송한다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        title: "테스트 매치",
        status: "recruiting",
      });
      (prisma.pickupMatchApplicant.findUnique as jest.Mock).mockResolvedValue({
        id: applicantId,
        matchId,
        userId: "applicant_user",
        status: "pending",
      });
      (prisma.pickupMatchApplicant.update as jest.Mock).mockResolvedValue({
        id: applicantId,
        status: "approved",
        rejectionReason: null,
        rejectedAt: null,
        updatedAt: new Date(),
        userId: "applicant_user",
      });

      await service.updateApplicantStatus(
        matchId,
        applicantId,
        otherUserId,
        "approved",
        "DIRECTOR",
      );

      await new Promise((r) => setImmediate(r));

      expect(prisma.pickupMatchApplicant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "approved",
            rejectedAt: null,
            rejectionReason: null,
          }),
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "applicant_user",
          notificationType: "match_approved",
        }),
      );
    });

    it("거절 시 rejectionReason과 rejectedAt을 저장한다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        title: "테스트 매치",
        status: "recruiting",
      });
      (prisma.pickupMatchApplicant.findUnique as jest.Mock).mockResolvedValue({
        id: applicantId,
        matchId,
        userId: "applicant_user",
        status: "pending",
      });
      (prisma.pickupMatchApplicant.update as jest.Mock).mockResolvedValue({
        id: applicantId,
        status: "rejected",
        rejectionReason: "레벨 미달",
        rejectedAt: new Date(),
        updatedAt: new Date(),
        userId: "applicant_user",
      });

      await service.updateApplicantStatus(
        matchId,
        applicantId,
        managerId,
        "rejected",
        "COACH",
        "레벨 미달",
      );

      expect(prisma.pickupMatchApplicant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "rejected",
            rejectionReason: "레벨 미달",
            rejectedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("취소된 매치의 신청자 상태는 변경할 수 없다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        managerId,
        title: "테스트 매치",
        status: "cancelled",
      });

      await expect(
        service.updateApplicantStatus(
          matchId,
          applicantId,
          managerId,
          "approved",
          "COACH",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== bulkRejectApplicants ====================
  describe("bulkRejectApplicants", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const baseMatch = {
      id: matchId,
      managerId,
      status: "recruiting",
      title: "테스트 매치",
      scheduledAt: futureDate,
      maxParticipants: 20,
      price: 35000,
    };

    it("권한 없는 사용자는 ForbiddenException", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);

      await expect(
        service.bulkRejectApplicants(
          matchId,
          { id: otherUserId, userType: "PARENT" },
          { applicantIds: ["a1"], rejectionReason: "테스트 사유" },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("pending 신청자만 거절 처리하고 나머지는 skip 카운트", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatchApplicant.findMany as jest.Mock).mockResolvedValue([
        { id: "a1", userId: "u1" },
        { id: "a2", userId: "u2" },
      ]);
      (prisma.pickupMatchApplicant.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      const result = await service.bulkRejectApplicants(
        matchId,
        { id: managerId, userType: "COACH" },
        {
          applicantIds: ["a1", "a2", "a3_already_approved", "a4_wrong_match"],
          rejectionReason: "레벨 미달",
        },
      );

      await new Promise((r) => setImmediate(r));

      expect(result.rejectedCount).toBe(2);
      expect(result.skippedCount).toBe(2);
      expect(result.reason).toBe("레벨 미달");
      expect(prisma.pickupMatchApplicant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "rejected",
            rejectionReason: "레벨 미달",
          }),
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== cancelWithReason ====================
  describe("cancelWithReason", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const baseMatch = {
      id: matchId,
      managerId,
      status: "recruiting",
      title: "테스트 매치",
      scheduledAt: futureDate,
      maxParticipants: 20,
      price: 35000,
    };

    it("권한 없는 사용자는 ForbiddenException을 받는다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);

      await expect(
        service.cancelWithReason(
          matchId,
          { id: otherUserId, userType: "COACH" },
          "사유",
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("이미 취소된 매치는 다시 취소할 수 없다 (BadRequest)", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        ...baseMatch,
        status: "cancelled",
      });

      await expect(
        service.cancelWithReason(
          matchId,
          { id: managerId, userType: "COACH" },
          "사유",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("ADMIN은 본인 매치가 아니어도 취소 가능하고 PG 환불 + 레거시 환불 + 전체 알림", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatch.update as jest.Mock).mockResolvedValue({
        id: matchId,
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: "긴급 취소",
        price: 35000,
      });
      // findMany 호출 순서: 1) 환불 대상 조회, 2) 알림 대상 조회
      (prisma.pickupMatchApplicant.findMany as jest.Mock)
        .mockResolvedValueOnce([
          // 환불 대상: paymentId 있는 건 1개 + 없는 건 (레거시) 2개
          {
            id: "app_1",
            userId: "u1",
            paymentId: "pay_1",
            paymentStatus: "paid",
          },
          { id: "app_2", userId: "u2", paymentId: null, paymentStatus: "paid" },
          { id: "app_3", userId: "u3", paymentId: null, paymentStatus: "paid" },
        ])
        .mockResolvedValueOnce([
          // 알림 대상
          { userId: "u1" },
          { userId: "u2" },
          { userId: "u3" },
        ]);
      (prisma.pickupMatchApplicant.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.pickupMatchApplicant.update as jest.Mock).mockResolvedValue({});

      const result = await service.cancelWithReason(
        matchId,
        { id: otherUserId, userType: "ADMIN" },
        "긴급 취소",
      );
      await new Promise((r) => setImmediate(r));

      expect(result.status).toBe("cancelled");
      // 레거시 2건 + PG 환불 1건 = 3건
      expect(result.refundedCount).toBe(3);
      expect(result.refundFailedCount).toBe(0);
      expect(result.notifiedCount).toBe(3);
      // PaymentsService.cancelPayment 호출 확인 (paymentId 있는 건만)
      expect(paymentsService.cancelPayment).toHaveBeenCalledTimes(1);
      // [2026-06-10 SECURITY] 매치 호스트의 참가자 일괄 환불은 신뢰된 내부 호출 → trusted 플래그 전달.
      expect(paymentsService.cancelPayment).toHaveBeenCalledWith(
        "pay_1",
        "긴급 취소",
        35000,
        undefined,
        undefined,
        undefined,
        { trusted: true },
      );
      expect(notifications.createNotification).toHaveBeenCalledTimes(3);
    });

    it("PG 환불 실패 시 refund_failed 상태로 전환하고 부분 성공 결과 반환", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(baseMatch);
      (prisma.pickupMatch.update as jest.Mock).mockResolvedValue({
        id: matchId,
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: "긴급 취소",
        price: 35000,
      });
      (prisma.pickupMatchApplicant.findMany as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: "app_1",
            userId: "u1",
            paymentId: "pay_1",
            paymentStatus: "paid",
          },
          {
            id: "app_2",
            userId: "u2",
            paymentId: "pay_2",
            paymentStatus: "paid",
          },
        ])
        .mockResolvedValueOnce([{ userId: "u1" }, { userId: "u2" }]);
      (prisma.pickupMatchApplicant.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });
      (prisma.pickupMatchApplicant.update as jest.Mock).mockResolvedValue({});
      // 첫 번째 환불 성공, 두 번째 실패
      (paymentsService.cancelPayment as jest.Mock)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("PG 통신 에러"));

      const result = await service.cancelWithReason(
        matchId,
        { id: otherUserId, userType: "ADMIN" },
        "긴급 취소",
      );

      expect(result.refundedCount).toBe(1);
      expect(result.refundFailedCount).toBe(1);
      // refund_failed 상태로 업데이트 확인
      expect(prisma.pickupMatchApplicant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "app_2" },
          data: { paymentStatus: "refund_failed" },
        }),
      );
    });
  });

  // ==================== leave ====================
  describe("leave", () => {
    it("신청 내역 없으면 NotFoundException을 던진다", async () => {
      (prisma.pickupMatchApplicant.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.leave(matchId, otherUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== incrementViewCount ====================
  describe("incrementViewCount", () => {
    it("비로그인 사용자는 카운트를 증가시키지 않고 현재 값 반환", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        id: matchId,
        viewCount: 10,
      });

      const result = await service.incrementViewCount(matchId, null);

      expect(result).toEqual({ viewCount: 10, incremented: false });
      expect(prisma.dailyViewLog.create).not.toHaveBeenCalled();
    });

    it("로그인 사용자 첫 조회는 카운트를 1 증가시킨다", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        id: matchId,
        viewCount: 10,
      });
      (prisma.dailyViewLog.create as jest.Mock).mockResolvedValue({});
      (prisma.pickupMatch.update as jest.Mock).mockResolvedValue({
        viewCount: 11,
      });

      const result = await service.incrementViewCount(matchId, otherUserId);

      expect(result).toEqual({ viewCount: 11, incremented: true });
      expect(prisma.dailyViewLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: "pickup_match",
            entityId: matchId,
            userId: otherUserId,
          }),
        }),
      );
      expect(prisma.pickupMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { viewCount: { increment: 1 } },
        }),
      );
    });

    it("이미 오늘 조회한 경우(P2002)는 카운트 증가 없이 false 반환", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue({
        id: matchId,
        viewCount: 10,
      });
      // $transaction 내부에서 P2002 발생 시뮬레이션
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("already viewed today", {
          code: "P2002",
          clientVersion: "5.22.0",
        }),
      );

      const result = await service.incrementViewCount(matchId, otherUserId);

      expect(result).toEqual({ viewCount: 10, incremented: false });
    });

    it("존재하지 않는 매치는 NotFoundException", async () => {
      (prisma.pickupMatch.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.incrementViewCount(matchId, otherUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
