import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PaymentRefundService } from "./payment-refund.service";
import { PrismaService } from "@/prisma/prisma.service";
import { KgInicisGateway } from "../kg-inicis.gateway";
import { TossPaymentsGateway } from "../toss-payments.gateway";
import { CreditDomainService } from "@/credits/credit-domain.service";

describe("PaymentRefundService", () => {
  let service: PaymentRefundService;

  const mockPrisma = {
    payment: { findUnique: jest.fn(), update: jest.fn() },
    memberCredit: { findMany: jest.fn(), updateMany: jest.fn() },
    refundLog: { create: jest.fn(), findMany: jest.fn() },
    enrollment: { findMany: jest.fn() },
    classAttendance: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockKgGateway = {
    cancelPayment: jest.fn(),
  };

  const mockTossGateway = {
    cancel: jest.fn(),
  };

  const mockCreditDomain = {};

  /** completed 상태의 KG 결제 기본 fixture (학부모 parent-1 소유) */
  const kgPayment = {
    id: "pay-1",
    userId: "parent-1",
    paymentStatus: "completed",
    paymentMethod: "card",
    tid: "StdpayCARD_INI0001",
    amount: 400000,
    completedAt: new Date("2026-07-08T05:40:00Z"),
    createdAt: new Date("2026-07-08T05:39:00Z"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRefundService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KgInicisGateway, useValue: mockKgGateway },
        { provide: TossPaymentsGateway, useValue: mockTossGateway },
        { provide: CreditDomainService, useValue: mockCreditDomain },
      ],
    }).compile();

    service = module.get<PaymentRefundService>(PaymentRefundService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ── [환불 정책 1단계] 이용 개시(출석) 후 셀프 취소 차단 ────────────────────

  describe("cancelPayment — 출석 사용분 가드", () => {
    it("결제 후 출석(present)이 있으면 학부모 셀프 취소를 ForbiddenException 으로 거절한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { childId: "child-1", classId: "class-1" },
      ]);
      mockPrisma.classAttendance.count.mockResolvedValue(1);

      await expect(
        service.cancelPayment(
          "pay-1",
          "학부모 요청",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "parent-1", userType: "PARENT" },
        ),
      ).rejects.toThrow(ForbiddenException);

      // 가드에서 거절 — PG 취소는 호출되지 않아야 한다
      expect(mockKgGateway.cancelPayment).not.toHaveBeenCalled();
      // 출석 조회는 결제일(KST 달력일) 이후 일정으로 한정
      expect(mockPrisma.classAttendance.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberId: "child-1",
            attendanceStatus: "present",
          }),
        }),
      );
    });

    it("출석 이력이 없으면 가드를 통과해 PG 취소 단계로 진행한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { childId: "child-1", classId: "class-1" },
      ]);
      mockPrisma.classAttendance.count.mockResolvedValue(0);
      // PG 실패로 흐름 종료 — 가드 통과 여부만 검증 ($transaction 미진입)
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 실패",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "학부모 요청",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "parent-1", userType: "PARENT" },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockKgGateway.cancelPayment).toHaveBeenCalledTimes(1);
    });

    it("ADMIN 요청은 출석 이력과 무관하게 가드를 우회한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 실패",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
        ),
      ).rejects.toThrow(BadRequestException);

      // 가드 미실행 — 수강/출석 조회 자체가 없어야 한다
      expect(mockPrisma.enrollment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.classAttendance.count).not.toHaveBeenCalled();
    });

    it("수강 결제가 아니면(Enrollment 미연결) 가드 대상이 아니다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 실패",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "학부모 요청",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "parent-1", userType: "PARENT" },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.classAttendance.count).not.toHaveBeenCalled();
      expect(mockKgGateway.cancelPayment).toHaveBeenCalledTimes(1);
    });
  });

  // Phase B 구현 후 활성화 예정
  it.skip("cancelPayment: KG 취소 성공 후 $transaction 내 크레딧 복원 + 감사 로그 생성", async () => {
    // given: kgGateway.cancelPayment 성공, payment 존재
    // when: cancelPayment(paymentId, userId, { refundReason: '회원 요청' })
    // then: $transaction 1회, 반환값 { refundId, cancelledAmount, restoredCreditIds } 포함
  });

  it.skip("cancelPayment: 이미 취소된 결제 재시도 시 ConflictException — 멱등성", async () => {
    // given: payment.status = 'CANCELLED'
    // when: cancelPayment 재호출
    // then: ConflictException, kgGateway.cancelPayment 호출 없음
  });

  it.skip("requestRefund: cancelPayment 에 그대로 위임하고 동일 결과 반환", async () => {
    // given: cancelPayment 가 정상 CancelPaymentResult 반환하도록 spy
    // when: requestRefund(paymentId, userId, options)
    // then: cancelPayment 호출 1회, 반환값 동일
  });

  it.skip("getRefundLogs: 존재하지 않는 paymentId 조회 시 빈 배열 반환", async () => {
    // given: prisma.refundLog.findMany 가 [] 반환
    // when: getRefundLogs('non-existent', userId)
    // then: [] 반환, 예외 없음
  });
});
