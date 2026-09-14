import { TournamentsService } from "./tournaments.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * confirmTournamentSettlement — 후불 청구행의 결제사 기록과 재청구 보호 회귀 스펙.
 *
 * 증명 대상:
 *  1) 신규 청구행은 활성 결제사(appSettings.paymentProvider)를 paymentMethod·pgProvider 에 기록한다.
 *  2) 승인 전 행(pending · 결제요청 취소 cancelled)은 재청구 시 활성 결제사·금액으로 갱신된다.
 *  3) 승인·환불을 거친 행(completed · refund_processing · refunded · partially_refunded ·
 *     completedAt 을 가진 cancelled)은 대상 조회 뒤에 상태가 바뀌었더라도 갱신되지 않는다 —
 *     실제 승인 결제사·금액이 보존되고 참가자 CAS 도 시도하지 않는다.
 *
 * updateMany 모의는 count:1 을 고정 반환하지 않고 실제 where(상태 allowlist + completedAt)를
 * 가짜 행에 평가한다 — 조건이 느슨해지면 보호 케이스가 실패한다.
 */

type FakePayment = {
  id: string;
  orderNumber: string;
  paymentStatus: string;
  completedAt: Date | null;
  paymentMethod: string | null;
  pgProvider: string | null;
  amount: number;
  userId: string;
};

const requester: JwtUserPayload = {
  id: "director-1",
  email: "director",
  userType: "DIRECTOR",
};

const TOURNAMENT_ID = "trn-1";
const REG_ID = "reg-1";
const ORDER_NUMBER = `TRN-POSTPAID-${TOURNAMENT_ID}-${REG_ID}`;

function matchesWhere(row: FakePayment, where: Record<string, any>): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  const st = where.paymentStatus;
  if (st !== undefined) {
    if (typeof st === "string" && row.paymentStatus !== st) return false;
    if (st && Array.isArray(st.in) && !st.in.includes(row.paymentStatus))
      return false;
    if (st && st.not !== undefined && row.paymentStatus === st.not)
      return false;
  }
  if ("completedAt" in where) {
    if (where.completedAt === null && row.completedAt !== null) return false;
  }
  return true;
}

function buildHarness(opts: {
  activeProvider: string;
  existing?: FakePayment | null;
  /** 대상 조회 뒤·결제행 갱신 전에 개입하는 상태 변화(승인·환불 경합 재현) */
  beforePaymentUpdate?: (row: FakePayment) => void;
}) {
  const rows = new Map<string, FakePayment>();
  if (opts.existing) rows.set(opts.existing.orderNumber, opts.existing);

  const tx = {
    tournament: { update: jest.fn().mockResolvedValue({}) },
    payment: {
      upsert: jest.fn(async (args: any) => {
        const found = rows.get(args.where.orderNumber);
        if (found) return { id: found.id };
        const created: FakePayment = {
          id: "pay-new",
          orderNumber: args.create.orderNumber,
          paymentStatus: args.create.paymentStatus,
          completedAt: null,
          paymentMethod: args.create.paymentMethod ?? null,
          pgProvider: args.create.pgProvider ?? null,
          amount: args.create.amount,
          userId: args.create.userId,
        };
        rows.set(created.orderNumber, created);
        return { id: created.id };
      }),
      updateMany: jest.fn(async (args: any) => {
        const row = [...rows.values()].find((r) => r.id === args.where.id);
        if (!row) return { count: 0 };
        opts.beforePaymentUpdate?.(row);
        if (!matchesWhere(row, args.where)) return { count: 0 };
        Object.assign(row, args.data);
        return { count: 1 };
      }),
    },
    tournamentRegistration: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = {
    tournament: {
      findUnique: jest.fn().mockResolvedValue({
        id: TOURNAMENT_ID,
        name: "가을 리그",
        billingMode: "POSTPAID",
        status: "finished",
        endDate: null,
        teamId: "team-1",
      }),
    },
    tournamentRegistration: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: REG_ID,
          userId: "parent-1",
          childId: null,
          paymentStatus: "PENDING",
          calculatedFee: null,
        },
      ]),
    },
    parentChild: { findMany: jest.fn().mockResolvedValue([]) },
    appSettings: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ paymentProvider: opts.activeProvider }),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
  };

  const notifications = { createNotification: jest.fn().mockResolvedValue({}) };
  const access = {
    assertManageableTournamentRecord: jest.fn().mockResolvedValue(undefined),
  };

  const service = new TournamentsService(
    prisma as any,
    notifications as any,
    access as any,
    {} as any,
    undefined,
  );

  return { service, tx, rows, notifications };
}

const tossRow = (over: Partial<FakePayment>): FakePayment => ({
  id: "pay-1",
  orderNumber: ORDER_NUMBER,
  paymentStatus: "pending",
  completedAt: null,
  paymentMethod: "toss",
  pgProvider: "toss",
  amount: 10000,
  userId: "parent-1",
  ...over,
});

describe("TournamentsService.confirmTournamentSettlement — 청구행 결제사 기록", () => {
  it("신규 청구행 — 활성 결제사를 paymentMethod·pgProvider 에 기록하고 참가자를 PENDING 으로 연결", async () => {
    const h = buildHarness({ activeProvider: "nice" });

    const res = await h.service.confirmTournamentSettlement(
      TOURNAMENT_ID,
      30000,
      undefined,
      requester,
    );

    const created = h.tx.payment.upsert.mock.calls[0][0].create;
    expect(created).toMatchObject({
      orderNumber: ORDER_NUMBER,
      paymentStatus: "pending",
      paymentMethod: "nice",
      pgProvider: "nice",
    });
    const row = h.rows.get(ORDER_NUMBER)!;
    expect(row).toMatchObject({ paymentMethod: "nice", pgProvider: "nice" });
    expect(h.tx.tournamentRegistration.updateMany).toHaveBeenCalledTimes(1);
    expect(res.billedCount).toBe(1);
  });

  it("갱신 조건 — 승인 전 상태 allowlist(pending·cancelled·failed) + completedAt null 만 허용", async () => {
    const h = buildHarness({
      activeProvider: "nice",
      existing: tossRow({}),
    });

    await h.service.confirmTournamentSettlement(
      TOURNAMENT_ID,
      30000,
      undefined,
      requester,
    );

    expect(h.tx.payment.updateMany.mock.calls[0][0].where).toEqual({
      id: "pay-1",
      paymentStatus: { in: ["pending", "cancelled", "failed"] },
      completedAt: null,
    });
  });

  it("미결제(pending) 재청구 — 금액·결제사를 현재 활성 결제사로 갱신", async () => {
    const h = buildHarness({
      activeProvider: "nice",
      existing: tossRow({}),
    });

    const res = await h.service.confirmTournamentSettlement(
      TOURNAMENT_ID,
      30000,
      undefined,
      requester,
    );

    expect(h.rows.get(ORDER_NUMBER)).toMatchObject({
      paymentStatus: "pending",
      amount: 30000,
      paymentMethod: "nice",
      pgProvider: "nice",
    });
    expect(res.billedCount).toBe(1);
  });

  it("결제요청 취소(cancelled·승인 전) 뒤 재청구 — pending 으로 되살리고 활성 결제사 기록", async () => {
    const h = buildHarness({
      activeProvider: "nice",
      existing: tossRow({ paymentStatus: "cancelled" }),
    });

    const res = await h.service.confirmTournamentSettlement(
      TOURNAMENT_ID,
      30000,
      undefined,
      requester,
    );

    expect(h.rows.get(ORDER_NUMBER)).toMatchObject({
      paymentStatus: "pending",
      paymentMethod: "nice",
      pgProvider: "nice",
    });
    expect(res.billedCount).toBe(1);
  });

  it("PG 승인 거절(failed·승인 전) 뒤 재청구 — pending 으로 되살리고 활성 결제사 기록", async () => {
    // 돈이 나가지 않은 행이라 재청구 대상이다. 허용 상태가 좁아지면 결제 실패한 참가자가
    //   영구히 재청구 불가가 되므로(등록 PENDING 전환·알림 누락) 성공 케이스로 고정한다.
    const h = buildHarness({
      activeProvider: "nice",
      existing: tossRow({ paymentStatus: "failed" }),
    });

    const res = await h.service.confirmTournamentSettlement(
      TOURNAMENT_ID,
      30000,
      undefined,
      requester,
    );

    expect(h.rows.get(ORDER_NUMBER)).toMatchObject({
      paymentStatus: "pending",
      amount: 30000,
      paymentMethod: "nice",
      pgProvider: "nice",
    });
    expect(h.tx.tournamentRegistration.updateMany).toHaveBeenCalledTimes(1);
    expect(res.billedCount).toBe(1);
  });

  describe("승인·환불을 거친 행 보호 — 대상 조회 뒤 상태가 바뀌어도 덮어쓰지 않는다", () => {
    const approvedAt = new Date("2026-09-10T00:00:00Z");
    const protectedStates: Array<{
      label: string;
      paymentStatus: string;
      completedAt: Date | null;
    }> = [
      {
        label: "completed",
        paymentStatus: "completed",
        completedAt: approvedAt,
      },
      {
        label: "refund_processing",
        paymentStatus: "refund_processing",
        completedAt: approvedAt,
      },
      { label: "refunded", paymentStatus: "refunded", completedAt: approvedAt },
      {
        label: "partially_refunded",
        paymentStatus: "partially_refunded",
        completedAt: approvedAt,
      },
      {
        label: "승인 뒤 취소(cancelled + completedAt)",
        paymentStatus: "cancelled",
        completedAt: approvedAt,
      },
    ];

    it.each(protectedStates)(
      "$label — 결제행·참가자 모두 미변경, 청구 건수 0",
      async ({ paymentStatus, completedAt }) => {
        // 조회 시점엔 pending(대상 포함) → 결제행 갱신 직전에 승인/환불 상태로 전이.
        const h = buildHarness({
          activeProvider: "nice",
          existing: tossRow({ amount: 10000 }),
          beforePaymentUpdate: (row) => {
            row.paymentStatus = paymentStatus;
            row.completedAt = completedAt;
          },
        });

        const res = await h.service.confirmTournamentSettlement(
          TOURNAMENT_ID,
          30000,
          undefined,
          requester,
        );

        expect(h.rows.get(ORDER_NUMBER)).toMatchObject({
          paymentStatus,
          amount: 10000,
          paymentMethod: "toss",
          pgProvider: "toss",
        });
        expect(h.tx.tournamentRegistration.updateMany).not.toHaveBeenCalled();
        expect(h.notifications.createNotification).not.toHaveBeenCalled();
        expect(res.billedCount).toBe(0);
      },
    );
  });
});
