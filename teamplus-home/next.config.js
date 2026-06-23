/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  devIndicators: false,
  // [보안 2026-06-07] production 빌드에서 console.* 제거(error 유지).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // [보안 2026-06-07] 보안 응답 헤더 — 클릭재킹/MIME 스니핑/다운그레이드 방어.
  //   /admin 로그인 폼이 동일 도메인에 존재 → frame 차단 필수.
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    // [dev only] Next.js dev(webpack/HMR)는 eval 기반 소스맵을 사용 → strict CSP면 dev에서
    //   스크립트(framer-motion 포함)가 깨져 화면이 비어 보인다. 프로덕션 빌드엔 eval 이 없으므로
    //   운영 CSP는 unsafe-eval 없이 그대로 strict 유지한다.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; img-src 'self' https://images.unsplash.com data: blob:; style-src 'self' 'unsafe-inline'; ${scriptSrc}; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
