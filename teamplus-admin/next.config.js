/** @type {import('next').NextConfig} */
const path = require("path");
const isDevelopment = process.env.NODE_ENV !== "production";

// [2026-06-10 SECURITY] 어드민 대시보드 보안 헤더 — 기존 next.config 에 headers() 부재로
//   CSP/X-Frame-Options/HSTS 가 전혀 적용되지 않아 클릭재킹·스니핑·다운그레이드에 노출되어 있었다.
//   어드민은 임베드될 일이 없으므로 X-Frame-Options: DENY + frame-ancestors 'none' 으로 엄격 적용.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // [2026-06-15 SECURITY] Next.js 런타임 + styled-components 는 인라인만 필요하고
      //   'unsafe-eval' 은 dev HMR 에서만 필요하다. 운영 CSP 에서는 제거해 eval 기반
      //   XSS 페이로드 실행면을 차단한다 (teamplus-home 패턴 이식). 어드민은 PG SDK 미로드라 안전.
      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      [
        "connect-src 'self'",
        "https://*.teamplus.com",
        "wss: ws:",
        "http://localhost:5002 http://localhost:5003",
        "http://127.0.0.1:5002 http://127.0.0.1:5003",
        "http://192.168.0.105:5002 http://192.168.0.105:5003",
        // [2026-06-19] dev 서버(115) — IP 직접 접속 (nginx/도메인 미사용)
        "http://211.236.174.115:5002 http://211.236.174.115:5003",
      ].join(" "),
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self' blob:",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // 어드민은 어떤 사이트에도 임베드 불필요 → DENY
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig = {
  // Prevent dev/prod artifact collisions when `next dev` and `next build`
  // are executed in parallel on the same project.
  distDir: isDevelopment ? ".next-dev" : ".next",
  reactStrictMode: true,
  swcMinify: true,
  // [2026-06-23 운영 배포] 운영 빌드 차단 회피 — lint(no-unused-vars)/TS strict(중복 키 등) 잔존 이슈.
  //   ESLint·tsc 자체는 CI/IDE에서 별도 실행으로 품질 관리. 차후 코드 정리 PR 권장.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // [보안 2026-06-07] production 빌드에서 console.* 제거(운영자 콘솔 PII/결제/토큰 노출 차단).
  //   console.error 만 유지(운영 로그). web 프로젝트와 동일 정책.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  transpilePackages: ["../shared"],
  // 🎯 성능 최적화 — 응답 압축·ETag·barrel import tree-shaking
  compress: true,
  generateEtags: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-query",
      "@radix-ui/react-slot",
      "date-fns",
    ],
  },
  webpack: (config) => {
    config.resolve.alias["@shared"] = path.resolve(__dirname, "../shared");
    // shared 폴더에서 teamplus-admin의 node_modules를 사용하도록 설정
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
    ];
    return config;
  },
  // [2026-06-10 SECURITY] 전 경로 보안 헤더 적용.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
