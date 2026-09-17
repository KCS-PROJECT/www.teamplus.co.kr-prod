import { BadRequestException, ConflictException } from "@nestjs/common";
import { TournamentsService } from "./tournaments.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * 대회 취소(updateTournament status=cancelled / changeTournamentStatus) 회귀 스펙.
 *
 * 증명 대상:
 *  1) 결제 완료(PAID, paymentId 연결) 참가자가 있으면 취소를 막는다 (사전 count).
 *     단, 결제행 없는 PAID(무료 대회)는 막지 않는다.
 *  2) 후불 대회 취소(tournament-cancel scope) 시 미결제 청구를 벌크로 철회
 *     (UNPAID·fee 0)하되 결제 연결(paymentId)은 보존한다. 결제요청 취소
 *     (settlement-cancel scope) 시에는 paymentId 를 해제한다.
 *  3) 청구 철회 대상 판정은 경로에 따라 넓이가 다르다 — failed 결제는
 *     대회 취소에서만 철회 대상이다.
 *  4) 벌크 갱신 뒤 실제로 UNPAID 로 확인된 행만 reverted 로 잡히고, 결제행
 *     벌크 취소의 id 목록도 그 행들의 paymentId 만 포함한다.
 *  5) 선불 대회 취소는 PENDING 참가만 CANCELLED 로 전환하고 paymentId 링크는 보존한다.
 *  6) PAID 사전 검사 통과 뒤에도 전환 도중 PAID 가 나타나면 사후 재검증이 롤백시킨다.
 *  7) changeTournamentStatus 는 판정~쓰기 사이 상태가 바뀌면 CAS 로 충돌을 감지한다.
 *  8) 취소 알림은 결제자(주 보호자) 단위로 dedupe 되고, 하나라도 청구 철회가
 *     있었으면 문구에 반영된다.
 */

const requester: JwtUserPayload = {
  id: "director-1",
  email: "director",
  userType: "DIRECTOR",
};

const TOURNAMENT_ID = "trn-1";

type FakeReg = {
  id: string;
  userId: string;
  childId: string | null;
  paymentStatus: string;
  paymentId: string | null;
  calculatedFee: number;
  cancelledAt: Date | null;
};

type FakePayment = {
  id: string;
  paymentStatus: string;
};

function matchesIdWhere(rowId: string, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "string") return rowId === cond;
  const inList = (cond as { in?: string[] }).in;
  return Array.isArray(inList) ? inList.includes(rowId) : true;
}

function matchesStatusWhere(status: string, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "string") return status === cond;
  const obj = cond as { in?: string[]; not?: string };
  if (Array.isArray(obj.in)) return obj.in.includes(status);
  if (obj.not !== undefined) return status !== obj.not;
  return true;
}

function matchesPaymentIdWhere(
  rowPaymentId: string | null,
  cond: unknown,
): boolean {
  if (cond === undefined) return true;
  if (cond === null) return rowPaymentId === null;
  if (typeof cond === "object" && cond !== null) {
    const notVal = (cond as { not?: unknown }).not;
    if (notVal === null) return rowPaymentId !== null;
    if (notVal !== undefined) return rowPaymentId !== notVal;
  }
  return true;
}

function matchesRegWhere(
  row: FakeReg,
  where: Record<string, any>,
  payments: Map<string, FakePayment>,
): boolean {
  if (where.tournamentId !== undefined && where.tournamentId !== TOURNAMENT_ID)
    return false;
  if (where.id !== undefined && !matchesIdWhere(row.id, where.id)) return false;
  if (
    where.paymentStatus !== undefined &&
    !matchesStatusWhere(row.paymentStatus, where.paymentStatus)
  )
    return false;
  if (
    where.paymentId !== undefined &&
    !matchesPaymentIdWhere(row.paymentId, where.paymentId)
  )
    return false;
  if (where.payment !== undefined) {
    const cond = where.payment.is;
    const pay = row.paymentId ? payments.get(row.paymentId) : undefined;
    if (!pay) return false;
    if (!matchesStatusWhere(pay.paymentStatus, cond.paymentStatus))
      return false;
  }
  if (where.OR !== undefined) {
    const rows = where.OR as Record<string, any>[];
    if (!rows.some((sub) => matchesRegWhere(row, sub, payments))) return false;
  }
  return true;
}

function buildTx(
  regs: Map<string, FakeReg>,
  payments: Map<string, FakePayment>,
  tournamentRow: { status: string },
  opts: {
    paidCountSequence?: number[];
    forceStatusRace?: boolean;
    /** 벌크 갱신 후 "실제로 UNPAID 로 확인" 쿼리에서 제외할 등록 id — 경합으로
     *  일부만 반영된 상황을 재현한다(등록 자체는 갱신되지만 확인 조회에서 빠짐). */
    excludeFromRevertConfirmation?: string[];
  },
) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    tournament: {
      updateMany: jest.fn(async (args: any) => {
        if (opts.forceStatusRace) return { count: 0 };
        if (tournamentRow.status === args.where.status) {
          tournamentRow.status = args.data.status;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      findUniqueOrThrow: jest.fn(async () => ({
        id: TOURNAMENT_ID,
        ...tournamentRow,
      })),
    },
    tournamentRegistration: {
      count: jest.fn(async (args: any) => {
        if (opts.paidCountSequence && opts.paidCountSequence.length > 0) {
          return opts.paidCountSequence.shift()!;
        }
        return [...regs.values()].filter((r) =>
          matchesRegWhere(r, args.where, payments),
        ).length;
      }),
      findMany: jest.fn(async (args: any) => {
        let rows = [...regs.values()].filter((r) =>
          matchesRegWhere(r, args.where, payments),
        );
        // "벌크 갱신 후 UNPAID 로 확인" 쿼리만 골라 경합 배제 목록을 적용한다 —
        //   초기 대상 조회(paymentStatus:"PENDING")·스냅샷 조회({in:[...]})와는
        //   where 모양이 달라 섞이지 않는다.
        if (
          opts.excludeFromRevertConfirmation &&
          args.where.paymentStatus === "UNPAID" &&
          args.where.id?.in
        ) {
          rows = rows.filter(
            (r) => !opts.excludeFromRevertConfirmation!.includes(r.id),
          );
        }
        // 실제 Prisma findMany 는 조회 시점 스냅샷을 반환한다 — 이후 updateMany 가
        //   regs 원본을 변형해도 이미 반환된 행은 영향받지 않아야 한다.
        return rows.map((r) => ({ ...r }));
      }),
      updateMany: jest.fn(async (args: any) => {
        const rows = [...regs.values()].filter((r) =>
          matchesRegWhere(r, args.where, payments),
        );
        for (const r of rows) Object.assign(r, args.data);
        return { count: rows.length };
      }),
    },
    payment: {
      updateMany: jest.fn(async (args: any) => {
        const ids: string[] = args.where.id?.in ?? [];
        let count = 0;
        for (const id of ids) {
          const row = payments.get(id);
          if (!row) continue;
          if (
            args.where.paymentStatus !== undefined &&
            !matchesStatusWhere(row.paymentStatus, args.where.paymentStatus)
          )
            continue;
          Object.assign(row, args.data);
          count += 1;
        }
        return { count };
      }),
    },
  };
}

function buildHarness(opts: {
  status: string;
  billingMode: string | null;
  registrations: FakeReg[];
  payments?: FakePayment[];
  paidCountSequence?: number[];
  forceStatusRace?: boolean;
  parentLinks?: { childId: string; parentId: string }[];
  excludeFromRevertConfirmation?: string[];
}) {
  const tournamentRow = {
    name: "가을 리그",
    billingMode: opts.billingMode,
    status: opts.status,
    teamId: "team-1",
  };
  const regs = new Map(opts.registrations.map((r) => [r.id, { ...r }]));
  const payments = new Map((opts.payments ?? []).map((p) => [p.id, { ...p }]));

  const tx = buildTx(regs, payments, tournamentRow, {
    paidCountSequence: opts.paidCountSequence
      ? [...opts.paidCountSequence]
      : undefined,
    forceStatusRace: opts.forceStatusRace,
    excludeFromRevertConfirmation: opts.excludeFromRevertConfirmation,
  });

  const notifications = {
    createNotification: jest.fn().mockResolvedValue({}),
  };
  const access = {
    assertManageableTournament: jest.fn().mockResolvedValue(undefined),
    assertManageableTournamentRecord: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    tournament: {
      findUnique: jest.fn(async () => ({
        id: TOURNAMENT_ID,
        ...tournamentRow,
      })),
    },
    parentChild: {
      findMany: jest.fn().mockResolvedValue(opts.parentLinks ?? []),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
  };

  const service = new TournamentsService(
    prisma as any,
    notifications as any,
    access as any,
    {} as any,
    undefined,
  );

  return { service, tx, regs, payments, notifications, prisma, tournamentRow };
}

describe("대회 취소 — PAID 사전 차단", () => {
  it("결제 완료(paymentId 연결) 참가자가 있으면 400, 참가 행 updateMany 는 호출되지 않는다", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "POSTPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "u1",
          childId: null,
          paymentStatus: "PAID",
          paymentId: "pay-1",
          calculatedFee: 10000,
          cancelledAt: null,
        },
      ],
    });

    await expect(
      h.service.changeTournamentStatus(TOURNAMENT_ID, "cancelled", requester),
    ).rejects.toThrow(BadRequestException);

    expect(h.tx.tournamentRegistration.updateMany).not.toHaveBeenCalled();
  });

  it("결제행 없는 PAID(무료 대회) 1건만 있으면 취소를 막지 않는다", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "PREPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "u1",
          childId: null,
          paymentStatus: "PAID",
          paymentId: null,
          calculatedFee: 0,
          cancelledAt: null,
        },
      ],
    });

    const updated = await h.service.changeTournamentStatus(
      TOURNAMENT_ID,
      "cancelled",
      requester,
    );

    expect(updated.status).toBe("cancelled");
    // PAID 행 자체는 대상이 아니므로 건드리지 않는다.
    expect(h.regs.get("reg-1")!.paymentStatus).toBe("PAID");
  });
});

describe("대회 취소 — 후불 청구 철회(tournament-cancel scope)", () => {
  it("PENDING(pending) 2건 — UNPAID·fee 0 벌크 전환, 결제 연결(paymentId)은 보존", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "POSTPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "u1",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-1",
          calculatedFee: 10000,
          cancelledAt: null,
        },
        {
          id: "reg-2",
          userId: "u2",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-2",
          calculatedFee: 10000,
          cancelledAt: null,
        },
      ],
      payments: [
        { id: "pay-1", paymentStatus: "pending" },
        { id: "pay-2", paymentStatus: "pending" },
      ],
    });

    await h.service.changeTournamentStatus(
      TOURNAMENT_ID,
      "cancelled",
      requester,
    );

    for (const id of ["reg-1", "reg-2"]) {
      const reg = h.regs.get(id)!;
      expect(reg.paymentStatus).toBe("UNPAID");
      expect(Number(reg.calculatedFee)).toBe(0);
    }
    // 대회 취소에서는 결제 연결을 유지한다 — 고아 결제 자동 환불 접수용.
    expect(h.regs.get("reg-1")!.paymentId).toBe("pay-1");
    expect(h.regs.get("reg-2")!.paymentId).toBe("pay-2");

    // 벌크 1회 — 참가자 수만큼 왕복하지 않는다.
    expect(h.tx.tournamentRegistration.updateMany).toHaveBeenCalledTimes(1);
    const regUpdateCall =
      h.tx.tournamentRegistration.updateMany.mock.calls[0][0];
    expect(Object.keys(regUpdateCall.data)).not.toContain("paymentId");

    expect(h.payments.get("pay-1")!.paymentStatus).toBe("cancelled");
    expect(h.payments.get("pay-2")!.paymentStatus).toBe("cancelled");
    expect(h.tx.payment.updateMany).toHaveBeenCalledTimes(1);
    const payUpdateCall = h.tx.payment.updateMany.mock.calls[0][0];
    expect(new Set(payUpdateCall.where.id.in)).toEqual(
      new Set(["pay-1", "pay-2"]),
    );

    // 두 참가자 모두 청구가 철회됐다 — 알림 문구에 반영되어야 한다.
    expect(h.notifications.createNotification).toHaveBeenCalledTimes(2);
    for (const call of h.notifications.createNotification.mock.calls) {
      expect(call[0].message).toContain("철회");
    }
  });

  it("벌크 갱신 후 UNPAID 확인이 일부만 나오면 그 행만 reverted — payment.updateMany 의 id in 도 그 행만 포함", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "POSTPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "u1",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-1",
          calculatedFee: 10000,
          cancelledAt: null,
        },
        {
          id: "reg-2",
          userId: "u2",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-2",
          calculatedFee: 10000,
          cancelledAt: null,
        },
      ],
      payments: [
        { id: "pay-1", paymentStatus: "pending" },
        { id: "pay-2", paymentStatus: "pending" },
      ],
      // reg-2 는 벌크 갱신 뒤 확인 조회에서 빠진 것으로 재현(경합으로 되돌아가지 못함).
      excludeFromRevertConfirmation: ["reg-2"],
    });

    await h.service.changeTournamentStatus(
      TOURNAMENT_ID,
      "cancelled",
      requester,
    );

    expect(h.tx.payment.updateMany).toHaveBeenCalledTimes(1);
    const payUpdateCall = h.tx.payment.updateMany.mock.calls[0][0];
    expect(payUpdateCall.where.id.in).toEqual(["pay-1"]);

    // 알림 스냅샷도 확인된 reg-1 만 철회로 반영 — 서로 다른 결제자라 알림 2건.
    expect(h.notifications.createNotification).toHaveBeenCalledTimes(2);
    const byUser = new Map(
      h.notifications.createNotification.mock.calls.map((c: any[]) => [
        c[0].userId,
        c[0].message as string,
      ]),
    );
    expect(byUser.get("u1")).toContain("철회");
    expect(byUser.get("u2")).not.toContain("철회");
  });

  describe("철회 대상 판정 — 경로별 범위", () => {
    it("대회 취소(tournament-cancel) — PG 승인 거절(failed) 결제도 철회 대상", async () => {
      const h = buildHarness({
        status: "scheduled",
        billingMode: "POSTPAID",
        registrations: [
          {
            id: "reg-1",
            userId: "u1",
            childId: null,
            paymentStatus: "PENDING",
            paymentId: "pay-1",
            calculatedFee: 10000,
            cancelledAt: null,
          },
        ],
        payments: [{ id: "pay-1", paymentStatus: "failed" }],
      });

      await h.service.changeTournamentStatus(
        TOURNAMENT_ID,
        "cancelled",
        requester,
      );

      expect(h.regs.get("reg-1")!.paymentStatus).toBe("UNPAID");
    });

    it("결제요청 취소(settlement-cancel) — failed 결제는 대상 아님(변경 없음)", async () => {
      const h = buildHarness({
        status: "scheduled",
        billingMode: "POSTPAID",
        registrations: [
          {
            id: "reg-1",
            userId: "u1",
            childId: null,
            paymentStatus: "PENDING",
            paymentId: "pay-1",
            calculatedFee: 10000,
            cancelledAt: null,
          },
        ],
        payments: [{ id: "pay-1", paymentStatus: "failed" }],
      });

      await expect(
        h.service.cancelTournamentSettlement(TOURNAMENT_ID, requester),
      ).rejects.toThrow(BadRequestException);

      expect(h.regs.get("reg-1")!.paymentStatus).toBe("PENDING");
    });
  });
});

describe("결제요청 취소(settlement-cancel scope) — paymentId 해제", () => {
  it("PENDING(pending) 2건 — UNPAID·fee 0·paymentId 해제(null), Payment 벌크 cancelled", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "POSTPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "u1",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-1",
          calculatedFee: 10000,
          cancelledAt: null,
        },
        {
          id: "reg-2",
          userId: "u2",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-2",
          calculatedFee: 10000,
          cancelledAt: null,
        },
      ],
      payments: [
        { id: "pay-1", paymentStatus: "pending" },
        { id: "pay-2", paymentStatus: "pending" },
      ],
    });

    const res = await h.service.cancelTournamentSettlement(
      TOURNAMENT_ID,
      requester,
    );

    expect(res.revertedCount).toBe(2);
    for (const id of ["reg-1", "reg-2"]) {
      const reg = h.regs.get(id)!;
      expect(reg.paymentStatus).toBe("UNPAID");
      expect(Number(reg.calculatedFee)).toBe(0);
      expect(reg.paymentId).toBeNull(); // 결제요청 취소는 연결을 해제한다.
    }

    expect(h.tx.tournamentRegistration.updateMany).toHaveBeenCalledTimes(1);
    const regUpdateCall =
      h.tx.tournamentRegistration.updateMany.mock.calls[0][0];
    expect(regUpdateCall.data.paymentId).toBeNull();

    expect(h.tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(h.payments.get("pay-1")!.paymentStatus).toBe("cancelled");
    expect(h.payments.get("pay-2")!.paymentStatus).toBe("cancelled");
  });
});

describe("대회 취소 — 선불 참가", () => {
  it("PENDING 1건 — CANCELLED 전환 + cancelledAt 설정, paymentId 링크는 보존", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "PREPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "u1",
          childId: null,
          paymentStatus: "PENDING",
          paymentId: "pay-1",
          calculatedFee: 10000,
          cancelledAt: null,
        },
      ],
      payments: [{ id: "pay-1", paymentStatus: "pending" }],
    });

    await h.service.changeTournamentStatus(
      TOURNAMENT_ID,
      "cancelled",
      requester,
    );

    const reg = h.regs.get("reg-1")!;
    expect(reg.paymentStatus).toBe("CANCELLED");
    expect(reg.cancelledAt).toBeInstanceOf(Date);
    expect(reg.paymentId).toBe("pay-1"); // 링크 보존 — 고아 결제 자동 환불 식별용

    const cancelCall = h.tx.tournamentRegistration.updateMany.mock.calls.find(
      (call: any[]) => call[0].data.paymentStatus === "CANCELLED",
    );
    expect(cancelCall).toBeDefined();
    expect(Object.keys(cancelCall![0].data)).not.toContain("paymentId");

    expect(h.payments.get("pay-1")!.paymentStatus).toBe("cancelled");
  });
});

describe("대회 취소 — 사후 재검증", () => {
  it("전환 도중 PAID 가 나타나면 400 으로 롤백", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "PREPAID",
      registrations: [],
      paidCountSequence: [0, 1],
    });

    await expect(
      h.service.changeTournamentStatus(TOURNAMENT_ID, "cancelled", requester),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("changeTournamentStatus — 상태 경합", () => {
  it("판정 이후 상태가 바뀌면 ConflictException", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "PREPAID",
      registrations: [],
      forceStatusRace: true,
    });

    await expect(
      h.service.changeTournamentStatus(TOURNAMENT_ID, "ongoing", requester),
    ).rejects.toThrow(ConflictException);
  });
});

describe("대회 취소 — 알림 dedupe", () => {
  it("자녀 둘의 학부모가 1명이면 알림 1회, 한쪽만 철회여도 문구에 철회 포함", async () => {
    const h = buildHarness({
      status: "scheduled",
      billingMode: "POSTPAID",
      registrations: [
        {
          id: "reg-1",
          userId: "child-1-self",
          childId: "child-1",
          paymentStatus: "PENDING",
          paymentId: "pay-1",
          calculatedFee: 10000,
          cancelledAt: null,
        },
        {
          id: "reg-2",
          userId: "child-2-self",
          childId: "child-2",
          paymentStatus: "UNPAID",
          paymentId: null,
          calculatedFee: 0,
          cancelledAt: null,
        },
      ],
      payments: [{ id: "pay-1", paymentStatus: "pending" }],
      parentLinks: [
        { childId: "child-1", parentId: "parent-shared" },
        { childId: "child-2", parentId: "parent-shared" },
      ],
    });

    await h.service.changeTournamentStatus(
      TOURNAMENT_ID,
      "cancelled",
      requester,
    );

    expect(h.notifications.createNotification).toHaveBeenCalledTimes(1);
    const call = h.notifications.createNotification.mock.calls[0][0];
    expect(call.userId).toBe("parent-shared");
    expect(call.message).toContain("철회");
  });
});
