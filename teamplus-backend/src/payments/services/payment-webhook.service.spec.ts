import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PrismaService } from "@/prisma/prisma.service";
import { KgInicisGateway } from "../kg-inicis.gateway";

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KgInicisGateway, useValue: mockKgGateway },
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
            update: jest.fn().mockResolvedValue({
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
    });
  });
});
