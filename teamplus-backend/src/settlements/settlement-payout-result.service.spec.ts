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
    settlementPayoutRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    settlement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    settlementDetail: { updateMany: jest.fn() },
    settlementTransaction: { create: jest.fn() },
    teamSettlementAccount: { findMany: jest.fn() },
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
      lastCheckedAt: Date | null;
      needsReview: boolean;
      amount: number;
      subMallId: string;
      settlementId: string;
      settlementStatus: string;
    }> = {},
  ) => ({
    id: overrides.id ?? "pr-1",
    settlementId: overrides.settlementId ?? "s-1",
    teamId: "team-1",
    teamName: "블리자드",
    settlementMonth: "2026-09",
    subMallId: overrides.subMallId ?? "SUB-1",
    settlementDate: SETTLEMENT_DATE,
    amount: overrides.amount ?? 500000,
    niceSeq: overrides.niceSeq === undefined ? "SEQ-1" : overrides.niceSeq,
    status: overrides.status ?? "REQUESTED",
    checkCount: overrides.checkCount ?? 0,
    needsReview: overrides.needsReview ?? false,
    requestedAt: overrides.requestedAt ?? new Date("2026-10-13T01:00:00.000Z"),
    lastCheckedAt: overrides.lastCheckedAt ?? null,
    bankName: "신한은행",
    bankAccount: "enc:cipher",
    accountHolder: "블리자드하키",
    settlement: {
      teamId: "team-1",
      status: overrides.settlementStatus ?? "processing",
    },
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
    mockPrisma.teamSettlementAccount.findMany.mockResolvedValue([]);
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
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "FAILED",
    });
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

  it("실패로 닫은 요청의 접수번호가 나이스에서 '재요청 진행중'으로 보이면 상태는 두고 확인 필요만 켠다", async () => {
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
      (c: [{ where: { id: string }; data: { needsReview?: boolean } }]) =>
        c[0].where.id === "failed" && c[0].data.needsReview === true,
    );
    // 운영자가 한 번 확인 완료한 요청(reviewedAt)은 다시 켜지 않는다 — 조건부 갱신으로 판정한다.
    expect(flag?.[0]).toEqual(
      expect.objectContaining({
        where: { id: "failed", needsReview: false },
        data: expect.objectContaining({
          needsReview: true,
          reviewReason: "REOPENED_IN_PROGRESS",
        }),
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
    const calls = mockPrisma.settlementPayoutRequest.updateMany.mock.calls;
    // 확인 기록(횟수)과 확인 필요 켜기는 같은 팀 lock 트랜잭션 안의 두 갱신이다.
    expect(calls[0][0].data).toEqual(
      expect.objectContaining({ checkCount: { increment: 1 } }),
    );
    expect(calls[1][0]).toEqual(
      expect.objectContaining({
        where: {
          id: "pr-1",
          needsReview: false,
          // 확인 완료한 요청은 같은 사유로만 다시 켜지 않는다.
          OR: [
            { reviewedAt: null },
            { reviewReason: null },
            { reviewReason: { not: expect.any(String) } },
          ],
        },
        data: expect.objectContaining({
          needsReview: true,
          reviewReason: "MATCH_AMBIGUOUS",
        }),
      }),
    );
    expect(calls[0][0].data.status).toBeUndefined();
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
  });

  it("목록에 없는 건은 지급일 당일에는 확인 기록만 남기고, 지급일 다음 날 0시 이후 조회에서 이미 한 번 없음을 본 뒤에야 NOT_FOUND 로 닫아 approved 복귀", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({
        checkCount: 5,
        // 지급일 다음 날 09:05(KST) 아침 대사에서 이미 한 번 없음을 봤다.
        lastCheckedAt: new Date("2026-10-16T00:05:00.000Z"),
      }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(niceResult([]));

    // 지급일 당일 — 확인 횟수와 무관하게 닫지 않는다(하루 8번 돌아도 당일엔 종결하지 않는다).
    const sameDay = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(sameDay.pending).toBe(1);
    expect(sameDay.notFound).toBe(0);
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();

    // 다음 날 — 지급일 다음 날 0시 이후에 본 기록이 있으므로 닫는다.
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

  it("지급일이 지났어도 지급일 다음 날 이후에 본 기록이 없으면(지급일 당일에만 봤거나 처음 봄) 닫지 않는다", async () => {
    setNow("2026-10-16T16:10:00+09:00");
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      // 지급일 당일 19:30(KST)까지 여러 번 봤지만 다음 날에는 아직 안 봤다.
      activeRequest({
        checkCount: 8,
        lastCheckedAt: new Date("2026-10-15T10:30:00.000Z"),
      }),
      activeRequest({ id: "pr-2", settlementId: "s-2", niceSeq: "SEQ-9" }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(niceResult([]));
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.notFound).toBe(0);
    expect(r.pending).toBe(2);
  });

  it("응답 미확인 정리(unconfirmedOnly) — UNCONFIRMED 만 보고 접수번호를 확보해 REQUESTED 로 올리되 확인 횟수·종결·실패 재맞춤·이상 감지는 하지 않는다", async () => {
    setNow("2026-10-13T09:05:00+09:00");
    mockPrisma.settlementPayoutRequest.findMany
      .mockResolvedValueOnce([{ settlementDate: SETTLEMENT_DATE }])
      .mockResolvedValueOnce([
        activeRequest({ id: "lost", status: "UNCONFIRMED", niceSeq: null }),
        activeRequest({
          id: "ok",
          status: "REQUESTED",
          niceSeq: "SEQ-2",
          amount: 777,
        }),
        activeRequest({
          id: "gone",
          status: "UNCONFIRMED",
          niceSeq: null,
          amount: 123,
          settlementId: "s-3",
        }),
        activeRequest({
          id: "failed",
          status: "FAILED",
          niceSeq: "SEQ-3",
          settlementStatus: "failed",
        }),
      ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([
        row("SEQ-1", "요청"),
        row("SEQ-2", "요청", null, 777),
        row("SEQ-3", "재요청 진행중"),
        row("SEQ-X", "성공", null, 999, "SUB-EXT"),
      ]),
    );
    await service.settleUnconfirmedRequests();
    const calls = mockPrisma.settlementPayoutRequest.updateMany.mock.calls;
    // 응답 유실 요청은 같은 서브몰·금액의 "요청" 행과 짝이 맞아 접수번호를 얻고 REQUESTED 가 된다. 확인 횟수는 올리지 않는다.
    const lost = calls.find(
      (c: [{ where: { id?: string } }]) => c[0].where.id === "lost",
    );
    expect(lost?.[0].data).toEqual(
      expect.objectContaining({ status: "REQUESTED", niceSeq: "SEQ-1" }),
    );
    expect(lost?.[0].data.checkCount).toBeUndefined();
    // 이미 접수된 요청과 실패로 닫은 요청은 건드리지 않는다.
    expect(
      calls.some((c: [{ where: { id?: string } }]) => c[0].where.id === "ok"),
    ).toBe(false);
    expect(
      calls.some(
        (c: [{ where: { id?: string } }]) => c[0].where.id === "failed",
      ),
    ).toBe(false);
    // 목록에 없는 응답 유실 요청은 종결하지도, 확인 기록을 남기지도 않는다.
    expect(
      calls.some((c: [{ where: { id?: string } }]) => c[0].where.id === "gone"),
    ).toBe(false);
    expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
    // 외부 지급처럼 보이는 행이 있어도 이 배치는 확인 필요를 켜지 않는다.
    expect(
      calls.some(
        (c: [{ data: { reviewReason?: string } }]) =>
          c[0].data.reviewReason !== undefined,
      ),
    ).toBe(false);
  });

  it("응답 미확인 정리 — 해당 요청이 없으면 나이스를 부르지 않는다", async () => {
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValueOnce([]);
    await service.settleUnconfirmedRequests();
    expect(mockPayoutApi.queryPayoutResults).not.toHaveBeenCalled();
  });

  it("나이스 '데이터 없음(1104)'은 어느 경로에서도 빈 목록이다 — 지급일 다음 날 이후에 본 기록이 있는 요청은 미접수로 닫힌다(수동 조회도 502 아님)", async () => {
    setNow("2026-10-16T16:10:00+09:00");
    mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
      activeRequest({ lastCheckedAt: new Date("2026-10-16T00:05:00.000Z") }),
    ]);
    mockPayoutApi.queryPayoutResults.mockResolvedValue({
      outcome: "TERMINAL",
      meta: {
        sid: "0101002",
        resCode: "1104",
        resMsg: "요청 데이터 없음",
        error: null,
      },
      totCnt: 0,
      succCnt: 0,
      failCnt: 0,
      remainAmt: null,
      rows: [],
    });
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.queried).toBe(true);
    expect(r.error).toBeNull();
    expect(r.notFound).toBe(1);
  });

  it("아침 대사 — 전 영업일은 우리 요청이 없어도 한 번 조회하고, 나이스가 '데이터 없음(1104)'이면 오류가 아니라 빈 목록으로 다룬다", async () => {
    // 2026-10-19(월) 09:05 — 전 영업일은 10-16(금).
    setNow("2026-10-19T09:05:00+09:00");
    mockPrisma.settlementPayoutRequest.findMany
      .mockResolvedValueOnce([]) // 끝나지 않은 요청·확인 필요 건 없음
      .mockResolvedValueOnce([]); // 10-16 요청 없음
    mockPayoutApi.queryPayoutResults.mockResolvedValue({
      outcome: "TERMINAL",
      meta: {
        sid: "0101002",
        resCode: "1104",
        resMsg: "요청 데이터 없음",
        error: null,
      },
      totCnt: 0,
      succCnt: 0,
      failCnt: 0,
      remainAmt: null,
      rows: [],
    });
    await service.reconcilePreviousBusinessDay();
    expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledTimes(1);
    expect(mockPayoutApi.queryPayoutResults.mock.calls[0][0]).toEqual({
      settlmntDt: "20261016",
    });
    expect(
      mockPrisma.settlementPayoutRequest.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("아침 대사 — 전 영업일에 우리 기록에 없는 접수번호가 보이면 외부 지급으로 세고(로그), 요청 행은 건드리지 않는다", async () => {
    setNow("2026-10-16T09:05:00+09:00");
    mockPrisma.settlementPayoutRequest.findMany
      .mockResolvedValueOnce([]) // 끝나지 않은 요청 없음
      .mockResolvedValueOnce([]) // 10-15 요청 없음(check 안)
      .mockResolvedValueOnce([]); // 대조용 재조회
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-EXT", "성공", null, 300000, "SUB-9")]),
    );
    await service.reconcilePreviousBusinessDay();
    expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledWith(
      { settlmntDt: "20261015" },
      { requestedBy: null },
    );
    expect(
      mockPrisma.settlementPayoutRequest.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("대조 — 접수번호는 우리 것인데 나이스 금액이 다르면 그 요청에 금액 불일치 확인 필요를 켠다(팀 lock 안, 이미 확인 완료한 요청은 제외)", async () => {
    mockPrisma.settlementPayoutRequest.findMany
      .mockResolvedValueOnce([activeRequest({ amount: 500000 })]) // check 안
      .mockResolvedValueOnce([
        {
          ...activeRequest({ amount: 500000 }),
          settlement: { teamId: "team-1" },
        },
      ]); // 대조용 재조회
    mockPayoutApi.queryPayoutResults.mockResolvedValue(
      niceResult([row("SEQ-1", "성공", null, 400000)]),
    );
    const r = await service.checkByAdmin(PAY_DATE, "admin-1");
    expect(r.succeeded).toBe(1);
    expect(r.needsReview).toBe(1);
    const flag = mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
      (c: [{ data: { reviewReason?: string } }]) =>
        c[0].data.reviewReason === "AMOUNT_MISMATCH",
    );
    expect(flag?.[0]).toEqual(
      expect.objectContaining({
        where: {
          id: "pr-1",
          needsReview: false,
          // 확인 완료한 요청은 같은 사유로만 다시 켜지 않는다.
          OR: [
            { reviewedAt: null },
            { reviewReason: null },
            { reviewReason: { not: expect.any(String) } },
          ],
        },
        data: expect.objectContaining({ needsReview: true }),
      }),
    );
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

  describe("실패로 닫은 건 다시 맞추기(나이스 화면 재요청)", () => {
    const failedClosed = (settlementStatus = "failed") =>
      activeRequest({
        id: "failed",
        status: "FAILED",
        niceSeq: "SEQ-1",
        settlementStatus,
      });
    const live = () =>
      activeRequest({
        id: "live",
        status: "REQUESTED",
        niceSeq: "SEQ-2",
        settlementId: "s-2",
      });

    it("'성공'으로 바뀌었으면 요청 SUCCEEDED, 정산 failed → paid, 거래 기록은 '재요청' 표기", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
        live(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "성공"), row("SEQ-2", "요청")]),
      );
      const r = await service.checkByAdmin(PAY_DATE, "admin-1");
      expect(r.succeeded).toBe(1);
      expect(r.pending).toBe(1);
      const close =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
          (c: [{ where: { id: string } }]) => c[0].where.id === "failed",
        );
      expect(close?.[0]).toEqual(
        expect.objectContaining({
          where: { id: "failed", status: "FAILED" },
          data: expect.objectContaining({
            status: "SUCCEEDED",
            needsReview: false,
            errReason: null,
          }),
        }),
      );
      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "s-1",
            status: { in: ["failed", "approved"] },
          }),
          data: expect.objectContaining({
            status: "paid",
            bankName: "신한은행",
            bankAccount: "enc:cipher",
          }),
        }),
      );
      expect(
        mockPrisma.settlementTransaction.create.mock.calls[0][0].data
          .description,
      ).toContain("재요청");
      // 정산을 먼저 닫고 요청을 SUCCEEDED 로 바꾼다 — 닫지 못하면 요청은 FAILED 로 남아 차단이 유지된다.
      const requestMock = mockPrisma.settlementPayoutRequest.updateMany.mock;
      const closeIdx = requestMock.calls.findIndex(
        (c: [{ where: { id: string } }]) => c[0].where.id === "failed",
      );
      expect(
        mockPrisma.settlement.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(requestMock.invocationCallOrder[closeIdx]);
    });

    it("'성공'이고 정산이 approved 로 돌아와 있으면(팀플러스 재요청이 삭제·미접수로 복귀) 그 돈으로 정산을 닫는다", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed("approved"),
        live(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "성공"), row("SEQ-2", "요청")]),
      );
      const r = await service.checkByAdmin(PAY_DATE, "admin-1");
      expect(r.succeeded).toBe(1);
      expect(mockPrisma.settlementTransaction.create).toHaveBeenCalledTimes(1);
    });

    it("'성공'인데 정산이 이미 failed 가 아니면(이중 지급 의심) paid 로 바꾸지 않고, 그 요청 행과 진행 중 요청에 확인 표시를 남기며 확인 필요로 집계한다", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed("processing"),
        live(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "성공"), row("SEQ-2", "요청")]),
      );
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      const r = await service.checkByAdmin(PAY_DATE, "admin-1");
      expect(r.succeeded).toBe(0);
      expect(r.needsReview).toBe(1);
      expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
      const calls = mockPrisma.settlementPayoutRequest.updateMany.mock.calls;
      // 종결된 옛 요청 행에 표시와 사유를 남긴다 — 다른 경로가 지우지 않아 상세 이력에 남는다.
      const markOld = calls.find(
        (
          c: [{ where: { id?: string }; data: { errReason?: string | null } }],
        ) =>
          c[0].where.id === "failed" && typeof c[0].data.errReason === "string",
      );
      expect(markOld?.[0]).toEqual(
        expect.objectContaining({
          // 요청은 FAILED 로 둔다 — needsReview 차단(지급 요청·수동 완료)이 살아 있어야
          //   정산이 나중에 failed·approved 로 돌아와도 다시 지급할 수 없다.
          where: { id: "failed", status: "FAILED" },
          data: expect.objectContaining({
            needsReview: true,
            errReason: expect.stringContaining("이중 지급"),
            reviewedAt: null,
            reviewedById: null,
            reviewMemo: null,
          }),
        }),
      );
      expect(
        calls.some(
          (c: [{ where: { id?: string }; data: { status?: string } }]) =>
            c[0].where.id === "failed" && c[0].data.status === "SUCCEEDED",
        ),
      ).toBe(false);
      const flagActive = calls.find(
        (c: [{ where: { settlementId?: string } }]) =>
          c[0].where.settlementId === "s-1",
      );
      expect(flagActive?.[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            settlementId: "s-1",
            needsReview: false,
            reviewedAt: null,
          }),
          data: { needsReview: true, reviewReason: "REOPENED_DUPLICATE" },
        }),
      );
    });

    it("지급 전 가드(verifyFailedForRetry)는 실패 건만 다시 맞추고 같은 지급일의 진행 중 요청은 건드리지 않는다", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
        live(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "재요청 진행중"), row("SEQ-2", "요청")]),
      );
      const v = await service.verifyFailedForRetry(PAY_DATE, "admin-1");
      expect(v.verified).toBe(true);
      const touchedLive =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.some(
          (c: [{ where: { id?: string } }]) => c[0].where.id === "live",
        );
      expect(touchedLive).toBe(false);
      expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it("verifyFailedForRetry — 예기치 않은 오류는 ERROR 로 돌려주고 던지지 않는다(일괄 요청의 다른 건을 막지 않음)", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockRejectedValueOnce(
        new Error("db down"),
      );
      await expect(
        service.verifyFailedForRetry(PAY_DATE, "admin-1"),
      ).resolves.toEqual({ verified: false, reason: "ERROR" });
      expect(mockRedis.releaseLock).toHaveBeenCalled();
    });

    it("운영자 [결과 조회]는 실패 건만 남은 지급일도 나이스에 조회한다(켜 둔 확인 표시를 풀 수 있는 길)", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "실패", "잔액 부족")]),
      );
      const r = await service.checkByAdmin(PAY_DATE, "admin-1");
      expect(r.queried).toBe(true);
      expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledTimes(1);
    });

    it("verifyFailedSettlements — 실패 정산의 실패 건 지급일을 모아 날짜별로 한 번씩 확인하고, 확인 못 한 날짜의 정산 id 를 돌려준다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([
        { id: "s-1", payoutRequests: [{ settlementDate: SETTLEMENT_DATE }] },
        { id: "s-2", payoutRequests: [{ settlementDate: SETTLEMENT_DATE }] },
      ]);
      mockRedis.setIfNotExists.mockResolvedValue(false);
      const unverified = await service.verifyFailedSettlements(
        ["s-1", "s-2", "s-3"],
        "admin-1",
      );
      expect([...unverified].sort()).toEqual(["s-1", "s-2"]);
      // 같은 지급일은 한 번만 조회한다.
      expect(mockRedis.setIfNotExists).toHaveBeenCalledTimes(1);
    });

    it("다시 '실패' 또는 '삭제'로 보이면 켜 둔 확인 표시를 끈다(다시 요청할 수 있다)", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
        live(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "삭제"), row("SEQ-2", "요청")]),
      );
      const r = await service.checkByAdmin(PAY_DATE, "admin-1");
      expect(r.needsReview).toBe(0);
      const clear =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
          (c: [{ where: { id: string } }]) => c[0].where.id === "failed",
        );
      // "재진행"으로 켰던 표시(또는 사유가 비어 있던 옛 표시)만 끈다 — 금액 불일치·이중 지급 의심은 운영자 확인 완료로만 푼다.
      expect(clear?.[0]).toEqual(
        expect.objectContaining({
          where: {
            id: "failed",
            status: "FAILED",
            needsReview: true,
            OR: [
              { reviewReason: "REOPENED_IN_PROGRESS" },
              { reviewReason: null },
            ],
          },
          data: expect.objectContaining({ needsReview: false }),
        }),
      );
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it("확인 완료한 요청도 실패 건의 나이스 재진행(REOPENED_IN_PROGRESS)이면 다시 켜고 지난 확인 기록을 비운다 — 다른 사유는 같은 사유일 때만 막는다", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
        live(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "재요청 진행중"), row("SEQ-2", "요청")]),
      );
      await service.checkByAdmin(PAY_DATE, "admin-1");
      const reopen =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
          (c: [{ where: { id: string }; data: { reviewReason?: string } }]) =>
            c[0].where.id === "failed" &&
            c[0].data.reviewReason === "REOPENED_IN_PROGRESS",
        );
      expect(reopen?.[0]).toEqual({
        where: { id: "failed", needsReview: false },
        data: expect.objectContaining({
          needsReview: true,
          reviewedAt: null,
          reviewedById: null,
          reviewMemo: null,
        }),
      });
    });

    it("verifyFailedForRetry — 진행 중 요청이 없어도 실패 건(접수번호 있음·정산 failed)이 있으면 나이스를 조회하고 verified", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "재요청 진행중")]),
      );
      const v = await service.verifyFailedForRetry(PAY_DATE, "admin-1");
      expect(v).toEqual({ verified: true, reason: null });
      expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledTimes(1);
      const flag =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
          (c: [{ where: { id: string }; data: { needsReview?: boolean } }]) =>
            c[0].where.id === "failed" && c[0].data.needsReview === true,
        );
      expect(flag?.[0].data).toEqual(
        expect.objectContaining({ needsReview: true }),
      );
      const [lockKey, lockToken] = mockRedis.setIfNotExists.mock.calls[0];
      expect(mockRedis.releaseLock).toHaveBeenCalledWith(lockKey, lockToken);
    });

    it("completeReview — 확인 필요가 켜진 요청을 메모·처리자와 함께 끄고(팀 lock 안), 같은 정산에 남은 건수를 돌려준다. 켜져 있지 않으면 409", async () => {
      mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
        id: "pr-1",
        settlementId: "s-1",
        settlement: { teamId: "team-1" },
      });
      mockPrisma.settlementPayoutRequest.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      mockPrisma.settlementPayoutRequest.count = jest.fn().mockResolvedValue(0);
      const r = await service.completeReview("pr-1", "admin-1", "대조 완료");
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(
        mockPrisma.settlementPayoutRequest.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: "pr-1", needsReview: true },
        data: expect.objectContaining({
          needsReview: false,
          reviewedById: "admin-1",
          reviewMemo: "대조 완료",
          reviewedAt: expect.any(Date),
        }),
      });
      expect(r).toEqual(
        expect.objectContaining({
          id: "pr-1",
          settlementId: "s-1",
          reviewedById: "admin-1",
          openLeft: 0,
        }),
      );

      mockPrisma.settlementPayoutRequest.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      await expect(
        service.completeReview("pr-1", "admin-1", "다시"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: "PAYOUT_REVIEW_NOT_OPEN",
        }),
      });

      mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.completeReview("pr-x", "admin-1", "메모"),
      ).rejects.toThrow("지급 요청을 찾을 수 없습니다.");
    });

    it("verifyFailedSettlements — 실패 뒤 approved 로 되돌아간 정산도 대상이다(옛 실패 건이 남아 있다)", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      await service.verifyFailedSettlements(["s-1"], "admin-1");
      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["failed", "approved"] },
          }),
        }),
      );
    });

    it("verifyFailedForRetry — 정산이 approved 로 돌아온 실패 건(접수번호 있음)도 나이스를 조회해 다시 맞춘다", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed("approved"),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "재요청 진행중")]),
      );
      const v = await service.verifyFailedForRetry(PAY_DATE, "admin-1");
      expect(v).toEqual({ verified: true, reason: null });
      expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledTimes(1);
      const flag =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
          (c: [{ where: { id: string }; data: { needsReview?: boolean } }]) =>
            c[0].where.id === "failed" && c[0].data.needsReview === true,
        );
      expect(flag?.[0].data).toEqual(
        expect.objectContaining({ needsReview: true }),
      );
    });

    it("이중 지급으로 이미 기록한 요청은 다음 조회에서 다시 켜거나 세지 않는다(확인 시각만 갱신)", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed("paid"),
        live(),
      ]);
      // 사유가 이미 재요청 중복으로 적혀 있다(운영자가 확인 완료했을 수도 있다).
      mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
        status: "FAILED",
        reviewReason: "REOPENED_DUPLICATE",
      });
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "성공"), row("SEQ-2", "요청")]),
      );
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      const r = await service.checkByAdmin(PAY_DATE, "admin-1");
      expect(r.needsReview).toBe(0);
      expect(r.succeeded).toBe(0);
      const calls = mockPrisma.settlementPayoutRequest.updateMany.mock.calls;
      expect(
        calls.some(
          (c: [{ where: { id?: string }; data: { needsReview?: boolean } }]) =>
            c[0].where.id === "failed" && c[0].data.needsReview === true,
        ),
      ).toBe(false);
      expect(
        calls.some(
          (c: [{ where: { settlementId?: string } }]) =>
            c[0].where.settlementId === "s-1",
        ),
      ).toBe(false);
      const touch = calls.find(
        (c: [{ where: { id?: string } }]) => c[0].where.id === "failed",
      );
      expect(touch?.[0].data).toEqual(
        expect.objectContaining({ lastCheckedAt: expect.any(Date) }),
      );
    });

    it("verifyFailedForRetry — 정산이 더는 failed 가 아닌 실패 건만 있으면 나이스를 부르지 않고 verified(확인할 것이 없음)", async () => {
      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed("paid"),
      ]);
      const v = await service.verifyFailedForRetry(PAY_DATE, "admin-1");
      expect(v).toEqual({ verified: true, reason: null });
      expect(mockPayoutApi.queryPayoutResults).not.toHaveBeenCalled();
    });

    it("verifyFailedForRetry — 같은 지급일을 조회 중이면 IN_PROGRESS, 나이스 오류면 NICE_ERROR(둘 다 verified=false, 던지지 않음)", async () => {
      mockRedis.setIfNotExists.mockResolvedValueOnce(false);
      await expect(
        service.verifyFailedForRetry(PAY_DATE, "admin-1"),
      ).resolves.toEqual({ verified: false, reason: "IN_PROGRESS" });

      mockPrisma.settlementPayoutRequest.findMany.mockResolvedValue([
        failedClosed(),
      ]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue({
        outcome: "ERROR",
        meta: { sid: "0101002", resCode: null, resMsg: null, error: "timeout" },
        totCnt: 0,
        succCnt: 0,
        failCnt: 0,
        remainAmt: null,
        rows: [],
      });
      await expect(
        service.verifyFailedForRetry(PAY_DATE, "admin-1"),
      ).resolves.toEqual({ verified: false, reason: "NICE_ERROR" });
      expect(mockRedis.releaseLock).toHaveBeenCalled();
    });

    it("결과 배치(cron)도 실패로 닫은 건을 다시 맞춘다 — 확인 필요가 켜진 실패 건만 남은 지급일을 나이스에 묻는다", async () => {
      mockPrisma.settlementPayoutRequest.findMany
        .mockResolvedValueOnce([{ settlementDate: SETTLEMENT_DATE }])
        .mockResolvedValueOnce(
          [
            failedClosed("paid"),
            // 정산은 끝났지만 확인 표시가 남아 있다 — 풀어 줄 길은 다시 조회하는 것뿐이다.
          ].map((r) => ({ ...r, needsReview: true })),
        )
        .mockResolvedValueOnce([]);
      mockPayoutApi.queryPayoutResults.mockResolvedValue(
        niceResult([row("SEQ-1", "실패")]),
      );
      await service.checkDueRequests();
      expect(mockPayoutApi.queryPayoutResults).toHaveBeenCalledTimes(1);
      const clear =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls.find(
          (c: [{ where: { id: string } }]) => c[0].where.id === "failed",
        );
      expect(clear?.[0].data).toEqual(
        expect.objectContaining({ needsReview: false }),
      );
    });
  });
});
