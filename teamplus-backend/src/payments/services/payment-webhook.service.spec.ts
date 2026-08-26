import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PrismaService } from "@/prisma/prisma.service";
import { KgInicisGateway } from "../kg-inicis.gateway";
import { CreditDomainService } from "@/credits/credit-domain.service";

describe("PaymentWebhookService", () => {
  let service: PaymentWebhookService;

  const mockPrisma = {
    payment: { findUnique: jest.fn(), update: jest.fn() },
    memberCredit: { create: jest.fn() },
    creditTransaction: { create: jest.fn() },
    enrollment: { findFirst: jest.fn(), update: jest.fn() },
    clubMember: { findFirst: jest.fn(), create: jest.fn() },
    classRegistration: { findUnique: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockKgGateway = {
    verifyWebhookSignature: jest.fn(),
    verifyAmount: jest.fn(),
  };

  // PR-B: MemberCredit 발급 단일 진입점 — 발급 위임만 검증(내부는 credits 도메인 spec 담당).
  const mockCreditDomain = {
    issueFromPayment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KgInicisGateway, useValue: mockKgGateway },
        { provide: CreditDomainService, useValue: mockCreditDomain },
      ],
    }).compile();

    service = module.get<PaymentWebhookService>(PaymentWebhookService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("completePayment 보안 검증", () => {
    const baseWebhook = {
      orderNumber: "ORD-001",
      tid: "T001",
      resultCode: "0000",
      amount: 10000,
    };

    it("signature 누락 시 BadRequestException 발생", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        amount: 10000,
        paymentStatus: "pending",
      });

      await expect(
        service.completePayment({ ...baseWebhook, signature: undefined }),
      ).rejects.toThrow(BadRequestException);

      expect(mockKgGateway.verifyWebhookSignature).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("signature 검증 실패 시 BadRequestException 발생 + DB 트랜잭션 미실행", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        amount: 10000,
        paymentStatus: "pending",
      });
      mockKgGateway.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.completePayment({ ...baseWebhook, signature: "invalid" }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("금액 불일치 시 BadRequestException 발생", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        amount: 9000,
        paymentStatus: "pending",
      });
      mockKgGateway.verifyWebhookSignature.mockReturnValue(true);
      mockKgGateway.verifyAmount.mockReturnValue(false);

      await expect(
        service.completePayment({ ...baseWebhook, signature: "valid" }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("결제 기록 없으면 NotFoundException 발생", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.completePayment({ ...baseWebhook, signature: "valid" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("이미 처리된 결제 재호출 시 ConflictException — 멱등성", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        amount: 10000,
        paymentStatus: "completed",
      });

      await expect(
        service.completePayment({ ...baseWebhook, signature: "valid" }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("finalizePayment $transaction 원자성", () => {
    it("이미 처리된 주문은 ConflictException — 트랜잭션 미실행", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "p1",
        orderNumber: "ORD-001",
        userId: "u1",
        amount: 10000,
        paymentStatus: "completed",
        productId: "prod1",
        product: { classId: "c1", durationDays: 90, sessionsPerMonth: 8 },
      });

      await expect(
        service.finalizePayment({
          orderNumber: "ORD-001",
          tid: "T001",
          amount: 10000,
          paymentStatus: "completed",
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("결제 기록 없으면 NotFoundException", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.finalizePayment({
          orderNumber: "ORD-NULL",
          tid: "T001",
          amount: 10000,
          paymentStatus: "completed",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("정상 완료 시 $transaction 1회 호출 + creditsIssued 반환", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "p1",
        orderNumber: "ORD-001",
        userId: "u1",
        amount: 10000,
        paymentStatus: "pending",
        productId: "prod1",
        product: { classId: "c1", durationDays: 90, sessionsPerMonth: 8 },
      });

      // $transaction 콜백 시뮬레이션
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: "p1",
              orderNumber: "ORD-001",
              userId: "u1",
              amount: 10000,
              paymentStatus: "completed",
              tid: "T001",
              completedAt: new Date(),
            }),
          },
          enrollment: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
          memberCredit: {
            create: jest.fn().mockResolvedValue({ id: "mc1" }),
          },
          creditTransaction: { create: jest.fn() },
          clubMember: { findFirst: jest.fn(), create: jest.fn() },
          classRegistration: { findUnique: jest.fn(), create: jest.fn() },
          user: { findUnique: jest.fn() },
        };
        return fn(tx);
      });

      const result = await service.finalizePayment({
        orderNumber: "ORD-001",
        tid: "T001",
        amount: 10000,
        paymentStatus: "completed",
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.creditsIssued).toBe(8);
      expect(result.paymentStatus).toBe("completed");
      expect(mockCreditDomain.issueFromPayment).toHaveBeenCalledTimes(1);
    });

    it("발급 수량 0 상품은 크레딧 미발급 — issueFromPayment 미호출 + 결제는 정상 완료", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "p1",
        orderNumber: "ORD-002",
        userId: "u1",
        amount: 10000,
        paymentStatus: "pending",
        productId: "prod1",
        // 발급 수량 0(신규 기본) — 크레딧 미발급 상품.
        product: { classId: "c1", durationDays: 90, sessionsPerMonth: 0 },
      });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: "p1",
              orderNumber: "ORD-002",
              userId: "u1",
              amount: 10000,
              paymentStatus: "completed",
              tid: "T002",
              completedAt: new Date(),
            }),
          },
          enrollment: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
          memberCredit: { create: jest.fn() },
          creditTransaction: { create: jest.fn() },
          clubMember: { findFirst: jest.fn(), create: jest.fn() },
          classRegistration: { findUnique: jest.fn(), create: jest.fn() },
          user: { findUnique: jest.fn() },
        };
        return fn(tx);
      });

      const result = await service.finalizePayment({
        orderNumber: "ORD-002",
        tid: "T002",
        amount: 10000,
        paymentStatus: "completed",
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.creditsIssued).toBe(0);
      expect(result.paymentStatus).toBe("completed");
      expect(mockCreditDomain.issueFromPayment).not.toHaveBeenCalled();
    });
  });

  describe("종결 전이 CAS — 동시 진입 단일 실행", () => {
    const pendingPayment = {
      id: "p1",
      orderNumber: "ORD-CAS",
      userId: "u1",
      amount: 10000,
      paymentStatus: "pending",
      productId: "prod1",
      product: { classId: "c1", durationDays: 90, sessionsPerMonth: 8 },
    };

    /** 사전 검사는 통과했으나 트랜잭션 진입 시 다른 실행자가 이미 선점한 상황. */
    function mockTxWithClaim(count: number) {
      const updateMany = jest.fn().mockResolvedValue({ count });
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          payment: {
            updateMany,
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              ...pendingPayment,
              paymentStatus: "completed",
              tid: "T-CAS",
              completedAt: new Date(),
            }),
          },
          enrollment: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
          memberCredit: { create: jest.fn().mockResolvedValue({ id: "mc1" }) },
          creditTransaction: { create: jest.fn() },
          clubMember: { findFirst: jest.fn(), create: jest.fn() },
          classRegistration: { findUnique: jest.fn(), create: jest.fn() },
          user: { findUnique: jest.fn() },
        }),
      );
      return updateMany;
    }

    it("claim 조건에 pending 상태가 포함된다 — 조건 없는 update 금지", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      const updateMany = mockTxWithClaim(1);

      await service.finalizePayment({
        orderNumber: "ORD-CAS",
        tid: "T-CAS",
        amount: 10000,
        paymentStatus: "completed",
      });

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderNumber: "ORD-CAS", paymentStatus: "pending" },
        }),
      );
    });

    it("claim 실패(count=0) 시 ConflictException — 크레딧 미발급", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockTxWithClaim(0);

      await expect(
        service.finalizePayment({
          orderNumber: "ORD-CAS",
          tid: "T-CAS",
          amount: 10000,
          paymentStatus: "completed",
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockCreditDomain.issueFromPayment).not.toHaveBeenCalled();
    });

    it("동시 2건 중 claim 승자만 크레딧을 발급한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);

      // 첫 호출만 count=1(승자), 이후는 count=0(패자) — DB 조건부 갱신 동작 재현.
      let claimTaken = false;
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          payment: {
            updateMany: jest.fn().mockImplementation(async () => {
              if (claimTaken) return { count: 0 };
              claimTaken = true;
              return { count: 1 };
            }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              ...pendingPayment,
              paymentStatus: "completed",
              tid: "T-CAS",
              completedAt: new Date(),
            }),
          },
          enrollment: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
          memberCredit: { create: jest.fn().mockResolvedValue({ id: "mc1" }) },
          creditTransaction: { create: jest.fn() },
          clubMember: { findFirst: jest.fn(), create: jest.fn() },
          classRegistration: { findUnique: jest.fn(), create: jest.fn() },
          user: { findUnique: jest.fn() },
        }),
      );

      const params = {
        orderNumber: "ORD-CAS",
        tid: "T-CAS",
        amount: 10000,
        paymentStatus: "completed" as const,
      };
      const results = await Promise.allSettled([
        service.finalizePayment(params),
        service.finalizePayment(params),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(mockCreditDomain.issueFromPayment).toHaveBeenCalledTimes(1);
    });
  });
});
