module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:5001/',
        'http://localhost:5001/login',
        'http://localhost:5001/settings',
      ],
      numberOfRuns: 3,
      settings: {
        preset: 'mobile',
        // Moto G4 emulation
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 360,
          height: 640,
          deviceScaleFactor: 3,
          disabled: false,
        },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
          cpuSlowdownMultiplier: 4,
        },
      },
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        // Next.js 환경에서 PWA는 선택적 항목으로 경고만 처리
        'categories:pwa': 'off',
        // 개발 환경에서 발생하는 known false-positive 항목 완화
        'uses-http2': 'off',
        'uses-long-cache-ttl': 'warn',
        'canonical': 'warn',
        // 🎯 1초 SLA 가드 — API 응답/서버 응답 시간 회귀 방지
        // server-response-time: TTFB 기준 800ms 이하 (모바일 3G 에뮬 환경 고려)
        'server-response-time': ['error', { maxNumericValue: 800 }],
        // Largest Contentful Paint: 모바일 2.5s 이하 (Google 권장)
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        // Total Blocking Time: 300ms 이하 (1s SLA 대비 여유)
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        // Time to Interactive: 3.8s 이하
        'interactive': ['warn', { maxNumericValue: 3800 }],
        // First Contentful Paint: 1.8s 이하
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        // 응답 압축 확인 — 이번 턴 gzip 도입 회귀 방지
        'uses-text-compression': 'error',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
