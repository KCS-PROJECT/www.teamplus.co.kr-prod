import { registerAs } from "@nestjs/config";

/**
 * KG 공식 샘플에 공개된 테스트 자격증명 — 비교 전용이며 설정 폴백으로 쓰지 않는다.
 * 운영에서 이 값으로 인증을 시도하지 못하도록 Gateway 가 사용 시점에 대조한다.
 */
export const INICIS_IDENTITY_SAMPLE_MID = "INIiasTest";
export const INICIS_IDENTITY_SAMPLE_API_KEY = "TGdxb2l3enJDWFRTbTgvREU3MGYwUT09";

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

  // [R1 #6] reqSvcCd 와 authUrl 이 규격상 짝이다 — 01/02 는 sa.inicis.com/auth,
  // 03(본인확인, DI 필요) 은 sa.inicis.com/id/auth. 둘을 별개 env 로 두면
  // INICIS_IDENTITY_REQ_SVC_CD 만 03 으로 바꿨을 때 authUrl 이 그대로 남아
  // 잘못된 엔드포인트로 요청이 나가고 KG 쪽 에러로만 드러난다. reqSvcCd 에서
  // authUrl 을 파생시키고, env 로 authUrl 을 직접 지정한 경우에는 그 값을
  // 우선하되 파생값과 다르면 경고만 남긴다(의도된 override 일 수 있어 강제하지 않음).
  const kgReqSvcCd = process.env.INICIS_IDENTITY_REQ_SVC_CD || "01";
  const kgDerivedAuthUrl =
    kgReqSvcCd === "03"
      ? "https://sa.inicis.com/id/auth"
      : "https://sa.inicis.com/auth";
  const kgEnvAuthUrl = process.env.INICIS_IDENTITY_AUTH_URL;
  if (kgEnvAuthUrl && kgEnvAuthUrl !== kgDerivedAuthUrl) {
    // eslint-disable-next-line no-console -- config factory 는 Nest Logger 컨텍스트 생성 이전에 실행된다.
    console.warn(
      `[본인인증 설정 경고] INICIS_IDENTITY_AUTH_URL="${kgEnvAuthUrl}" 이 ` +
        `reqSvcCd="${kgReqSvcCd}" 규격 URL("${kgDerivedAuthUrl}")과 다릅니다. ` +
        "환경변수 값을 그대로 사용하지만, 의도한 설정인지 확인하세요.",
    );
  }
  const kgAuthUrl = kgEnvAuthUrl || kgDerivedAuthUrl;

  return {
    // ==================== KG이니시스 통합인증 (직계약) ====================
    //
    // 규격 SoT: docs/Reference/INICIS_UNIFIED_IDENTITY_API.md
    // 포트원 경유 경로와 별개이며, 포트원 설정은 아래 portone 블록만 참조한다.
    kgInicis: {
      // 상점아이디 (계약 시 발급). 코드 폴백을 두지 않는다 — .env 가 유일한 출처여야
      // 로딩 실패가 테스트 키로 위장되지 않는다. 비면 Gateway 가 사용 시점에 거부한다.
      mid: process.env.INICIS_IDENTITY_MID?.trim() ?? "",

      // 대칭키 — authHash / userHash 생성에 사용
      apiKey: process.env.INICIS_IDENTITY_API_KEY?.trim() ?? "",

      // SEED/CBC 복호화 IV (16 byte) — 상점별 발급값. mid·apiKey 와 같은 이유로 폴백 없음.
      seedIv: process.env.INICIS_IDENTITY_SEED_IV?.trim() ?? "",

      // 서비스 구분 — 01 간편인증 / 02 전자서명 / 03 본인확인(DI 제공)
      reqSvcCd: kgReqSvcCd,

      // 인증창 호출 URL — reqSvcCd 에서 파생(위 kgAuthUrl 계산 참조).
      // 본인확인(03)은 https://sa.inicis.com/id/auth, 그 외는 https://sa.inicis.com/auth.
      authUrl: kgAuthUrl,

      // STEP2 authRequestUrl 허용 호스트 — 정확 일치 검증(SSRF 차단)
      allowedResultHosts: (
        process.env.INICIS_IDENTITY_RESULT_HOSTS ||
        "kssa.inicis.com,fcsa.inicis.com"
      )
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),

      // CI 미제공(카카오 등 제한적 제공) 허용 여부 — 기본 false(인증 실패 처리).
      //
      // ⚠️ 부작용: CI 가 없으면 identity.service 가 ciHash 를 null 로 저장하고,
      //   auth.service 의 중복가입 차단이 `if (verification.ciHash)` 가드라 통째로 건너뛴다.
      //   즉 이 스위치는 "CI 없이 진행"이 아니라 "1인 1계정 차단 해제"를 겸한다.
      allowMissingCi: process.env.INICIS_IDENTITY_ALLOW_MISSING_CI === "true",
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
    // Phase 2 — provider 전환 스위치. initiate-anonymous 요청은 이 값만 쓴다
    // (R1 #4 — 클라이언트 provider 무시). 운영 기본값은 portone(현재 운영 경로)
    // 유지 — kg_inicis 로 바꾸면 직결 전환. 허용값 이외는 portone 으로 강등하되,
    // [R1 #5] 오타(예: "kg-inicis")를 조용히 삼키면 운영자가 스위치를 넘기고
    // 재배포했는데도 원인 추적이 안 되므로 경고 로그를 남긴다.
    activeProvider: (() => {
      const raw = (process.env.IDENTITY_PROVIDER || "portone")
        .trim()
        .toLowerCase();
      if (raw === "portone" || raw === "kg_inicis") return raw;
      // eslint-disable-next-line no-console -- config factory 는 Nest Logger 컨텍스트 생성 이전에 실행된다.
      console.warn(
        `[본인인증 설정 경고] IDENTITY_PROVIDER="${raw}" 는 허용값(portone|kg_inicis)이 ` +
          "아닙니다. portone 으로 강등합니다.",
      );
      return "portone";
    })(),

    // 콜백 URL (백엔드)
    callbackBaseUrl:
      process.env.IDENTITY_CALLBACK_BASE_URL ||
      "http://localhost:5003/api/v1/identity/callback",

    // 리턴 URL (프론트엔드/앱)
    // [R1 #3] 기존 기본값 ".../identity/result" 는 실재하지 않는 라우트였다
    // (teamplus-web/src/app/identity/ 아래엔 callback 뿐) — resolveKgReturnUrl 이
    // 허용목록 밖 origin 을 이 값으로 강등하면 인증 성공 사용자가 404 로 떨어지고
    // idv:pending 도 소비되지 못했다. 실재하는 /identity/callback 으로 고정한다.
    returnBaseUrl:
      process.env.IDENTITY_RETURN_BASE_URL ||
      "http://localhost:5001/identity/callback",

    // 백엔드 공개 진입점 — KG successUrl/failUrl 조립 기준 (외부에서 접근 가능한 주소)
    publicBaseUrl: (
      process.env.IDENTITY_PUBLIC_BASE_URL || "http://localhost:5003"
    ).replace(/\/+$/, ""),

    // 인증 완료 후 리다이렉트 허용 origin — 목록 밖이면 returnBaseUrl 로 강등(open redirect 차단)
    returnUrlAllowlist: (
      process.env.IDENTITY_RETURN_URL_ALLOWLIST ||
      "http://localhost:5001,https://www.teamplus.co.kr"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),

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
    // token 은 KG 통합인증의 SEED 복호화 키다 — webhook 로그 JSONB 에 평문 적재를 막는다.
    sensitiveFields: [
      "ci",
      "di",
      "name",
      "phone",
      "birthDate",
      "password",
      "token",
      "authHash",
      "userHash",
    ],

    // 웹훅 페이로드 로깅
    logWebhookPayload: process.env.IDENTITY_LOG_WEBHOOK !== "false",
    },
  };
});
