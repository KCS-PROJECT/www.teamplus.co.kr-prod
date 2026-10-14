import { Test, TestingModule } from "@nestjs/testing";
import { BadGatewayException, ConflictException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { SettlementPayoutResultService } from "./settlement-payout-result.service";
import { NicePayoutApiService } from "./nice-payout-api.service";
import type { NicePayoutResultRow } from "./gateway/nice-payout.types";

describe("SettlementPayoutResultService", () => {
  let service: SettlementPayoutResultService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    settlementPayoutRequest: { findMany: jest.fn(), updateMany: jest.fn() },
    settlement: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    settlementDetail: { updateMany: jest.fn() },
    settlementTransaction: { create: jest.fn() },
    appSettings: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setIfNotExists: jest.fn(),
    releaseLock: jest.fn(),
  };
  const mockPayoutApi = { queryPayoutResults: jest.fn() };

  const PAY_DATE = "2026-10-15";
  const SETTLEMENT_DATE = new Date("2026-10-15T00:00:00.000Z");

  const activeRequest = (
    overrides: Partial<{
      id: string;
      status: string;
      niceSeq: string | null;
      checkCount: number;
      requestedAt: Date;
      amount: number;
      subMallId: string;
    }> = {},
  ) => ({
    id: overrides.id ?? "pr-1",
    settlementId: "s-1",
    teamId: "team-1",
    subMallId: overrides.subMallId ?? "SUB-1",
    amount: overrides.amount ?? 500000,
    niceSeq: overrides.niceSeq === undefined ? "SEQ-1" : overrides.niceSeq,
    status: overrides.status ?? "REQUESTED",
    checkCount: overrides.checkCount ?? 0,
    requestedAt: overrides.requestedAt ?? new Date("2026-10-13T01:00:00.000Z"),
    bankName: "신한은행",
    bankAccount: "enc:cipher",
    accountHolder: "블리자드하키",
    settlement: { teamId: "team-1" },
  });

  const row = (
    seq: string | null,
    statusNm: string,
    errReason: string | null = null,
    amount = 500000,
    subId = "SUB-1",
  ): NicePayoutResultRow => ({
    seq,
    subId,
    statusNm,
    settlmntAmt: amount,
    errReason,
  });

  const niceResult = (rows: NicePayoutResultRow[]) => ({
    outcome: "SUCCESS",
    meta: { sid: "0101002", resCode: "0000", resMsg: "", error: null },
    totCnt: rows.length,
    succCnt: rows.filter((r) => r.statusNm === "성공").length,
    failCnt: rows.filter((r) => r.statusNm === "실패").length,
    remainAmt: 99,
    rows,
  });

  const setNow = (iso: string) =>
    jest.spyOn(Date, "now").mockReturnValue(new Date(iso).getTime());

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementPayoutResultService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: NicePayoutApiService, useValue: mockPayoutApi },
      ],
    }).compile();
    service = module.get(SettlementPayoutResultService);

    jest.clearAllMocks();
    // KST 2026-10-15 16:10 — 지급일 당일 결과 조회 시각.
    setNow("2026-10-15T16:10:00+09:00");
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setIfNotExists.mockResolvedValue(true);
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      payoutApiMode: "live",
    });
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.$queryRaw.mockResolvedValue(undefined);
    mockPrisma.settlementPayoutRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
      netAmount: 500000,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("off 모드면 409 PAYOUT_API_OFF, 나이스를 부르지 않는다", async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      payoutApiMode: "off",
    });
    await expect(service.checkByAdmin(PAY_DATE, "admin-1")).rejects.toThrow(
      ConflictException,
    );
    expect(mockPayoutApi.queryPayoutResults).not.toHaveBeenCalled();
  });

  it("같은 지급일을 이미 조회 중이면 409 PAYOUT_CHECK_IN_PROGRESS", async () => {
    mockRedis.setIfNotExists.mockResolvedValue(false);
    await expect(
      service.checkByAdmin(PAY_DATE, "admin-1"),
    ).rejects.toMatchObject({
      response: { errorCode: "PAYOUT_CHECK_IN_PROGRESS" },
    });
    expect(mockRedis.setIfNotExists).toHaveBeenCalledWith(
      "settlement:payout-check:20261015",
      expect.stringMatching(/^admin-1:/),
      120,
    );
    expect(mockRedis.releaseLock).not.toHaveBeenCalled();
  });

  it("진행 중 요청이 없으면 나이스를 부르지 않고 queried=false, 락은 푼다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([]);
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.queried).toBe(false);
    expect(mockPayoutApi.queryPayoutResults).not.toHaveBeenCalled();
    const [lockKey, lockToken] = mockRedis.setIfNotExists.mock.calls[0];
    expect(lockKey).toBe("settlement:payout-check:20261015");
    // 우리가 잡은 토큰으로만 푼다 — TTL 이 지나 다른 실행이 잡은 락을 지우지 않는다.
    expect(mockRedis.releaseLock).toHaveBeenCalledWith(lockKey, lockToken);
  });

  it("이미 닫힌 요청의 접수번호는 응답 유실 요청의 후보에서 뺀다 — 다른 요청의 결과를 가져다 붙이지 않는다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ id: "done", status: "SUCCEEDED", niceSeq: "SEQ-1" }),
      activeRequest({ id: "lost", status: "UNCONFIRMED", niceSeq: null }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-1", "성공")]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.checked).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(r.pending).toBe(1);
    expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
    const updates =
      mockPrisma.settlementPayoutRequest.updateMany.mock.calls.map(
        (c: [{ where: { id: string } }]) => c[0],
      );
    expect(
      updates.every((u: { where: { id: string } }) => u.where.id === "lost"),
    ).toBe(true);
  });

  it("60초가 안 된 REQUESTING 요청은 조회하지 않지만 같은 서브몰·금액의 응답 유실 요청과 경쟁자로 세어 자동 확정을 막는다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({
        id: "young",
        status: "REQUESTING",
        niceSeq: null,
        requestedAt: new Date(Date.now() - 5_000),
      }),
      activeRequest({ id: "lost", status: "UNCONFIRMED", niceSeq: null }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-9", "성공")]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.checked).toBe(1);
    expect(r.needsReview).toBe(1);
    expect(r.succeeded).toBe(0);
  });

  it("실패로 닫은 요청의 접수번호가 나이스에서 '재요청 진행중'·'성공'으로 바뀌면 상태는 두고 확인 필요만 켠다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ id: "failed", status: "FAILED", niceSeq: "SEQ-1" }),
      activeRequest({ id: "live", status: "REQUESTED", niceSeq: "SEQ-2" }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-1", "재요청 진행중"), row("SEQ-2", "요청")]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.checked).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.needsReview).toBe(1);
    const flag = mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
      (c: [{ where: { id: string } }]) => c[0].where.id === "failed",
    );
    expect(flag?.[0]).toEqual(
      expect.objectContaining({
        where: { id: "failed", status: "FAILED", needsReview: false },
        data: expect.objectContaining({ needsReview: true }),
      }),
    );
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
  });

  it("REQUESTING 은 60초가 지난 것만 응답 유실로 보고 조회 대상에 넣는다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({
        id: "young",
        status: "REQUESTING",
        niceSeq: null,
        requestedAt: new Date(Date.now() - 5_000),
      }),
    ]);
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.queried).toBe(false);

    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({
        id: "stale",
        status: "REQUESTING",
        niceSeq: null,
        requestedAt: new Date(Date.now() - 120_000),
      }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(niceResult([]));
    const r2 = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r2.queried).toBe(true);
    expect(r2.pending).toBe(1);
  });

  it("'성공' → 요청 SUCCEEDED, 정산 processing → paid + 요청 행의 계좌 스냅샷 + 명세 PAID + 거래 기록", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest(),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-1", "성공")]),
    );

    const r = await service.checkByAdmin(PAY_DATE, "admin-1");

    expect(r).toEqual(
      expect.objectContaining({
        queried: true,
        checked: 1,
        succeeded: 1,
        remainAmt: 99,
      }),
    );
    expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledWith(
      { settlmntDt: "20261015" },
      { requestedBy: "admin-1" },
    );
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    const req = mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
    expect(req.where).toEqual({
      id: "pr-1",
      status: { in: ["REQUESTING", "REQUESTED", "UNCONFIRMED"] },
    });
    expect(req.data).toEqual(
      expect.objectContaining({
        status: "SUCCEEDED",
        niceSeq: "SEQ-1",
        niceStatusNm: "성공",
      }),
    );
    const paid = mockPrisma.settlement.updateMany.mock.calls[0][0];
    expect(paid.where).toEqual({ id: "s-1", status: { in: ["processing"] } });
    expect(paid.data).toEqual(
      expect.objectContaining({
        status: "paid",
        bankName: "신한은행",
        bankAccount: "enc:cipher",
        accountHolder: "블리자드하키",
      }),
    );
    expect(mockPrisma.settlementDetail.updateMany).toHaveBeenCalledWith({
      where: { settlementId: "s-1" },
      data: { status: "PAID" },
    });
    const tx = mockPrisma.settlementTransaction.create.mock.calls[0][0].data;
    expect(tx).toEqual(
      expect.objectContaining({
        settlementId: "s-1",
        transactionType: "payout",
        amount: 500000,
      }),
    );
    expect(tx.description).toContain("SEQ-1");
  });

  it("'실패' → 요청 FAILED(사유는 요청 행에만), 정산 processing → failed", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest(),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-1", "실패", "잔액부족")]),
    );

    const r = await service.checkByAdmin(PAY_DATE, "admin-1");

    expect(r.failed).toBe(1);
    const req = mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
    expect(req.data).toEqual(
      expect.objectContaining({ status: "FAILED", errReason: "잔액부족" }),
    );
    const settle = mockPrisma.settlement.updateMany.mock.calls[0][0];
    expect(settle).toEqual({
      where: { id: "s-1", status: "processing" },
      data: { status: "failed" },
    });
    expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
  });

  it("'삭제' → 요청 CANCELLED, 정산 approved 복귀", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest(),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-1", "삭제")]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.cancelled).toBe(1);
    expect(mockPrisma.settlement.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "s-1", status: "processing" },
      data: { status: "approved" },
    });
  });

  it("'요청' 은 확인 횟수만 올리고 정산은 건드리지 않는다. 접수번호 없던 요청은 접수번호를 알게 되면 REQUESTED 로 올린다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ status: "UNCONFIRMED", niceSeq: null }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-7", "요청")]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.pending).toBe(1);
    const req = mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
    expect(req.data).toEqual(
      expect.objectContaining({
        status: "REQUESTED",
        niceSeq: "SEQ-7",
        checkCount: { increment: 1 },
      }),
    );
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
  });

  it("같은 서브몰·금액 결과가 2건이면 자동 확정하지 않고 확인 필요만 켠다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ status: "UNCONFIRMED", niceSeq: null }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("A", "성공"), row("B", "성공")]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.needsReview).toBe(1);
    const req = mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
    expect(req.data).toEqual(
      expect.objectContaining({
        needsReview: true,
        checkCount: { increment: 1 },
      }),
    );
    expect(req.data.status).toBeUndefined();
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
  });

  it("목록에 없는 건은 지급일 당일에는 확인 횟수만 올리고, 지급일이 지나고 두 번째 확인부터 NOT_FOUND 로 닫아 approved 복귀", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ checkCount: 1 }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(niceResult([]));

    // 지급일 당일 — 아직 닫지 않는다.
    const sameDay = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(sameDay.pending).toBe(1);
    expect(sameDay.notFound).toBe(0);
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();

    // 다음 날, checkCount 1 → 2.
    setNow("2026-10-16T16:10:00+09:00");
    const nextDay = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(nextDay.notFound).toBe(1);
    const req = mockPrisma.settlementPayoutRequest.updateMany.mock.calls[1][0];
    expect(req.data).toEqual(expect.objectContaining({ status: "NOT_FOUND" }));
    expect(mockPrisma.settlement.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "s-1", status: "processing" },
      data: { status: "approved" },
    });
  });

  it("지급일이 지났어도 첫 확인(checkCount 0)에서는 닫지 않는다", async () => {
    setNow("2026-10-16T16:10:00+09:00");
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ checkCount: 0 }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(niceResult([]));
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.notFound).toBe(0);
    expect(r.pending).toBe(1);
  });

  it("나이스 조회 오류 — 운영자 버튼은 502, 자동 조회는 던지지 않고 기록만 남긴다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest(),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue({
      outcome: "AMBIGUOUS",
      meta: { sid: "0101002", resCode: null, resMsg: null, error: "timeout" },
      totCnt: null,
      succCnt: null,
      failCnt: null,
      remainAmt: null,
      rows: [],
    });
    await expect(service.checkByAdmin(PAY_DATE, "admin-1")).rejects.toThrow(
      BadGatewayException,
    );
    expect(mockRedis.releaseLock).toHaveBeenCalled();

    // 자동 조회: 진행 중 요청의 지급일을 모아 하나씩 조회한다.
    mockPrisma.settlementPayoutRequest.findMany
      .mockResolvedValueOnce([{ settlementDate: SETTLEMENT_DATE }])
      .mockResolvedValueOnce([activeRequest()]);
    await expect(service.checkDueRequests()).resolves.toBeUndefined();
    expect(
      mockPrisma.settlementPayoutRequest.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("자동 조회는 off 모드면 아무것도 하지 않는다", async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      payoutApiMode: "off",
    });
    await service.checkDueRequests();
    expect(mockPrisma.settlementPayoutRequest.findMany).not.toHaveBeenCalled();
  });
});
