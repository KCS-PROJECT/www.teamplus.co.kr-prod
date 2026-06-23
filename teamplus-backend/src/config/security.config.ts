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
   * AccountLockoutService(3/5/10회 진행형 잠금) + ThrottlerGuard(login Rate Limit
   * local 30 / dev 10 / prod 3 per min) 가 brute-force 를 이미 차단하므로 round 10
   * 은 OWASP minimum 충족 + 1초 SLA 달성에 적합. 신규 가입자만 영향, 기존 해시는
   * bcrypt.compare 가 cost prefix 를 자체 인식해 그대로 검증된다.
   */
  password: {
    saltRounds: 10,
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
    retention: 90, // Days to retain audit logs
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
