/**
 * Security Configuration
 * Centralized security settings for authentication, password hashing, and rate limiting
 */

/**
 * Environment Detection
 * - local: 개발자 로컬 환경 (NODE_ENV=development, RATE_LIMIT_ENV=local)
 * - development: 개발/스테이징 서버 (NODE_ENV=development, RATE_LIMIT_ENV=development)
 * - production: 운영 서버 (NODE_ENV=production)
 */
const getRateLimitEnv = (): "local" | "development" | "production" => {
  const nodeEnv = process.env.NODE_ENV;
  const rateLimitEnv = process.env.RATE_LIMIT_ENV;

  // RATE_LIMIT_ENV가 명시적으로 설정된 경우 우선 사용
  if (rateLimitEnv === "local") return "local";
  if (rateLimitEnv === "development") return "development";
  if (rateLimitEnv === "production") return "production";

  // NODE_ENV 기반 기본값
  if (nodeEnv === "production") return "production";
  return "local"; // 기본값: 로컬 개발 환경
};

/**
 * Environment-based Rate Limit Values
 * - local: 30 (개발 편의성)
 * - development: 10 (테스트 환경)
 * - production: 3 (보안 강화)
 */
const rateLimitByEnv = {
  local: {
    login: 30,
    register: 30,
    refresh: 30,
  },
  development: {
    login: 10,
    register: 10,
    refresh: 20,
  },
  production: {
    login: 3,
    register: 3,
    refresh: 10,
  },
};

const currentEnv = getRateLimitEnv();
const envRateLimits = rateLimitByEnv[currentEnv];

export const securityConfig = {
  /**
   * Current Environment
   */
  environment: currentEnv,

  /**
   * Password Hashing
   * bcrypt salt rounds: higher = more secure but slower
   * round 10 ≈ 65ms / round 12 ≈ 250ms (Apple M-series 기준).
   *
   * [2026-07-30 SECURITY] 10 → 12 상향. AccountLockoutService(3/5/10회 진행형 잠금) +
   * ThrottlerGuard 가 온라인 brute-force 는 막지만, DB 유출 후 **오프라인 크래킹**은
   * cost 만이 방어수단이라 OWASP 권고치(12)를 따른다.
   *
   * 하위 호환: 기존 해시는 cost 10 으로 저장돼 있어도 bcrypt.compare 가 해시 문자열의
   * cost prefix(`$2b$10$…`)를 스스로 읽어 검증하므로 **로그인이 깨지지 않는다**.
   * 신규 가입·비밀번호 변경분부터 cost 12 로 저장되고, 두 cost 가 DB에 공존해도 무해하다.
   *
   * 성능: 해싱은 회원가입·비밀번호 변경·로그인 검증 시 1회뿐이고 +185ms 는 1초 SLA 내.
   */
  password: {
    saltRounds: 12,
    minLength: 8,
    maxLength: 128,
  },

  /**
   * Rate Limiting
   * Prevents brute-force attacks on authentication endpoints
   * 환경별 설정: local(30) / development(10) / production(3)
   */
  rateLimit: {
    login: {
      limit: envRateLimits.login,
      ttl: 60000, // per 1 minute
      description: `Login attempts - ${currentEnv} (${envRateLimits.login}/min)`,
    },
    register: {
      limit: envRateLimits.register,
      ttl: 60000, // per 1 minute
      description: `Registration attempts - ${currentEnv} (${envRateLimits.register}/min)`,
    },
    refresh: {
      limit: envRateLimits.refresh,
      ttl: 60000, // per 1 minute
      description: `Token refresh attempts - ${currentEnv} (${envRateLimits.refresh}/min)`,
    },
  },

  /**
   * Account Lockout
   * Progressive lockout prevents account compromise via brute-force
   */
  accountLockout: {
    thresholds: [
      {
        attempts: 3,
        duration: 900, // 15 minutes (in seconds)
        level: 1,
        description: "Soft lockout: 15 minute cool-off",
      },
      {
        attempts: 5,
        duration: 3600, // 1 hour (in seconds)
        level: 2,
        description: "Medium lockout: 1 hour suspension",
      },
      {
        attempts: 10,
        duration: 86400, // 24 hours (in seconds)
        level: 3,
        description:
          "Hard lockout: 24 hour suspension (manual admin unlock required)",
      },
    ],
    resetDuration: 86400, // Attempt counter resets after 24 hours
  },

  /**
   * JWT Configuration
   * Token expiration settings (in seconds)
   */
  jwt: {
    accessTokenExpiration: 1800, // 30 minutes
    refreshTokenExpiration: 604800, // 7 days
    description: "Short-lived access token + long-lived refresh token rotation",
  },

  /**
   * CORS Configuration
   * Allowed origins for cross-origin requests
   */
  cors: {
    allowedOrigins: [
      "http://localhost:5001", // Web development
      "http://localhost:5002", // Admin dashboard
      "http://localhost:8080", // Alternative dev port
      process.env.WEB_URL || "https://app.teamplus.com", // Production web
      process.env.ADMIN_URL || "https://admin.teamplus.com", // Admin panel
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  },

  /**
   * Cryptography
   * E2E encryption for sensitive data
   */
  crypto: {
    algorithm: "aes-256-gcm",
    keySize: 32, // 256 bits = 32 bytes
    ivSize: 16, // 128 bits = 16 bytes
    authTagSize: 16, // 128 bits = 16 bytes
    maxPayloadSize: 8192, // 8KB max encrypted payload
  },

  /**
   * Audit Logging
   * Security event tracking and monitoring
   */
  auditLog: {
    enableEncryptedPayloadLogging: false, // Never log encrypted data
    enablePasswordLogging: false, // Never log passwords
    sensitiveFields: [
      "password",
      "passwordHash",
      "refreshToken",
      "accessToken",
      "encryptedData",
      "iv",
      "authTag",
      "creditCard",
      "ssn",
    ],
    /**
     * 감사·접속기록 보관일수.
     *
     * [2026-07-30 LEGAL] 90 → 730 (2년) 상향.
     * 근거: 「개인정보의 안전성 확보조치 기준」 §8② — 접속기록 보관 최소 1년.
     *   단, ①5만명 이상 정보주체의 개인정보를 처리하거나 ②고유식별정보·민감정보를
     *   처리하는 개인정보처리자는 **최소 2년**. 본 서비스는 본인인증 CI/DI(고유식별정보
     *   준용 연계정보)와 아동 개인정보를 처리하므로 2년 기준을 적용한다.
     * 집행: DataRetentionScheduler(src/common/schedulers/data-retention.scheduler.ts)가
     *   이 값을 읽어 매일 실제 삭제한다. (종전엔 집행 코드가 없어 死설정이었다.)
     */
    retention: 730,
  },

  /**
   * Security Headers
   * HSTS, CSP, and other protective headers
   */
  headers: {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  },
};
