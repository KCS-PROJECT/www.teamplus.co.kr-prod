import { registerAs } from "@nestjs/config";

/**
 * 본인인증 설정
 *
 * 4개 제공자 지원:
 * - KG이니시스 (우선순위 1 - 결제 연동과 동일 패턴)
 * - 카카오 인증 (우선순위 2 - 한국에서 가장 대중적)
 * - NICE평가정보 (우선순위 3 - 기업 표준)
 * - PASS 앱 (우선순위 4 - 통신사 인증)
 */
export default registerAs("identity", () => {
  // [2026-06-10 SECURITY] CI/DI 암호화 키는 프로덕션/스테이징에서 필수.
  //   기존: 미설정 시 소스 하드코딩 기본키('default-32-char-...')로 폴백 → DB 유출 시 누구나 복호화.
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const isProductionLike = nodeEnv === "production" || nodeEnv === "staging";
  if (isProductionLike && !process.env.IDENTITY_ENCRYPTION_KEY) {
    throw new Error(
      `[본인인증 설정 오류] ${nodeEnv} 환경에서 IDENTITY_ENCRYPTION_KEY 가 설정되지 않았습니다. 강력한 32바이트 키를 설정하세요.`,
    );
  }

  return {
    // ==================== KG이니시스 본인인증 ====================
    kgInicis: {
    // 상점 ID (MID) - 결제 MID와 별도
    storeId: process.env.INICIS_IDENTITY_STORE_ID || "test-identity-store-id",

    // 상점 인증 키
    merchantKey:
      process.env.INICIS_IDENTITY_MERCHANT_KEY || "test-identity-merchant-key",

    // 서비스 ID (본인인증 전용)
    serviceId: process.env.INICIS_IDENTITY_SERVICE_ID || "test-service-id",

    // 결제 모드 (sandbox | production)
    mode: process.env.NODE_ENV === "production" ? "production" : "sandbox",

    // 엔드포인트
    endpoints: {
      sandbox: {
        request: "https://testpg.inicis.com/auth/auth",
        result: "https://testpg.inicis.com/auth/result",
      },
      production: {
        request: "https://pg.inicis.com/auth/auth",
        result: "https://pg.inicis.com/auth/result",
      },
    },
  },

  // ==================== 카카오 인증 ====================
  kakao: {
    // REST API 키
    clientId: process.env.KAKAO_IDENTITY_CLIENT_ID || "test-kakao-client-id",

    // Client Secret
    clientSecret:
      process.env.KAKAO_IDENTITY_CLIENT_SECRET || "test-kakao-client-secret",

    // 결제 모드
    mode: process.env.NODE_ENV === "production" ? "production" : "sandbox",

    // 엔드포인트
    endpoints: {
      sandbox: {
        authorize: "https://kauth.kakao.com/oauth/authorize",
        token: "https://kauth.kakao.com/oauth/token",
        certify: "https://kapi.kakao.com/v1/certification/certify",
      },
      production: {
        authorize: "https://kauth.kakao.com/oauth/authorize",
        token: "https://kauth.kakao.com/oauth/token",
        certify: "https://kapi.kakao.com/v1/certification/certify",
      },
    },
  },

  // ==================== NICE평가정보 ====================
  nice: {
    // 사이트 코드
    siteCode: process.env.NICE_SITE_CODE || "test-nice-site-code",

    // 사이트 패스워드
    sitePassword: process.env.NICE_SITE_PASSWORD || "test-nice-site-password",

    // 클라이언트 ID
    clientId: process.env.NICE_CLIENT_ID || "test-nice-client-id",

    // 클라이언트 Secret
    clientSecret: process.env.NICE_CLIENT_SECRET || "test-nice-client-secret",

    // 결제 모드
    mode: process.env.NODE_ENV === "production" ? "production" : "sandbox",

    // 엔드포인트
    endpoints: {
      sandbox: {
        authorize:
          "https://nice.checkplus.co.kr/CheckPlusSafeModel/checkplus.cb",
        decrypt: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
      },
      production: {
        authorize:
          "https://nice.checkplus.co.kr/CheckPlusSafeModel/checkplus.cb",
        decrypt: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
      },
    },
  },

  // ==================== PASS 앱 (통신사 인증) ====================
  pass: {
    // 서비스 ID
    serviceId: process.env.PASS_SERVICE_ID || "test-pass-service-id",

    // 서비스 Key
    serviceKey: process.env.PASS_SERVICE_KEY || "test-pass-service-key",

    // CP 코드 (SKT, KT, LGU+)
    cpCode: process.env.PASS_CP_CODE || "test-pass-cp-code",

    // 결제 모드
    mode: process.env.NODE_ENV === "production" ? "production" : "sandbox",

    // 엔드포인트
    endpoints: {
      sandbox: {
        authorize: "https://test-auth.passauth.co.kr/v1/auth",
        result: "https://test-auth.passauth.co.kr/v1/result",
      },
      production: {
        authorize: "https://auth.passauth.co.kr/v1/auth",
        result: "https://auth.passauth.co.kr/v1/result",
      },
    },
  },

  // ==================== 포트원(PortOne) 게이트웨이 ====================
  //
  // 결제는 토스페이먼츠 직접, 본인인증은 포트원 게이트웨이를 통해
  // KG이니시스 통합인증을 호출하는 구조 (2026-05-26 결정).
  //
  // PortOne V2 흐름:
  //   1. 프론트 @portone/browser-sdk → requestIdentityVerification({ storeId, channelKey })
  //   2. KG 통합인증창 노출 → 사용자 인증 완료
  //   3. SDK가 identityVerificationId 반환
  //   4. 백엔드: GET https://api.portone.io/identity-verifications/{id}
  //              Authorization: PortOne {apiSecret}  → 인증 결과 수신
  //
  // 테스트 채널 발급 (2026-05-26):
  //   - 채널키:  channel-key-d108c58b-2137-42f8-8198-6708561b943c
  //   - 공용 MID (KG 직계약 미가입 상태): MIIiasTest
  //   - 환경변수 미설정 시 위 테스트 값으로 폴백.
  portone: {
    // 포트원 V2 Store ID (관리자 콘솔 발급)
    storeId: process.env.PORTONE_STORE_ID || "",

    // 포트원 채널키 (본인인증 채널 — KG이니시스 통합인증)
    channelKey:
      process.env.PORTONE_IDENTITY_CHANNEL_KEY ||
      "channel-key-d108c58b-2137-42f8-8198-6708561b943c",

    // 포트원 REST API 시크릿 (백엔드 → PortOne 호출 인증)
    apiSecret: process.env.PORTONE_API_SECRET || "",

    // 포트원 V2 API Base URL
    apiBaseUrl: process.env.PORTONE_API_BASE_URL || "https://api.portone.io",

    // 운영 모드 (sandbox | production)
    mode: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  },

  // ==================== 공통 설정 ====================
  common: {
    // 콜백 URL (백엔드)
    callbackBaseUrl:
      process.env.IDENTITY_CALLBACK_BASE_URL ||
      "http://localhost:5003/api/v1/identity/callback",

    // 리턴 URL (프론트엔드/앱)
    returnBaseUrl:
      process.env.IDENTITY_RETURN_BASE_URL ||
      "http://localhost:5001/identity/result",

    // Deep Link 스킴 (Flutter 앱)
    deepLinkScheme: process.env.IDENTITY_DEEP_LINK_SCHEME || "teamplus",

    // 인증 요청 만료 시간 (초)
    requestTimeout: parseInt(
      process.env.IDENTITY_REQUEST_TIMEOUT || "1800",
      10,
    ), // 30분

    // 타임아웃 설정 (밀리초)
    httpTimeout: parseInt(process.env.IDENTITY_HTTP_TIMEOUT || "30000", 10),
  },

  // ==================== 보안 설정 ====================
  security: {
    // 암호화 키 (CI/DI 암호화용) — 프로덕션/스테이징은 위 fail-fast 로 필수, dev 전용 폴백.
    encryptionKey:
      process.env.IDENTITY_ENCRYPTION_KEY ||
      (isProductionLike ? undefined : "default-32-char-encryption-key!"),

    // 암호화 알고리즘
    encryptionAlgorithm: "aes-256-cbc",

    // 해시 알고리즘 (서명용)
    hashAlgorithm: "sha256",

    // 서명 검증 활성화
    verifySignature: process.env.IDENTITY_VERIFY_SIGNATURE !== "false",

    // IP 화이트리스트 (프로덕션용)
    ipWhitelist: process.env.IDENTITY_IP_WHITELIST?.split(",") || [],

    // Rate Limiting
    rateLimitPerHour: parseInt(process.env.IDENTITY_RATE_LIMIT || "10", 10),
  },

  // ==================== 재시도 정책 ====================
  retry: {
    // 최대 재시도 횟수
    maxAttempts: parseInt(process.env.IDENTITY_RETRY_MAX_ATTEMPTS || "3", 10),

    // 재시도 간격 (밀리초)
    retryDelay: parseInt(process.env.IDENTITY_RETRY_DELAY || "1000", 10),

    // 지수 백오프 사용 여부
    exponentialBackoff: true,
  },

  // ==================== 로깅 설정 ====================
  logging: {
    // 민감정보 마스킹 활성화
    maskSensitiveData: true,

    // 마스킹 대상 필드
    sensitiveFields: ["ci", "di", "name", "phone", "birthDate", "password"],

    // 웹훅 페이로드 로깅
    logWebhookPayload: process.env.IDENTITY_LOG_WEBHOOK !== "false",
    },
  };
});
