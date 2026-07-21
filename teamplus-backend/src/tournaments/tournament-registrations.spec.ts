import { ForbiddenException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { TournamentsService } from "./tournaments.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * 작업 A BE-1 — getTournamentRegistrations 파생 필드(5-state·billingTiming·금액) 회귀 스펙.
 *
 * 증명 대상:
 *  1) 팀 허브(computeTournamentSummaries)와 동일한 resolveTournamentAttribution 로
 *     각 행이 PAID/PENDING(BILLED)/UNPAID(UNSETTLED)/CANCELLED/REFUNDED 파생을 갖는지.
 *  2) 레거시 키(paymentStatus·orderNumber·calculatedFee·payment) Dual Emit 보존.
 *  3) CANCELLED/REFUNDED 명단 보존(where 필터 제거) — 조회 전체 로드.
 *  4) IDOR 가드(assertManageableTournamentRecord) 유지.
 */
describe("TournamentsService.getTournamentRegistrations — 파생 필드/명단 보존", () => {
  const requester: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  const makePrismaMock = () => ({
    tournament: { findUnique: jest.fn() },
    tournamentRegistration: { findMany: jest.fn() },
  });

  const makeAccessMock = (reject: boolean) => ({
    assertManageableTournamentRecord: reject
      ? jest.fn().mockRejectedValue(new ForbiddenException("no"))
      : jest.fn().mockResolvedValue(undefined),
  });

  const makeService = (prisma: any, access: any) =>
    new TournamentsService(prisma, {} as any, access);

  // KST 2026-03-10 15:00 → UTC 06:00. 귀속월 2026-03.
  const march = new Date("2026-03-10T06:00:00.000Z");

  const buildReg = (over: Record<string, any>) => ({
    id: "reg-x",
    userId: "u-x",
    childId: null,
    gamesCount: 2,
    calculatedFee: new Decimal(30000),
    paymentStatus: "PAID",
    registeredAt: march,
    user: { id: "u-x", firstName: "길동", lastName: "홍" },
    child: null,
    payment: {
      id: "pay-x",
      orderNumber: "ORD-1",
      paymentStatus: "completed",
      amount: new Decimal(30000),
      completedAt: march,
      createdAt: march,
      refundLogs: [],
    },
    ...over,
  });

  it("POSTPAID 대회 — 5-state 전 케이스 파생 + 레거시 키 보존", async () => {
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-1",
      teamId: "team-1",
      billingMode: "POSTPAID",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });

    prisma.tournamentRegistration.findMany.mockResolvedValue([
      buildReg({
        id: "r-paid",
        paymentStatus: "PAID",
        payment: {
          id: "p1",
          orderNumber: "ORD-P",
          paymentStatus: "completed",
          amount: new Decimal(30000),
          completedAt: march,
          createdAt: march,
          refundLogs: [],
        },
      }),
      buildReg({
        id: "r-pending",
        paymentStatus: "PENDING",
        payment: {
          id: "p2",
          orderNumber: "ORD-B",
          paymentStatus: "pending",
          amount: new Decimal(30000),
          completedAt: null,
          createdAt: march,
          refundLogs: [],
        },
      }),
      buildReg({
        id: "r-unpaid",
        paymentStatus: "UNPAID",
        // UNPAID 은 실제로 payment 없이도 오지만(명단 보존), endDate 폴백 귀속.
        payment: null,
      }),
      buildReg({
        id: "r-cancelled",
        paymentStatus: "CANCELLED",
        payment: {
          id: "p4",
          orderNumber: "ORD-C",
          paymentStatus: "cancelled",
          amount: new Decimal(30000),
          completedAt: null,
          createdAt: march,
          refundLogs: [],
        },
      }),
      buildReg({
        id: "r-refunded",
        paymentStatus: "REFUNDED",
        payment: {
          id: "p5",
          orderNumber: "ORD-R",
          paymentStatus: "refunded",
          amount: new Decimal(30000),
          completedAt: march,
          createdAt: march,
          refundLogs: [{ refundAmount: 30000 }],
        },
      }),
    ]);

    const res = await prismaCall(prisma);

    // where 필터 없이 전 상태 로드(명단 보존).
    expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournamentId: "trn-1" } }),
    );

    expect(res.billingMode).toBe("POSTPAID");
    expect(res.total).toBe(5);

    const byId = Object.fromEntries(res.registrations.map((r: any) => [r.id, r]));

    // PAID
    expect(byId["r-paid"].billingStatus).toBe("PAID");
    expect(byId["r-paid"].billingTiming).toBe("POSTPAID");
    expect(byId["r-paid"].billedAmount).toBe(30000);
    expect(byId["r-paid"].paidAmount).toBe(30000);
    expect(byId["r-paid"].refundedAmount).toBe(0);
    expect(byId["r-paid"].estimatedAmount).toBeNull();
    expect(byId["r-paid"].paidAt).toEqual(march);
    // Dual Emit — 레거시 키 보존.
    expect(byId["r-paid"].paymentStatus).toBe("PAID");
    expect(byId["r-paid"].payment.orderNumber).toBe("ORD-P");
    expect(byId["r-paid"].calculatedFee).toBeInstanceOf(Decimal);

    // PENDING → BILLED
    expect(byId["r-pending"].billingStatus).toBe("BILLED");
    expect(byId["r-pending"].billedAmount).toBe(30000);
    expect(byId["r-pending"].paidAmount).toBe(0);
    expect(byId["r-pending"].paidAt).toBeNull();

    // UNPAID → UNSETTLED (estimated = amount, billed null)
    expect(byId["r-unpaid"].billingStatus).toBe("UNSETTLED");
    expect(byId["r-unpaid"].billedAmount).toBeNull();
    expect(byId["r-unpaid"].paidAmount).toBe(0);
    expect(byId["r-unpaid"].estimatedAmount).toBe(30000);

    // CANCELLED (명단 보존)
    expect(byId["r-cancelled"].billingStatus).toBe("CANCELLED");
    expect(byId["r-cancelled"].billedAmount).toBeNull();
    expect(byId["r-cancelled"].paidAmount).toBe(0);

    // REFUNDED (전액 환불 → net 0)
    expect(byId["r-refunded"].billingStatus).toBe("REFUNDED");
    expect(byId["r-refunded"].refundedAmount).toBe(30000);
    expect(byId["r-refunded"].paidAmount).toBe(0);
    expect(byId["r-refunded"].paidAt).toBeNull();
  });

  it("실제 취소 형태(registration=CANCELLED·payment=refunded·refundLogs=[]) → paidAmount 0 · refundedAmount=amount", async () => {
    // cancelRegistration 은 RefundLog 를 생성하지 않는다 → 로그 부재를 전액 환불로 해석해야
    //  이름은 명단에 남되(REFUNDED) 순수납은 0 이 된다.
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-3",
      teamId: "team-1",
      billingMode: "POSTPAID",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });
    prisma.tournamentRegistration.findMany.mockResolvedValue([
      buildReg({
        id: "r-real-cancel",
        paymentStatus: "CANCELLED",
        payment: {
          id: "p-rc",
          orderNumber: "ORD-RC",
          paymentStatus: "refunded",
          amount: new Decimal(30000),
          completedAt: march,
          createdAt: march,
          refundLogs: [], // 실제 취소 = 로그 없음
        },
      }),
    ]);

    const res = await prismaCall(prisma);
    const row = res.registrations[0];

    // 명단 보존(REFUNDED 로 표시)되나 순수납 0.
    expect(row.billingStatus).toBe("REFUNDED");
    expect(row.refundedAmount).toBe(30000); // 로그 부재 → 전액 환불
    expect(row.billedAmount).toBeNull();
    expect(row.paidAmount).toBe(0);
    expect(row.paidAt).toBeNull();
  });

  it("PREPAID 대회 — billingTiming 상속(PREPAID)", async () => {
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-2",
      teamId: "team-1",
      billingMode: "PREPAID",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });
    prisma.tournamentRegistration.findMany.mockResolvedValue([
      buildReg({ id: "r-p", paymentStatus: "PAID" }),
    ]);

    const res = await new TournamentsService(
      prisma as any,
      {} as any,
      makeAccessMock(false) as any,
    ).getTournamentRegistrations("trn-2", requester);

    expect(res.billingMode).toBe("PREPAID");
    expect(res.registrations[0].billingTiming).toBe("PREPAID");
    expect(res.registrations[0].billingStatus).toBe("PAID");
  });

  it("IDOR — 관리 권한 단언 거부 시 참가자 조회 미수행", async () => {
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-1",
      teamId: "team-1",
      billingMode: "POSTPAID",
      endDate: null,
    });
    const service = makeService(prisma, makeAccessMock(true));
    await expect(
      service.getTournamentRegistrations("trn-1", requester),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tournamentRegistration.findMany).not.toHaveBeenCalled();
  });

  // 헬퍼 — 접근 허용 서비스로 호출.
  async function prismaCall(prisma: any) {
    const service = makeService(prisma, makeAccessMock(false));
    return service.getTournamentRegistrations("trn-1", requester);
  }
});
