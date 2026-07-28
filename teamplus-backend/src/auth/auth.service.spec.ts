import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { AppleTokenService } from "./services/apple-token.service";
import { AccountLockoutService } from "./services/account-lockout.service";
import { LoggerService } from "@/logger/logger.service";
import { SmsService } from "@/sms/sms.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { MailService } from "@/mail/mail.service";
import { UserType } from "@prisma/client";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

describe("AuthService", () => {
  let service: AuthService;

  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    phone: "01012345678",
    passwordHash: "hashed-password",
    userType: UserType.PARENT,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    team: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    class: { count: jest.fn() },
    tournament: { count: jest.fn() },
    academy: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    enrollment: { count: jest.fn() },
    monthlyPostpaidBillingLine: { count: jest.fn() },
    tournamentRegistration: { count: jest.fn() },
    refundRequest: { count: jest.fn() },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    getConnectionStatus: jest.fn().mockReturnValue(true),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === "redis") {
        return {
          keyPrefix: {
            jwt: "jwt:blacklist:",
            refresh: "refresh:",
          },
          cacheTTL: {
            jwtBlacklist: 900,
            refreshToken: 604800,
          },
        };
      }
      const config: Record<string, any> = {
        JWT_EXPIRATION: "900",
        JWT_REFRESH_EXPIRATION: "604800",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AppleTokenService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(false),
            exchangeAuthorizationCode: jest.fn().mockResolvedValue(null),
            revokeRefreshToken: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AccountLockoutService,
          useValue: {
            checkIfLocked: jest.fn().mockResolvedValue(undefined),
            recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
            clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SmsService,
          useValue: {
            sendVerificationCode: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            logAuthEvent: jest.fn(),
            audit: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendMail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    const registerDto: RegisterDto = {
      email: "parent@example.com",
      phone: "01012345678",
      password: "SecurePassword123",
      userType: UserType.PARENT,
    };

    it("should register a new user successfully", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        id: "new-user-id",
        email: registerDto.email,
        phone: registerDto.phone,
        userType: registerDto.userType,
        createdAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.user.email).toBe(registerDto.email);
      expect(result.user.phone).toBe(registerDto.phone);
      expect(result.user.userType).toBe(UserType.PARENT);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email: registerDto.email }, { phone: registerDto.phone }],
        },
      });
    });

    it("should throw BadRequestException if user already exists by email", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        "이미 등록된 이메일 또는 휴대폰 번호입니다.",
      );
    });

    it("should throw BadRequestException if user already exists by phone", async () => {
      // Arrange
      const existingUser = { ...mockUser, email: "different@example.com" };
      mockPrismaService.user.findFirst.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should hash password correctly", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: registerDto.email,
      });

      // Act
      await service.register(registerDto);

      // Assert
      const createCall = mockPrismaService.user.create.mock.calls[0];
      const passwordHash = createCall[0].data.passwordHash;
      expect(passwordHash).not.toBe(registerDto.password);
      expect(await bcrypt.compare(registerDto.password, passwordHash)).toBe(
        true,
      );
    });

    it("should generate both access and refresh tokens", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign
        .mockReturnValueOnce("access-token")
        .mockReturnValueOnce("refresh-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: registerDto.email,
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe("login", () => {
    const loginDto: LoginDto = {
      email: "test@example.com",
      password: "SecurePassword123",
    };

    it("should login user successfully with correct credentials", async () => {
      // Arrange
      const passwordHash = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash,
      });
      mockJwtService.sign
        .mockReturnValueOnce("access-token")
        .mockReturnValueOnce("refresh-token");

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        "아이디 또는 비밀번호가 일치하지 않습니다.",
      );
    });

    it("should throw UnauthorizedException if password is incorrect", async () => {
      // Arrange
      const incorrectPasswordHash = await bcrypt.hash("WrongPassword123", 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: incorrectPasswordHash,
      });

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should not return password hash in response", async () => {
      // Arrange
      const passwordHash = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash,
      });
      mockJwtService.sign
        .mockReturnValueOnce("access-token")
        .mockReturnValueOnce("refresh-token");

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result.user).not.toHaveProperty("passwordHash");
    });
  });

  describe("refreshToken", () => {
    const refreshToken = "valid-refresh-token";

    it("should refresh token successfully with valid refresh token", async () => {
      // Arrange
      mockJwtService.verify.mockReturnValue({
        sub: mockUser.id,
        userType: mockUser.userType,
      });
      mockJwtService.sign
        .mockReturnValueOnce("new-access-token")
        .mockReturnValueOnce("new-refresh-token");

      // Act
      const result = await service.refreshToken(refreshToken);

      // Assert
      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-refresh-token");
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    });

    it("should throw UnauthorizedException if refresh token is invalid", async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      // Act & Assert
      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        "유효하지 않은 refresh token입니다.",
      );
    });

    it("should throw UnauthorizedException if refresh token is expired", async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Token expired");
      });

      // Act & Assert
      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should return new tokens with same user information", async () => {
      // Arrange
      const decodedPayload = {
        sub: "user-123",
        userType: UserType.COACH,
      };
      mockJwtService.verify.mockReturnValue(decodedPayload);
      mockJwtService.sign
        .mockReturnValueOnce("new-access-token")
        .mockReturnValueOnce("new-refresh-token");

      // Act
      const result = await service.refreshToken(refreshToken);

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Verify that the same userId and userType are used
      const signCalls = mockJwtService.sign.mock.calls;
      expect(signCalls[0][0].sub).toBe(decodedPayload.sub);
      expect(signCalls[0][0].userType).toBe(decodedPayload.userType);
    });
  });

  describe("validateUser", () => {
    it("should validate user successfully if user exists", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      });

      // Act
      const result = await service.validateUser(mockUser.id);

      // Assert
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.userType).toBe(mockUser.userType);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: {
          id: true,
          email: true,
          userType: true,
        },
      });
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.validateUser("non-existent-id")).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateUser("non-existent-id")).rejects.toThrow(
        "사용자를 찾을 수 없습니다.",
      );
    });

    it("should not include password hash in result", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      });

      // Act
      const result = await service.validateUser(mockUser.id);

      // Assert
      expect(result).not.toHaveProperty("passwordHash");
    });
  });

  describe("Token generation", () => {
    it("should generate tokens with correct payload structure", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        id: mockUser.id,
        email: "test@example.com",
        phone: "01012345678",
        userType: UserType.PARENT,
        createdAt: new Date(),
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "TestPassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const signCalls = mockJwtService.sign.mock.calls;
      expect(signCalls[0][0]).toHaveProperty("sub");
      expect(signCalls[0][0]).toHaveProperty("userType");
      expect(signCalls[0][0]).toHaveProperty("iat");
      expect(signCalls[0][1]).toHaveProperty("expiresIn");
    });

    it("should use correct expiration times", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        id: mockUser.id,
        email: "test@example.com",
        phone: "01012345678",
        userType: UserType.PARENT,
        createdAt: new Date(),
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "TestPassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const signCalls = mockJwtService.sign.mock.calls;
      const accessTokenOptions = signCalls[0][1];
      const refreshTokenOptions = signCalls[1][1];

      // Access token: 15 minutes (900 seconds)
      expect(accessTokenOptions.expiresIn).toBe(900);
      // Refresh token: 7 days (604800 seconds)
      expect(refreshTokenOptions.expiresIn).toBe(604800);
    });
  });

  describe("Security", () => {
    it("should not log passwords", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: "test@example.com",
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "SecurePassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const logCalls = consoleSpy.mock.calls.join().toLowerCase();
      expect(logCalls).not.toContain("securepassword123");

      consoleSpy.mockRestore();
    });

    it("should always hash passwords before storing", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: "test@example.com",
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "PlainPassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const createCall = mockPrismaService.user.create.mock.calls[0];
      const storedPassword = createCall[0].data.passwordHash;

      // Should not be plain password
      expect(storedPassword).not.toBe(registerDto.password);
      // Should be a hash (bcrypt hashes are long)
      expect(storedPassword.length).toBeGreaterThan(50);
    });

    it("should generate bcrypt hash with proper format", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: "test@example.com",
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "SecurePassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const createCall = mockPrismaService.user.create.mock.calls[0];
      const passwordHash = createCall[0].data.passwordHash;

      // Bcrypt hashes follow $2a$ or $2b$ pattern with specific format
      expect(passwordHash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe("requestWithdraw - 자산 보유 가드", () => {
    // 소셜 전용 계정(phone social_*)으로 만들어 비밀번호 검증 대신 확인 문구 경로 사용
    // (본인 확인은 가드 다음 단계라 가드 검증에는 영향 없음 — bcrypt 회피 목적)
    const WITHDRAW_CONFIRM = "탈퇴합니다";
    const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: "u-1",
      email: "someone@example.com",
      phone: "social_u1",
      passwordHash: "hash",
      status: "ACTIVE",
      userType: UserType.PARENT,
      ...overrides,
    });

    // 자산 count 기본값 0 (미차단) — 개별 테스트에서 필요한 것만 override
    const resetCountsToZero = () => {
      mockPrismaService.team.count.mockResolvedValue(0);
      mockPrismaService.class.count.mockResolvedValue(0);
      mockPrismaService.tournament.count.mockResolvedValue(0);
      mockPrismaService.academy.count.mockResolvedValue(0);
      mockPrismaService.enrollment.count.mockResolvedValue(0);
    };

    beforeEach(() => {
      resetCountsToZero();
    });

    // 18. DIRECTOR + 활성 팀 → 차단, status 미변경
    it("DIRECTOR + 운영 중 팀 보유 시 BadRequestException + 탈퇴 미전환", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.DIRECTOR }),
      );
      mockPrismaService.team.count.mockResolvedValue(1);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("운영 중인 팀");
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    // 19. DIRECTOR + 활성 수업(팀 경로) → 차단
    it("DIRECTOR + 활성 수업 보유 시 차단", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.DIRECTOR }),
      );
      mockPrismaService.class.count.mockResolvedValue(2);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("활성 수업 2개");
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    // 20. ACADEMY_DIRECTOR + 활성 수업(academy 경로) → 차단
    it("ACADEMY_DIRECTOR + 활성 수업 보유 시 차단", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.ACADEMY_DIRECTOR }),
      );
      mockPrismaService.class.count.mockResolvedValue(1);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("활성 수업");
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    // 21. DIRECTOR + scheduled/ongoing 대회 → 차단 / finished·cancelled 만이면 통과
    it("DIRECTOR + 진행 중 대회 보유 시 차단", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.DIRECTOR }),
      );
      mockPrismaService.tournament.count.mockResolvedValue(1);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("진행 중인 대회");
      // 대회 count 쿼리는 status IN (scheduled, ongoing) 로만 집계
      expect(mockPrismaService.tournament.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            team: { coachId: "u-1" },
            status: { in: ["scheduled", "ongoing"] },
          }),
        }),
      );
    });

    it("DIRECTOR + finished/cancelled 대회만이면 통과(대회 count 0)", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.DIRECTOR }),
      );
      // 모든 자산 0 → 정상 전환
      const result = await service.requestWithdraw(
        "u-1",
        undefined,
        undefined,
        WITHDRAW_CONFIRM,
      );
      expect(result).toHaveProperty("gracePeriodEnd");
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    // 22. ACADEMY_DIRECTOR + isActive 오픈클래스 → 차단
    it("ACADEMY_DIRECTOR + 오픈클래스 보유 시 차단", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.ACADEMY_DIRECTOR }),
      );
      mockPrismaService.academy.count.mockResolvedValue(1);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("오픈클래스");
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    // 23. 자산 2종 이상 → 메시지에 ", " 결합
    it("자산 2종 이상이면 개수 조합이 ', ' 로 결합된 메시지", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.DIRECTOR }),
      );
      mockPrismaService.team.count.mockResolvedValue(1);
      mockPrismaService.class.count.mockResolvedValue(3);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("운영 중인 팀 1개, 활성 수업 3개");
    });

    // 24. PARENT + 자녀 진행 중 수강신청 → 차단 / 그 외 상태만이면 통과
    it("PARENT + 자녀 진행 중 수강신청 있으면 차단", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.PARENT }),
      );
      mockPrismaService.enrollment.count.mockResolvedValue(1);

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("자녀의 진행 중인 수강신청");
      expect(mockPrismaService.enrollment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["pending", "pending_approval", "approved"] },
            child: { childParents: { some: { parentId: "u-1" } } },
          }),
        }),
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it("PARENT + paid/cancelled 수강신청만이면 통과(enrollment count 0)", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.PARENT }),
      );
      const result = await service.requestWithdraw(
        "u-1",
        undefined,
        undefined,
        WITHDRAW_CONFIRM,
      );
      expect(result).toHaveProperty("gracePeriodEnd");
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    // 25. 자산 없는 DIRECTOR → 정상 WITHDRAW_PENDING 전환
    it("자산 없는 DIRECTOR 는 정상 WITHDRAW_PENDING 전환", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.DIRECTOR }),
      );

      const result = await service.requestWithdraw(
        "u-1",
        undefined,
        undefined,
        WITHDRAW_CONFIRM,
      );

      expect(result).toHaveProperty("gracePeriodEnd");
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u-1" },
          data: expect.objectContaining({ status: "WITHDRAW_PENDING" }),
        }),
      );
    });

    // 26. COACH/TEEN 등 → 가드 미적용(자산 쿼리 자체가 실행되지 않음)
    it("COACH 는 자산 가드 미적용(count 쿼리 미실행)", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.COACH }),
      );

      const result = await service.requestWithdraw(
        "u-1",
        undefined,
        undefined,
        WITHDRAW_CONFIRM,
      );

      expect(result).toHaveProperty("gracePeriodEnd");
      expect(mockPrismaService.team.count).not.toHaveBeenCalled();
      expect(mockPrismaService.enrollment.count).not.toHaveBeenCalled();
    });

    // 27. ADMIN → 기존 관리자 차단이 가드보다 먼저(자산 쿼리 미실행)
    it("ADMIN 은 관리자 차단이 자산 가드보다 먼저 동작", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser({ userType: UserType.ADMIN }),
      );

      await expect(
        service.requestWithdraw("u-1", undefined, undefined, WITHDRAW_CONFIRM),
      ).rejects.toThrow("관리자 계정은 직접 탈퇴할 수 없습니다.");
      expect(mockPrismaService.team.count).not.toHaveBeenCalled();
    });
  });
});
