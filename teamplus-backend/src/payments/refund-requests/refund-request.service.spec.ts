import { Test } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RefundRequestService } from "./refund-request.service";
import { PrismaService } from "@/prisma/prisma.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  PaymentRefundService,
  RefundExecutionError,
} from "../services/payment-refund.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * 환불 승인제(Phase 1) 서비스 검증.
 *  커버: 도메인 판별 3종 + 422 fail-closed · 소유권/완료 가드 · 활성 중복(P2002) 409 ·
 *        CAS 경쟁 409 · 승인 실행(trusted+refundContext) · failureStage 분기 ·
 *        DB_AFTER_PG 재처리(PG 재호출 금지) · 역할별 스코프 매핑 · 교차 소속 거부.
 */
describe("RefundRequestService", () => {
  let service: RefundRequestService;

  const prismaMock = {
    payment: { findUnique: jest.fn(), updateMany: jest.fn() },
    refundRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    enrollment: { findFirst: jest.fn(), findMany: jest.fn() },
    monthlyPostpaidBillingLine: { findFirst: jest.fn() },
    tournamentRegistration: { findFirst: jest.fn() },
    pickupMatchApplicant: { findFirst: jest.fn() },
    class: { findUnique: jest.fn(), findMany: jest.fn() },
    tournament: { findUnique: jest.fn(), findMany: jest.fn() },
    academy: { findMany: jest.fn(), findUnique: jest.fn() },
    academyCoach: { findMany: jest.fn() },
    team: { findUnique: jest.fn() },
    teamMember: { findMany: jest.fn() },
    classAttendance: { count: jest.fn() },
    refundLog: { findMany: jest.fn() },
    notification: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const refundServiceMock = {
    cancelPayment: jest.fn(),
    applyRefundDbOnly: jest.fn(),
    computeRefundQuote: jest.fn(),
  };

  /** 픽업매치 요청(스코프 스냅샷 부재) 역참조 필터 — buildPermissionWhere 기대값 조립용. */
  const ownPickupWhere = (managerId: string) => ({
    sourceType: "PICKUP_MATCH",
    payment: {
      pickupMatchApplicants: { some: { match: { managerId } } },
    },
  });

  const resourceAccessMock = {
    resolveManageableTeamIds: jest.fn(),
    assertManageableClass: jest.fn(),
    assertManageableTournament: jest.fn(),
    assertTeamManager: jest.fn(),
    assertAcademyManager: jest.fn(),
  };

  const notificationsMock = {
    notifyUsers: jest.fn(),
    createNotification: jest.fn(),
  };

  const parent: JwtUserPayload = {
    id: "parent-1",
    email: "p@t.dev",
    userType: "PARENT",
  };
  const admin: JwtUserPayload = {
    id: "admin-1",
    email: "a@t.dev",
    userType: "ADMIN",
  };
  const director: JwtUserPayload = {
    id: "dir-1",
    email: "d@t.dev",
    userType: "DIRECTOR",
  };
  const academyDirector: JwtUserPayload = {
    id: "acad-1",
    email: "ad@t.dev",
    userType: "ACADEMY_DIRECTOR",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundRequestService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PaymentRefundService, useValue: refundServiceMock },
        { provide: ResourceAccessService, useValue: resourceAccessMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();
    service = moduleRef.get(RefundRequestService);
    // 기본 $transaction: 콜백을 prismaMock 자체로 실행(tx delegate = prismaMock 위임).
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    // 기본 산정: 미개시 · 전액 환불 가능(create 가 서버 산정액을 요청 금액으로 쓴다).
    refundServiceMock.computeRefundQuote.mockResolvedValue({
      paymentId: "pay-1",
      paidAmount: 240000,
      alreadyRefunded: 0,
      attendedCount: 0,
      unitFee: 30000,
      deductedAmount: 0,
      refundableAmount: 240000,
      started: false,
      calculationNote: "결제액 240000원 − 이용분 0회 × 30000원(0원) = 240000원",
    });
  });

  const completedPayment = {
    id: "pay-1",
    userId: "parent-1",
    paymentStatus: "completed",
    amount: 240000,
    completedAt: new Date(),
    createdAt: new Date(),
  };

  // ── E1. 도메인 판별 ────────────────────────────────────────────
  describe("create — 도메인 판별", () => {
    beforeEach(() => {
      prismaMock.payment.findUnique.mockResolvedValue(completedPayment);
      prismaMock.pickupMatchApplicant.findFirst.mockResolvedValue(null);
      prismaMock.refundRequest.create.mockImplementation(({ data }: any) => ({
        id: "rr-1",
        ...data,
        version: 0,
      }));
    });

    it("Enrollment 연결 → CLASS_PREPAID + 스코프 스냅샷(teamId)", async () => {
      prismaMock.enrollment.findFirst.mockResolvedValue({
        classId: "cls-1",
        childId: "child-1",
      });
      prismaMock.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });

      await service.create({ paymentId: "pay-1", reason: "사유" }, parent);

      const arg = prismaMock.refundRequest.create.mock.calls[0][0].data;
      expect(arg.sourceType).toBe("CLASS_PREPAID");
      expect(arg.classId).toBe("cls-1");
      expect(arg.teamId).toBe("team-1");
      expect(arg.childId).toBe("child-1");
      expect(arg.requestedAmount).toBe(240000);
      expect(notificationsMock.notifyUsers).not.toHaveBeenCalled(); // team 조회 후 recipients 있을 때만
    });

    it("BillingLine 연결 → CLASS_POSTPAID", async () => {
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.monthlyPostpaidBillingLine.findFirst.mockResolvedValue({
        userId: "child-2",
        billing: { classId: "cls-2" },
      });
      prismaMock.class.findUnique.mockResolvedValue({
        teamId: "team-2",
        academyId: null,
      });

      await service.create({ paymentId: "pay-1", reason: "사유" }, parent);

      const arg = prismaMock.refundRequest.create.mock.calls[0][0].data;
      expect(arg.sourceType).toBe("CLASS_POSTPAID");
      expect(arg.classId).toBe("cls-2");
      expect(arg.childId).toBe("child-2");
    });

    it("TournamentRegistration 연결 → TOURNAMENT", async () => {
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.monthlyPostpaidBillingLine.findFirst.mockResolvedValue(null);
      prismaMock.tournamentRegistration.findFirst.mockResolvedValue({
        tournamentId: "tour-1",
        childId: "child-3",
      });
      prismaMock.tournament.findUnique.mockResolvedValue({ teamId: "team-3" });

      await service.create({ paymentId: "pay-1", reason: "사유" }, parent);

      const arg = prismaMock.refundRequest.create.mock.calls[0][0].data;
      expect(arg.sourceType).toBe("TOURNAMENT");
      expect(arg.tournamentId).toBe("tour-1");
      expect(arg.teamId).toBe("team-3");
    });

    it("PickupMatchApplicant 연결 → PICKUP_MATCH (스코프 스냅샷 없음)", async () => {
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.monthlyPostpaidBillingLine.findFirst.mockResolvedValue(null);
      prismaMock.tournamentRegistration.findFirst.mockResolvedValue(null);
      prismaMock.pickupMatchApplicant.findFirst.mockResolvedValue({
        id: "app-1",
      });

      await service.create({ paymentId: "pay-1", reason: "사유" }, parent);

      const arg = prismaMock.refundRequest.create.mock.calls[0][0].data;
      expect(arg.sourceType).toBe("PICKUP_MATCH");
      expect(arg.teamId).toBeNull();
      expect(arg.academyId).toBeNull();
      expect(arg.childId).toBeNull();
    });

    it("어디에도 안 걸림(쇼핑 등) → 422 fail-closed (요청 생성 안 함)", async () => {
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.monthlyPostpaidBillingLine.findFirst.mockResolvedValue(null);
      prismaMock.tournamentRegistration.findFirst.mockResolvedValue(null);
      prismaMock.pickupMatchApplicant.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ paymentId: "pay-1", reason: "사유" }, parent),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prismaMock.refundRequest.create).not.toHaveBeenCalled();
    });
  });

  // ── E1. 가드 ──────────────────────────────────────────────────
  describe("create — 가드", () => {
    it("타인 결제 → 403", async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...completedPayment,
        userId: "other",
      });
      await expect(
        service.create({ paymentId: "pay-1", reason: "r" }, parent),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("미완료 결제 → 400", async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...completedPayment,
        paymentStatus: "pending",
      });
      await expect(
        service.create({ paymentId: "pay-1", reason: "r" }, parent),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("접수 상한(365일) 초과 → 400 (요청 생성 안 함)", async () => {
      const longAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
      prismaMock.payment.findUnique.mockResolvedValue({
        ...completedPayment,
        completedAt: longAgo,
        createdAt: longAgo,
      });
      await expect(
        service.create({ paymentId: "pay-1", reason: "r" }, parent),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.refundRequest.create).not.toHaveBeenCalled();
    });

    it("completedAt null이면 createdAt 기준으로 접수 상한 판정 (365일 초과 → 400)", async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...completedPayment,
        completedAt: null,
        createdAt: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000),
      });
      await expect(
        service.create({ paymentId: "pay-1", reason: "r" }, parent),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.refundRequest.create).not.toHaveBeenCalled();
    });

    it("청약철회 기간(7일) 경과 → 차단 대신 비례 환급액으로 접수", async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      prismaMock.payment.findUnique.mockResolvedValue({
        ...completedPayment,
        completedAt: thirtyDaysAgo,
        createdAt: thirtyDaysAgo,
      });
      prismaMock.pickupMatchApplicant.findFirst.mockResolvedValue(null);
      prismaMock.enrollment.findFirst.mockResolvedValue({
        classId: "cls-1",
        childId: "child-1",
      });
      prismaMock.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      prismaMock.refundRequest.create.mockImplementation(({ data }: any) => ({
        id: "rr-1",
        ...data,
        version: 0,
      }));
      refundServiceMock.computeRefundQuote.mockResolvedValue({
        paymentId: "pay-1",
        paidAmount: 240000,
        alreadyRefunded: 0,
        attendedCount: 4,
        unitFee: 30000,
        deductedAmount: 120000,
        refundableAmount: 120000,
        started: true,
        calculationNote:
          "결제액 240000원 − 이용분 4회 × 30000원(120000원) = 120000원",
      });

      await service.create({ paymentId: "pay-1", reason: "r" }, parent);

      const arg = prismaMock.refundRequest.create.mock.calls[0][0].data;
      expect(arg.requestedAmount).toBe(120000); // 전액(240000)이 아닌 비례 환급액
    });

    it("환불 가능 잔액 0 → 400 (요청 생성 안 함)", async () => {
      prismaMock.pickupMatchApplicant.findFirst.mockResolvedValue(null);
      prismaMock.enrollment.findFirst.mockResolvedValue({
        classId: "cls-1",
        childId: "child-1",
      });
      prismaMock.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      refundServiceMock.computeRefundQuote.mockResolvedValue({
        paymentId: "pay-1",
        paidAmount: 240000,
        alreadyRefunded: 0,
        attendedCount: 8,
        unitFee: 30000,
        deductedAmount: 240000,
        refundableAmount: 0,
        started: true,
        calculationNote:
          "결제액 240000원 − 이용분 8회 × 30000원(240000원) = 0원",
      });

      await expect(
        service.create({ paymentId: "pay-1", reason: "r" }, parent),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.refundRequest.create).not.toHaveBeenCalled();
    });

    it("활성 중복(P2002) → 409", async () => {
      prismaMock.payment.findUnique.mockResolvedValue(completedPayment);
      prismaMock.enrollment.findFirst.mockResolvedValue({
        classId: "cls-1",
        childId: "child-1",
      });
      prismaMock.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      prismaMock.refundRequest.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "5.7.0",
        }),
      );
      await expect(
        service.create({ paymentId: "pay-1", reason: "r" }, parent),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── E4. 승인 = 실행 ───────────────────────────────────────────
  describe("approve", () => {
    const pendingRr = {
      id: "rr-1",
      paymentId: "pay-1",
      requesterId: "parent-1",
      childId: "child-1",
      status: "pending",
      sourceType: "CLASS_PREPAID",
      classId: "cls-1",
      tournamentId: null,
      teamId: "team-1",
      academyId: null,
      requestReason: "사유",
      requestedAmount: 240000,
      version: 0,
    };

    it("CAS 선점 성공 → cancelPayment(trusted + refundContext: fencing/idempotency) 호출", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce(pendingRr) // approve 진입
        .mockResolvedValueOnce({
          ...pendingRr,
          status: "executed",
          version: 1,
        }); // reload
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      refundServiceMock.cancelPayment.mockResolvedValue({});

      await service.approve("rr-1", { version: 0 }, admin);

      expect(refundServiceMock.cancelPayment).toHaveBeenCalledTimes(1);
      const call = refundServiceMock.cancelPayment.mock.calls[0];
      expect(call[6]).toMatchObject({ trusted: true }); // requester
      // refundContext — fencing(expectedVersion) + PG 멱등키 포함.
      expect(call[7]).toEqual({
        refundRequestId: "rr-1",
        actorId: "admin-1",
        expectedVersion: 1,
        idempotencyKey: "rr:rr-1",
        creditPolicy: "restore", // 미개시(quote.started=false) → 기존 복원 정책
      });
      // CAS 데이터에 idempotencyKey 저장 확인.
      expect(
        prismaMock.refundRequest.updateMany.mock.calls[0][0].data,
      ).toMatchObject({ status: "executing", idempotencyKey: "rr:rr-1" });
    });

    it("CAS 경쟁(count 0) → 409, PG 미호출", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue(pendingRr);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve("rr-1", { version: 0 }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
    });

    it("결제 선점 불가(동시 실행 loser) → cancelPayment PAYMENT_NOT_AVAILABLE → execution_failed(200)", async () => {
      // Payment CAS 는 cancelPayment 내부 단일 초크포인트 — loser 는 RefundExecutionError('PG','PAYMENT_NOT_AVAILABLE').
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce(pendingRr)
        .mockResolvedValueOnce({
          ...pendingRr,
          status: "execution_failed",
          failureStage: "PG",
          failureCode: "PAYMENT_NOT_AVAILABLE",
          version: 2,
        });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      refundServiceMock.cancelPayment.mockRejectedValue(
        new RefundExecutionError(
          "PG",
          "PAYMENT_NOT_AVAILABLE",
          "이미 환불 처리 중이거나 완료된 결제입니다.",
        ),
      );

      const res = await service.approve("rr-1", { version: 0 }, admin);
      expect(res.status).toBe("execution_failed");
      const failCall = prismaMock.refundRequest.updateMany.mock.calls[1][0];
      expect(failCall.data.status).toBe("execution_failed");
      expect(failCall.data.failureStage).toBe("PG");
      expect(failCall.data.failureCode).toBe("PAYMENT_NOT_AVAILABLE");
      // markExecutionFailed 는 version fencing(executing + expectedVersion=1).
      expect(failCall.where).toMatchObject({
        status: "executing",
        version: 1,
      });
    });

    it("PG 실패(RefundExecutionError stage=PG) → execution_failed 전이 + 200(throw 안 함)", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce(pendingRr)
        .mockResolvedValueOnce({
          ...pendingRr,
          status: "execution_failed",
          failureStage: "PG",
          version: 2,
        });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "completed",
        amount: 240000,
      });
      refundServiceMock.cancelPayment.mockRejectedValue(
        new RefundExecutionError("PG", "KG_CANCEL_FAILED", "취소 실패"),
      );

      const res = await service.approve("rr-1", { version: 0 }, admin);
      expect(res.status).toBe("execution_failed");
      const failCall = prismaMock.refundRequest.updateMany.mock.calls[1][0];
      expect(failCall.data.failureStage).toBe("PG");
    });

    it("교차 소속 거부 — assertManageableClass 403 전파", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue(pendingRr);
      resourceAccessMock.assertManageableClass.mockRejectedValue(
        new ForbiddenException("범위 밖"),
      );
      await expect(
        service.approve("rr-1", { version: 0 }, director),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prismaMock.refundRequest.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── E6. 재처리 — Payment 상태 기준 분기(fencing) ────────────────
  describe("reprocess — Payment 상태 분기", () => {
    const failedBase = {
      id: "rr-1",
      paymentId: "pay-1",
      requesterId: "parent-1",
      childId: "child-1",
      status: "execution_failed",
      sourceType: "CLASS_PREPAID",
      classId: "cls-1",
      tournamentId: null,
      teamId: "team-1",
      academyId: null,
      requestReason: "사유",
      requestedAmount: 240000,
      failureStage: "PG",
      pgRefundSucceededAt: null,
      executionStartedAt: null,
      version: 2,
    };

    const executed = { ...failedBase, status: "executed", version: 3 };

    it("payment refunded + 자기 PG 증거(DB_AFTER_PG+pgRefundSucceededAt) → applyRefundDbOnly, PG 미호출", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...failedBase,
          failureStage: "DB_AFTER_PG",
          pgRefundSucceededAt: new Date(),
        })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refunded",
      });
      refundServiceMock.applyRefundDbOnly.mockResolvedValue({
        paymentStatus: "refunded",
        alreadyApplied: true,
      });

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.applyRefundDbOnly).toHaveBeenCalledTimes(1);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
      // fencing context 전달(expectedVersion=3, idempotencyKey).
      expect(refundServiceMock.applyRefundDbOnly.mock.calls[0][3]).toEqual({
        creditPolicy: "restore", // 미개시(quote.started=false) → 기존 복원 정책
        refundRequestId: "rr-1",
        actorId: "admin-1",
        expectedVersion: 3,
        idempotencyKey: "rr:rr-1",
      });
    });

    it("payment refunded + 증거 없음 → canceled 정합화(executed 오인 금지), PG·보상 미호출", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({ ...failedBase, failureStage: "PG" }) // 증거 없음
        .mockResolvedValueOnce({
          ...failedBase,
          status: "canceled",
          version: 4,
        });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refunded",
      });

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.applyRefundDbOnly).not.toHaveBeenCalled();
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
      // 2번째 updateMany = reconcileToCanceled(canceled, version fencing).
      const reconcile = prismaMock.refundRequest.updateMany.mock.calls[1][0];
      expect(reconcile.data.status).toBe("canceled");
      expect(reconcile.where).toMatchObject({
        status: "executing",
        version: 3,
      });
    });

    it("payment refund_processing → cancelPayment resumeProcessing(PG 멱등 재개)", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({ ...failedBase, failureStage: "PG" })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refund_processing",
      });
      refundServiceMock.cancelPayment.mockResolvedValue({});

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.cancelPayment).toHaveBeenCalledTimes(1);
      expect(refundServiceMock.applyRefundDbOnly).not.toHaveBeenCalled();
      const ctx = refundServiceMock.cancelPayment.mock.calls[0][7];
      expect(ctx).toMatchObject({
        resumeProcessing: true,
        idempotencyKey: "rr:rr-1",
        expectedVersion: 3,
      });
    });

    it("payment completed → cancelPayment 전체 재실행(초기 CAS부터)", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({ ...failedBase, failureStage: "PG" })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "completed",
      });
      refundServiceMock.cancelPayment.mockResolvedValue({});

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.cancelPayment).toHaveBeenCalledTimes(1);
      const ctx = refundServiceMock.cancelPayment.mock.calls[0][7];
      expect(ctx.resumeProcessing).toBeUndefined(); // 전체 재실행 — 초기 Payment CAS 포함.
    });

    it("execution_failed 아닌 상태(pending) → 400", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...failedBase,
        status: "pending",
      });
      await expect(
        service.reprocess("rr-1", { version: 2 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("stale executing(11분 경과) + payment completed → 재실행 허용", async () => {
      const staleStarted = new Date(Date.now() - 11 * 60 * 1000);
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...failedBase,
          status: "executing",
          failureStage: null,
          executionStartedAt: staleStarted,
        })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "completed",
      });
      refundServiceMock.cancelPayment.mockResolvedValue({});

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.cancelPayment).toHaveBeenCalledTimes(1);
      // CAS는 현재 상태(executing) 기준으로 재선점.
      expect(
        prismaMock.refundRequest.updateMany.mock.calls[0][0].where.status,
      ).toBe("executing");
    });

    it("fresh executing(비-stale) → 400 (재처리 불가)", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...failedBase,
        status: "executing",
        failureStage: null,
        executionStartedAt: new Date(),
      });
      await expect(
        service.reprocess("rr-1", { version: 2 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // [Major 1] KG 격리
    it("failureCode=KG_UNCONFIRMED + 증거 없음 → 409, PG/보상 미호출(수동 확인)", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...failedBase,
        failureStage: "PG",
        failureCode: "KG_UNCONFIRMED",
        pgRefundSucceededAt: null,
      });
      await expect(
        service.reprocess("rr-1", { version: 2 }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
      expect(refundServiceMock.applyRefundDbOnly).not.toHaveBeenCalled();
      // CAS 도 시도하지 않음(조기 격리).
      expect(prismaMock.refundRequest.updateMany).not.toHaveBeenCalled();
    });

    // [토스 멱등] TOSS_UNCONFIRMED + 유효기간 내(pgFirstAttemptedAt 최근) → resume 허용(409 아님).
    it("failureCode=TOSS_UNCONFIRMED + 유효기간 내 + refund_processing → resumeProcessing(같은 idempotencyKey)", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...failedBase,
          failureStage: "PG",
          failureCode: "TOSS_UNCONFIRMED",
          pgRefundSucceededAt: null,
          pgFirstAttemptedAt: new Date(), // 최근 — 14일 이내.
        })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refund_processing",
      });
      refundServiceMock.cancelPayment.mockResolvedValue({});

      await service.reprocess("rr-1", { version: 2 }, admin);

      // KG_UNCONFIRMED 처럼 조기 409 로 막지 않고 resume 재호출로 진행.
      expect(refundServiceMock.cancelPayment).toHaveBeenCalledTimes(1);
      const ctx = refundServiceMock.cancelPayment.mock.calls[0][7];
      expect(ctx).toMatchObject({
        resumeProcessing: true,
        idempotencyKey: "rr:rr-1",
        expectedVersion: 3,
      });
    });

    // [토스 멱등 유효기간] pgFirstAttemptedAt 만료(>14일) → PG 0회 + 409(reconcile 필요).
    it("TOSS_UNCONFIRMED + pgFirstAttemptedAt 15일 경과 → 409, PG/보상 미호출", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...failedBase,
        failureStage: "PG",
        failureCode: "TOSS_UNCONFIRMED",
        pgRefundSucceededAt: null,
        pgFirstAttemptedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      });
      await expect(
        service.reprocess("rr-1", { version: 2 }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
      expect(refundServiceMock.applyRefundDbOnly).not.toHaveBeenCalled();
      expect(prismaMock.refundRequest.updateMany).not.toHaveBeenCalled(); // CAS 전 격리.
    });

    // [토스 멱등 유효기간] pgFirstAttemptedAt null(레거시) → 보수적 만료 처리 → 409.
    it("TOSS_UNCONFIRMED + pgFirstAttemptedAt null(레거시) → 보수적 만료 409, PG 미호출", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...failedBase,
        failureStage: "PG",
        failureCode: "TOSS_UNCONFIRMED",
        pgRefundSucceededAt: null,
        pgFirstAttemptedAt: null,
      });
      await expect(
        service.reprocess("rr-1", { version: 2 }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
    });

    // [Critical 1] stale executing + failureCode null + refund_processing → resume 도달(관문 방어 대상).
    //   진입부 가드(KG/TOSS/CONFLICT)는 failureCode null 이라 모두 우회 → runExecution(resume)로 라우팅됨을 확인.
    //   실제 PG 재호출 여부는 cancelPayment 단일 관문(payment-refund.service.spec)에서 공급자별로 방어.
    it("stale executing(failureCode null) + refund_processing → resumeProcessing 재호출로 라우팅", async () => {
      const staleStarted = new Date(Date.now() - 11 * 60 * 1000);
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...failedBase,
          status: "executing",
          failureStage: null,
          failureCode: null,
          pgFirstAttemptedAt: new Date(),
          executionStartedAt: staleStarted,
        })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refund_processing",
      });
      refundServiceMock.cancelPayment.mockResolvedValue({});

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.cancelPayment).toHaveBeenCalledTimes(1);
      const ctx = refundServiceMock.cancelPayment.mock.calls[0][7];
      expect(ctx).toMatchObject({
        resumeProcessing: true,
        idempotencyKey: "rr:rr-1",
      });
    });

    // [Critical 1] 그 경로에서 관문이 KG_UNCONFIRMED 로 격리 → execution_failed+KG_UNCONFIRMED 전이(reconcile 개방).
    it("stale executing 재호출 시 관문 KG_UNCONFIRMED → execution_failed+KG_UNCONFIRMED 전이", async () => {
      const staleStarted = new Date(Date.now() - 11 * 60 * 1000);
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...failedBase,
          status: "executing",
          failureStage: null,
          failureCode: null,
          pgFirstAttemptedAt: new Date(),
          executionStartedAt: staleStarted,
        })
        .mockResolvedValueOnce({
          ...failedBase,
          status: "execution_failed",
          failureCode: "KG_UNCONFIRMED",
          version: 4,
        });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refund_processing",
      });
      refundServiceMock.cancelPayment.mockRejectedValue(
        new RefundExecutionError("PG", "KG_UNCONFIRMED", "격리"),
      );

      await service.reprocess("rr-1", { version: 2 }, admin);

      const failCall = prismaMock.refundRequest.updateMany.mock.calls.find(
        (c) => c[0]?.data?.failureCode === "KG_UNCONFIRMED",
      );
      expect(failCall).toBeTruthy();
      expect(failCall[0].data.status).toBe("execution_failed");
    });

    // [토스 멱등 본문충돌] TOSS_IDEMPOTENCY_CONFLICT → 자동 재처리 불가 409(reconcile 필요).
    it("TOSS_IDEMPOTENCY_CONFLICT → 409, PG 미호출(reconcile 대상)", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...failedBase,
        failureStage: "PG",
        failureCode: "TOSS_IDEMPOTENCY_CONFLICT",
        pgRefundSucceededAt: null,
        pgFirstAttemptedAt: new Date(),
      });
      await expect(
        service.reprocess("rr-1", { version: 2 }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
      expect(prismaMock.refundRequest.updateMany).not.toHaveBeenCalled();
    });

    // [Critical] 직접 환불(DIRECT) DB_AFTER_PG → reprocess DB-only 복구
    it("DIRECT + DB_AFTER_PG 증거 → applyRefundDbOnly(PG 미호출), payment 무관", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...failedBase,
          sourceType: "DIRECT",
          classId: null,
          teamId: null,
          failureStage: "DB_AFTER_PG",
          failureCode: "DB_TX_FAILED",
          pgRefundSucceededAt: new Date(),
        })
        .mockResolvedValueOnce(executed);
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.findUnique.mockResolvedValue({
        paymentStatus: "refund_processing",
      });
      refundServiceMock.applyRefundDbOnly.mockResolvedValue({
        paymentStatus: "refunded",
        alreadyApplied: false,
      });

      await service.reprocess("rr-1", { version: 2 }, admin);

      expect(refundServiceMock.applyRefundDbOnly).toHaveBeenCalledTimes(1);
      expect(refundServiceMock.cancelPayment).not.toHaveBeenCalled();
    });
  });

  // ── DIRECT 요청은 승인/거절 대상 아님 (Critical item 3) ────────────
  describe("DIRECT 시스템 원장 가드", () => {
    const directRr = {
      id: "rr-d",
      paymentId: "pay-1",
      requesterId: "admin-1",
      childId: null,
      status: "executed",
      sourceType: "DIRECT",
      classId: null,
      tournamentId: null,
      teamId: null,
      academyId: null,
      requestReason: "관리자 직접 환불",
      requestedAmount: 100000,
      version: 1,
    };

    it("approve(DIRECT) → 400", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue(directRr);
      await expect(
        service.approve("rr-d", { version: 1 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.refundRequest.updateMany).not.toHaveBeenCalled();
    });

    it("reject(DIRECT) → 400", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue(directRr);
      await expect(
        service.reject("rr-d", { version: 1, decisionReason: "x" }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.refundRequest.updateMany).not.toHaveBeenCalled();
    });

    it("detail(DIRECT) 비-ADMIN(director) → 403", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...directRr,
        teamId: "team-1", // 스냅샷 teamId 있어도 DIRECT 는 admin 전용.
      });
      await expect(service.detail("rr-d", director)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("reprocess(DIRECT) 비-ADMIN(director) → 403", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...directRr,
        status: "execution_failed",
        failureStage: "DB_AFTER_PG",
        teamId: "team-1",
      });
      await expect(
        service.reprocess("rr-d", { version: 1 }, director),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── E9. KG_UNCONFIRMED 수동 해소(reconcile) ─────────────────────
  describe("reconcile", () => {
    const unconfirmedRr = {
      id: "rr-1",
      paymentId: "pay-1",
      requesterId: "admin-1",
      childId: null,
      status: "execution_failed",
      sourceType: "DIRECT",
      classId: null,
      tournamentId: null,
      teamId: null,
      academyId: null,
      requestReason: "관리자 직접 환불",
      requestedAmount: 100000,
      failureStage: "PG",
      failureCode: "KG_UNCONFIRMED",
      pgRefundSucceededAt: null,
      executionStartedAt: null,
      version: 2,
    };

    it("CONFIRMED_CANCELLED → 자기 증거(DB_AFTER_PG) 기록 + applyRefundDbOnly 반영", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce(unconfirmedRr)
        .mockResolvedValueOnce({
          ...unconfirmedRr,
          status: "executed",
          version: 4,
        });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      refundServiceMock.applyRefundDbOnly.mockResolvedValue({
        paymentStatus: "refunded",
        alreadyApplied: false,
      });

      await service.reconcile(
        "rr-1",
        { version: 2, outcome: "CONFIRMED_CANCELLED", memo: "KG 취소 확인" },
        admin,
      );

      const cas = prismaMock.refundRequest.updateMany.mock.calls[0][0];
      expect(cas.where).toMatchObject({
        status: "execution_failed",
        failureCode: {
          in: expect.arrayContaining([
            "KG_UNCONFIRMED",
            "TOSS_UNCONFIRMED",
            "TOSS_IDEMPOTENCY_CONFLICT",
          ]),
        },
        version: 2,
      });
      expect(cas.data.status).toBe("executing");
      expect(cas.data.failureStage).toBe("DB_AFTER_PG");
      expect(cas.data.pgRefundSucceededAt).toBeInstanceOf(Date);
      expect(refundServiceMock.applyRefundDbOnly).toHaveBeenCalledTimes(1);
    });

    // [토스 확장] reconcile 게이트가 TOSS_UNCONFIRMED(만료 등)도 수용.
    it("TOSS_UNCONFIRMED(만료) CONFIRMED_CANCELLED → DB_AFTER_PG 증거 + applyRefundDbOnly", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce({
          ...unconfirmedRr,
          failureCode: "TOSS_UNCONFIRMED",
        })
        .mockResolvedValueOnce({
          ...unconfirmedRr,
          status: "executed",
          version: 4,
        });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      refundServiceMock.applyRefundDbOnly.mockResolvedValue({
        paymentStatus: "refunded",
        alreadyApplied: false,
      });

      await service.reconcile(
        "rr-1",
        { version: 2, outcome: "CONFIRMED_CANCELLED", memo: "토스 취소 확인" },
        admin,
      );

      expect(refundServiceMock.applyRefundDbOnly).toHaveBeenCalledTimes(1);
      const cas = prismaMock.refundRequest.updateMany.mock.calls[0][0];
      expect(cas.data.failureStage).toBe("DB_AFTER_PG");
    });

    it("CONFIRMED_NOT_CANCELLED → Payment 복원 + PG_CONFIRMED_NOT_CANCELLED, 보상 없음", async () => {
      prismaMock.refundRequest.findUnique
        .mockResolvedValueOnce(unconfirmedRr)
        .mockResolvedValueOnce({ ...unconfirmedRr, version: 3 });
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.reconcile(
        "rr-1",
        { version: 2, outcome: "CONFIRMED_NOT_CANCELLED", memo: "미취소 확인" },
        admin,
      );

      expect(refundServiceMock.applyRefundDbOnly).not.toHaveBeenCalled();
      const cas = prismaMock.refundRequest.updateMany.mock.calls[0][0];
      expect(cas.data.failureCode).toBe("PG_CONFIRMED_NOT_CANCELLED");
      // Payment refund_processing → completed 복원.
      expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay-1", paymentStatus: "refund_processing" },
          data: { paymentStatus: "completed" },
        }),
      );
    });

    it("KG_UNCONFIRMED 아닌 건 → 400", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue({
        ...unconfirmedRr,
        failureCode: "DB_TX_FAILED",
      });
      await expect(
        service.reconcile(
          "rr-1",
          { version: 2, outcome: "CONFIRMED_CANCELLED", memo: "x" },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("CONFIRMED_NOT_CANCELLED Payment 복원 실패(count 0) → 전체 rollback + 409(200 금지)", async () => {
      prismaMock.refundRequest.findUnique.mockResolvedValue(unconfirmedRr);
      // $transaction 콜백: 원장 CAS count 1, Payment 복원 count 0 → throw → rollback.
      prismaMock.refundRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.payment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reconcile(
          "rr-1",
          { version: 2, outcome: "CONFIRMED_NOT_CANCELLED", memo: "미취소" },
          admin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      // reload(성공 200)로 진행하지 않음 — $transaction 이 throw.
    });
  });

  // ── E2 목록 계약 (Major 4: activeItems/historyItems 분리) ───────────
  describe("list — active/history 분리 계약", () => {
    it("필터 없음 → activeItems(전량)+historyItems(페이지)+pagination(이력 기준)", async () => {
      // findMany: 활성 조회 → 2건(pending/executing), 이력 페이지 → 1건.
      prismaMock.refundRequest.findMany
        .mockResolvedValueOnce([
          {
            id: "a1",
            status: "executing",
            sourceType: "CLASS_PREPAID",
            classId: "c1",
            tournamentId: null,
            paymentId: "p1",
            childId: null,
            requestedAmount: 1000,
            createdAt: new Date("2026-07-20"),
            requester: { firstName: "길", lastName: "홍" },
            child: null,
          },
          {
            id: "a2",
            status: "pending",
            sourceType: "TOURNAMENT",
            classId: null,
            tournamentId: "t1",
            paymentId: "p2",
            childId: null,
            requestedAmount: 2000,
            createdAt: new Date("2026-07-21"),
            requester: { firstName: "수", lastName: "김" },
            child: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "h1",
            status: "executed",
            sourceType: "CLASS_PREPAID",
            classId: "c1",
            tournamentId: null,
            paymentId: "p3",
            childId: null,
            requestedAmount: 3000,
            createdAt: new Date("2026-07-10"),
            requester: { firstName: "영", lastName: "이" },
            child: null,
          },
        ]);
      prismaMock.refundRequest.count
        .mockResolvedValueOnce(1) // pendingCount
        .mockResolvedValueOnce(25); // historyTotal
      prismaMock.class.findMany.mockResolvedValue([
        { id: "c1", className: "수업A" },
      ]);
      prismaMock.tournament.findMany.mockResolvedValue([
        { id: "t1", name: "대회A" },
      ]);

      const res: any = await service.list({ page: 2, limit: 10 }, admin);

      expect(res.activeItems).toHaveLength(2);
      // 활성 우선순위: pending(a2) < executing(a1).
      expect(res.activeItems[0].id).toBe("a2");
      expect(res.historyItems).toHaveLength(1);
      expect(res.historyItems[0].id).toBe("h1");
      expect(res.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25, // 이력 전용.
        totalPages: 3,
      });
      expect(res.pendingCount).toBe(1);
      expect(res.items).toBeUndefined(); // 구 계약 제거.
    });

    it("단일 status 필터 → activeItems=[] + historyItems 페이지네이션", async () => {
      prismaMock.refundRequest.count
        .mockResolvedValueOnce(0) // pendingCount
        .mockResolvedValueOnce(5); // filtered total
      prismaMock.refundRequest.findMany.mockResolvedValueOnce([]);
      prismaMock.class.findMany.mockResolvedValue([]);
      prismaMock.tournament.findMany.mockResolvedValue([]);

      const res: any = await service.list(
        { status: "executed", page: 1, limit: 20 },
        admin,
      );

      expect(res.activeItems).toEqual([]);
      expect(res.pagination.total).toBe(5);
    });

    // [R6-Major1] embedded pendingCount 가 scope 필터(teamId/academyId) 적용 + E8 일치.
    it("teamId=team-1 필터 → embedded pendingCount 가 team-1 범위만(관리 전체 아님)", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([
        "team-1",
        "team-2",
      ]);
      prismaMock.refundRequest.count.mockResolvedValue(0);
      prismaMock.refundRequest.findMany.mockResolvedValue([]);
      prismaMock.class.findMany.mockResolvedValue([]);
      prismaMock.tournament.findMany.mockResolvedValue([]);

      await service.list({ teamId: "team-1", page: 1, limit: 20 }, director);

      // list 의 첫 count = embedded pendingCount.
      const embeddedWhere =
        prismaMock.refundRequest.count.mock.calls[0][0].where;
      const permission = {
        AND: [
          { sourceType: { not: "DIRECT" } },
          {
            OR: [
              { teamId: { in: ["team-1", "team-2"] } },
              ownPickupWhere("dir-1"),
            ],
          },
        ],
      };
      // baseAnd(permission + teamId=team-1) + status=pending.
      expect(embeddedWhere).toEqual({
        AND: [permission, { teamId: "team-1" }, { status: "pending" }],
      });
    });

    it("teamId=team-1 → E8 pending-count 와 동일 scope 집계", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([
        "team-1",
        "team-2",
      ]);
      prismaMock.refundRequest.count.mockResolvedValue(4);

      await service.pendingCount({ teamId: "team-1" }, director);

      const e8Where = prismaMock.refundRequest.count.mock.calls[0][0].where;
      // E8: permission + status=pending + teamId=team-1 (같은 필터 집합).
      expect(e8Where.AND).toEqual(
        expect.arrayContaining([
          {
            AND: [
              { sourceType: { not: "DIRECT" } },
              {
                OR: [
                  { teamId: { in: ["team-1", "team-2"] } },
                  ownPickupWhere("dir-1"),
                ],
              },
            ],
          },
          { status: "pending" },
          { teamId: "team-1" },
        ]),
      );
    });
  });

  // ── 스코프 매핑 (E2/E8 buildPermissionWhere) ───────────────────
  describe("pendingCount — 역할별 스코프 매핑", () => {
    it("DIRECTOR → team_id IN 관리팀 + DIRECT 제외", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([
        "team-1",
        "team-2",
      ]);
      prismaMock.refundRequest.count.mockResolvedValue(3);

      await service.pendingCount({}, director);

      const where = prismaMock.refundRequest.count.mock.calls[0][0].where;
      // permission = { AND: [ {sourceType not DIRECT}, {teamId in} ] }
      expect(where.AND[0]).toEqual({
        AND: [
          { sourceType: { not: "DIRECT" } },
          {
            OR: [
              { teamId: { in: ["team-1", "team-2"] } },
              ownPickupWhere("dir-1"),
            ],
          },
        ],
      });
      expect(where.AND[1]).toEqual({ status: "pending" });
    });

    it("ACADEMY_DIRECTOR → academy_id IN 자기 아카데미 + DIRECT 제외", async () => {
      prismaMock.academy.findMany.mockResolvedValue([{ id: "ac-1" }]);
      prismaMock.refundRequest.count.mockResolvedValue(1);

      await service.pendingCount({}, academyDirector);

      const where = prismaMock.refundRequest.count.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({
        AND: [
          { sourceType: { not: "DIRECT" } },
          {
            OR: [{ academyId: { in: ["ac-1"] } }, ownPickupWhere("acad-1")],
          },
        ],
      });
    });

    it("ADMIN → 전역(빈 필터)", async () => {
      prismaMock.refundRequest.count.mockResolvedValue(9);

      await service.pendingCount({}, admin);

      const where = prismaMock.refundRequest.count.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({});
    });
  });
});
