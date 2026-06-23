/**
 * Sentry Client Configuration
 *
 * 브라우저 사이드 에러·성능 트래킹 설정.
 * NEXT_PUBLIC_SENTRY_DSN 미설정 시 자동 비활성 (no-op).
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 환경 구분
  environment: process.env.NODE_ENV,

  // 샘플링 설정 (production 10%, dev 100%)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay — production 1% 세션 / 에러 발생 100%
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // 개발 환경에서는 비활성화
  enabled: process.env.NODE_ENV === 'production',

  // 민감 정보 필터링
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-auth-token'];
    }

    // breadcrumb 의 sensitive query string 제거
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((b) => {
        if (b.data?.url && typeof b.data.url === 'string') {
          b.data.url = b.data.url.replace(/(token|password|secret)=[^&]+/gi, '$1=[REDACTED]');
        }
        return b;
      });
    }

    if (event.extra) {
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'cardNumber'];
      for (const key of Object.keys(event.extra)) {
        if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
          delete event.extra[key];
        }
      }
    }

    return event;
  },

  // 노이즈 제거 — 네트워크 끊김 / 사용자 취소
  ignoreErrors: [
    'Network request failed',
    'Failed to fetch',
    'AbortError',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
  ],
});
