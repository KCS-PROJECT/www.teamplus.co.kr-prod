/**
 * Sentry Edge Configuration
 *
 * Edge Runtime 에러 트래킹 설정입니다.
 * Middleware 및 Edge Functions에서 발생하는 에러를 Sentry로 전송합니다.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 환경 구분
  environment: process.env.NODE_ENV,

  // 샘플링 설정
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // 개발 환경에서는 비활성화
  enabled: process.env.NODE_ENV === 'production',

  // 민감 정보 필터링
  beforeSend(event) {
    // Edge 에러에서 민감 정보 제거
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }

    return event;
  },
});
