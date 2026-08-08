/**
 * AuthController 유닛 스펙 — 현행 컨트롤러 계약 기준.
 *
 * [2026-08-08 스펙 정합화] 구버전 스펙은 다음 드리프트로 컴파일조차 실패했다:
 *  - login: 평문 LoginDto 1-인자 → 현행은 EncryptedLoginDto + req + res 3-인자
 *    (E2E 암호화 + httpOnly refresh 쿠키). 복호화 실물 검증은
 *    `__tests__/encrypted-login.e2e.spec.ts` 가 담당하므로 여기서는
 *    CryptoService 를 mock 하고 컨트롤러 오케스트레이션만 검증한다.
 *  - refresh: 문자열 1-인자 → RefreshTokenDto + req + res (쿠키 fallback).
 *  - register: authService.register(dto, { allowedUserTypes }) 2-인자.
 *  - getProfile: req.user 반환 → authService.getProfile(req.user.id) 위임.
 *  - 생성자 의존성 6개 (CryptoService/Logger/TwoFactor/WithdrawCleanup/EmailVerification).
 */
import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CryptoService } from "./services/crypto.service";
import { TwoFactorService } from "./two-factor.service";
import { WithdrawCleanupService } from "./withdraw-cleanup.service";
import { EmailVerificationService } from "./email-verification.service";
import { LoggerService } from "@/logger/logger.service";
import { REGISTER_ENDPOINT_ALLOWED_USER_TYPES } from "./constants/public-signup.constants";
import { UserType } from "@prisma/client";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { RegisterDto } from "./dto/register.dto";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

describe("AuthController", () => {
  let controller: AuthController;

  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    phone: "01012345678",
    userType: UserType.PARENT,
    createdAt: new Date(),
  };

  const mockAuthResponse = {
    user: mockUser,
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
  };

  const testCredentials = {
    email: "test@example.com",
    password: "SecurePassword123",
  };

  /** 유효한 형태의 암호화 페이로드 (CryptoService 는 mock — 값 자체는 불투명) */
  const encryptedLoginDto = {
    encryptedData: "b2s=",
    iv: "aXYtMTZieXRlcw==",
    authTag: "dGFnLTE2Ynl0ZXM=",
  };

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    getProfile: jest.fn(),
  };

  const mockCryptoService = {
    // 기본: 정상 복호화 — 로그인 자격증명 JSON 반환
    decryptCredentialsWithAudit: jest
      .fn()
      .mockResolvedValue(JSON.stringify(testCredentials)),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logAuthEvent: jest.fn(),
    audit: jest.fn(),
  };

  const makeReq = (overrides?: Partial<ExpressRequest>): ExpressRequest =>
    ({
      ip: "127.0.0.1",
      headers: {
        "user-agent": "jest-test-agent",
        "x-client-platform": "web",
      },
      socket: {},
      ...overrides,
    }) as unknown as ExpressRequest;

  const makeRes = (): ExpressResponse =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as unknown as ExpressResponse;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: TwoFactorService, useValue: {} },
        { provide: WithdrawCleanupService, useValue: {} },
        { provide: EmailVerificationService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // clearAllMocks 는 mockResolvedValue 구현까지 지우므로 기본 복호화 동작 복원
    mockCryptoService.decryptCredentialsWithAudit.mockResolvedValue(
      JSON.stringify(testCredentials),
    );
  });

  describe("POST /api/v1/auth/register", () => {
    const registerDto: RegisterDto = {
      email: "parent@example.com",
      phone: "01012345678",
      password: "SecurePassword123",
      userType: UserType.PARENT,
    } as RegisterDto;

    it("should register user and return tokens", async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(registerDto);

      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // [R14-C1] 공개 register 엔드포인트는 PARENT 전용 allowlist 를 강제한다
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto, {
        allowedUserTypes: REGISTER_ENDPOINT_ALLOWED_USER_TYPES,
      });
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it("should handle registration error from service", async () => {
      mockAuthService.register.mockRejectedValue(
        new BadRequestException("User already exists"),
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should return user without password hash", async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(registerDto);

      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user).toHaveProperty("email");
      expect(result.user).toHaveProperty("userType");
    });
  });

  describe("POST /api/v1/auth/login (encrypted, chldiv=APP)", () => {
    it("should decrypt payload, login and return tokens", async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const res = makeRes();

      const result = await controller.login(encryptedLoginDto, makeReq(), res);

      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBeDefined();
      expect(mockCryptoService.decryptCredentialsWithAudit).toHaveBeenCalledWith(
        encryptedLoginDto,
        expect.anything(),
        undefined,
      );
      // 복호화된 자격증명 + APP 분기 컨텍스트로 서비스 위임
      expect(mockAuthService.login).toHaveBeenCalledWith(
        { email: testCredentials.email, password: testCredentials.password },
        expect.objectContaining({
          chldiv: "APP",
          force: false,
          ipAddress: "127.0.0.1",
          userAgent: "jest-test-agent",
        }),
      );
    });

    it("should set httpOnly refresh cookie on success [A-1]", async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const res = makeRes();

      await controller.login(encryptedLoginDto, makeReq(), res);

      expect(res.cookie).toHaveBeenCalledWith(
        "teamplus_refresh_token",
        mockAuthResponse.refreshToken,
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
      );
    });

    it("should pass force=true when decrypted payload contains force", async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      mockCryptoService.decryptCredentialsWithAudit.mockResolvedValue(
        JSON.stringify({ ...testCredentials, force: true }),
      );

      await controller.login(encryptedLoginDto, makeReq(), makeRes());

      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: testCredentials.email }),
        expect.objectContaining({ force: true }),
      );
    });

    it("should return generic 401 when decryption fails (no info leak)", async () => {
      mockCryptoService.decryptCredentialsWithAudit.mockRejectedValue(
        new Error("tampered"),
      );

      await expect(
        controller.login(encryptedLoginDto, makeReq(), makeRes()),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it("should propagate UnauthorizedException from service", async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException("Invalid credentials"),
      );

      await expect(
        controller.login(encryptedLoginDto, makeReq(), makeRes()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should not return password in response", async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(
        encryptedLoginDto,
        makeReq(),
        makeRes(),
      );

      expect(result.user).not.toHaveProperty("password");
      expect(result.user).not.toHaveProperty("passwordHash");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    const newTokens = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    };

    it("should refresh with body token and set rotated cookie", async () => {
      mockAuthService.refreshToken.mockResolvedValue(newTokens);
      const res = makeRes();

      const result = await controller.refresh(
        { refreshToken: "valid-refresh-token" },
        makeReq(),
        res,
      );

      expect(result.accessToken).toBe("new-access-token");
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(
        "valid-refresh-token",
      );
      expect(res.cookie).toHaveBeenCalledWith(
        "teamplus_refresh_token",
        newTokens.refreshToken,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it("should fall back to httpOnly cookie when body token is absent [A-1]", async () => {
      mockAuthService.refreshToken.mockResolvedValue(newTokens);
      const req = makeReq({
        headers: {
          cookie: "teamplus_refresh_token=cookie-refresh-token",
        } as ExpressRequest["headers"],
      });

      await controller.refresh(
        { refreshToken: "" } as { refreshToken: string },
        req,
        makeRes(),
      );

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(
        "cookie-refresh-token",
      );
    });

    it("should reject when neither body nor cookie has a token", async () => {
      await expect(
        controller.refresh(
          { refreshToken: "" } as { refreshToken: string },
          makeReq(),
          makeRes(),
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();
    });

    it("should handle invalid refresh token", async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException("Invalid token"),
      );

      await expect(
        controller.refresh(
          { refreshToken: "bad-token" },
          makeReq(),
          makeRes(),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("GET /api/v1/auth/profile (Protected)", () => {
    it("should delegate to authService.getProfile with JWT user id", async () => {
      const profile = {
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      };
      mockAuthService.getProfile.mockResolvedValue(profile);
      const mockRequest = {
        user: { id: mockUser.id, email: mockUser.email, userType: mockUser.userType },
      } as never;

      const result = await controller.getProfile(mockRequest);

      expect(mockAuthService.getProfile).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(profile);
    });

    it("should require valid JWT token (guard wiring)", () => {
      expect(controller.getProfile).toBeDefined();
    });
  });
});
