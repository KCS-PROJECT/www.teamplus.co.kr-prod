/**
 * LoggerService 회귀 spec (v8.6 P1-8, 2026-05-20)
 *
 * 검증 항목:
 * 1. 민감 필드 마스킹 (12 필드 + 재귀)
 * 2. 카테고리 라우팅 (access/input/output/auth/payment/database/system/activity)
 * 3. 오류 자동 분류 (HTTP status·Prisma 코드·예외 이름)
 * 4. resetFileLoggers() — 회전 후 Map clear 동작
 * 5. 통합 인덱스(_all.jsonl) 기록 보장
 *
 * 전제: 임시 LOG_ROOT를 /tmp 하위로 지정해 실제 파일 시스템 격리
 */
import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LoggerService } from "./logger.service";
import {
  classifyError,
  formatDate,
  getAllErrorsPath,
  getLogPath,
} from "./file-path.util";

describe("LoggerService (v8.6)", () => {
  let logger: LoggerService;
  let tempRoot: string;
  let originalLogRoot: string | undefined;

  beforeAll(() => {
    // 임시 LOG_ROOT 격리
    originalLogRoot = process.env.LOG_ROOT;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "teamplus-logger-spec-"));
    process.env.LOG_ROOT = tempRoot;
  });

  afterAll(() => {
    // 정리 + 환경변수 복구
    if (originalLogRoot === undefined) {
      delete process.env.LOG_ROOT;
    } else {
      process.env.LOG_ROOT = originalLogRoot;
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      /* 무시 */
    }
  });

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [LoggerService],
    }).compile();
    logger = moduleRef.get<LoggerService>(LoggerService);
    // onModuleInit 수동 호출 — ensureAllCategoryFiles + symlinks 초기화
    logger.onModuleInit();
  });

  /* ============================================================
   * 1. 민감 필드 마스킹
   * ============================================================ */
  describe("민감 필드 마스킹", () => {
    it("12 SENSITIVE_KEYS는 [REDACTED]로 마스킹된다", () => {
      // private sanitize 메서드 접근 — 테스트용
      const dirty = {
        password: "secret123",
        passwordHash: "$2b$10$...",
        refreshToken: "abc.def.xyz",
        accessToken: "jwt.token",
        authToken: "bearer",
        encryptedData: "enc",
        iv: "iv-bytes",
        authTag: "tag",
        creditCard: "1234-5678-9012-3456",
        ssn: "900101-1234567",
        socialNumber: "9001011234567",
        CRYPTO_SECRET_KEY: "secret",
        safeField: "normal value",
      };
      const sanitized = (
        logger as unknown as {
          sanitize: (d: unknown) => Record<string, unknown>;
        }
      ).sanitize(dirty);

      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.passwordHash).toBe("[REDACTED]");
      expect(sanitized.refreshToken).toBe("[REDACTED]");
      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect(sanitized.creditCard).toBe("[REDACTED]");
      expect(sanitized.ssn).toBe("[REDACTED]");
      // 일반 필드는 그대로
      expect(sanitized.safeField).toBe("normal value");
    });

    it("중첩된 객체의 민감 필드도 재귀적으로 마스킹된다", () => {
      const dirty = {
        user: {
          name: "홍길동",
          password: "secret",
          tokens: { accessToken: "jwt" },
        },
      };
      const sanitized = (
        logger as unknown as {
          sanitize: (d: unknown) => any;
        }
      ).sanitize(dirty);

      expect(sanitized.user.name).toBe("홍길동");
      expect(sanitized.user.password).toBe("[REDACTED]");
      expect(sanitized.user.tokens.accessToken).toBe("[REDACTED]");
    });
  });

  /* ============================================================
   * 2. 카테고리 라우팅
   * ============================================================ */
  describe("카테고리 라우팅", () => {
    const flushDelay = () => new Promise((resolve) => setTimeout(resolve, 50)); // SonicBoom 비동기 flush 대기

    it("access() 호출 시 access.log에 기록된다", async () => {
      logger.access("info", "GET /test 200 5ms", {
        requestId: "test-001",
        url: "/test",
      });
      await flushDelay();

      const filePath = getLogPath({ type: "normal", category: "access" });
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("test-001");
      expect(content).toContain('"category":"access"');
    });

    it("payment() 호출 시 payment.log에 기록된다", async () => {
      logger.payment("info", "PAYMENT_INITIATED", {
        orderId: "pay-test-001",
      });
      await flushDelay();

      const filePath = getLogPath({ type: "normal", category: "payment" });
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("pay-test-001");
      expect(content).toContain('"category":"payment"');
    });

    it("info() 호출 시 ctx.category가 없으면 system으로 라우팅된다", async () => {
      logger.info("일반 시스템 메시지");
      await flushDelay();

      const filePath = getLogPath({ type: "normal", category: "system" });
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("일반 시스템 메시지");
    });
  });

  /* ============================================================
   * 3. 오류 자동 분류 (classifyError)
   * ============================================================ */
  describe("classifyError 자동 분류", () => {
    it("HTTP 5xx → server", () => {
      expect(classifyError({ status: 500 })).toBe("server");
      expect(classifyError({ status: 503 })).toBe("server");
    });

    it("HTTP 4xx → client", () => {
      expect(classifyError({ status: 404 })).toBe("client");
      expect(classifyError({ status: 400 })).toBe("client");
    });

    it("Prisma P2002/P2025 → database", () => {
      expect(classifyError({ prismaCode: "P2002" })).toBe("database");
      expect(classifyError({ prismaCode: "P2025" })).toBe("database");
    });

    it("externalSource 명시 → external (status보다 우선)", () => {
      expect(classifyError({ externalSource: "KG_INICIS", status: 500 })).toBe(
        "external",
      );
    });

    it("transactionScope 명시 → transaction (status보다 우선)", () => {
      expect(classifyError({ transactionScope: "credit", status: 500 })).toBe(
        "transaction",
      );
    });

    it("UnauthorizedException → auth", () => {
      expect(
        classifyError({ exceptionName: "UnauthorizedException", status: 500 }),
      ).toBe("auth");
    });

    it("기본값 → server (분류 실패 시 안전 측)", () => {
      expect(classifyError({})).toBe("server");
    });
  });

  /* ============================================================
   * 4. 오류 기록 + _all.jsonl 통합 인덱스
   * ============================================================ */
  describe("오류 기록 + 통합 인덱스", () => {
    const flushDelay = () => new Promise((resolve) => setTimeout(resolve, 50));

    it("errorAs('server', ...) 호출 시 errors/server.log + _all.jsonl 동시 기록", async () => {
      const err = new Error("Test 5xx error");
      logger.errorAs("server", "[500] /test 실패", err, {
        method: "GET",
        url: "/test",
        status: 500,
      });
      await flushDelay();

      const serverPath = getLogPath({ type: "error", category: "server" });
      const allPath = getAllErrorsPath();

      expect(fs.existsSync(serverPath)).toBe(true);
      expect(fs.existsSync(allPath)).toBe(true);

      const serverContent = fs.readFileSync(serverPath, "utf-8");
      const allContent = fs.readFileSync(allPath, "utf-8");

      expect(serverContent).toContain("[500] /test 실패");
      expect(serverContent).toContain("Test 5xx error");
      expect(allContent).toContain("Test 5xx error");
      expect(allContent).toContain('"category":"server"');
    });

    it("error() 자동 분류 — Prisma 코드 P2002 입력 시 database 카테고리", async () => {
      logger.error("[DB] Unique constraint", undefined, {
        prismaCode: "P2002",
      });
      await flushDelay();

      const dbErrorPath = getLogPath({ type: "error", category: "database" });
      const content = fs.readFileSync(dbErrorPath, "utf-8");
      expect(content).toContain("Unique constraint");
      expect(content).toContain('"category":"database"');
    });
  });

  /* ============================================================
   * 5. resetFileLoggers()
   * ============================================================ */
  describe("resetFileLoggers (회전 후 Map clear)", () => {
    it("호출 시 fileLoggers Map이 비워진다", async () => {
      logger.access("info", "first");
      await new Promise((r) => setTimeout(r, 30));

      const fileLoggersMap = (
        logger as unknown as {
          fileLoggers: Map<string, unknown>;
        }
      ).fileLoggers;
      expect(fileLoggersMap.size).toBeGreaterThan(0);

      logger.resetFileLoggers();
      expect(fileLoggersMap.size).toBe(0);
    });
  });

  /* ============================================================
   * 6. getErrorLogPaths — Interceptor·Filter 응답 헤더 주입
   * ============================================================ */
  describe("getErrorLogPaths", () => {
    it("ErrorCategory별 file·all 경로를 반환한다", () => {
      const paths = logger.getErrorLogPaths("transaction");
      expect(paths.file).toContain("errors/transaction.log");
      expect(paths.all).toContain("errors/_all.jsonl");
      // 오늘 일자 디렉토리에 매핑됨
      const today = formatDate();
      expect(paths.file).toContain(today.replace(/-/g, "/").slice(0, 10));
    });
  });
});
