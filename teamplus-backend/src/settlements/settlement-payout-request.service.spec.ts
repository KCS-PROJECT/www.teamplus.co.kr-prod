import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { encryptField } from "@/common/utils/field-encryption.util";
import {
  SettlementPayoutRequestService,
  buildAccntDesc,
} from "./settlement-payout-request.service";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { TeamSettlementAccountService } from "./team-settlement-account.service";

process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ?? randomBytes(32).toString("hex");

const PLAIN_ACCOUNT = "11012345678901";
const CIPHER_ACCOUNT = encryptField(PLAIN_ACCOUNT);
const ACCOUNT_UPDATED_AT = new Date("2026-09-29T01:00:00.000Z");

describe("SettlementPayoutRequestService", () => {
  let service: SettlementPayoutRequestService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    settlement: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    settlementPayoutRequest: { create: jest.fn(), updateMany: jest.fn() },
    appSettings: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const mockRedis = { get: jest.fn(), set: jest.fn() };
  const mockPayoutApi = { getBalance: jest.fn(), requestPayout: jest.fn() };
  const mockAccountService = { loadBankNames: jest.fn() };

  const target = (
    overrides: Partial<{
      status: string;
      netAmount: number;
      accountStatus: string;
      subMallId: string | null;
      registrationStartedAt: Date | null;
      account: null;
    }> = {},
  ) => ({
    id: "s-1",
    teamId: "team-1",
    settlementMonth: "2026-07",
    status: overrides.status ?? "approved",
    netAmount: overrides.netAmount ?? 1849430,
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    team: {
      id: "team-1",
      name: "블리자드",
      settlementAccount:
        overrides.account === null
          ? null
          : {
              status: overrides.accountStatus ?? "REGISTERED",
              subMallId:
                overrides.subMallId === undefined
                  ? "SUB-1"
                  : overrides.subMallId,
              bankCode: "088",
              bankAccount: CIPHER_ACCOUNT,
              accountHolder: "블리자드하키",
              updatedAt: ACCOUNT_UPDATED_AT,
              registrationStartedAt: overrides.registrationStartedAt ?? null,
            },
    },
  });

  const requestDto = (settlementId = "s-1") => ({
    payDate: "2026-10-15",
    items: [
      {
        settlementId,
        expectedAccountUpdatedAt: ACCOUNT_UPDATED_AT.toISOString(),
      },
    ],
  });

  const setMode = (mode: string) =>
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      payoutApiMode: mode,
      payoutDayOfMonth: 15,
    });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementPayoutRequestService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: NicePayoutApiService, useValue: mockPayoutApi },
        { provide: TeamSettlementAccountService, useValue: mockAccountService },
      ],
    }).compile();
    service = module.get(SettlementPayoutRequestService);

    jest.clearAllMocks();
    // KST 2026-10-13(화) 09:00 — 지급일 10-15(목)은 유효.
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-10-13T09:00:00+09:00").getTime());
    mockRedis.get.mockResolvedValue(null);
    setMode("live");
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.$queryRaw.mockResolvedValue(undefined);
    mockAccountService.loadBankNames.mockResolvedValue(
      new Map([["088", "신한은행"]]),
    );
    mockPrisma.settlement.findUnique.mockResolvedValue(target());
    mockPrisma.settlementPayoutRequest.create.mockResolvedValue({ id: "pr-1" });
    mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.settlementPayoutRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPayoutApi.getBalance.mockResolvedValue({
      outcome: "SUCCESS",
      remainAmt: 5_000_000,
      meta: { sid: "0101001", resCode: "0000" },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("accntDesc 는 '팀플러스 N월 정산'", () => {
    expect(buildAccntDesc("2026-07")).toBe("팀플러스 7월 정산");
    expect(buildAccntDesc("2026-11")).toBe("팀플러스 11월 정산");
  });

  describe("getDefaults", () => {
    it("모드·설정 N일·계산한 기본 지급일을 돌려준다", async () => {
      const r = await service.getDefaults();
      expect(r).toEqual({
        mode: "live",
        payoutDayOfMonth: 15,
        defaultPayDate: "2026-10-15",
        maxItems: 10,
      });
    });
  });

  describe("request", () => {
    it("접수 성공 — 요청 행(REQUESTING)을 만들고 정산을 processing 으로 잡은 뒤 나이스를 부르고 REQUESTED 로 반영한다", async () => {
      mockPayoutApi.requestPayout.mockResolvedValue({
        outcome: "SUCCESS",
        seq: "SEQ-1",
        meta: { sid: "0102001", resCode: "0000", resMsg: "", error: null },
      });

      const r = await service.request(requestDto(), "admin-1");

      expect(r.summary).toEqual({
        requested: 1,
        unconfirmed: 0,
        rejected: 0,
        skipped: 0,
        errored: 0,
      });
      expect(r.results[0]).toEqual(
        expect.objectContaining({
          settlementId: "s-1",
          outcome: "REQUESTED",
          requestId: "pr-1",
          niceSeq: "SEQ-1",
        }),
      );

      // 팀 lock 을 트랜잭션 선두에서 잡는다.
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const created =
        mockPrisma.settlementPayoutRequest.create.mock.calls[0][0].data;
      expect(created).toEqual(
        expect.objectContaining({
          settlementId: "s-1",
          teamId: "team-1",
          teamName: "블리자드",
          settlementMonth: "2026-07",
          subMallId: "SUB-1",
          settlementDate: new Date("2026-10-15T00:00:00.000Z"),
          amount: 1849430,
          accntDesc: "팀플러스 7월 정산",
          status: "REQUESTING",
          bankName: "신한은행",
          bankAccount: CIPHER_ACCOUNT,
          accountHolder: "블리자드하키",
          accountUpdatedAt: ACCOUNT_UPDATED_AT,
          requestedById: "admin-1",
        }),
      );
      // 평문 계좌번호는 어디에도 저장하지 않는다.
      expect(JSON.stringify(created)).not.toContain(PLAIN_ACCOUNT);

      const claim = mockPrisma.settlement.updateMany.mock.calls[0][0];
      expect(claim.where).toEqual(
        expect.objectContaining({
          id: "s-1",
          status: "approved",
          netAmount: 1849430,
        }),
      );
      expect(claim.data).toEqual({ status: "processing" });

      expect(mockPayoutApi.requestPayout).toHaveBeenCalledTimes(1);
      expect(mockPayoutApi.requestPayout).toHaveBeenCalledWith(
        {
          subId: "SUB-1",
          settlmntDt: "20261015",
          settlmntAmt: 1849430,
          dupChkYn: "N",
          accntDesc: "팀플러스 7월 정산",
        },
        { teamId: "team-1", settlementId: "s-1", requestedBy: "admin-1" },
      );

      const applied =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
      expect(applied.where).toEqual({ id: "pr-1", status: "REQUESTING" });
      expect(applied.data).toEqual(
        expect.objectContaining({ status: "REQUESTED", niceSeq: "SEQ-1" }),
      );
      // 접수됐으므로 정산은 processing 그대로(되돌리는 updateMany 없음).
      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledTimes(1);
    });

    it("응답을 못 받으면 UNCONFIRMED 로 남기고 다시 보내지 않으며 정산은 processing 을 유지한다", async () => {
      mockPayoutApi.requestPayout.mockResolvedValue({
        outcome: "AMBIGUOUS",
        seq: null,
        meta: { sid: "0102001", resCode: null, resMsg: null, error: "timeout" },
      });

      const r = await service.request(requestDto(), "admin-1");

      expect(r.results[0].outcome).toBe("UNCONFIRMED");
      expect(mockPayoutApi.requestPayout).toHaveBeenCalledTimes(1);
      const applied =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
      expect(applied.data).toEqual(
        expect.objectContaining({
          status: "UNCONFIRMED",
          niceSeq: null,
          requestError: "timeout",
        }),
      );
      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledTimes(1);
    });

    it("확정 거절(1001)이면 REJECTED 로 닫고 정산을 요청 전 상태로 되돌린다", async () => {
      mockPayoutApi.requestPayout.mockResolvedValue({
        outcome: "TERMINAL",
        seq: null,
        meta: {
          sid: "0102001",
          resCode: "1001",
          resMsg: "비영업일",
          error: null,
        },
      });

      const r = await service.request(requestDto(), "admin-1");

      expect(r.results[0].outcome).toBe("REJECTED");
      expect(r.results[0].message).toContain("1001");
      const applied =
        mockPrisma.settlementPayoutRequest.updateMany.mock.calls[0][0];
      expect(applied.data).toEqual(
        expect.objectContaining({ status: "REJECTED", resCode: "1001" }),
      );
      const revert = mockPrisma.settlement.updateMany.mock.calls[1][0];
      expect(revert.where).toEqual({ id: "s-1", status: "processing" });
      expect(revert.data).toEqual({ status: "approved" });
    });

    it("지급 실패 정산의 재요청이 거절되면 failed 로 되돌린다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(
        target({ status: "failed" }),
      );
      mockPayoutApi.requestPayout.mockResolvedValue({
        outcome: "CONFIG",
        seq: null,
        meta: { sid: "0102001", resCode: "1000", resMsg: "", error: null },
      });

      await service.request(requestDto(), "admin-1");

      const revert = mockPrisma.settlement.updateMany.mock.calls[1][0];
      expect(revert.data).toEqual({ status: "failed" });
    });

    it("미리보기 이후 계좌가 바뀌었으면 그 건만 건너뛰고 나이스를 부르지 않는다", async () => {
      const r = await service.request(
        {
          payDate: "2026-10-15",
          items: [
            {
              settlementId: "s-1",
              expectedAccountUpdatedAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        },
        "admin-1",
      );

      expect(r.results[0]).toEqual(
        expect.objectContaining({
          outcome: "SKIPPED",
          reasonCode: "ACCOUNT_CHANGED",
        }),
      );
      expect(mockPrisma.settlementPayoutRequest.create).not.toHaveBeenCalled();
      expect(mockPayoutApi.requestPayout).not.toHaveBeenCalled();
    });

    it("이미 processing 인 정산은 PAYOUT_IN_PROGRESS 로 건너뛴다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(
        target({ status: "processing" }),
      );
      const r = await service.request(requestDto(), "admin-1");
      expect(r.results[0].reasonCode).toBe("PAYOUT_IN_PROGRESS");
      expect(mockPayoutApi.requestPayout).not.toHaveBeenCalled();
    });

    it("예기치 않은 오류는 그 건만 ERROR 로 돌려주고 나머지 건은 계속 처리한다", async () => {
      mockPrisma.settlementPayoutRequest.create.mockRejectedValue(
        new Error("db down"),
      );
      const r = await service.request(requestDto(), "admin-1");
      expect(r.results).toHaveLength(1);
      expect(r.results[0]).toEqual(
        expect.objectContaining({ outcome: "ERROR", requestId: null }),
      );
      expect(r.summary.errored).toBe(1);
      expect(mockPayoutApi.requestPayout).not.toHaveBeenCalled();
    });

    it("정산당 진행 중 1건 유니크 인덱스(P2002)에 걸리면 PAYOUT_IN_PROGRESS 로 건너뛴다", async () => {
      mockPrisma.settlementPayoutRequest.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "5.7.0",
        }),
      );
      const r = await service.request(requestDto(), "admin-1");
      expect(r.results[0].reasonCode).toBe("PAYOUT_IN_PROGRESS");
      expect(mockPayoutApi.requestPayout).not.toHaveBeenCalled();
    });

    it("정산이 그 사이 바뀌어 processing 으로 잡지 못하면 SETTLEMENT_CHANGED — 나이스를 부르지 않는다", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      const r = await service.request(requestDto(), "admin-1");
      expect(r.results[0].reasonCode).toBe("SETTLEMENT_CHANGED");
      expect(mockPayoutApi.requestPayout).not.toHaveBeenCalled();
    });

    it("같은 정산이 두 번 들어 있으면 두 번째는 DUPLICATE_ITEM", async () => {
      mockPayoutApi.requestPayout.mockResolvedValue({
        outcome: "SUCCESS",
        seq: "SEQ-1",
        meta: { sid: "0102001", resCode: "0000", resMsg: "", error: null },
      });
      const dto = requestDto();
      const r = await service.request(
        { ...dto, items: [dto.items[0], dto.items[0]] },
        "admin-1",
      );
      expect(r.results.map((x) => x.outcome)).toEqual(["REQUESTED", "SKIPPED"]);
      expect(r.results[1].reasonCode).toBe("DUPLICATE_ITEM");
      expect(mockPayoutApi.requestPayout).toHaveBeenCalledTimes(1);
    });

    it("live 가 아니면 409 — off 는 PAYOUT_API_OFF, readonly 는 PAYOUT_API_NOT_LIVE", async () => {
      setMode("off");
      await expect(service.request(requestDto(), "admin-1")).rejects.toThrow(
        ConflictException,
      );
      setMode("readonly");
      await expect(
        service.request(requestDto(), "admin-1"),
      ).rejects.toMatchObject({
        response: { errorCode: "PAYOUT_API_NOT_LIVE" },
      });
      expect(mockPayoutApi.requestPayout).not.toHaveBeenCalled();
    });

    it("지급일이 주말이면 400 PAYOUT_DATE_INVALID 로 전체를 거절한다", async () => {
      await expect(
        service.request({ ...requestDto(), payDate: "2026-10-17" }, "admin-1"),
      ).rejects.toMatchObject({
        response: { errorCode: "PAYOUT_DATE_INVALID" },
      });
    });
  });

  describe("preview", () => {
    it("들어갈 팀은 마스킹 계좌·계좌 버전과 함께, 잔액보다 합계가 크면 balanceShort", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([
        target(),
        { ...target(), id: "s-2", status: "pending" },
        { ...target(), id: "s-3", netAmount: 0 },
        { ...target({ account: null }), id: "s-4" },
      ]);
      mockPayoutApi.getBalance.mockResolvedValue({
        outcome: "SUCCESS",
        remainAmt: 1_000_000,
        meta: { sid: "0101001", resCode: "0000" },
      });

      const r = await service.preview(
        ["s-1", "s-2", "s-3", "s-4", "s-9"],
        "2026-10-15",
        "admin-1",
      );

      expect(r.included).toEqual([
        expect.objectContaining({
          settlementId: "s-1",
          subMallId: "SUB-1",
          bankName: "신한은행",
          bankAccountMasked: "****8901",
          accountUpdatedAt: ACCOUNT_UPDATED_AT,
          accntDesc: "팀플러스 7월 정산",
          isRetry: false,
        }),
      ]);
      expect(r.excluded.map((e) => [e.settlementId, e.reasonCode])).toEqual([
        ["s-2", "NOT_PAYABLE_STATUS"],
        ["s-3", "NET_NOT_POSITIVE"],
        ["s-4", "ACCOUNT_NONE"],
        ["s-9", "SETTLEMENT_NOT_FOUND"],
      ]);
      expect(r.includedTotal).toBe(1849430);
      expect(r.balance).toBe(1_000_000);
      expect(r.balanceShort).toBe(true);
      expect(r.balanceError).toBeNull();
      expect(JSON.stringify(r)).not.toContain(PLAIN_ACCOUNT);
    });

    it("잔액 조회에 실패해도 미리보기는 되고 balanceError 만 채운다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([target()]);
      mockPayoutApi.getBalance.mockResolvedValue({
        outcome: "AMBIGUOUS",
        remainAmt: null,
        meta: {
          sid: "0101001",
          resCode: null,
          resMsg: null,
          error: "timeout",
        },
      });
      const r = await service.preview(["s-1"], "2026-10-15", "admin-1");
      expect(r.balance).toBeNull();
      expect(r.balanceShort).toBe(false);
      expect(r.balanceError).toContain("시간 초과");
    });

    it("readonly 에서도 볼 수 있지만 off 면 409 PAYOUT_API_OFF", async () => {
      setMode("readonly");
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      await expect(
        service.preview(["s-1"], "2026-10-15", "admin-1"),
      ).resolves.toBeDefined();
      setMode("off");
      await expect(
        service.preview(["s-1"], "2026-10-15", "admin-1"),
      ).rejects.toMatchObject({ response: { errorCode: "PAYOUT_API_OFF" } });
    });
  });
});
