import { registerAs } from "@nestjs/config";

/**
 * KG이니시스 결제 설정
 *
 * 환경변수를 기반으로 결제 게이트웨이 설정을 제공합니다.
 * - 개발 환경: 샌드박스 모드
 * - 프로덕션 환경: 실제 결제 처리
 */
export default registerAs("payment", () => {
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const isProduction = nodeEnv === "production";
  // [2026-06-10 SECURITY] staging 도 production 과 동일하게 웹훅 서명/IP 검증을 강제.
  //   기존: staging(NODE_ENV≠production)에서 하드코딩 dev 서명키 사용 + IP 화이트리스트 스킵 →
  //   소스에 노출된 dev 키로 결제완료 웹훅 위조 → 무료 크레딧 발급 가능(CRITICAL).
  const isProductionLike = isProduction || nodeEnv === "staging";

  // 프로덕션/스테이징 환경에서 필수 환경변수 누락 시 즉시 서버 시작 중단
  if (isProductionLike) {
    const requiredVars = [
      "INICIS_STORE_ID",
      "INICIS_MERCHANT_KEY",
      "INICIS_SIGNATURE_KEY",
    ];
    const missing = requiredVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(
        `[결제 설정 오류] ${nodeEnv} 환경에서 필수 환경변수가 누락되었습니다: ${missing.join(", ")}`,
      );
    }
  }

  return {
    // KG이니시스 기본 설정
    inicis: {
      // 상점 ID (MID) - 프로덕션에서 반드시 환경변수로 설정
      storeId:
        process.env.INICIS_STORE_ID ||
        (isProduction ? undefined : "INIpayTest"),

      // 상점 인증 키 (Merchant Key) - 프로덕션에서 반드시 환경변수로 설정
      merchantKey:
        process.env.INICIS_MERCHANT_KEY || (isProduction ? undefined : ""),

      // API 버전
      apiVersion: process.env.INICIS_API_VERSION || "1.0",

      // 결제 모드 (sandbox | production)
      mode: isProduction ? "production" : "sandbox",

      // 타임아웃 설정 (밀리초)
      timeout: parseInt(process.env.INICIS_TIMEOUT || "30000", 10),
    },

    // KG이니시스 API 엔드포인트
    endpoints: {
      // 샌드박스 URL
      sandbox: {
        mobile: "https://stgstdpay.inicis.com/stdpay/INIpayMobile.php",
        pc: "https://stgstdpay.inicis.com/stdpay/INIpayStd.php",
        approval: "https://stgstdpay.inicis.com/stdpay/INIpayMobileReturn.php",
        cancel: "https://stgstdpay.inicis.com/stdpay/INIpayMobileCancel.php",
      },

      // 프로덕션 URL
      production: {
        mobile: "https://stdpay.inicis.com/stdpay/INIpayMobile.php",
        pc: "https://stdpay.inicis.com/stdpay/INIpayStd.php",
        approval: "https://stdpay.inicis.com/stdpay/INIpayMobileReturn.php",
        cancel: "https://stdpay.inicis.com/stdpay/INIpayMobileCancel.php",
      },
    },

    // 웹훅 설정
    webhook: {
      // 결제 완료 후 리턴 URL
      returnUrl:
        process.env.INICIS_RETURN_URL ||
        "http://localhost:3001/api/v1/payments/callback",

      // 웹훅 수신 URL (서버 간 통신)
      webhookUrl:
        process.env.INICIS_WEBHOOK_URL ||
        "http://localhost:3001/api/v1/payments/webhook",

      // 웹훅 서명 검증 — PCI DSS A08 준수, env 토글 불가 (항상 강제)
      verifySignature: true as const,
    },

    // 결제 옵션
    options: {
      // 지원 결제 수단
      paymentMethods: ["card", "bank", "vbank", "phone"],

      // 기본 통화
      currency: "KRW",

      // 할부 개월 수 (0: 일시불, 2~12: 할부)
      quotabase: "0:2:3:4:5:6",

      // 결제 타임아웃 (초)
      paymentTimeout: 1800, // 30분
    },

    // 보안 설정
    security: {
      // 해시 알고리즘 (SHA256)
      hashAlgorithm: "sha256",

      // 서명 키 (웹훅 검증용) - 프로덕션/스테이징에서 반드시 강력한 랜덤 키 설정 필요.
      //   dev 전용 폴백 키는 development/test 에서만 사용 (productionLike 는 위 fail-fast 로 강제).
      signatureKey:
        process.env.INICIS_SIGNATURE_KEY ||
        (isProductionLike ? undefined : "dev-only-signature-key-change-in-prod"),

      // IP 화이트리스트 (프로덕션에서만 사용)
      ipWhitelist: process.env.INICIS_IP_WHITELIST?.split(",") || [],
    },

    // 재시도 정책
    retry: {
      // 최대 재시도 횟수
      maxAttempts: parseInt(process.env.PAYMENT_RETRY_MAX_ATTEMPTS || "3", 10),

      // 재시도 간격 (밀리초)
      retryDelay: parseInt(process.env.PAYMENT_RETRY_DELAY || "1000", 10),

      // 지수 백오프 사용 여부
      exponentialBackoff: true,
    },
  }; // inner return object
}); // registerAs
