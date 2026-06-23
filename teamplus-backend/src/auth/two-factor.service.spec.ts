import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TwoFactorService } from "./two-factor.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("TwoFactorService", () => {
  let service: TwoFactorService;

  const mockPrismaService = {
    twoFactorSecret: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue("test-secret-key-for-unit-tests-32b"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    jest.clearAllMocks();
  });

  // ── initEnable ────────────────────────────────────────────────────────────

  describe("initEnable", () => {
    it("secret 생성 후 upsert를 호출하고 otpauthUri를 반환한다", async () => {
      mockPrismaService.twoFactorSecret.upsert.mockResolvedValue({});

      const result = await service.initEnable("user-1", "test@example.com");

      expect(result.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
      expect(result.secret).toBeTruthy();
      expect(mockPrismaService.twoFactorSecret.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          create: expect.objectContaining({ enabled: false }),
          update: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it("otpauthUri에 올바른 issuer(TEAMPLUS)가 포함된다", async () => {
      mockPrismaService.twoFactorSecret.upsert.mockResolvedValue({});

      const result = await service.initEnable("user-1", "test@example.com");

      expect(result.otpauthUri).toContain("issuer=TEAMPLUS");
    });
  });

  // ── verifyAndEnable ───────────────────────────────────────────────────────

  describe("verifyAndEnable", () => {
    it("2FA 설정이 시작되지 않은 상태면 NotFoundException을 던진다", async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      await expect(service.verifyAndEnable("user-1", "123456")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("이미 활성화된 2FA에 재요청 시 BadRequestException을 던진다", async () => {
      // 암호화된 더미 secret 생성
      const encryptedSecret = service.encryptSecret(service.generateSecret());
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: encryptedSecret,
        enabled: true,
      });

      await expect(service.verifyAndEnable("user-1", "123456")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("잘못된 TOTP 코드 입력 시 UnauthorizedException을 던진다", async () => {
      const encryptedSecret = service.encryptSecret(service.generateSecret());
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: encryptedSecret,
        enabled: false,
      });

      // "000000"은 실제 TOTP 코드가 아니므로 거의 항상 실패
      await expect(service.verifyAndEnable("user-1", "000000")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("올바른 TOTP 코드 입력 시 enabled=true로 update를 호출한다", async () => {
      // 실제 TOTP 코드를 생성하여 검증
      const rawSecret = service.generateSecret();
      const encryptedSecret = service.encryptSecret(rawSecret);

      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: encryptedSecret,
        enabled: false,
      });
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({});

      // verifyTotp를 직접 spy하여 true 반환하도록 강제
      const verifySpy = jest.spyOn(service, "verifyTotp").mockReturnValue(true);

      await service.verifyAndEnable("user-1", "123456");

      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          data: { enabled: true },
        }),
      );

      verifySpy.mockRestore();
    });
  });

  // ── disable ───────────────────────────────────────────────────────────────

  describe("disable", () => {
    it("2FA가 비활성 상태에서 disable 시 BadRequestException을 던진다", async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      await expect(service.disable("user-1", "123456")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("enabled=false 레코드가 있어도 BadRequestException을 던진다", async () => {
      const encryptedSecret = service.encryptSecret(service.generateSecret());
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: encryptedSecret,
        enabled: false,
      });

      await expect(service.disable("user-1", "123456")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("올바른 코드 입력 시 2FA 레코드를 삭제한다", async () => {
      const encryptedSecret = service.encryptSecret(service.generateSecret());
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: encryptedSecret,
        enabled: true,
      });
      mockPrismaService.twoFactorSecret.delete.mockResolvedValue({});

      jest.spyOn(service, "verifyTotp").mockReturnValue(true);

      await service.disable("user-1", "123456");

      expect(mockPrismaService.twoFactorSecret.delete).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("잘못된 코드 입력 시 UnauthorizedException을 던진다", async () => {
      const encryptedSecret = service.encryptSecret(service.generateSecret());
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: encryptedSecret,
        enabled: true,
      });

      // 실제 잘못된 코드
      await expect(service.disable("user-1", "000000")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("2FA 설정이 없으면 enabled=false, createdAt=null 을 반환한다", async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      const result = await service.getStatus("user-1");

      expect(result.enabled).toBe(false);
      expect(result.createdAt).toBeNull();
    });

    it("2FA가 활성화된 경우 enabled=true 와 createdAt을 반환한다", async () => {
      const now = new Date();
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        enabled: true,
        createdAt: now,
      });

      const result = await service.getStatus("user-1");

      expect(result.enabled).toBe(true);
      expect(result.createdAt).toBe(now);
    });

    it("2FA 레코드가 있지만 비활성화된 경우 enabled=false 를 반환한다", async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        enabled: false,
        createdAt: new Date(),
      });

      const result = await service.getStatus("user-1");

      expect(result.enabled).toBe(false);
    });
  });

  // ── AES-256-GCM 암복호화 ──────────────────────────────────────────────────

  describe("encryptSecret / decryptSecret", () => {
    it("암호화 후 복호화하면 원본 값이 복원된다", () => {
      const original = service.generateSecret();
      const encrypted = service.encryptSecret(original);
      const decrypted = service.decryptSecret(encrypted);

      expect(decrypted).toBe(original);
    });

    it("잘못된 암호화 포맷 입력 시 BadRequestException을 던진다", () => {
      expect(() => service.decryptSecret("invalid-format")).toThrow(
        BadRequestException,
      );
    });
  });
});
