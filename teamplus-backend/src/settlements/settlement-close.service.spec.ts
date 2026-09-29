import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { SettlementCloseService } from "./settlement-close.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * [정산 센터] 월 마감 생성기 검증 — 마감 기준 = 결제일/환불일 현금 기준.
 *  "M월 정산 = KST M월에 completedAt 인 결제 − KST M월에 processedAt 인 환불".
 *
 *  핵심 계약:
 *   1. 당월·미래월 마감 차단
 *   2. 결제 1건 = PAYMENT 행 1개(paymentAmount=+amount, feeAmount=round(amount*rate))
 *   3. 환불 1건 = REFUND 행 1개(paymentAmount=-refundAmount, feeAmount=-round(refundAmount*rate))
 *      — 짝(원 결제 Detail)이 이번 마감 또는 기존 어느 정산에도 없으면 행 미생성(unmatchedRefunds)
 *   4. mock·free 결제사 제외(excluded.mockAmount) / 팀 귀속 불가(teamUnattributed)
 *   5. approved 이상 잠긴 팀은 재계산 없이 skip + lateArrivals 보고
 *   6. eventKey 충돌 → conflicts 로 제외(마감 순서 무관 결제 1회만)
 *   7. 로그 없는 refunded 결제 → refundsWithoutLog 보고(그래도 PAYMENT 행은 생성)
 *   8. 순지급액 음수 → negativeNetTeams 보고(그래도 행/정산은 생성)
 *   9. 전월 미마감 경고(첫 마감은 예외)
 *   10. 멱등 · pending/rejected 재계산 · 끼어든 승인 롤백(팀별 실패 격리)
 */
describe("SettlementCloseService", () => {
  let service: SettlementCloseService;

  const MONTH = "2026-07"; // "오늘"보다 확실히 과거인 고정월

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    team: { findMany: jest.fn() },
    appSettings: { findFirst: jest.fn() },
    payment: { findMany: jest.fn() },
    refundLog: { findMany: jest.fn() },
    settlement: {
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    settlementDetail: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  };

  /** 결제 fixture 기본값 — 선불 수업 결제(팀 귀속 1개). */
  const makePayment = (overrides: Record<string, unknown> = {}) => ({
    id: "pay-1",
    orderNumber: "ORDER-1",
    amount: 10000,
    pgProvider: "inicis",
    paymentMethod: "card",
    completedAt: new Date("2026-07-05T00:00:00Z"),
    createdAt: new Date("2026-07-05T00:00:00Z"),
    paymentStatus: "completed",
    _count: { refundLogs: 0 },
    enrollments: [
      {
        billingMonth: new Date("2026-07-01T00:00:00Z"),
        class: { id: "cls-1", teamId: "team-1", className: "테스트 수업" },
      },
    ],
    monthlyBillingLines: [],
    tournamentRegistrations: [],
    ...overrides,
  });

  const makeRefundLog = (overrides: Record<string, unknown> = {}) => ({
    id: "refund-1",
    paymentId: "pay-1",
    refundAmount: 3000,
    processedAt: new Date("2026-07-10T00:00:00Z"),
    payment: makePayment(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementCloseService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SettlementCloseService);
    jest.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue(undefined);
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.team.findMany.mockResolvedValue([
      { id: "team-1", name: "테스트 팀" },
    ]);
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      commissionRate: 0.03,
    });
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.refundLog.findMany.mockResolvedValue([]);
    mockPrisma.settlementDetail.findMany.mockResolvedValue([]);
    mockPrisma.settlement.count.mockResolvedValue(0); // 전월 미마감 경고 비활성 기본값
    mockPrisma.settlement.findUnique.mockResolvedValue(null);
    mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
  });

  it("당월(KST 기준 현재월)은 마감할 수 없다", async () => {
    const k = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const year = String(k.getUTCFullYear());
    const month = String(k.getUTCMonth() + 1).padStart(2, "0");
    await expect(service.closeMonth(`${year}-${month}`)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("미래월은 마감할 수 없다", async () => {
    await expect(service.closeMonth("2099-01")).rejects.toThrow(
      BadRequestException,
    );
  });

  describe("PAYMENT 행 정합", () => {
    it("결제 1건 → PAYMENT 행 1개, feeAmount·actualAmount 를 규약대로 산출한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            paymentId: "pay-1",
            orderNumber: "ORDER-1",
            entryType: "PAYMENT",
            refundLogId: null,
            eventKey: "P:pay-1",
            paymentAmount: 10000,
            feeRate: 0.03,
            feeAmount: 300, // round(10000*0.03)
            actualAmount: 9700,
            attributionMonth: "2026-07",
            memo: null,
          }),
        ],
      });
      expect(result.created).toBe(1);
      expect(result.totals.paymentCount).toBe(1);
      expect(result.totals.refundCount).toBe(0);
      expect(result.totals.totalRevenue).toBe(10000);
      expect(result.totals.platformFee).toBe(300);
      expect(result.totals.netAmount).toBe(9700);
      expect(result.totals.refundAmount).toBe(0);
    });

    it("mock·free 결제사는 제외하고 excluded.mockAmount 에 집계한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({ id: "pay-mock", pgProvider: "mock", amount: 5000 }),
        makePayment({ id: "pay-free", pgProvider: "free", amount: 0 + 1 }),
      ]);

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(result.excluded.mockAmount).toBe(5001);
      expect(result.created).toBe(0);
    });

    it("팀 귀속이 불가능(0개)한 결제는 teamUnattributed 로 보고한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({
          enrollments: [],
          monthlyBillingLines: [],
          tournamentRegistrations: [],
        }),
      ]);

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(result.teamUnattributed).toEqual({ count: 1, amount: 10000 });
    });

    it("결제 1건이 2개 팀에 걸치면(비정상) teamUnattributed 로 방어 보고한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({
          enrollments: [
            { billingMonth: null, class: { teamId: "team-1", className: "A" } },
          ],
          monthlyBillingLines: [
            {
              billing: {
                yearMonth: "2026-07",
                class: { teamId: "team-2", className: "B" },
              },
            },
          ],
        }),
      ]);

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(result.teamUnattributed).toEqual({ count: 1, amount: 10000 });
    });

    it("로그 없는 refunded 결제는 refundsWithoutLog 로 보고하되 PAYMENT 행은 그대로 생성한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({ paymentStatus: "refunded", _count: { refundLogs: 0 } }),
      ]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      const result = await service.closeMonth(MONTH);

      expect(result.refundsWithoutLog).toEqual([
        { paymentId: "pay-1", orderNumber: "ORDER-1", amount: 10000 },
      ]);
      expect(mockPrisma.settlementDetail.createMany).toHaveBeenCalled();
    });

    it("대회 결제는 productName=대회명, attributionMonth=completedAt KST 월", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({
          enrollments: [],
          tournamentRegistrations: [
            { tournament: { id: "tour-1", teamId: "team-1", name: "가을컵" } },
          ],
        }),
      ]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            productName: "가을컵",
            sourceType: "TOURNAMENT",
            sourceId: "tour-1",
            attributionMonth: "2026-07",
          }),
        ],
      });
    });

    it("선불 수업 결제는 출처=CLASS(수업 id), 이름=수업명", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            productName: "테스트 수업",
            sourceType: "CLASS",
            sourceId: "cls-1",
          }),
        ],
      });
    });

    it("후불 수업 결제는 청구의 수업이 출처", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({
          enrollments: [],
          monthlyBillingLines: [
            {
              billing: {
                yearMonth: "2026-07",
                class: { id: "cls-9", teamId: "team-1", className: "후불반" },
              },
            },
          ],
        }),
      ]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            productName: "후불반",
            sourceType: "CLASS",
            sourceId: "cls-9",
          }),
        ],
      });
    });

    it("수업·대회 연결이 없으면 출처=OTHER, sourceId=null", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({ enrollments: [] }),
      ]);

      const result = await service.closeMonth(MONTH);

      // 팀 귀속이 불가해 정산 행은 만들어지지 않는다 — 출처 판정은 팀 귀속보다 뒤다.
      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(result.teamUnattributed.count).toBe(1);
    });
  });

  describe("REFUND 행 정합", () => {
    it("같은 달 결제+환불 → PAYMENT·REFUND 2행", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.refundLog.findMany.mockResolvedValue([makeRefundLog()]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      const result = await service.closeMonth(MONTH);

      const call = mockPrisma.settlementDetail.createMany.mock.calls[0][0];
      expect(call.data).toHaveLength(2);
      const refundRow = call.data.find(
        (d: { entryType: string }) => d.entryType === "REFUND",
      );
      expect(refundRow).toEqual(
        expect.objectContaining({
          paymentId: "pay-1",
          entryType: "REFUND",
          refundLogId: "refund-1",
          eventKey: "R:refund-1",
          sourceType: "CLASS",
          sourceId: "cls-1",
          productName: "테스트 수업",
          paymentAmount: -3000,
          feeAmount: -90, // -round(3000*0.03)
          actualAmount: -2910, // -3000 - (-90)
          memo: "환불",
        }),
      );
      expect(result.totals.paymentCount).toBe(1);
      expect(result.totals.refundCount).toBe(1);
      expect(result.totals.totalRevenue).toBe(10000);
      expect(result.totals.refundAmount).toBe(3000);
      expect(result.totals.netAmount).toBe(9700 - 2910);
    });

    it("부분환불 2회 → REFUND 2행(각 로그마다 별도 행)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.refundLog.findMany.mockResolvedValue([
        makeRefundLog({ id: "refund-1", refundAmount: 2000 }),
        makeRefundLog({ id: "refund-2", refundAmount: 1000 }),
      ]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      const result = await service.closeMonth(MONTH);

      const call = mockPrisma.settlementDetail.createMany.mock.calls[0][0];
      const refundRows = call.data.filter(
        (d: { entryType: string }) => d.entryType === "REFUND",
      );
      expect(refundRows).toHaveLength(2);
      expect(
        refundRows.map((r: { paymentAmount: number }) => r.paymentAmount),
      ).toEqual(expect.arrayContaining([-2000, -1000]));
      expect(result.totals.refundCount).toBe(2);
    });

    it("결제는 과거월(8월)에 이미 정산됨 · 환불만 이번 달(7월) → REFUND 행만 생성(짝=기존 Detail)", async () => {
      // 이번 달 payment.findMany 결과에는 없음(완료월이 달라 조회 범위 밖) — refundLog 만 존재.
      mockPrisma.refundLog.findMany.mockResolvedValue([makeRefundLog()]);
      // "이 결제는 예전에 이미 PAYMENT 로 정산됨" — eventKey P:pay-1 존재.
      mockPrisma.settlementDetail.findMany.mockImplementation(
        (args: { where: { eventKey: { in: string[] } } }) => {
          if (args.where.eventKey.in.includes("P:pay-1")) {
            return Promise.resolve([
              { eventKey: "P:pay-1", settlementId: "settle-aug" },
            ]);
          }
          return Promise.resolve([]);
        },
      );
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      const result = await service.closeMonth(MONTH);

      const call = mockPrisma.settlementDetail.createMany.mock.calls[0][0];
      expect(call.data).toHaveLength(1);
      expect(call.data[0].entryType).toBe("REFUND");
      expect(result.unmatchedRefunds).toEqual([]);
    });

    it("환불 수수료는 현재 요율이 아니라 원 결제(PAYMENT 행)가 기록된 요율을 따른다", async () => {
      // 결제 당시 3% 로 정산됐는데, 그 사이 플랫폼 수수료율이 5% 로 바뀐 상태에서
      //   환불이 발생해도 환급 수수료는 결제 당시 3% 그대로여야 한다.
      mockPrisma.appSettings.findFirst.mockResolvedValue({
        commissionRate: 0.05,
      });
      mockPrisma.refundLog.findMany.mockResolvedValue([makeRefundLog()]);
      mockPrisma.settlementDetail.findMany.mockImplementation(
        (args: { where: { eventKey: { in: string[] } } }) => {
          if (args.where.eventKey.in.includes("P:pay-1")) {
            return Promise.resolve([
              {
                eventKey: "P:pay-1",
                settlementId: "settle-aug",
                paymentId: "pay-1",
                feeRate: 0.03,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

      await service.closeMonth(MONTH);

      const call = mockPrisma.settlementDetail.createMany.mock.calls[0][0];
      expect(call.data).toHaveLength(1);
      expect(call.data[0]).toEqual(
        expect.objectContaining({
          entryType: "REFUND",
          feeRate: 0.03, // 현재 요율(0.05)이 아니라 결제 당시 요율.
          feeAmount: -90, // -round(3000*0.03)
          actualAmount: -2910, // -3000 - (-90)
        }),
      );
    });

    it("짝(원 결제 Detail) 없는 환불은 unmatchedRefunds 로 보고하고 행을 만들지 않는다", async () => {
      mockPrisma.refundLog.findMany.mockResolvedValue([makeRefundLog()]);
      mockPrisma.settlementDetail.findMany.mockResolvedValue([]); // 기존 어디에도 없음

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(result.unmatchedRefunds).toEqual([
        { refundLogId: "refund-1", orderNumber: "ORDER-1", amount: 3000 },
      ]);
    });

    it("환불 원 결제가 mock 이면 조용히 제외한다(mockAmount 이중 합산 금지, 보고도 안 함)", async () => {
      // 원 결제(mock)는 애초에 정산 대상이 아니므로 이번 달 PAYMENT 후보에도 없다(기본 []).
      mockPrisma.refundLog.findMany.mockResolvedValue([
        makeRefundLog({ payment: makePayment({ pgProvider: "mock" }) }),
      ]);

      const result = await service.closeMonth(MONTH);

      expect(result.excluded.mockAmount).toBe(0);
      expect(result.unmatchedRefunds).toEqual([]);
      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
    });

    it("같은 달 mock 결제+환불이면 mockAmount 는 결제 금액만 집계한다(환불액 이중 합산 금지)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({ pgProvider: "mock", amount: 5000 }),
      ]);
      mockPrisma.refundLog.findMany.mockResolvedValue([
        makeRefundLog({
          refundAmount: 2000,
          payment: makePayment({ pgProvider: "mock", amount: 5000 }),
        }),
      ]);

      const result = await service.closeMonth(MONTH);

      expect(result.excluded.mockAmount).toBe(5000); // 5000(결제) — 2000(환불) 합산 아님
      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
    });

    it("환불 원 결제 팀 귀속 불가 → teamUnattributed 보고", async () => {
      mockPrisma.refundLog.findMany.mockResolvedValue([
        makeRefundLog({
          payment: makePayment({
            enrollments: [],
            monthlyBillingLines: [],
            tournamentRegistrations: [],
          }),
        }),
      ]);

      const result = await service.closeMonth(MONTH);

      expect(result.teamUnattributed).toEqual({ count: 1, amount: 3000 });
    });
  });

  describe("잠금 상태(approved 이상) — 재계산 없이 skip + lateArrivals", () => {
    it.each(["approved", "processing", "paid", "failed", "completed"])(
      "%s 상태 정산은 재계산하지 않고 skipped + lateArrivals 로 보고한다",
      async (status) => {
        mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
        mockPrisma.settlement.findUnique.mockResolvedValue({
          id: "settle-1",
          status,
        });

        const result = await service.closeMonth(MONTH);

        expect(mockPrisma.settlementDetail.deleteMany).not.toHaveBeenCalled();
        expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
        expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
        expect(result.skipped).toEqual([
          expect.objectContaining({
            teamId: "team-1",
            reason: "LOCKED_STATUS",
            status,
          }),
        ]);
        expect(result.lateArrivals).toEqual([
          {
            paymentId: "pay-1",
            orderNumber: "ORDER-1",
            teamId: "team-1",
            month: MONTH,
          },
        ]);
      },
    );

    it("이미 Detail 에 반영된 결제는 재마감 재스캔에서 lateArrivals 로 오탐하지 않는다", async () => {
      // 8월 승인 후 재마감 시, 같은 달 결제를 다시 스캔하면 이 결제도 다시 잡히지만
      //   이미 그 정산의 Detail 에 eventKey=P:pay-1 로 반영돼 있으므로 late 가 아니다.
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "settle-1",
        status: "approved",
      });
      mockPrisma.settlementDetail.findMany.mockResolvedValue([
        { eventKey: "P:pay-1" },
      ]);

      const result = await service.closeMonth(MONTH);

      expect(result.lateArrivals).toEqual([]);
      expect(result.lateRefunds).toEqual([]);
    });

    it("잠긴 팀에 새로 확정된 결제/환불만 lateArrivals·lateRefunds 로 보고한다(혼합)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({ id: "pay-1", orderNumber: "ORDER-1" }), // 이미 반영됨
        makePayment({ id: "pay-2", orderNumber: "ORDER-2" }), // 새로 도착
      ]);
      mockPrisma.refundLog.findMany.mockResolvedValue([
        makeRefundLog({
          id: "refund-1",
          paymentId: "pay-1",
          refundAmount: 1500,
          payment: makePayment({ id: "pay-1", orderNumber: "ORDER-1" }),
        }), // 새로 도착한 환불(원 결제는 이미 반영)
      ]);
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "settle-1",
        status: "approved",
      });
      // pay-1 의 PAYMENT 행만 이미 반영됨 — pay-2 결제와 refund-1 환불은 처음 보는 이벤트.
      mockPrisma.settlementDetail.findMany.mockResolvedValue([
        { eventKey: "P:pay-1" },
      ]);

      const result = await service.closeMonth(MONTH);

      expect(result.lateArrivals).toEqual([
        {
          paymentId: "pay-2",
          orderNumber: "ORDER-2",
          teamId: "team-1",
          month: MONTH,
        },
      ]);
      expect(result.lateRefunds).toEqual([
        { refundLogId: "refund-1", orderNumber: "ORDER-1", amount: 1500 },
      ]);
    });
  });

  describe("멱등·재계산", () => {
    it("기존 pending 정산이 있으면 Detail 을 교체하고 updated 로 보고한다(재실행 시 금액 동일)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "settle-1",
        status: "pending",
      });

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlement.create).not.toHaveBeenCalled();
      // 조건 없는 update 가 아니라 "여전히 pending/rejected 일 때만" 조건부 updateMany —
      //   그 사이 끼어든 승인(→approved)을 덮어쓰지 않기 위한 방어.
      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { id: "settle-1", status: { in: ["pending", "rejected"] } },
        data: { status: "pending" },
      });
      expect(mockPrisma.settlementDetail.deleteMany).toHaveBeenCalledWith({
        where: { settlementId: "settle-1" },
      });
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.totals.netAmount).toBe(9700);
    });

    it("rejected 상태는 재마감 시 pending 으로 전이한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "settle-1",
        status: "rejected",
      });

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { id: "settle-1", status: { in: ["pending", "rejected"] } },
        data: { status: "pending" },
      });
      expect(result.updated).toBe(1);
    });

    it("재마감이 기존 정산을 읽은 뒤 그 사이 승인(pending→approved)이 끼어들면 승인을 되돌리지 않고 skipped 로 보고한다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      // closeTeam 이 읽을 때는 pending 이었지만(재계산 경로 진입), 조건부 claim 시점엔
      //   이미 다른 트랜잭션이 approved 로 바꿔놔 claim 이 0건으로 실패하는 시나리오.
      mockPrisma.settlement.findUnique
        .mockResolvedValueOnce({ id: "settle-1", status: "pending" }) // closeTeam 최초 조회
        .mockResolvedValueOnce({ status: "approved" }); // claim 실패 후 재조회(현재 상태)
      mockPrisma.settlement.updateMany.mockResolvedValueOnce({ count: 0 }); // claim 실패

      const result = await service.closeMonth(MONTH);

      // 승인을 덮어쓰는 상태 갱신·Detail 교체가 전혀 일어나지 않아야 한다("승인 유지").
      expect(mockPrisma.settlementDetail.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(result.skipped).toEqual([
        expect.objectContaining({
          teamId: "team-1",
          reason: "LOCKED_STATUS",
          status: "approved",
        }),
      ]);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });

    it("대상 0건이고 기존 pending 정산이 있으면 삭제한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "settle-1",
        status: "pending",
      });

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.deleteMany).toHaveBeenCalledWith({
        where: { settlementId: "settle-1" },
      });
      expect(mockPrisma.settlement.delete).toHaveBeenCalledWith({
        where: { id: "settle-1" },
      });
      expect(result.deleted).toBe(1);
    });

    it("대상 0건이고 기존 정산도 없으면 아무 것도 하지 않는다", async () => {
      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlement.delete).not.toHaveBeenCalled();
      expect(mockPrisma.settlement.create).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
      expect(result.created).toBe(0);
    });
  });

  it("순지급액이 음수면 negativeNetTeams 로 보고하되 정산은 그대로 생성한다", async () => {
    // 이번 달 결제는 없고, 과거 결제(이미 정산됨)의 대형 환불만 이번 달 처리됨 → 순액 음수.
    mockPrisma.refundLog.findMany.mockResolvedValue([
      makeRefundLog({ refundAmount: 5000 }),
    ]);
    mockPrisma.settlementDetail.findMany.mockImplementation(
      (args: { where: { eventKey: { in: string[] } } }) =>
        args.where.eventKey.in.includes("P:pay-1")
          ? Promise.resolve([
              { eventKey: "P:pay-1", settlementId: "settle-aug" },
            ])
          : Promise.resolve([]),
    );
    mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });

    const result = await service.closeMonth(MONTH);

    expect(result.totals.netAmount).toBeLessThan(0);
    expect(result.negativeNetTeams).toEqual([
      {
        teamId: "team-1",
        teamName: "테스트 팀",
        netAmount: result.totals.netAmount,
      },
    ]);
  });

  describe("전월 미마감 경고", () => {
    it("전월에 정산이 없고 그 이전 어딘가에 정산이 있으면 경고한다", async () => {
      mockPrisma.settlement.count.mockImplementation(
        (args: { where: { settlementMonth?: unknown } }) => {
          if (args.where.settlementMonth === "2026-06")
            return Promise.resolve(0);
          return Promise.resolve(3); // lt: "2026-07" 조건 쪽
        },
      );

      const result = await service.closeMonth(MONTH);

      expect(result.warnings.previousMonthNotClosed).toBe(true);
    });

    it("첫 마감(이전 정산이 전혀 없음)이면 전월이 비어 있어도 경고하지 않는다", async () => {
      mockPrisma.settlement.count.mockResolvedValue(0);

      const result = await service.closeMonth(MONTH);

      expect(result.warnings.previousMonthNotClosed).toBe(false);
    });
  });

  describe("경쟁·실패 격리", () => {
    it("최종 재계산 updateMany 가 count!==1 이면 해당 팀만 FAILED 로 격리한다(끼어든 승인)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-1" });
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 }); // 경쟁 발생

      const result = await service.closeMonth(MONTH);

      expect(result.skipped).toEqual([
        expect.objectContaining({ teamId: "team-1", reason: "FAILED" }),
      ]);
      expect(result.created).toBe(0);
    });

    it("한 팀의 처리 실패가 다른 팀 처리를 막지 않는다", async () => {
      mockPrisma.team.findMany.mockResolvedValue([
        { id: "team-1", name: "실패 팀" },
        { id: "team-2", name: "정상 팀" },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([
        makePayment({
          enrollments: [
            {
              billingMonth: null,
              class: { teamId: "team-1", className: "A" },
            },
          ],
        }),
        makePayment({
          id: "pay-2",
          orderNumber: "ORDER-2",
          amount: 5000,
          enrollments: [
            {
              billingMonth: null,
              class: { teamId: "team-2", className: "B" },
            },
          ],
        }),
      ]);
      mockPrisma.settlement.create.mockResolvedValue({ id: "settle-x" });
      // team-1 만 경쟁 실패, team-2 는 성공.
      mockPrisma.settlement.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.closeMonth(MONTH);

      expect(result.skipped).toEqual([
        expect.objectContaining({ teamId: "team-1", reason: "FAILED" }),
      ]);
      expect(result.created).toBe(1);
    });
  });

  describe("eventKey 충돌", () => {
    it("이미 다른 정산에 귀속된 이벤트는 conflicts 로 제외한다(마감 순서 뒤바뀌어도 1회만)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlementDetail.findMany.mockResolvedValue([
        { eventKey: "P:pay-1", settlementId: "other-settlement" },
      ]);

      const result = await service.closeMonth(MONTH);

      expect(mockPrisma.settlementDetail.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.settlement.create).not.toHaveBeenCalled();
      expect(result.conflicts).toEqual([
        { eventKey: "P:pay-1", existingSettlementId: "other-settlement" },
      ]);
    });

    it("같은 정산에 이미 속한 이벤트는 재생성 대상이라 conflict 가 아니다", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "settle-1",
        status: "pending",
      });
      mockPrisma.settlementDetail.findMany.mockResolvedValue([
        { eventKey: "P:pay-1", settlementId: "settle-1" },
      ]);

      const result = await service.closeMonth(MONTH);

      expect(result.conflicts).toEqual([]);
      expect(mockPrisma.settlementDetail.createMany).toHaveBeenCalled();
    });
  });
});
