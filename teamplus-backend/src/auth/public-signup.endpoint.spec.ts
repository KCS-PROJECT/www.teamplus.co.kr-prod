import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaService } from "@/prisma/prisma.service";
import { LoggerService } from "@/logger/logger.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { CryptoService } from "./services/crypto.service";
import { TwoFactorService } from "./two-factor.service";
import { WithdrawCleanupService } from "./withdraw-cleanup.service";
import { EmailVerificationService } from "./email-verification.service";

/**
 * R14-C1 — 공개 가입 **HTTP 계약** 고정.
 *
 * 단위 테스트만으로는 부족하다. DTO 에 `@IsIn(allowlist)` 을 걸었을 때
 * ValidationPipe 가 먼저 generic 400 을 던져 **역할별 안내 문구가 실제 응답에서 소실**됐는데,
 * `publicSignupDenialMessage()` 를 직접 호출하는 단위 테스트는 그 사실을 잡지 못했다
 * (Codex Round 2 지적 1·3 — "endpoint 테스트로 고정").
 *
 * 그래서 여기서는 **실제 파이프라인(ValidationPipe → Controller → Service)** 을 태우고
 * status code 와 message 를 함께 검증한다.
 */
describe("R14-C1 — 공개 가입 HTTP 계약", () => {
  let app: INestApplication;

  /** 가드가 throw 하기 전에는 어떤 쿼리도 나가면 안 된다 — 호출되면 테스트가 알려준다. */
  const prismaMock = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    identityVerification: { findUnique: jest.fn() },
    appSettings: { findFirst: jest.fn() },
  };

  const passthroughGuard = { canActivate: () => true };

  beforeAll(async () => {
    // register() 는 역할 가드에서 끝나므로 Prisma 외 의존성은 빈 스텁으로 충분하다.
    const authService = new AuthService(
      prismaMock as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: CryptoService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), warn: jest.fn() },
        },
        { provide: TwoFactorService, useValue: {} },
        { provide: WithdrawCleanupService, useValue: {} },
        { provide: EmailVerificationService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passthroughGuard)
      .overrideGuard(RolesGuard)
      .useValue(passthroughGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // main.ts 와 동일한 전역 파이프 — 실제 응답 형태를 재현한다.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const post = (userType: string) =>
    request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: "attacker@example.com",
      password: "Test1234!",
      userType,
    });

  describe("시스템 역할 차단", () => {
    it("ADMIN 은 403 + 운영자 콘솔 안내", async () => {
      const res = await post("ADMIN");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("운영자 콘솔");
    });

    it("SYSTEM·OPER 도 403 으로 차단한다", async () => {
      for (const t of ["SYSTEM", "OPER"]) {
        const res = await post(t);
        expect(res.status).toBe(403);
        expect(res.body.message).toContain("운영자 콘솔");
      }
    });

    it("차단은 DB 조회 이전에 일어난다", async () => {
      await post("ADMIN");

      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe("역할별 안내 문구 보존 (Codex Round 2 지적 1)", () => {
    it("CHILD 는 403 + 가족정책 안내 문구를 그대로 반환한다", async () => {
      const res = await post("CHILD");

      expect(res.status).toBe(403);
      // 2026-06-18 앱심사(App Store/Google Play 가족정책) 대응 문구 — 변경 시 재심사 리스크
      expect(res.body.message).toContain("보호자 계정에서만 가능합니다");
      expect(res.body.message).toContain("내 자녀 추가");
    });

    it("TEEN 도 동일한 가족정책 문구를 반환한다", async () => {
      const res = await post("TEEN");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("보호자 계정에서만 가능합니다");
    });

    it("COACH 는 403 + 감독의 코치 등록 안내", async () => {
      const res = await post("COACH");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("감독");
    });

    it("generic 400 으로 뭉개지지 않는다 (회귀 방지)", async () => {
      const res = await post("CHILD");

      expect(res.status).not.toBe(400);
      expect(res.body.message).not.toBe("가입할 수 없는 회원 유형입니다.");
    });
  });

  describe("엔드포인트 계약 (Codex Round 2 지적 2)", () => {
    it("DIRECTOR 는 /auth/register 로 가입할 수 없고 signup 경로를 안내한다", async () => {
      const res = await post("DIRECTOR");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("/auth/signup");
    });

    it("ACADEMY_DIRECTOR 도 동일하게 안내한다", async () => {
      const res = await post("ACADEMY_DIRECTOR");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("/auth/signup");
    });
  });

  /**
   * `/auth/signup` 은 `signup()` → `register()` 경로이며 **엔드포인트 계약이 다르다**
   * (중첩 clubInfo/academyInfo 를 받으므로 3종 허용). 계약이 갈리는 지점이라 별도로 고정한다.
   */
  describe("/auth/signup — 3종 계약 (Codex Round 2 지적 3)", () => {
    // ⚠️ SignupDto 의 `email` 은 이메일이 아니라 **아이디 규격**(영문 소문자 시작 8~20자)이다.
    //    register 엔드포인트와 계약이 달라 실제 형식을 맞춰야 역할 가드까지 도달한다.
    const postSignup = (
      userType: string,
      extra: Record<string, unknown> = {},
    ) =>
      request(app.getHttpServer())
        .post("/api/v1/auth/signup")
        .send({
          email: "attacker01",
          password: "Test1234!",
          userType,
          agreements: { terms: true, privacy: true },
          ...extra,
        });

    it("ADMIN 은 403 + 운영자 콘솔 안내", async () => {
      const res = await postSignup("ADMIN");

      expect({ status: res.status, message: res.body.message }).toEqual({
        status: 403,
        message: expect.stringContaining("운영자 콘솔"),
      });
    });

    it("CHILD 는 403 + 가족정책 문구를 그대로 반환한다", async () => {
      const res = await postSignup("CHILD");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("보호자 계정에서만 가능합니다");
    });

    it("COACH 는 403 + 감독의 코치 등록 안내", async () => {
      const res = await postSignup("COACH");

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("감독");
    });

    it("DIRECTOR 는 register 와 달리 역할 가드를 통과한다 (팀 정보 단계로 진행)", async () => {
      const res = await postSignup("DIRECTOR");

      // 엔드포인트 계약이 3종이므로 역할 때문에 막히지 않는다
      expect(res.status).not.toBe(403);
      expect(res.body.message).not.toContain("/auth/signup");
    });

    it("역할 차단은 여기서도 DB 조회 이전에 일어난다", async () => {
      await postSignup("ADMIN");

      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe("허용 역할", () => {
    it("PARENT 는 역할 가드를 통과한다 (이후 본인인증 단계에서 400)", async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      const res = await post("PARENT");

      // 역할 때문에 막힌 게 아니라 본인인증 미완료로 막혔음을 확인
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("본인인증");
    });

    it("알 수 없는 문자열은 DTO 단계에서 400", async () => {
      const res = await post("SUPERUSER");

      expect(res.status).toBe(400);
    });
  });
});
