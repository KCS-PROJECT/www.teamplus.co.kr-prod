import { Test, TestingModule } from "@nestjs/testing";
import {
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
  };

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
});
