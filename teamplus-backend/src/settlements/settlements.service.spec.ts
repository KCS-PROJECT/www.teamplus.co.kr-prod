import { Test, TestingModule } from "@nestjs/testing";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SettlementsService, escapeLikePattern } from "./settlements.service";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { PrismaService } from "@/prisma/prisma.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { RedisService } from "@/redis/redis.service";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { encryptField } from "@/common/utils/field-encryption.util";
import { randomBytes } from "crypto";

// 필드 암호화 유틸이 요구하는 서버 전용 키(64 hex) — 테스트 환경엔 없으므로 즉석 생성해 채운다.
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ?? randomBytes(32).toString("hex");

describe("SettlementsService", () => {
  let service: SettlementsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    settlement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    settlementDetail: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    settlementTransaction: {
      create: jest.fn(),
    },
    team: {
      findMany: jest.fn(),
    },
    appSettings: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const mockPayoutApi = { getBalance: jest.fn() };
  const mockRedis = { get: jest.fn(), set: jest.fn() };
  const configValues: Record<string, string | undefined> = {};
  const mockConfig = { get: jest.fn((key: string) => configValues[key]) };

  const mockResourceAccess = {
    resolveTeamScope: jest.fn(),
  };

  const mockAccountService = {
    loadBankNames: jest.fn(),
    getPayoutAccount: jest.fn(),
  };

  const registeredAccount = {
    status: "REGISTERED",
    bankName: "KB국민은행",
    bankAccount: "enc:account",
    accountHolder: "블랭크하키",
    updatedAt: new Date("2026-09-29T01:00:00.000Z"),
  };

  const setupTransaction = () => {
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
  };

  const asUser = (id: string, userType: string): JwtUserPayload => ({
    id,
    email: `${id}@t.dev`,
    userType,
  });

  const admin = asUser("admin-1", "ADMIN");
  const director = asUser("director-1", "DIRECTOR");
  const otherCoach = asUser("coach-999", "COACH");
  const coach = asUser("coach-1", "COACH");

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ResourceAccessService, useValue: mockResourceAccess },
        { provide: TeamSettlementAccountService, useValue: mockAccountService },
        { provide: NicePayoutApiService, useValue: mockPayoutApi },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
    jest.clearAllMocks();
    setupTransaction();
    mockPrisma.$queryRaw.mockResolvedValue(undefined);
    // approve/reject/payout 가 advisory lock 을 얻기 위해 조회하는 teamId 기본값.
    //   개별 테스트가 findUnique 를 재정의하면 이 기본값은 그 테스트에서 덮인다.
    mockPrisma.settlement.findUnique.mockResolvedValue({ teamId: "team-1" });
    mockAccountService.loadBankNames.mockResolvedValue(
      new Map([["004", "KB국민은행"]]),
    );
    mockAccountService.getPayoutAccount.mockResolvedValue(registeredAccount);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== getSettlements (스코프) ====================

  describe("getSettlements", () => {
    it("계좌 상태는 team 객체가 아니라 행 최상위 accountStatus 로 내려준다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([
        {
          id: "s-1",
          team: {
            id: "team-1",
            name: "팀1",
            settlementAccount: { status: "REGISTERED" },
          },
        },
        {
          id: "s-2",
          team: { id: "team-2", name: "팀2", settlementAccount: null },
        },
      ]);
      mockPrisma.settlement.count.mockResolvedValue(2);

      const result = await service.getSettlements({}, admin);

      expect(result.data[0].team).toEqual({ id: "team-1", name: "팀1" });
      expect(result.data[0].accountStatus).toBe("REGISTERED");
      expect(result.data[1].accountStatus).toBeNull();
    });

    it("목록 select 는 계좌 관련 필드(bankName·bankAccount·accountHolder)를 조회하지 않는다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({} as any, admin);

      const { select } = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(select.bankName).toBeUndefined();
      expect(select.bankAccount).toBeUndefined();
      expect(select.accountHolder).toBeUndefined();
    });

    it("ADMIN + teamId 지정 시 스코프 조회 없이 해당 팀만 필터한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({ teamId: "team-1" } as any, admin);

      expect(mockResourceAccess.resolveTeamScope).not.toHaveBeenCalled();
      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.teamId).toBe("team-1");
    });

    it("ADMIN 이 teamId 없이 조회하면 팀 필터를 걸지 않는다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({} as any, admin);

      expect(mockResourceAccess.resolveTeamScope).not.toHaveBeenCalled();
      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.teamId).toBeUndefined();
    });

    it("startDate/endDate 는 KST 달력일 경계(UTC 자정 −9h / +15h)로 변환한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements(
        { startDate: "2026-01-01", endDate: "2026-01-31" } as any,
        admin,
      );

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toEqual({
        gte: new Date("2025-12-31T15:00:00.000Z"),
        lt: new Date("2026-01-31T15:00:00.000Z"),
      });
    });

    it("DIRECTOR 는 관리 팀 교집합으로만 조회한다", async () => {
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-a"]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({} as any, director);

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.teamId).toEqual({ in: ["team-a"] });
    });

    it("타 팀 teamId 지정(관리 범위 밖) → 빈 결과, DB 미조회", async () => {
      mockResourceAccess.resolveTeamScope.mockResolvedValue([]);

      const result = await service.getSettlements(
        { teamId: "team-other" } as any,
        otherCoach,
      );

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(mockPrisma.settlement.findMany).not.toHaveBeenCalled();
    });

    it("월(month) 필터를 settlementMonth 로 적용한다", async () => {
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({ month: "2026-04" } as any, admin);

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.settlementMonth).toBe("2026-04");
    });

    it("페이지네이션 메타를 올바르게 반환한다", async () => {
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(45);

      const result = await service.getSettlements(
        { page: 3, pageSize: 10 } as any,
        admin,
      );

      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        pageSize: 10,
        totalPages: 5,
      });
    });
  });

  // ==================== getSettlementById ====================

  describe("getSettlementById", () => {
    const baseSettlement = {
      id: "s-1",
      teamId: "team-1",
      settlementMonth: "2026-01",
      status: "pending",
      bankAccount: null,
      transactions: [],
      manager: null,
      team: { id: "team-1", name: "Test Team", settlementAccount: null },
    };

    const withTeamAccount = () => ({
      ...baseSettlement,
      team: {
        id: "team-1",
        name: "Test Team",
        settlementAccount: {
          status: "SUBMITTED",
          bankCode: "004",
          bankAccount: encryptField("110222333444"),
          accountHolder: "블랭크하키",
        },
      },
    });

    it("현재 팀 계좌는 관리자 평문·감독 마스킹·코치 상태만, team 응답에는 계좌를 싣지 않는다", async () => {
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);

      mockPrisma.settlement.findUnique.mockResolvedValue(withTeamAccount());
      const asAdmin = await service.getSettlementById("s-1", admin);
      expect(asAdmin.teamSettlementAccount).toEqual({
        status: "SUBMITTED",
        bankName: "KB국민은행",
        bankAccount: "110222333444",
        accountHolder: "블랭크하키",
      });
      expect(asAdmin.team).toEqual({ id: "team-1", name: "Test Team" });

      mockPrisma.settlement.findUnique.mockResolvedValue(withTeamAccount());
      const asDirector = await service.getSettlementById("s-1", director);
      expect(asDirector.teamSettlementAccount?.bankAccount).toBe("****3444");

      mockPrisma.settlement.findUnique.mockResolvedValue(withTeamAccount());
      const asCoach = await service.getSettlementById("s-1", coach);
      expect(asCoach.teamSettlementAccount).toEqual({
        status: "SUBMITTED",
        bankName: null,
        bankAccount: null,
        accountHolder: null,
      });
    });

    it("스코프 통과 + 관리자급이면 계좌 평문을 반환한다", async () => {
      const encrypted = encryptField("110-222-333444");
      mockPrisma.settlement.findUnique.mockResolvedValue({
        ...baseSettlement,
        bankAccount: encrypted,
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);

      const result = await service.getSettlementById("s-1", admin);

      expect(result.bankAccount).toBe("110-222-333444");
    });

    it("스코프 통과 + 비관리자면 계좌를 마스킹한다", async () => {
      const encrypted = encryptField("110-222-333444");
      mockPrisma.settlement.findUnique.mockResolvedValue({
        ...baseSettlement,
        bankAccount: encrypted,
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);

      const result = await service.getSettlementById("s-1", director);

      expect(result.bankAccount).toBe("****3444");
    });

    it("[보안] 스코프 밖이면 ForbiddenException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(baseSettlement);
      mockResourceAccess.resolveTeamScope.mockResolvedValue([]);

      await expect(
        service.getSettlementById("s-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("존재하지 않는 정산이면 NotFoundException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(
        service.getSettlementById("not-exist", admin),
      ).rejects.toThrow(NotFoundException);
    });

    it("COACH 는 스코프 통과해도 bankName·bankAccount·accountHolder 가 null 이다", async () => {
      const encrypted = encryptField("110-222-333444");
      mockPrisma.settlement.findUnique.mockResolvedValue({
        ...baseSettlement,
        bankName: "국민은행",
        bankAccount: encrypted,
        accountHolder: "홍길동",
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);

      const result = await service.getSettlementById("s-1", coach);

      expect(result.bankName).toBeNull();
      expect(result.bankAccount).toBeNull();
      expect(result.accountHolder).toBeNull();
    });
  });

  // ==================== getSettlementDetails (스코프) ====================

  describe("getSettlementDetails", () => {
    it("스코프 밖이면 ForbiddenException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        teamId: "team-1",
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue([]);

      await expect(
        service.getSettlementDetails(
          "s-1",
          { page: 1, pageSize: 20 },
          otherCoach,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("스코프 통과 시 상세 내역을 페이징 반환한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        teamId: "team-1",
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);
      mockPrisma.settlementDetail.findMany.mockResolvedValue([]);
      mockPrisma.settlementDetail.count.mockResolvedValue(0);

      const result = await service.getSettlementDetails(
        "s-1",
        { page: 1, pageSize: 20 },
        director,
      );

      expect(result.meta.page).toBe(1);
    });

    it("존재하지 않는 정산이면 NotFoundException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(
        service.getSettlementDetails(
          "not-exist",
          { page: 1, pageSize: 20 },
          admin,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("COACH 는 스코프 통과해도 건별 명세는 403 이다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        teamId: "team-1",
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);

      await expect(
        service.getSettlementDetails("s-1", { page: 1, pageSize: 20 }, coach),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.settlementDetail.findMany).not.toHaveBeenCalled();
    });
  });

  // ==================== 명세 필터·요약·CSV ====================

  describe("명세 필터·요약·CSV", () => {
    const inScope = () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        teamId: "team-1",
        settlementMonth: "2026-07",
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue(["team-1"]);
      mockPrisma.settlementDetail.findMany.mockResolvedValue([]);
      mockPrisma.settlementDetail.count.mockResolvedValue(0);
    };

    it("구분·검색어·출처 필터가 where 로 전달되고 count 와 같은 조건이다", async () => {
      inScope();
      mockPrisma.$queryRaw.mockResolvedValue([{ id: "d-1" }, { id: "d-2" }]);

      await service.getSettlementDetails(
        "s-1",
        {
          page: 2,
          pageSize: 10,
          entryType: "REFUND",
          q: "화요",
          sourceType: "CLASS",
          sourceId: "cls-1",
        },
        director,
      );

      const where = {
        settlementId: "s-1",
        entryType: "REFUND",
        sourceType: "CLASS",
        sourceId: "cls-1",
        id: { in: ["d-1", "d-2"] },
      };
      expect(mockPrisma.settlementDetail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 10, take: 10 }),
      );
      expect(mockPrisma.settlementDetail.count).toHaveBeenCalledWith({ where });
    });

    it("검색어의 역슬래시·%·_ 는 LIKE 리터럴로 이스케이프한다", () => {
      expect(escapeLikePattern("50%_a\\b")).toBe("50\\%\\_a\\\\b");
      expect(escapeLikePattern("화요")).toBe("화요");
    });

    it("검색어가 있으면 이스케이프된 패턴으로 이 정산 안에서만 찾는다", async () => {
      inScope();
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getSettlementDetails("s-1", { q: "%" }, admin);

      const sql = mockPrisma.$queryRaw.mock.calls[0][0];
      expect(sql.values).toEqual(["s-1", "%\\%%", "%\\%%"]);
      expect(mockPrisma.settlementDetail.count).toHaveBeenCalledWith({
        where: { settlementId: "s-1", id: { in: [] } },
      });
    });

    it("OTHER 출처는 sourceId=null + 상품명 정확 일치로 거른다", async () => {
      inScope();

      await service.getSettlementDetails(
        "s-1",
        { sourceType: "OTHER", productName: "알 수 없음" },
        admin,
      );

      expect(mockPrisma.settlementDetail.count).toHaveBeenCalledWith({
        where: {
          settlementId: "s-1",
          sourceType: "OTHER",
          sourceId: null,
          productName: "알 수 없음",
        },
      });
    });

    it("sourceId 없는 CLASS 그룹도 sourceId=null + 상품명으로 거른다(요약 그룹 키와 동일)", async () => {
      inScope();

      await service.getSettlementDetails(
        "s-1",
        { sourceType: "CLASS", productName: "화요반" },
        admin,
      );

      expect(mockPrisma.settlementDetail.count).toHaveBeenCalledWith({
        where: {
          settlementId: "s-1",
          sourceType: "CLASS",
          sourceId: null,
          productName: "화요반",
        },
      });
    });

    it("sourceId 만 오면 400", async () => {
      inScope();

      await expect(
        service.getSettlementDetails("s-1", { sourceId: "cls-1" }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      ["ADMIN", admin],
      ["DIRECTOR", director],
      ["COACH", coach],
    ])("요약은 %s 도 조회할 수 있다", async (_label, user) => {
      inScope();

      const result = await service.getSettlementDetailsSummary("s-1", user);

      expect(result.meta.groupCount).toBe(0);
    });

    it("요약도 스코프 밖이면 403, 없으면 404", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        teamId: "team-1",
      });
      mockResourceAccess.resolveTeamScope.mockResolvedValue([]);
      await expect(
        service.getSettlementDetailsSummary("s-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);

      mockPrisma.settlement.findUnique.mockResolvedValue(null);
      await expect(
        service.getSettlementDetailsSummary("x", admin),
      ).rejects.toThrow(NotFoundException);
    });

    it("CSV 는 COACH 403", async () => {
      inScope();

      await expect(
        service.exportSettlementDetails("s-1", {}, coach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("CSV 는 같은 필터로 전체 행을 내리고 음수 금액은 숫자로 둔다", async () => {
      inScope();
      mockPrisma.settlementDetail.findMany.mockResolvedValue([
        {
          entryType: "REFUND",
          sourceType: "CLASS",
          productName: "=HYPERLINK()",
          orderNumber: "ORD-1",
          paymentDate: new Date("2026-07-10T00:00:00Z"),
          paymentMethod: "card",
          attributionMonth: "2026-07",
          paymentAmount: -3000,
          feeRate: 0,
          feeAmount: 0,
          actualAmount: -3000,
          memo: "환불",
        },
      ]);

      const { buffer, filename } = await service.exportSettlementDetails(
        "s-1",
        { entryType: "REFUND", page: 3, pageSize: 5 },
        director,
      );

      const call = mockPrisma.settlementDetail.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ settlementId: "s-1", entryType: "REFUND" });
      expect(call.skip).toBeUndefined();
      expect(call.take).toBe(10001);
      expect(mockPrisma.settlementDetail.count).not.toHaveBeenCalled();
      const csv = buffer.toString("utf-8");
      expect(csv).toContain(
        "환불,수업,'=HYPERLINK(),ORD-1,2026-07-10,card,2026-07,-3000,0,0,-3000,환불",
      );
      expect(filename).toBe("settlement_details_2026-07_s-1.csv");
    });

    it("CSV 상한을 넘으면 400", async () => {
      inScope();
      mockPrisma.settlementDetail.findMany.mockResolvedValue(
        Array.from({ length: 10001 }, () => ({})),
      );

      await expect(
        service.exportSettlementDetails("s-1", {}, admin),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== approve ====================

  describe("approve", () => {
    it("pending → approved 전이에 성공하고 소속 Detail 을 APPROVED 로 동기화한다", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "approved",
        managerId: "admin-1",
        managerApprovalStatus: "APPROVED",
        managerApprovalAt: new Date(),
      });

      const result = await service.approve("s-1", "admin-1", "확인 완료");

      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { id: "s-1", status: "pending", netAmount: { gte: 0 } },
        data: expect.objectContaining({
          status: "approved",
          managerId: "admin-1",
          managerApprovalStatus: "APPROVED",
        }),
      });
      expect(mockPrisma.settlementDetail.updateMany).toHaveBeenCalledWith({
        where: { settlementId: "s-1" },
        data: { status: "APPROVED" },
      });
      expect(result.status).toBe("approved");
    });

    it("마감 생성기와 동일한 팀 단위 advisory lock 을 tx 선두에서 획득한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({ teamId: "team-42" });
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "approved",
      });

      await service.approve("s-1", "admin-1");

      // acquireSettlementCloseLock 은 내부적으로 $queryRaw(pg_advisory_xact_lock) 를 호출한다 —
      //   마감 생성기(SettlementCloseService)의 재마감과 같은 lock 을 공유함을 증명한다.
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("이미 approved 인 정산은 updateMany count 0 → 400, 거래 행 미생성", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "approved",
      });

      await expect(service.approve("s-1", "admin-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
    });

    it("순지급액이 음수면 상태가 pending 이어도 승인할 수 없다(전용 메시지, Detail 불변)", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "pending",
        netAmount: -1000,
      });

      await expect(service.approve("s-1", "admin-1")).rejects.toThrow(
        "순지급액이 음수인 정산은 승인할 수 없습니다. 다음 달 정산에서 처리하세요.",
      );
      expect(mockPrisma.settlementDetail.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.settlement.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("존재하지 않는 정산이면 NotFoundException", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(service.approve("not-exist", "admin-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== reject ====================

  describe("reject", () => {
    it("pending → rejected 전이에 성공하고 사유를 반환한다", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "rejected",
        managerId: "admin-1",
        managerApprovalStatus: "REJECTED",
        managerApprovalAt: new Date(),
      });

      const result = await service.reject("s-1", "admin-1", "금액 오류");

      expect(result.reason).toBe("금액 오류");
      expect(result.status).toBe("rejected");
    });

    it("소속 Detail 을 REJECTED 로 동기화하고 사유를 SettlementTransaction(reject, amount 0)로 남긴다", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "rejected",
        managerId: "admin-1",
        managerApprovalStatus: "REJECTED",
        managerApprovalAt: new Date(),
      });

      await service.reject("s-1", "admin-1", "금액 오류");

      expect(mockPrisma.settlementDetail.updateMany).toHaveBeenCalledWith({
        where: { settlementId: "s-1" },
        data: { status: "REJECTED" },
      });
      expect(mockPrisma.settlementTransaction.create).toHaveBeenCalledTimes(1);
      const txArgs = mockPrisma.settlementTransaction.create.mock.calls[0][0];
      expect(txArgs.data).toEqual(
        expect.objectContaining({
          settlementId: "s-1",
          transactionType: "reject",
          amount: 0,
          description: "금액 오류",
        }),
      );
    });

    it("pending 이 아니면 400", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "paid",
      });

      await expect(service.reject("s-1", "admin-1", "사유")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== payout ====================

  describe("payout", () => {
    const approvedTarget = (netAmount: number) => ({
      teamId: "team-1",
      status: "approved",
      netAmount,
    });

    it("approved → paid 전이 성공 시 계좌를 스냅샷하고 SettlementTransaction(payout) 1건을 생성한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(
        approvedTarget(500000),
      );
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "paid",
        completedAt: new Date(),
        netAmount: 500000,
      });
      mockPrisma.settlementTransaction.create.mockResolvedValue({});

      const result = await service.payout("s-1", "admin-1");

      expect(result.status).toBe("paid");
      const updateArgs = mockPrisma.settlement.updateMany.mock.calls[0][0];
      expect(updateArgs.data).toEqual(
        expect.objectContaining({
          status: "paid",
          bankName: "KB국민은행",
          bankAccount: "enc:account",
          accountHolder: "블랭크하키",
        }),
      );
      expect(updateArgs.where).toEqual(
        expect.objectContaining({
          netAmount: { gt: 0 },
          team: {
            settlementAccount: {
              is: {
                status: "REGISTERED",
                updatedAt: registeredAccount.updatedAt,
              },
            },
          },
        }),
      );
      expect(mockPrisma.settlementTransaction.create).toHaveBeenCalledTimes(1);
      const txArgs = mockPrisma.settlementTransaction.create.mock.calls[0][0];
      expect(txArgs.data.transactionType).toBe("payout");
      expect(txArgs.data.amount).toBe(500000);
      expect(mockPrisma.settlementDetail.updateMany).toHaveBeenCalledWith({
        where: { settlementId: "s-1" },
        data: { status: "PAID" },
      });
    });

    it("확인 화면에서 본 계좌 버전과 다르면 409 SETTLEMENT_ACCOUNT_CHANGED, 상태 변경 없음", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(approvedTarget(5000));

      await expect(
        service.payout("s-1", "admin-1", undefined, "2026-09-28T00:00:00.000Z"),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          errorCode: "SETTLEMENT_ACCOUNT_CHANGED",
        }),
      });
      expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it("확인 화면에서 본 계좌 버전과 같으면 지급한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(approvedTarget(5000));
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "paid",
        completedAt: new Date(),
        netAmount: 5000,
      });

      await service.payout(
        "s-1",
        "admin-1",
        undefined,
        registeredAccount.updatedAt.toISOString(),
      );

      expect(mockPrisma.settlement.updateMany).toHaveBeenCalledTimes(1);
    });

    it("순지급액 0원은 계좌 없이 완료 처리하고 스냅샷을 남기지 않는다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(approvedTarget(0));
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.settlement.findUniqueOrThrow.mockResolvedValue({
        id: "s-1",
        status: "paid",
        completedAt: new Date(),
        netAmount: 0,
      });

      await service.payout("s-1", "admin-1");

      expect(mockAccountService.getPayoutAccount).not.toHaveBeenCalled();
      const updateArgs = mockPrisma.settlement.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toEqual(
        expect.objectContaining({ netAmount: 0 }),
      );
      expect(updateArgs.data.bankAccount).toBeUndefined();
    });

    it("approved 가 아니면 계좌를 보지 않고 상태 오류 400, 거래 행 없음(이중 요청 방지)", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        teamId: "team-1",
        status: "paid",
        netAmount: 500000,
      });
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockAccountService.getPayoutAccount.mockResolvedValue(null);

      await expect(service.payout("s-1", "admin-1")).rejects.toThrow(
        "현재 상태(paid)에서는 지급할 수 없습니다.",
      );
      expect(mockAccountService.getPayoutAccount).not.toHaveBeenCalled();
      expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
    });

    it("없는 정산이면 404", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);
      await expect(service.payout("x", "admin-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ["계좌 없음", null],
      ["나이스 등록 전", { ...registeredAccount, status: "SUBMITTED" }],
    ])(
      "팀 계좌가 %s 이면 409 이고 상태를 바꾸지 않는다",
      async (_label, account) => {
        mockPrisma.settlement.findUnique.mockResolvedValue(
          approvedTarget(5000),
        );
        mockAccountService.getPayoutAccount.mockResolvedValue(account);

        await expect(service.payout("s-1", "admin-1")).rejects.toMatchObject({
          status: 409,
          response: expect.objectContaining({
            errorCode: "SETTLEMENT_ACCOUNT_NOT_REGISTERED",
          }),
        });
        expect(mockPrisma.settlement.updateMany).not.toHaveBeenCalled();
      },
    );

    it("지급 직전에 계좌가 바뀌면(조건부 갱신 0건·approved·순지급액 양수) 409 SETTLEMENT_ACCOUNT_CHANGED", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.settlement.findUnique
        .mockResolvedValueOnce(approvedTarget(5000))
        .mockResolvedValueOnce({ status: "approved", netAmount: 5000 });

      await expect(service.payout("s-1", "admin-1")).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          errorCode: "SETTLEMENT_ACCOUNT_CHANGED",
        }),
      });
      expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
    });

    it("순지급액이 음수면 상태가 approved 여도 지급할 수 없다(방어 가드, 전용 메시지)", async () => {
      mockPrisma.settlement.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.settlement.findUnique.mockResolvedValue({
        teamId: "team-1",
        status: "approved",
        netAmount: -1000,
      });

      await expect(service.payout("s-1", "admin-1")).rejects.toThrow(
        "순지급액이 음수인 정산은 지급할 수 없습니다. 다음 달 정산에서 처리하세요.",
      );
      expect(mockAccountService.getPayoutAccount).not.toHaveBeenCalled();
      expect(mockPrisma.settlementTransaction.create).not.toHaveBeenCalled();
      expect(mockPrisma.settlementDetail.updateMany).not.toHaveBeenCalled();
    });
  });

  // ==================== exportSettlements ====================

  describe("exportSettlements", () => {
    it("13열 헤더 + BOM 을 포함한 CSV 를 생성한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([
        {
          id: "s-1",
          settlementMonth: "2026-01",
          totalRevenue: 100000,
          platformFee: 5000,
          paymentFee: 3000,
          refundAmount: 0,
          netAmount: 92000,
          status: "paid",
          bankName: "국민은행",
          bankAccount: encryptField("110-222-333444"),
          accountHolder: "홍길동",
          createdAt: new Date("2026-01-15T00:00:00Z"),
          team: { id: "team-1", name: "Test Team" },
        },
      ]);

      const buffer = await service.exportSettlements();
      const csv = buffer.toString("utf-8");

      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain(
        "ID,정산월,클럽명,총매출,플랫폼수수료,PG수수료,환불금액,정산금액,상태,은행명,계좌번호,예금주,생성일",
      );
      expect(csv).toContain("110-222-333444");
    });

    it("month 필터를 settlementMonth 로 적용한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);

      await service.exportSettlements(undefined, undefined, "2026-04");

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.settlementMonth).toBe("2026-04");
    });
  });

  // ==================== getSettlementsSummary ====================

  describe("getSettlementsSummary", () => {
    it("월 단위 상태별 건수·순지급액 합계를 반환한다", async () => {
      mockPrisma.settlement.groupBy.mockResolvedValue([
        { status: "pending", _count: { _all: 3 }, _sum: { netAmount: 30000 } },
        { status: "approved", _count: { _all: 2 }, _sum: { netAmount: 20000 } },
        { status: "paid", _count: { _all: 1 }, _sum: { netAmount: 10000 } },
        { status: "rejected", _count: { _all: 1 }, _sum: { netAmount: 0 } },
      ]);

      const result = await service.getSettlementsSummary("2026-07");

      expect(mockPrisma.settlement.groupBy).toHaveBeenCalledWith({
        by: ["status"],
        where: { settlementMonth: "2026-07" },
        _count: { _all: true },
        _sum: { netAmount: true },
      });
      expect(result).toEqual({
        pending: { count: 3, netAmount: 30000 },
        approved: { count: 2, netAmount: 20000 },
        paid: { count: 1, netAmount: 10000 },
        rejected: { count: 1 },
      });
    });

    it("특정 상태가 없으면 0으로 채운다", async () => {
      mockPrisma.settlement.groupBy.mockResolvedValue([]);

      const result = await service.getSettlementsSummary("2026-07");

      expect(result).toEqual({
        pending: { count: 0, netAmount: 0 },
        approved: { count: 0, netAmount: 0 },
        paid: { count: 0, netAmount: 0 },
        rejected: { count: 0 },
      });
    });

    it("month 형식이 아니면 400", async () => {
      await expect(service.getSettlementsSummary("2026-13")).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getSettlementsSummary("")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("month 를 생략하면 전체 기간을 집계한다(어드민 대시보드 위젯)", async () => {
      mockPrisma.settlement.groupBy.mockResolvedValue([]);

      const result = await service.getSettlementsSummary();

      expect(mockPrisma.settlement.groupBy).toHaveBeenCalledWith({
        by: ["status"],
        where: {},
        _count: { _all: true },
        _sum: { netAmount: true },
      });
      expect(result).toEqual({
        pending: { count: 0, netAmount: 0 },
        approved: { count: 0, netAmount: 0 },
        paid: { count: 0, netAmount: 0 },
        rejected: { count: 0 },
      });
    });
  });

  // ==================== getPayoutExport ====================

  describe("getPayoutExport", () => {
    it("approved 상태만 조회하고 팀 계좌를 복호화 평문으로 포함한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([
        {
          netAmount: 92000,
          team: {
            name: "Test Team",
            teamCode: "TP001",
            settlementAccount: {
              status: "REGISTERED",
              businessNumber: encryptField("1234567890"),
              bankCode: "004",
              bankAccount: encryptField("110222333444"),
              accountHolder: "홍길동",
            },
          },
        },
        {
          netAmount: 1000,
          team: {
            name: "No Account",
            teamCode: "TP002",
            settlementAccount: null,
          },
        },
      ]);

      const buffer = await service.getPayoutExport("2026-07");
      const csv = buffer.toString("utf-8");

      expect(mockPrisma.settlement.findMany.mock.calls[0][0].where).toEqual({
        settlementMonth: "2026-07",
        status: "approved",
        netAmount: { gt: 0 },
      });
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain(
        "팀명,팀코드,정산월,사업자등록번호,은행코드,은행명,계좌번호,예금주,순지급액,계좌상태",
      );
      expect(csv).toContain(
        "Test Team,TP001,2026-07,123-45-67890,004,KB국민은행,110222333444,홍길동,92000,등록완료",
      );
      expect(csv).toContain("No Account,TP002,2026-07,,,,,,1000,미등록");
    });

    it("팀명이 수식으로 시작하면 앞에 작은따옴표를 붙여 무해화한다(CSV 수식 주입 방지)", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([
        {
          netAmount: 1000,
          team: {
            name: "=SUM(A1:A10)",
            teamCode: "@evil",
            settlementAccount: null,
          },
        },
      ]);

      const buffer = await service.getPayoutExport("2026-07");
      const csv = buffer.toString("utf-8");

      expect(csv).toContain("'=SUM(A1:A10)");
      expect(csv).toContain("'@evil");
    });

    it("month 형식이 아니면 400", async () => {
      await expect(service.getPayoutExport("bad-month")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("음수·0원 정산은 쿼리 조건에서 제외한다(netAmount > 0)", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);

      await service.getPayoutExport("2026-07");

      const where = mockPrisma.settlement.findMany.mock.calls[0][0].where;
      expect(where.netAmount).toEqual({ gt: 0 });
    });
  });

  describe("지급대행 잔액·모드", () => {
    const meta = {
      sid: "0101001",
      resCode: "0000",
      resMsg: "성공",
      httpStatus: 200,
      durationMs: 10,
      error: null,
    };

    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      for (const key of Object.keys(configValues)) delete configValues[key];
    });

    it("off 면 나이스를 부르지 않고 409 PAYOUT_API_OFF", async () => {
      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: "off",
      });
      await expect(service.getPayoutBalance("admin-1")).rejects.toThrow(
        ConflictException,
      );
      expect(mockPayoutApi.getBalance).not.toHaveBeenCalled();
    });

    it("설정 조회가 실패하면 off 로 보고 나이스를 부르지 않는다", async () => {
      mockPrisma.appSettings.findFirst.mockRejectedValue(new Error("db down"));
      await expect(service.getPayoutBalance("admin-1")).rejects.toThrow(
        ConflictException,
      );
      expect(mockPayoutApi.getBalance).not.toHaveBeenCalled();
    });

    it("readonly 면 잔액을 돌려주고 요청자를 기록 문맥으로 넘긴다", async () => {
      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: "readonly",
      });
      mockPayoutApi.getBalance.mockResolvedValue({
        outcome: "SUCCESS",
        meta,
        remainAmt: 1500000,
      });
      const result = await service.getPayoutBalance("admin-1");
      expect(result.remainAmt).toBe(1500000);
      expect(mockPayoutApi.getBalance).toHaveBeenCalledWith({
        requestedBy: "admin-1",
      });
    });

    it("나이스 실패면 502 NICE_PAYOUT_API_FAILED", async () => {
      mockPrisma.appSettings.findFirst.mockResolvedValue({
        payoutApiMode: "live",
      });
      mockPayoutApi.getBalance.mockResolvedValue({
        outcome: "AMBIGUOUS",
        meta: { ...meta, resCode: null, error: "timeout" },
        remainAmt: null,
      });
      await expect(service.getPayoutBalance("admin-1")).rejects.toThrow(
        BadGatewayException,
      );
    });

    it("키가 없으면 readonly·live 는 선택할 수 없고 off 는 항상 선택 가능", () => {
      const modes = service.getPayoutModes();
      expect(modes.map((m) => [m.code, m.selectable])).toEqual([
        ["off", true],
        ["readonly", false],
        ["live", false],
      ]);
    });

    it("운영 환경에서는 가짜 게이트웨이 지정만으로 선택 가능해지지 않는다", () => {
      configValues.NICE_PAYOUT_GATEWAY = "fake";
      configValues.NODE_ENV = "production";
      expect(
        service.getPayoutModes().find((m) => m.code === "live")?.selectable,
      ).toBe(false);
      configValues.NODE_ENV = "development";
      expect(
        service.getPayoutModes().find((m) => m.code === "live")?.selectable,
      ).toBe(true);
    });

    it("선택 가능 판정은 게이트웨이와 같은 규칙 — 공백·대소문자 무시, 공백뿐인 키는 미설정", () => {
      configValues.NODE_ENV = "development";
      configValues.NICE_PAYOUT_GATEWAY = " Fake ";
      expect(
        service.getPayoutModes().find((m) => m.code === "live")?.selectable,
      ).toBe(true);
      configValues.NICE_PAYOUT_GATEWAY = "nice";
      configValues.NICE_PAYOUT_MID = "   ";
      configValues.NICE_PAYOUT_MERCHANT_KEY = "key";
      expect(
        service.getPayoutModes().find((m) => m.code === "live")?.selectable,
      ).toBe(false);
    });
  });
});
