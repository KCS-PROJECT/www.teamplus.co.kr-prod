import { registerAs } from "@nestjs/config";

export default registerAs("redis", () => ({
  // Redis 연결 URL (예: redis://localhost:6379)
  url: process.env.REDIS_URL || "redis://localhost:6379",

  // Redis 포트
  port: parseInt(process.env.REDIS_PORT || "6379", 10),

  // Redis 호스트
  host: process.env.REDIS_HOST || "localhost",

  // Redis 비밀번호 (선택사항)
  password: process.env.REDIS_PASSWORD,

  // Redis 데이터베이스 인덱스
  db: parseInt(process.env.REDIS_DB || "0", 10),

  // 재연결 전략 (3번 시도 후 포기 - graceful degradation)
  retryStrategy: (times: number) => {
    if (times > 3) {
      // 3번 이상 실패하면 재연결 중단 (null 반환)
      return null;
    }
    const delay = Math.min(times * 100, 1000);
    return delay;
  },

  // 연결 타임아웃 (밀리초) - 개발 환경에서 빠른 실패
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || "3000", 10),

  // 명령 타임아웃 (밀리초)
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || "5000", 10),

  // 최대 재연결 시도 횟수
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || "3", 10),

  // 연결 실패 시 graceful degradation 활성화
  enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE !== "false",

  // 캐시 TTL 설정 (초 단위)
  cacheTTL: {
    // 수업 목록 캐싱 (5분)
    classList: parseInt(process.env.CACHE_TTL_CLASS_LIST || "300", 10),

    // 클럽 정보 캐싱 (10분)
    clubInfo: parseInt(process.env.CACHE_TTL_CLUB_INFO || "600", 10),

    // 사용자 프로필 캐싱 (15분)
    userProfile: parseInt(process.env.CACHE_TTL_USER_PROFILE || "900", 10),

    // 결제 idempotency (24시간)
    paymentIdempotency: parseInt(
      process.env.CACHE_TTL_PAYMENT_IDEMPOTENCY || "86400",
      10,
    ),

    // JWT 블랙리스트 — access 토큰 수명과 동일해야 한다.
    // [2026-06-10 SECURITY] 기본값 900→1800 정정. JWT_EXPIRATION 미설정 시 블랙리스트 TTL(900)이
    //   access 토큰 수명(JwtModule 기본 1800)보다 짧아, 로그아웃한 토큰이 블랙리스트 만료 후
    //   남은 수명 동안 다시 유효해지는 창이 생겼다. 기본값을 access 토큰 기본 수명과 일치시킨다.
    jwtBlacklist: parseInt(process.env.JWT_EXPIRATION || "1800", 10),

    // 리프레시 토큰 (7일)
    refreshToken: parseInt(process.env.JWT_REFRESH_EXPIRATION || "604800", 10),

    // 레이트 리미팅 (1분)
    rateLimit: parseInt(process.env.CACHE_TTL_RATE_LIMIT || "60", 10),
  },

  // 캐시 키 프리픽스
  keyPrefix: {
    class: "class:",
    club: "club:",
    user: "user:",
    payment: "payment:",
    jwt: "jwt:blacklist:",
    refresh: "refresh:",
    rateLimit: "ratelimit:",
  },
}));
