import { Test, TestingModule } from "@nestjs/testing";
import {
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import {
  encryptField,
  isEncryptedField,
} from "@/common/utils/field-encryption.util";

describe("TeamSettlementAccountService", () => {
  let service: TeamSettlementAccountService;
  const prevKey = process.env.FIELD_ENCRYPTION_KEY;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    team: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    teamSettlementAccount: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    commonCode: { findMany: jest.fn() },
    appSettings: { findFirst: jest.fn() },
    nicePayoutApiLog: { findMany: jest.fn() },
  };
  const mockRedis = { get: jest.fn(), set: jest.fn() };
  const mockPayoutApi = { upsertSubMall: jest.fn(), getBalance: jest.fn() };

  const asUser = (id: string, userType: string): JwtUserPayload => ({
    id,
    email: `${id}@t.dev`,
    userType,
  });
  const owner = asUser("director-1", "DIRECTOR");
  const otherDirector = asUser("director-2", "DIRECTOR");
  const coach = asUser("coach-1", "COACH");
  const admin = asUser("admin-1", "ADMIN");

  const dto = {
    businessNumber: "1234567890",
    bankCode: "004",
    bankAccount: "110222333444",
    accountHolder: "블랭크하키",
  };

  const storedRow = () => ({
    teamId: "team-1",
    businessNumber: encryptField("1234567890"),
    bankCode: "004",
    bankAccount: encryptField("110222333444"),
    accountHolder: "블랭크하키",
    status: "SUBMITTED",
    submittedAt: new Date("2026-09-29T00:00:00Z"),
    registeredAt: null,
    updatedAt: new Date("2026-09-29T00:00:00Z"),
    registeredBy: null,
  });

  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });
  afterAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = prevKey;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamSettlementAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: NicePayoutApiService, useValue: mockPayoutApi },
      ],
    }).compile();
    service = module.get(TeamSettlementAccountService);
    jest.clearAllMocks();
    mockPrisma.team.findUnique.mockResolvedValue({
      id: "team-1",
      coachId: "director-1",
      isActive: true,
    });
    mockPrisma.commonCode.findMany.mockResolvedValue([
      { code: "004", name: "KB국민은행" },
    ]);
    mockPrisma.teamSettlementAccount.findUniqueOrThrow.mockResolvedValue(
      storedRow(),
    );
    mockPrisma.teamSettlementAccount.create.mockResolvedValue({});
    mockPrisma.teamSettlementAccount.update.mockResolvedValue({});
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      payoutApiMode: "off",
    });
    mockPrisma.nicePayoutApiLog.findMany.mockResolvedValue([]);
  });

  describe("권한", () => {
    it.each([
      ["다른 팀 감독", otherDirector],
      ["팀 코치", coach],
      ["관리자", admin],
    ])("%s 은(는) 저장할 수 없다", async (_label, user) => {
      await expect(service.upsert("team-1", dto, user)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.teamSettlementAccount.create).not.toHaveBeenCalled();
      expect(mockPrisma.teamSettlementAccount.update).not.toHaveBeenCalled();
    });

    it("감독 이름만 같고 팀 소유자가 아니면 조회도 403", async () => {
      await expect(service.getForTeam("team-1", otherDirector)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("없는 팀이면 404", async () => {
      mockPrisma.team.findUnique.mockResolvedValue(null);
      await expect(service.upsert("x", dto, owner)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("저장", () => {
    it("첫 저장은 사업자번호가 필수다", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.upsert("team-1", { ...dto, businessNumber: undefined }, owner),
      ).rejects.toThrow(BadRequestException);
    });

    it("첫 저장은 암호화해 SUBMITTED 로 만들고 응답은 마스킹한다", async () => {
      mockPrisma.teamSettlementAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      const result = await service.upsert("team-1", dto, owner);

      const args = mockPrisma.teamSettlementAccount.create.mock.calls[0][0];
      expect(args.data.status).toBe("SUBMITTED");
      expect(isEncryptedField(args.data.businessNumber)).toBe(true);
      expect(isEncryptedField(args.data.bankAccount)).toBe(true);
      expect(args.data.submittedById).toBe("director-1");
      expect(result.bankAccount).toBe("****3444");
      expect(result.businessNumber).toBe("123-**-***90");
      expect(JSON.stringify(result)).not.toContain("110222333444");
    });

    it("사업자번호를 바꾸려 하면 400", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(
        storedRow(),
      );
      await expect(
        service.upsert(
          "team-1",
          { ...dto, businessNumber: "9999999999" },
          owner,
        ),
      ).rejects.toThrow("사업자등록번호는 변경할 수 없습니다");
    });

    it("선택할 수 없는 은행이면 400", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.upsert("team-1", { ...dto, bankCode: "999" }, owner),
      ).rejects.toThrow("선택할 수 없는 은행입니다.");
    });

    it("내용이 같으면 저장하지 않아 등록 완료 상태를 유지한다", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(
        storedRow(),
      );

      await service.upsert(
        "team-1",
        { ...dto, businessNumber: undefined },
        owner,
      );

      expect(mockPrisma.teamSettlementAccount.create).not.toHaveBeenCalled();
      expect(mockPrisma.teamSettlementAccount.update).not.toHaveBeenCalled();
    });

    it("계좌가 바뀌면 SUBMITTED 로 돌리고 등록 처리 기록을 지운다", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(
        storedRow(),
      );

      await service.upsert(
        "team-1",
        { ...dto, businessNumber: undefined, bankAccount: "999888777666" },
        owner,
      );

      const args = mockPrisma.teamSettlementAccount.update.mock.calls[0][0];
      expect(args.data).toEqual(
        expect.objectContaining({
          status: "SUBMITTED",
          registeredById: null,
          registeredAt: null,
        }),
      );
      expect(args.data.businessNumber).toBeUndefined();
    });
  });

  describe("경쟁·예외", () => {
    it("저장 중 운영자 초기화로 행이 사라지면(P2025) 409", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(
        storedRow(),
      );
      mockPrisma.teamSettlementAccount.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("gone", {
          code: "P2025",
          clientVersion: "5",
        }),
      );

      await expect(
        service.upsert(
          "team-1",
          { ...dto, businessNumber: undefined, bankAccount: "999888777666" },
          owner,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("첫 저장이 동시에 두 번 오면(P2002) 409", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(null);
      mockPrisma.teamSettlementAccount.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "5",
        }),
      );

      await expect(service.upsert("team-1", dto, owner)).rejects.toThrow(
        ConflictException,
      );
    });

    it("저장된 값을 복호화할 수 없으면 변경으로 오판하지 않고 500 으로 멈춘다", async () => {
      const currentKey = process.env.FIELD_ENCRYPTION_KEY;
      process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
      const foreignCipher = encryptField("110222333444");
      process.env.FIELD_ENCRYPTION_KEY = currentKey;
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue({
        ...storedRow(),
        bankAccount: foreignCipher,
      });

      await expect(
        service.upsert("team-1", { ...dto, businessNumber: undefined }, owner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(mockPrisma.teamSettlementAccount.update).not.toHaveBeenCalled();
    });

    it("비활성 팀은 저장할 수 없다", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: "team-1",
        coachId: "director-1",
        isActive: false,
      });

      await expect(service.upsert("team-1", dto, owner)).rejects.toThrow(
        "운영 중이 아닌 팀은 정산 계좌를 등록할 수 없습니다.",
      );
    });

    it("은행 검증은 그룹·코드가 모두 활성인 코드만 허용한다", async () => {
      mockPrisma.teamSettlementAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      await service.upsert("team-1", dto, owner);

      expect(mockPrisma.commonCode.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
        group: { groupCode: "BANK_CODE", isActive: true },
      });
    });
  });

  describe("조회", () => {
    it("감독은 마스킹, 관리자는 평문(사업자번호 서식 포함)", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(
        storedRow(),
      );
      const asOwner = await service.getForTeam("team-1", owner);
      expect(asOwner?.bankAccount).toBe("****3444");

      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(
        storedRow(),
      );
      const asAdmin = await service.getForTeam("team-1", admin);
      expect(asAdmin?.bankAccount).toBe("110222333444");
      expect(asAdmin?.businessNumber).toBe("123-45-67890");
    });

    it("미등록이면 null", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(null);
      await expect(service.getForTeam("team-1", owner)).resolves.toBeNull();
    });
  });

  describe("운영자 등록 상태·초기화", () => {
    const expectedUpdatedAt = "2026-09-29T00:00:00.000Z";

    it("본 버전과 같으면 REGISTERED 와 처리자를 기록한다", async () => {
      mockPrisma.teamSettlementAccount.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.updateRegistration(
        "team-1",
        { status: "REGISTERED", expectedUpdatedAt },
        "admin-1",
      );

      const args = mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({
        teamId: "team-1",
        updatedAt: new Date(expectedUpdatedAt),
      });
      expect(args.data.status).toBe("REGISTERED");
      expect(args.data.registeredById).toBe("admin-1");
    });

    it("그 사이 감독이 수정했으면 409, 계좌가 없으면 404", async () => {
      mockPrisma.teamSettlementAccount.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValueOnce({
        id: "a-1",
      });
      await expect(
        service.updateRegistration(
          "team-1",
          { status: "REGISTERED", expectedUpdatedAt },
          "admin-1",
        ),
      ).rejects.toThrow(ConflictException);

      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateRegistration(
          "team-1",
          { status: "REGISTERED", expectedUpdatedAt },
          "admin-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("초기화는 행을 지우고, 없으면 404", async () => {
      mockPrisma.teamSettlementAccount.deleteMany.mockResolvedValueOnce({
        count: 1,
      });
      await expect(service.reset("team-1", "admin-1")).resolves.toEqual({
        teamId: "team-1",
        reset: true,
      });

      mockPrisma.teamSettlementAccount.deleteMany.mockResolvedValueOnce({
        count: 0,
      });
      await expect(service.reset("team-1", "admin-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("목록 NONE 필터는 계좌 없는 활성 팀만 고른다", async () => {
      mockPrisma.team.findMany.mockResolvedValue([
        { id: "team-2", name: "팀2", teamCode: null, settlementAccount: null },
      ]);
      mockPrisma.team.count.mockResolvedValue(1);

      const result = await service.listForAdmin({ status: "NONE" });

      expect(mockPrisma.team.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
        settlementAccount: { is: null },
      });
      expect(result.data[0].account).toBeNull();
    });
  });
  describe("live 모드 — 나이스 서브몰 자동 등록", () => {
    const okMeta = (resCode: string | null, error: string | null = null) => ({
      sid: "0105001",
      resCode,
      resMsg: null,
      httpStatus: resCode ? 200 : null,
      durationMs: 5,
      error,
    });
    const result = (
      outcome: "SUCCESS" | "TERMINAL" | "AMBIGUOUS" | "CONFIG",
      resCode: string | null,
      error: string | null = null,
    ) => ({ outcome, meta: okMeta(resCode, error) });

    let claim: Date | null;
    let existingRow: Record<string, unknown> | null;
    let registrationRow: Record<string, unknown>;

    const finalWrite = () => {
      const calls = mockPrisma.teamSettlementAccount.updateMany.mock.calls;
      return calls[calls.length - 1][0];
    };

    beforeEach(() => {
      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: "live",
      });
      // 01:00 KST(= 전날 16:00Z) — 등록 가능 시간
      jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 8, 29, 16, 0));
      claim = null;
      existingRow = null;
      registrationRow = {
        businessNumber: encryptField("1234567890"),
        bankCode: "004",
        bankAccount: encryptField("110222333444"),
        accountHolder: "블랭크하키",
        subMallId: null,
        status: "SUBMITTED",
        createdAt: new Date("2026-09-29T00:00:00Z"),
        team: { name: "블랭크" },
      };
      mockPrisma.teamSettlementAccount.create.mockImplementation(
        ({ data }: { data: { registrationStartedAt?: Date } }) => {
          claim = data.registrationStartedAt ?? null;
          return {};
        },
      );
      mockPrisma.teamSettlementAccount.updateMany.mockImplementation(
        ({ data }: { data: { registrationStartedAt?: Date | null } }) => {
          if (data.registrationStartedAt instanceof Date) {
            claim = data.registrationStartedAt;
          }
          return { count: 1 };
        },
      );
      mockPrisma.teamSettlementAccount.findUnique.mockImplementation(
        ({ select }: { select: Record<string, unknown> }) => {
          if (select.team) {
            return { ...registrationRow, registrationStartedAt: claim };
          }
          if (select.registeredBy) return storedRow();
          return existingRow;
        },
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("첫 저장은 신규 등록(reqType 0, 서브몰 ID=팀 ID)하고 성공하면 REGISTERED 와 서브몰 ID 를 기록한다", async () => {
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("SUCCESS", "0000"));

      await service.upsert("team-1", dto, owner);

      expect(mockPayoutApi.upsertSubMall).toHaveBeenCalledTimes(1);
      const [req, ctx] = mockPayoutApi.upsertSubMall.mock.calls[0];
      expect(req).toEqual({
        subId: "team-1",
        subNm: "블랭크",
        subCoNo: "1234567890",
        bankCd: "004",
        accntNo: "110222333444",
        accntNm: "블랭크하키",
        reqType: 0,
      });
      expect(ctx).toEqual({ teamId: "team-1", requestedBy: "director-1" });
      const write = finalWrite();
      expect(write.where).toEqual({
        teamId: "team-1",
        registrationStartedAt: claim,
      });
      expect(write.data).toMatchObject({
        status: "REGISTERED",
        subMallId: "team-1",
        registeredById: null,
        registrationStartedAt: null,
        lastResMsg: null,
      });
    });

    it("첫 저장이 나이스에 거절(1003)되면 만든 계좌를 지우고 사유와 함께 400 SUBMALL_REJECTED", async () => {
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("TERMINAL", "1003"));

      const err = await service.upsert("team-1", dto, owner).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse().errorCode).toBe("SUBMALL_REJECTED");
      expect(err.getResponse().message).toContain("예금주");
      expect(mockPrisma.teamSettlementAccount.deleteMany).toHaveBeenCalledWith({
        where: { teamId: "team-1", registrationStartedAt: claim },
      });
      expect(
        mockPrisma.teamSettlementAccount.updateMany,
      ).not.toHaveBeenCalled();
    });

    const registeredPrevious = () => ({
      ...storedRow(),
      status: "REGISTERED",
      submittedById: "director-1",
      registeredById: null,
      registeredAt: new Date("2026-09-29T01:00:00Z"),
      lastResCode: "0000",
      lastResMsg: null,
      lastAttemptedAt: new Date("2026-09-29T01:00:00Z"),
    });

    it("등록된 계좌를 입력 오류(1003)로 바꾸지 못하면 이전 값·등록 완료로 되돌리고 400", async () => {
      const prev = registeredPrevious();
      existingRow = prev;
      registrationRow.subMallId = "team-1";
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("TERMINAL", "1003"));

      const err = await service
        .upsert("team-1", { ...dto, bankAccount: "999888777" }, owner)
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse().errorCode).toBe("SUBMALL_REJECTED");
      // 호출 전에 새 내용을 확인 중으로 먼저 썼다(호출 중 지급 차단).
      const claimCall =
        mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0];
      expect(claimCall.data.status).toBe("SUBMITTED");
      expect(claimCall.data.bankAccount).not.toBe(prev.bankAccount);
      // 되돌리기
      const write = finalWrite();
      expect(write.where).toEqual({
        teamId: "team-1",
        registrationStartedAt: claim,
      });
      expect(write.data).toMatchObject({
        bankAccount: prev.bankAccount,
        accountHolder: prev.accountHolder,
        status: "REGISTERED",
        registeredAt: prev.registeredAt,
        lastResCode: "0000",
        registrationStartedAt: null,
      });
      expect(
        mockPrisma.teamSettlementAccount.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it("수정 중 나이스에 없음(1105)이 확인된 뒤 입력 오류로 거절되면 확인 중으로 되돌린다", async () => {
      existingRow = registeredPrevious();
      registrationRow.subMallId = "team-1";
      mockPayoutApi.upsertSubMall
        .mockResolvedValueOnce(result("TERMINAL", "1105"))
        .mockResolvedValueOnce(result("TERMINAL", "1003"));

      await expect(
        service.upsert("team-1", { ...dto, bankAccount: "999888777" }, owner),
      ).rejects.toThrow(BadRequestException);

      expect(finalWrite().data).toMatchObject({
        status: "SUBMITTED",
        lastResCode: "1105",
        registrationStartedAt: null,
      });
    });

    it("같은 내용 재시도가 거절되면 저장된 계좌 자체의 거절이라 등록 실패와 사유를 남긴다(400 아님)", async () => {
      existingRow = { ...storedRow(), status: "SUBMITTED" };
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("TERMINAL", "1003"));

      await service.upsert("team-1", dto, owner);

      const write = finalWrite();
      expect(write.data.status).toBe("FAILED");
      expect(write.data.lastResCode).toBe("1003");
    });

    it("입력과 무관한 거절(1106→1105 상태 불일치)은 첫 저장이어도 지우지 않고 등록 실패로 남긴다", async () => {
      mockPayoutApi.upsertSubMall
        .mockResolvedValueOnce(result("TERMINAL", "1106"))
        .mockResolvedValueOnce(result("TERMINAL", "1105"));

      await service.upsert("team-1", dto, owner);

      expect(
        mockPrisma.teamSettlementAccount.deleteMany,
      ).not.toHaveBeenCalled();
      expect(finalWrite().data).toMatchObject({
        status: "FAILED",
        lastResCode: "1105",
      });
    });

    it("등록된 계좌를 바꾸는 중 결과 불명이면 새 내용(확인 중)을 그대로 둔다", async () => {
      existingRow = registeredPrevious();
      registrationRow.subMallId = "team-1";
      mockPayoutApi.upsertSubMall.mockResolvedValue(
        result("AMBIGUOUS", null, "timeout"),
      );

      await service.upsert(
        "team-1",
        { ...dto, bankAccount: "999888777" },
        owner,
      );

      const claimCall =
        mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0];
      expect(claimCall.data.status).toBe("SUBMITTED");
      expect(isEncryptedField(claimCall.data.bankAccount)).toBe(true);
      const write = finalWrite();
      expect(write.data).not.toHaveProperty("status");
      expect(write.data).not.toHaveProperty("bankAccount");
      expect(write.data.lastResMsg).toBeTruthy();
      expect(write.data.registrationStartedAt).toBeNull();
    });

    it.each([
      ["결과 불명(무응답)", "AMBIGUOUS", null],
      ["설정 오류", "CONFIG", "1000"],
    ] as const)(
      "%s 이면 상태를 바꾸지 않고 진행 표시만 푼다",
      async (_l, outcome, code) => {
        jest
          .spyOn(Logger.prototype, "error")
          .mockImplementation(() => undefined);
        mockPayoutApi.upsertSubMall.mockResolvedValue(
          result(outcome, code, code ? null : "timeout"),
        );

        await service.upsert("team-1", dto, owner);

        const write = finalWrite();
        expect(write.data.status).toBeUndefined();
        expect(write.data.subMallId).toBeUndefined();
        expect(write.data.registrationStartedAt).toBeNull();
        expect(write.data.lastResMsg).toBeTruthy();
      },
    );

    it("신규 등록이 1106(이미 있음)이면 수정으로 한 번만 다시 요청한다", async () => {
      mockPayoutApi.upsertSubMall
        .mockResolvedValueOnce(result("TERMINAL", "1106"))
        .mockResolvedValueOnce(result("SUCCESS", "0000"));

      await service.upsert("team-1", dto, owner);

      expect(
        mockPayoutApi.upsertSubMall.mock.calls.map((c) => c[0].reqType),
      ).toEqual([0, 1]);
      expect(finalWrite().data.status).toBe("REGISTERED");
    });

    it("서브몰 ID 가 있으면 수정(reqType 1)하고, 1105(없음)면 신규로 한 번만 다시 요청한다", async () => {
      existingRow = { ...storedRow(), status: "REGISTERED" };
      registrationRow.subMallId = "team-1";
      mockPayoutApi.upsertSubMall
        .mockResolvedValueOnce(result("TERMINAL", "1105"))
        .mockResolvedValueOnce(result("TERMINAL", "1106"));

      await service.upsert(
        "team-1",
        { ...dto, bankAccount: "999888777" },
        owner,
      );

      expect(
        mockPayoutApi.upsertSubMall.mock.calls.map((c) => c[0].reqType),
      ).toEqual([1, 0]);
      // 1106 은 입력 오류가 아니라 되돌리지 않고 등록 실패로 남긴다.
      expect(finalWrite().data.status).toBe("FAILED");
    });

    it("계좌가 바뀌면 새 내용을 먼저 확인 중으로 쓰고, 나이스 성공 뒤 등록 완료로 바꾼다", async () => {
      existingRow = registeredPrevious();
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("SUCCESS", "0000"));

      await service.upsert(
        "team-1",
        { ...dto, bankAccount: "999888777" },
        owner,
      );

      const claimCall =
        mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0];
      expect(claimCall.where.OR).toHaveLength(2);
      expect(claimCall.data).toMatchObject({
        status: "SUBMITTED",
        bankCode: "004",
        submittedById: "director-1",
        registrationStartedAt: expect.any(Date),
      });
      expect(isEncryptedField(claimCall.data.bankAccount)).toBe(true);
      expect(finalWrite().data).toMatchObject({
        status: "REGISTERED",
        registrationStartedAt: null,
      });
      expect(mockPrisma.teamSettlementAccount.update).not.toHaveBeenCalled();
    });

    it("등록 완료 상태에서 같은 내용을 다시 저장하면 나이스를 부르지 않는다", async () => {
      existingRow = { ...storedRow(), status: "REGISTERED" };

      await service.upsert("team-1", dto, owner);

      expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
      expect(
        mockPrisma.teamSettlementAccount.updateMany,
      ).not.toHaveBeenCalled();
    });

    it("실패 상태에서 같은 내용을 다시 저장하면 재시도로 보고 나이스를 다시 부른다", async () => {
      existingRow = { ...storedRow(), status: "FAILED" };
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("SUCCESS", "0000"));

      await service.upsert("team-1", dto, owner);

      const claimCall =
        mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0];
      expect(Object.keys(claimCall.data)).toEqual(["registrationStartedAt"]);
      expect(mockPayoutApi.upsertSubMall).toHaveBeenCalledTimes(1);
    });

    it("같은 팀 등록이 진행 중이면 409 SUBMALL_REGISTRATION_IN_PROGRESS, 나이스를 부르지 않는다", async () => {
      existingRow = { ...storedRow(), status: "SUBMITTED" };
      mockPrisma.teamSettlementAccount.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      mockPrisma.teamSettlementAccount.findUnique.mockImplementation(
        ({ select }: { select: Record<string, unknown> }) =>
          select.businessNumber
            ? existingRow
            : { registrationStartedAt: new Date(Date.now() - 5_000) },
      );

      const err = await service
        .upsert("team-1", { ...dto, bankAccount: "999888777" }, owner)
        .catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().errorCode).toBe(
        "SUBMALL_REGISTRATION_IN_PROGRESS",
      );
      expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
    });

    it("읽은 뒤 계좌가 바뀌었으면(수정 시각 불일치) 진행 표시를 잡지 못하고 409 계좌 변경", async () => {
      existingRow = { ...storedRow(), status: "SUBMITTED" };
      mockPrisma.teamSettlementAccount.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      mockPrisma.teamSettlementAccount.findUnique.mockImplementation(
        ({ select }: { select: Record<string, unknown> }) =>
          select.businessNumber ? existingRow : { registrationStartedAt: null },
      );

      const err = await service
        .upsert("team-1", { ...dto, bankAccount: "999888777" }, owner)
        .catch((e) => e);

      const claimWhere =
        mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0].where;
      expect(claimWhere.updatedAt).toEqual(new Date("2026-09-29T00:00:00Z"));
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({
        message: "계좌 정보가 변경되었습니다. 새로고침 후 다시 확인해주세요.",
      });
      expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
    });

    it("23:00~01:00(KST)에는 저장 전에 409 SUBMALL_WINDOW_CLOSED", async () => {
      (Date.now as jest.Mock).mockReturnValue(Date.UTC(2026, 8, 29, 14, 30));

      const err = await service.upsert("team-1", dto, owner).catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().errorCode).toBe("SUBMALL_WINDOW_CLOSED");
      expect(mockPrisma.teamSettlementAccount.create).not.toHaveBeenCalled();
      expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
    });

    it("초기화 뒤 새로 등록하면 이미 쓴 서브몰 ID 다음 번호(-2)를 쓴다", async () => {
      mockPrisma.nicePayoutApiLog.findMany.mockResolvedValue([
        { subId: "team-1" },
      ]);
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("SUCCESS", "0000"));

      await service.upsert("team-1", dto, owner);

      expect(mockPayoutApi.upsertSubMall.mock.calls[0][0].subId).toBe(
        "team-1-2",
      );
      expect(finalWrite().data.subMallId).toBe("team-1-2");
      // 지금 계좌 이전의 성공·결과 불명 호출만 쓴 ID 로 본다.
      expect(
        mockPrisma.nicePayoutApiLog.findMany.mock.calls[0][0].where,
      ).toMatchObject({
        outcome: { in: ["SUCCESS", "AMBIGUOUS"] },
        createdAt: { lt: new Date("2026-09-29T00:00:00Z") },
      });
    });

    it("이미 나이스에 등록된 계좌를 운영자가 다시 맞추다 거절되면 등록 완료를 유지하고 사유만 남긴다", async () => {
      registrationRow.status = "REGISTERED";
      registrationRow.subMallId = "team-1";
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("TERMINAL", "1003"));

      await service.registerByAdmin("team-1", "admin-1");

      const write = finalWrite();
      expect(write.data.status).toBeUndefined();
      expect(write.data.lastResCode).toBe("1003");
    });

    it("서브몰 이름은 UTF-8 50바이트를 넘지 않게 자른다", async () => {
      registrationRow.team = { name: "가".repeat(30) };
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("SUCCESS", "0000"));

      await service.upsert("team-1", dto, owner);

      const subNm = mockPayoutApi.upsertSubMall.mock.calls[0][0].subNm;
      expect(Buffer.byteLength(subNm, "utf8")).toBeLessThanOrEqual(50);
      expect(subNm).toBe("가".repeat(16));
    });

    it("진행 표시가 그 사이 바뀌었으면(초기화·인계) 나이스를 부르지 않는다", async () => {
      mockPrisma.teamSettlementAccount.findUnique.mockImplementation(
        ({ select }: { select: Record<string, unknown> }) => {
          if (select.team) {
            return { ...registrationRow, registrationStartedAt: new Date(0) };
          }
          if (select.registeredBy) return storedRow();
          return existingRow;
        },
      );

      await service.upsert("team-1", dto, owner);

      expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
    });

    it("호출 준비 중 오류(복호화 실패)가 나면 진행 표시를 풀고 오류를 올린다", async () => {
      const currentKey = process.env.FIELD_ENCRYPTION_KEY;
      process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
      registrationRow.businessNumber = encryptField("1234567890");
      process.env.FIELD_ENCRYPTION_KEY = currentKey;
      jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      await expect(service.upsert("team-1", dto, owner)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(finalWrite()).toEqual({
        where: { teamId: "team-1", registrationStartedAt: claim },
        data: { registrationStartedAt: null },
      });
      expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
    });

    it("live 에서는 운영자 수동 등록 완료 표시가 409 PAYOUT_API_LIVE", async () => {
      const err = await service
        .updateRegistration(
          "team-1",
          {
            status: "REGISTERED",
            expectedUpdatedAt: "2026-09-29T00:00:00.000Z",
          },
          "admin-1",
        )
        .catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().errorCode).toBe("PAYOUT_API_LIVE");
      expect(
        mockPrisma.teamSettlementAccount.updateMany,
      ).not.toHaveBeenCalled();
    });

    it("운영자 재등록은 live 에서만 되고, 진행 표시를 잡은 뒤 나이스를 부른다", async () => {
      mockPayoutApi.upsertSubMall.mockResolvedValue(result("SUCCESS", "0000"));

      await service.registerByAdmin("team-1", "admin-1");

      expect(mockPayoutApi.upsertSubMall.mock.calls[0][1]).toEqual({
        teamId: "team-1",
        requestedBy: "admin-1",
      });

      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: "readonly",
      });
      const err = await service
        .registerByAdmin("team-1", "admin-1")
        .catch((e) => e);
      expect(err.getResponse().errorCode).toBe("PAYOUT_API_NOT_LIVE");
    });

    it("운영자 재등록 대상 계좌가 없으면 404", async () => {
      mockPrisma.teamSettlementAccount.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      mockPrisma.teamSettlementAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.registerByAdmin("team-1", "admin-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("감독 저장 정책: live 면 api, 등록 불가 시간이면 저장 불가 사유를 내려준다", async () => {
      await expect(service.getRegistrationPolicy()).resolves.toEqual({
        registrationMode: "api",
        saveBlockedReason: null,
      });
      (Date.now as jest.Mock).mockReturnValue(Date.UTC(2026, 8, 29, 15, 10));
      const policy = await service.getRegistrationPolicy();
      expect(policy.saveBlockedReason).toContain("23:00~01:00");

      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: "off",
      });
      await expect(service.getRegistrationPolicy()).resolves.toEqual({
        registrationMode: "manual",
        saveBlockedReason: null,
      });
    });
  });

  it("off 모드 저장은 나이스를 부르지 않는다", async () => {
    mockPrisma.teamSettlementAccount.findUnique.mockResolvedValueOnce(null);
    mockPrisma.teamSettlementAccount.findUnique.mockResolvedValueOnce(
      storedRow(),
    );

    await service.upsert("team-1", dto, owner);

    expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
    expect(
      mockPrisma.teamSettlementAccount.create.mock.calls[0][0].data,
    ).not.toHaveProperty("registrationStartedAt");
  });

  it("수동 운영에서 등록 실패 계좌를 같은 내용으로 다시 저장하면 운영자 확인 대기로 되돌린다", async () => {
    mockPrisma.teamSettlementAccount.findUnique
      .mockResolvedValueOnce({ ...storedRow(), status: "FAILED" })
      .mockResolvedValueOnce(storedRow());

    await service.upsert("team-1", dto, owner);

    expect(
      mockPrisma.teamSettlementAccount.update.mock.calls[0][0].data,
    ).toMatchObject({
      status: "SUBMITTED",
      lastResCode: null,
      lastResMsg: null,
    });
    expect(mockPayoutApi.upsertSubMall).not.toHaveBeenCalled();
  });

  it("운영자 수동 등록 상태 변경은 이전 나이스 응답 사유를 지운다", async () => {
    mockPrisma.teamSettlementAccount.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    await service.updateRegistration(
      "team-1",
      { status: "REGISTERED", expectedUpdatedAt: "2026-09-29T00:00:00.000Z" },
      "admin-1",
    );

    expect(
      mockPrisma.teamSettlementAccount.updateMany.mock.calls[0][0].data,
    ).toMatchObject({ lastResCode: null, lastResMsg: null });
  });
});
