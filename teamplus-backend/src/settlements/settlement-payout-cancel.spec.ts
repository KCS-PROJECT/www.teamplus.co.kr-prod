import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import {
  PAYOUT_CANCEL_REASON,
  SettlementPayoutRequestService,
} from "./settlement-payout-request.service";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { SettlementPayoutResultService } from "./settlement-payout-result.service";
import { TeamSettlementAccountService } from "./team-settlement-account.service";

describe("SettlementPayoutRequestService.cancel", () => {
  let service: SettlementPayoutRequestService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    settlement: { findUnique: jest.fn() },
    settlementPayoutRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
    appSettings: { findFirst: jest.fn() },
  };
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setIfNotExists: jest.fn(),
    releaseLock: jest.fn(),
  };
  const mockPayoutApi = { cancelPayout: jest.fn() };
  const mockResultService = {
    closeAndRevert: jest.fn(),
    recheckAfterCancel: jest.fn(),
  };

  const PAY_DATE = new Date("2026-10-15T00:00:00.000Z");

  const processing = (
    request: Partial<{
      status: string;
      niceSeq: string | null;
      needsReview: boolean;
      settlementDate: Date;
    }> | null = {},
    status = "processing",
  ) => ({
    teamId: "team-1",
    status,
    payoutRequests:
      request === null
        ? []
        : [
            {
              id: "pr-1",
              status: request.status ?? "REQUESTED",
              niceSeq:
                request.niceSeq === undefined ? "SEQ001" : request.niceSeq,
              subMallId: "SUB-1",
              settlementDate: request.settlementDate ?? PAY_DATE,
              needsReview: request.needsReview ?? false,
            },
          ],
  });

  const niceCall = (
    outcome: string,
    resCode: string | null,
    error?: string,
  ) => ({
    outcome,
    meta: {
      sid: "0103001",
      resCode,
      resMsg: null,
      httpStatus: resCode === null ? null : 200,
      durationMs: 5,
      error: error ?? null,
    },
  });

  const setKstNow = (iso: string) =>
    jest.spyOn(Date, "now").mockReturnValue(new Date(`${iso}+09:00`).getTime());

  const expectConflict = async (errorCode: string) => {
    try {
      await service.cancel("s-1", "admin-1");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        errorCode,
      });
      return;
    }
    throw new Error(`${errorCode} 가 나지 않았다`);
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementPayoutRequestService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: NicePayoutApiService, useValue: mockPayoutApi },
        { provide: TeamSettlementAccountService, useValue: {} },
        { provide: SettlementPayoutResultService, useValue: mockResultService },
      ],
    }).compile();
    service = module.get(SettlementPayoutRequestService);

    jest.clearAllMocks();
    setKstNow("2026-10-15T09:00:00");
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setIfNotExists.mockResolvedValue(true);
    mockRedis.releaseLock.mockResolvedValue(true);
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      payoutApiMode: "live",
    });
    mockPrisma.settlement.findUnique.mockResolvedValue(processing());
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "CANCELLED",
    });
    mockResultService.closeAndRevert.mockResolvedValue(true);
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: true,
      sighting: { kind: "MATCHED", result: "CANCELLED" },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("나이스 취소 성공이면 삭제와 같은 경로로 요청을 닫고 정산을 지급 대기로 되돌린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("SUCCESS", "0000"));

    const result = await service.cancel("s-1", "admin-1");

    expect(mockPayoutApi.cancelPayout).toHaveBeenCalledWith(
      { subId: "SUB-1", settlmntDt: "20261015", seq: "SEQ001" },
      { teamId: "team-1", settlementId: "s-1", requestedBy: "admin-1" },
    );
    expect(mockResultService.closeAndRevert).toHaveBeenCalledWith(
      { id: "pr-1", settlementId: "s-1" },
      "team-1",
      "CANCELLED",
      expect.objectContaining({ errReason: PAYOUT_CANCEL_REASON }),
    );
    expect(result).toMatchObject({
      outcome: "CANCELLED",
      requestId: "pr-1",
      resCode: "0000",
    });
    expect(mockResultService.recheckAfterCancel).not.toHaveBeenCalled();
    expect(mockRedis.releaseLock).toHaveBeenCalledWith(
      "settlement:payout-cancel:s-1",
      expect.any(String),
    );
  });

  it("나이스 성공인데 요청이 이미 다른 상태로 닫혔으면 확인 필요로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("SUCCESS", "0000"));
    mockResultService.closeAndRevert.mockResolvedValue(false);
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "SUCCEEDED",
    });

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("UNCONFIRMED");
  });

  it("응답이 없으면 그 지급일을 바로 조회하고, 나이스가 삭제로 보이면 취소로 확정한다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(
      niceCall("AMBIGUOUS", null, "timeout"),
    );

    const result = await service.cancel("s-1", "admin-1");

    expect(mockResultService.recheckAfterCancel).toHaveBeenCalledWith(
      "2026-10-15",
      "admin-1",
      "pr-1",
    );
    expect(mockResultService.closeAndRevert).not.toHaveBeenCalled();
    expect(
      mockPrisma.settlementPayoutRequest.updateMany,
    ).not.toHaveBeenCalled();
    expect(result.outcome).toBe("CANCELLED");
  });

  it("1104 뒤 조회에서 나이스가 아직 그 건을 요청으로 보여주면 취소되지 않은 것으로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("TERMINAL", "1104"));
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: true,
      sighting: { kind: "MATCHED", result: "PENDING" },
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "REQUESTED",
    });

    const result = await service.cancel("s-1", "admin-1");

    expect(mockResultService.recheckAfterCancel).toHaveBeenCalledWith(
      "2026-10-15",
      "admin-1",
      "pr-1",
    );
    expect(result.outcome).toBe("REJECTED");
    expect(
      mockPrisma.settlementPayoutRequest.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("1104 뒤 조회 결과에 그 건이 없으면 지난 조회가 남긴 '요청' 상태값이 있어도 취소 안 됨이라 하지 않고 나이스 화면 확인으로 넘긴다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("TERMINAL", "1104"));
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: true,
      sighting: { kind: "NOT_FOUND" },
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "REQUESTED",
      niceStatusNm: "요청",
      lastCheckedAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("UNCONFIRMED");
    expect(result.message).toContain("찾지 못했습니다");
  });

  it("응답 없음(AMBIGUOUS) 뒤 조회에서 아직 요청으로 보여도 나이스가 뒤늦게 반영할 수 있어 확인 중으로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(
      niceCall("AMBIGUOUS", null, "timeout"),
    );
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: true,
      sighting: { kind: "MATCHED", result: "PENDING" },
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "REQUESTED",
    });

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("UNCONFIRMED");
    expect(result.message).toContain("응답을 받지 못했고");
  });

  it("조회 뒤 그 건이 접수되지 않음(NOT_FOUND)으로 닫혀 지급 대기로 돌아가 있으면 취소된 것으로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("TERMINAL", "1104"));
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: true,
      sighting: { kind: "NOT_FOUND" },
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "NOT_FOUND",
    });

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("CANCELLED");
    expect(result.message).toContain("접수되지 않은");
  });

  it("1104 뒤 조회에서 짝 맞추기 불가면 확인 중으로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("TERMINAL", "1104"));
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: true,
      sighting: { kind: "AMBIGUOUS" },
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "REQUESTED",
    });

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("UNCONFIRMED");
  });

  it("1104 뒤 그 건이 이미 성공·실패로 닫혀 있으면 확정됐다고 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("TERMINAL", "1104"));
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: false,
      sighting: null,
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "SUCCEEDED",
    });

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("REJECTED");
    expect(result.message).toContain("이미 확정");
  });

  it("나이스 취소 성공 뒤 상태 반영이 실패하면 그 건만 다시 조회하고, 삭제로 닫혔으면 취소로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("SUCCESS", "0000"));
    mockResultService.closeAndRevert.mockRejectedValue(new Error("db down"));

    const result = await service.cancel("s-1", "admin-1");

    expect(mockResultService.recheckAfterCancel).toHaveBeenCalledWith(
      "2026-10-15",
      "admin-1",
      "pr-1",
    );
    expect(result.outcome).toBe("CANCELLED");
    expect(mockRedis.releaseLock).toHaveBeenCalled();
  });

  it("나이스 취소 성공 뒤 상태 반영이 실패하고 재조회로도 안 닫혔으면 확인 중으로 알린다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("SUCCESS", "0000"));
    mockResultService.closeAndRevert.mockRejectedValue(new Error("db down"));
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: false,
      sighting: null,
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "REQUESTED",
    });

    const result = await service.cancel("s-1", "admin-1");

    expect(result.outcome).toBe("UNCONFIRMED");
    expect(mockRedis.releaseLock).toHaveBeenCalled();
  });

  it("응답이 없고 조회도 못 했으면 확인 중으로 두고 상태를 바꾸지 않는다", async () => {
    mockPayoutApi.cancelPayout.mockResolvedValue(
      niceCall("AMBIGUOUS", null, "network"),
    );
    mockResultService.recheckAfterCancel.mockResolvedValue({
      queried: false,
      sighting: null,
    });
    mockPrisma.settlementPayoutRequest.findUnique.mockResolvedValue({
      status: "REQUESTED",
    });

    const result = await service.cancel("s-1", "admin-1");

    expect(result.outcome).toBe("UNCONFIRMED");
    expect(mockResultService.closeAndRevert).not.toHaveBeenCalled();
  });

  it.each([
    ["1107", "TERMINAL"],
    ["1000", "CONFIG"],
  ])("확정 거절(%s)은 상태를 바꾸지 않는다", async (resCode, outcome) => {
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall(outcome, resCode));

    const result = await service.cancel("s-1", "admin-1");

    expect(result).toMatchObject({ outcome: "REJECTED", resCode });
    expect(mockResultService.closeAndRevert).not.toHaveBeenCalled();
    expect(mockResultService.recheckAfterCancel).not.toHaveBeenCalled();
  });

  it.each(["off", "readonly"])(
    "%s 모드면 나이스를 부르지 않는다",
    async (mode) => {
      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: mode,
      });

      await expectConflict(
        mode === "off" ? "PAYOUT_API_OFF" : "PAYOUT_API_NOT_LIVE",
      );
      expect(mockRedis.setIfNotExists).not.toHaveBeenCalled();
      expect(mockPayoutApi.cancelPayout).not.toHaveBeenCalled();
    },
  );

  it("같은 정산의 취소가 진행 중이면 막는다", async () => {
    mockRedis.setIfNotExists.mockResolvedValue(false);

    await expectConflict("PAYOUT_CANCEL_IN_PROGRESS");
    expect(mockPayoutApi.cancelPayout).not.toHaveBeenCalled();
    expect(mockRedis.releaseLock).not.toHaveBeenCalled();
  });

  it("정산이 없으면 404 이고 락은 푼다", async () => {
    mockPrisma.settlement.findUnique.mockResolvedValue(null);

    await expect(service.cancel("s-1", "admin-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockRedis.releaseLock).toHaveBeenCalled();
  });

  it("지급 처리 중이 아니면 막는다", async () => {
    mockPrisma.settlement.findUnique.mockResolvedValue(
      processing({}, "approved"),
    );
    await expectConflict("PAYOUT_CANCEL_NOT_PROCESSING");
  });

  it.each([
    ["진행 중 요청 없음", null],
    ["응답 미확인", { status: "UNCONFIRMED", niceSeq: null }],
    ["접수번호 없음", { niceSeq: null }],
  ])("%s 이면 막는다", async (_label, request) => {
    mockPrisma.settlement.findUnique.mockResolvedValue(processing(request));
    await expectConflict("PAYOUT_CANCEL_NO_REQUEST");
    expect(mockPayoutApi.cancelPayout).not.toHaveBeenCalled();
  });

  it("확인 필요가 켜진 요청이면 막는다", async () => {
    mockPrisma.settlement.findUnique.mockResolvedValue(
      processing({ needsReview: true }),
    );
    await expectConflict("PAYOUT_REVIEW_OPEN");
  });

  it("지급일 10:30 이 지났으면 막는다", async () => {
    setKstNow("2026-10-15T10:30:00");
    await expectConflict("PAYOUT_CANCEL_CUTOFF_PASSED");
    expect(mockPayoutApi.cancelPayout).not.toHaveBeenCalled();
  });

  it("지급일이 미래면 전날 오후에도 취소할 수 있다", async () => {
    setKstNow("2026-10-14T15:00:00");
    mockPayoutApi.cancelPayout.mockResolvedValue(niceCall("SUCCESS", "0000"));

    const result = await service.cancel("s-1", "admin-1");
    expect(result.outcome).toBe("CANCELLED");
  });
});
