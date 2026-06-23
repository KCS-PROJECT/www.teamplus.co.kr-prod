/** @type {import('next').NextConfig} */

const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

// NEXT_PUBLIC_API_URL에서 동적으로 허용 오리진 추출
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5003";
let extraConnectSrc = "";
// 정적 자원(/uploads/*) 이미지 origin — img-src 보강용. resolveImageUrl 이 상대 경로를
//   ${API_ORIGIN}/uploads/... 절대 URL 로 변환하므로, 백엔드 origin 이 img-src 에 없으면 차단된다.
let extraImgSrc = "";
try {
  const parsed = new URL(apiUrl);
  const apiHost = `${parsed.protocol}//${parsed.hostname}`;
  const apiPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  // localhost/127.0.0.1은 이미 포함되어 있으므로 외부 호스트만 추가
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    // 실제 API 포트 + 표준 backend/web 포트 모두 허용 (서버별 포트 매핑 변동 대응)
    extraConnectSrc = `${apiHost}:${apiPort} ${apiHost}:5001 ${apiHost}:5002 ${apiHost}:5003 ${apiHost}:5010 ${apiHost}:5001 ${apiHost}:5003`;
    // 이미지는 백엔드 정적 서빙(5003)에서 오므로 API origin(실제 포트 + 5003)만 있으면 충분.
    extraImgSrc = `${apiHost}:${apiPort} ${apiHost}:5003`;
  }
} catch {
  // URL 파싱 실패 시 무시
}

// [2026-06-15 SECURITY] 운영 CSP 에서 'unsafe-eval' 제거 (eval/new Function 기반 XSS
//   페이로드 실행면 차단). next dev 는 HMR/소스맵이 eval 을 쓰므로 dev 한정 허용한다
//   (teamplus-home/next.config.js 패턴 이식). PG SDK(Toss/PortOne)는 webpack 번들
//   동적 import 라 eval 미사용 — 제거해도 결제/본인인증 영향 없음.
const isDev = process.env.NODE_ENV !== "production";

// 보안 헤더 설정 (OWASP 권장)
const securityHeaders = [
  {
    // Content Security Policy - XSS 및 인젝션 공격 방어
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // [추가 2026-05-26] PortOne(본인인증 게이트웨이) SDK 동적 로드 허용.
      //   cdn.portone.io = SDK 파일 / *.portone.io = 향후 추가 도메인 대응.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://pg.inicis.com https://*.sentry.io https://*.daumcdn.net https://t1.kakaocdn.net https://developers.kakao.com https://*.tosspayments.com https://cdn.portone.io https://*.portone.io https://*.iamport.co https://*.iamport.kr`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // [수정] dev/staging 백엔드(HTTP) 정적 이미지(/uploads/*) 허용 — resolveImageUrl 이
      //   상대경로를 http://<backend>/uploads/... 절대 URL 로 변환하므로 img-src 에 명시 필요.
      //   운영(https://*.teamplus.com)은 `https:` 로 커버되어 영향 없음.
      [
        "img-src 'self' data: https: blob:",
        "http://localhost:5001 http://localhost:5003 http://localhost:5010",
        "http://127.0.0.1:5001 http://127.0.0.1:5003 http://127.0.0.1:5010",
        "http://192.168.0.105:5001 http://192.168.0.105:5003 http://192.168.0.105:5010",
        "http://211.236.174.86:5003 http://211.236.174.110:5003 http://211.236.174.90:5003 http://211.236.174.115:5003",
        extraImgSrc,
      ]
        .filter(Boolean)
        .join(" "),
      "font-src 'self' https://fonts.gstatic.com",
      [
        "connect-src 'self'",
        "https://*.teamplus.com",
        "https://*.sentry.io",
        "https://*.ingest.sentry.io",
        "https://*.kakao.com",
        "https://t1.kakaocdn.net",
        // [수정 2026-05-13] 토스페이먼츠 모든 서브도메인 허용 — log/event/api/js 등 SDK 가 다양한 endpoint 호출.
        "https://*.tosspayments.com",
        // [추가 2026-05-26] PortOne V2 REST API + KG이니시스 통합인증 호출 도메인.
        //   PortOne V2 SDK 는 내부적으로 구 iamport.co (checkout-service.prod.iamport.co
        //   = identity-verification-prepare 엔드포인트) 도메인을 사용하므로 함께 허용.
        "https://api.portone.io",
        "https://*.portone.io",
        "https://*.iamport.co",
        "https://*.iamport.kr",
        "https://*.inicis.com",
        "wss: ws:",
        "http://localhost:5001 http://localhost:5003",
        "http://127.0.0.1:5001 http://127.0.0.1:5003",
        "http://192.168.0.105:5001 http://192.168.0.105:5003",
        // [추가 — 사용자 지정 포트 매핑 web=5001 admin=5002 backend=5003 home=5010]
        "http://localhost:5001 http://localhost:5002 http://localhost:5003 http://localhost:5010",
        "http://127.0.0.1:5001 http://127.0.0.1:5002 http://127.0.0.1:5003 http://127.0.0.1:5010",
        "http://192.168.0.105:5001 http://192.168.0.105:5002 http://192.168.0.105:5003 http://192.168.0.105:5010",
        // [추가 2026-05-19] 개발자별 LAN IP — dart_defines/{dsh,kms,kty}.json + dev 서버.
        //   WebView 환경에서 dsh 머신 backend (211.236.174.86:5003) 직접 호출 차단 해소.
        "http://211.236.174.86:5001 http://211.236.174.86:5002 http://211.236.174.86:5003 http://211.236.174.86:5010",
        "http://211.236.174.110:5001 http://211.236.174.110:5002 http://211.236.174.110:5003 http://211.236.174.110:5010",
        "http://211.236.174.90:5001 http://211.236.174.90:5002 http://211.236.174.90:5003 http://211.236.174.90:5010",
        "http://211.236.174.115:5001 http://211.236.174.115:5002 http://211.236.174.115:5003 http://211.236.174.115:5010",
        extraConnectSrc,
      ]
        .filter(Boolean)
        .join(" "),
      // [추가 2026-05-13] 토스 결제창 / 3DS / 카드사 인증 페이지 — frame-src 허용 필수.
      // [추가 2026-05-26] PortOne 본인인증 iframe + KG이니시스 통합인증창 + PASS/카카오 등 인증사 도메인.
      //   KG 통합인증창은 PASS/네이버/카카오/금융인증/TOSS 등을 sub-iframe 으로 띄우므로
      //   주요 인증 도메인을 함께 화이트리스트.
      "frame-src 'self' https://pg.inicis.com https://*.inicis.com https://*.portone.io https://*.iamport.co https://*.iamport.kr http://postcode.map.kakao.com https://postcode.map.kakao.com https://*.daumcdn.net http://*.daumcdn.net https://*.tosspayments.com https://*.kakao.com https://*.kakaopay.com https://*.naver.com https://*.nice.co.kr https://*.passauth.co.kr https://nice.checkplus.co.kr",
      "media-src 'self' data: blob:", // QR 스캔 성공 beep(data:audio/mp3), 카메라 스트림(blob:)
      "object-src 'none'",
      "base-uri 'self'",
      // [수정 2026-05-26] PortOne 본인인증 SDK 가 KG이니시스 통합인증 시작 시
      //   <form action="https://sa.inicis.com/auth"> 를 POST submit 한다.
      //   form-action 'self' 만 허용하면 CSP 가 차단하여 본인인증창이 뜨지 못함.
      //   인증사 도메인(KG/PortOne/NICE/PASS/카카오/네이버) 을 frame-src 와 동일하게 허용.
      "form-action 'self' https://*.inicis.com https://*.portone.io https://*.iamport.co https://*.iamport.kr https://*.kakao.com https://*.kakaopay.com https://*.naver.com https://*.nice.co.kr https://*.passauth.co.kr https://nice.checkplus.co.kr",
      "worker-src 'self' blob:",
    ].join("; "),
  },
  {
    // HTTPS 강제 (2년 캐시, 서브도메인 포함, preload 목록 등록)
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Clickjacking 방어
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    // MIME 타입 스니핑 방지
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // 리퍼러 정보 누출 방지
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // 브라우저 기능 권한 제어
    key: "Permissions-Policy",
    // [수정 2026-05-13] 토스 결제 iframe 에서 Payment Request API 사용 가능하도록 토스 도메인 허용.
    //  기존: payment=(self) → 토스 iframe(다른 도메인)에서 결제수단 선택 시 차단되어 UI 토글 비활성.
    // [수정 2026-06-10] 위치 미수집 선언(Data Safety/App Privacy) 정합 — geolocation 전면 차단.
    value:
      'camera=(self), microphone=(), geolocation=(), payment=(self "https://*.tosspayments.com")',
  },
  {
    // DNS Prefetch 제어
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const isStaticExport = process.env.NEXT_EXPORT === "true";

const nextConfig = {
  // 정적 HTML 내보내기 (NestJS에서 서빙하기 위함)
  // NOTE: 동적 라우트([id])가 클라이언트 컴포넌트이므로 개발 중에는 비활성화
  // 배포 시 SSR 모드 또는 generateStaticParams 서버 컴포넌트 래퍼 필요
  // output: 'export',

  // 개발 서버에서 허용할 호스트 (Flutter WebView 네트워크 접근용)
  allowedDevOrigins: ["http://192.168.0.105:3000", "http://localhost:5001"],

  // 실험적 기능: 서버 액션 및 외부 호스트 허용
  experimental: {
    serverActions: {
      allowedOrigins: ["192.168.0.105:3000", "localhost:5001"],
    },
    // 🎯 대형 모듈 barrel import 최적화 — tree-shaking 강화 (2026-04-30 확장)
    // 번들 크기 10-30% 감소 → 초기 JS 파싱 시간 단축
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-slot",
      // 추가: 무거운 라이브러리 barrel import 최적화
      "recharts", // 차트 — 사용한 컴포넌트만 import
      "qrcode.react", // QR — 단일 컴포넌트만 (QRCodeSVG)
      "socket.io-client", // 사용된 export 만
      "dompurify", // 단일 sanitize 함수
    ],
  },

  // 🎯 standalone 출력 — Docker/PaaS 배포 시 의존성 자체 포함, 이미지 크기 80% 감소
  // dev 모드 영향 없음. production 빌드 시 .next/standalone 디렉토리 생성.
  output: "standalone",

  // 🎯 응답 압축 (Next.js 자체 gzip) — production 에서 자동 활성화
  compress: true,

  // 🎯 생성 파일 ETag — CDN/브라우저 304 캐시 적중 향상
  generateEtags: true,

  // Powered-by 헤더 제거 — 응답 byte 절약 + 보안
  poweredByHeader: false,

  // Trailing slash 추가 (정적 파일 라우팅 호환성)
  trailingSlash: true,

  // Monorepo workspace root for output file tracing
  outputFileTracingRoot: path.resolve(__dirname, ".."),

  // React strict mode for better development experience
  reactStrictMode: true,

  // 개발 모드 인디케이터 비활성화
  devIndicators: false,

  // Hydration 경고 억제 (브라우저 확장 프로그램으로 인한 불일치 무시)
  // bis_skin_checked 등 확장 프로그램이 추가하는 속성으로 인한 경고 방지
  onDemandEntries: {
    // 페이지 버퍼 크기
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },

  // TypeScript build-time type checking
  typescript: {
    // Type errors will fail the build
    ignoreBuildErrors: false,
  },

  // ESLint during builds
  eslint: {
    // Lint errors will fail the build
    ignoreDuringBuilds: false,
  },

  // Image optimization (정적 빌드에서는 비활성화 필요)
  images: {
    unoptimized: isStaticExport, // 정적 export 시 이미지 최적화 비활성화
    // 🎯 해상도 적응 — 모바일 우선 srcset 단계 (2026-04-30 명시화)
    //   기존 Next.js 기본값(640~3840)은 데스크톱 위주로 모바일 단계가 비어 있어
    //   iPhone SE(320)/Android(360·412)/iPad mini(744·768) DPR 1x~3x 조합에서
    //   불필요하게 큰 이미지가 다운로드되던 문제를 차단.
    deviceSizes: [320, 360, 412, 640, 750, 828, 1080, 1280, 1920],
    imageSizes: [16, 24, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },

  // Shared types path alias
  webpack: (config, { isServer }) => {
    config.resolve.alias["@shared"] = path.resolve(__dirname, "../shared");

    // [추가] Prisma Instrumentation / OpenTelemetry 관련 동적 의존성 경고 억제
    if (isServer) {
      config.ignoreWarnings = [
        { module: /node_modules\/@opentelemetry\/instrumentation/ },
        {
          message:
            /Critical dependency: the request of a dependency is an expression/,
        },
      ];
    }

    return config;
  },

  // 프로덕션 빌드에서 console.log 제거 (console.error는 유지)
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  // 딥링크 검증 파일 매핑 (App Links / Universal Links)
  //   iOS/Android 는 도메인 루트의 고정 경로에서만 검증 파일을 읽으므로,
  //   .well-known 고정 경로 → Route Handler 로 rewrite 한다.
  //   - Android: /.well-known/assetlinks.json        → /api/deeplink/assetlinks
  //   - iOS:     /.well-known/apple-app-site-association → /api/deeplink/aasa
  //   ⚠️ 이 rewrite 가 없으면 AndroidManifest autoVerify=true 검증이 실패한다.
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/deeplink/assetlinks",
      },
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/deeplink/aasa",
      },
    ];
  },

  // 보안 헤더 + 폰트 preload + Cache-Control 적용
  async headers() {
    return [
      {
        // 모든 라우트에 보안 헤더 적용.
        // ⚠️ Material Symbols preload Link 헤더는 의도적으로 제거됨 — Next.js dev HMR 이
        //    CSS 를 분할 주입하면서 "preloaded but not used" 경고를 유발했기 때문.
        //    @font-face 의 font-display:block (app/layout.tsx inline) 이 FOUT 을 차단하므로
        //    preload 없이도 UX 손실 없음.
        source: "/:path*",
        headers: [...securityHeaders],
      },
      // 🚀 콜드 스타트 최적화 (2026-05-16) — 정적 자산 immutable + Image 30일 캐시
      //   브라우저/CDN 재방문 시 0 bytes 전송 (304 또는 캐시 hit).
      //   _next/static 은 hash 기반 파일명이라 immutable 안전.
      //   _next/image 는 max-age 30일 + must-revalidate (이미지 변경 시 갱신 가능).
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/image/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, must-revalidate",
          },
        ],
      },
      {
        // Pretendard / Material Symbols 폰트 — 거의 변하지 않으므로 1년 캐시.
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// Sentry 설정 (Phase α 활성화 — 2026-04-18)
// @sentry/nextjs 10.49.0 기준 Next.js 15 App Router 호환 확인 완료.
// 활성화 조건: SENTRY_DSN · NEXT_PUBLIC_SENTRY_ENABLED=true · SENTRY_DISABLED !== 'true'
// 소스맵 업로드는 추가로 SENTRY_ORG · SENTRY_PROJECT · SENTRY_AUTH_TOKEN 설정 필요.
const sentryWebpackPluginOptions = {
  // Sentry 조직 및 프로젝트 설정
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // 소스맵 업로드 설정 (프로덕션 빌드 시)
  silent: !process.env.CI, // CI에서만 로그 출력
  widenClientFileUpload: true,

  // 소스맵 삭제 (클라이언트에서 접근 불가)
  hideSourceMaps: true,

  // Webpack 설정
  bundleSizeOptimizations: {
    // 디버그 로깅 제거 (production)
    excludeDebugStatements: true,
  },
};

const enableSentry =
  process.env.SENTRY_DSN &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true" &&
  process.env.SENTRY_DISABLED !== "true";

module.exports = enableSentry
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
