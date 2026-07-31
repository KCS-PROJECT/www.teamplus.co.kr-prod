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

    // [2026-07-30] PG 콜백 URL 평문(http) 경고.
    //   콜백·웹훅에는 결제 결과와 구매자 정보가 실려 오므로 평문 전송은
    //   「개인정보의 안전성 확보조치 기준」 §7④(정보통신망 전송 시 암호화) 위반이다.
    //   미설정 시 기본값이 http://localhost 라서 환경변수 누락이 곧 평문 전송이 된다.
    //   부팅을 중단시키지 않는 이유: 운영 중 배포에서 서비스가 죽는 부작용이
    //   경고를 놓치는 것보다 위험하다. 대신 ERROR 레벨로 남겨 로그 감시에 걸리게 한다.
    const insecureUrls = (
      [
        ["INICIS_RETURN_URL", process.env.INICIS_RETURN_URL],
        ["INICIS_WEBHOOK_URL", process.env.INICIS_WEBHOOK_URL],
      ] as const
    ).filter(([, v]) => !v || v.startsWith("http://"));

    if (insecureUrls.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[결제 설정 경고] ${nodeEnv} 환경에서 PG 콜백 URL 이 HTTPS 가 아닙니다: ` +
          `${insecureUrls.map(([k, v]) => `${k}=${v ?? "(미설정)"}`).join(", ")} — ` +
          "결제 결과·구매자 정보가 평문 전송됩니다. https:// 로 즉시 교체하십시오.",
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
