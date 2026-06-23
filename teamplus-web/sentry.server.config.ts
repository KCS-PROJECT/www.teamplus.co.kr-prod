/**
 * Sentry Server Configuration
 *
 * 서버 사이드 에러 트래킹 설정입니다.
 * Next.js 서버에서 발생하는 에러를 Sentry로 전송합니다.
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
    // 서버 에러에서 민감 정보 제거
    if (event.request?.headers) {
      // 인증 헤더 제거
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-auth-token'];
    }

    if (event.extra) {
      // 민감 키워드가 포함된 extra 데이터 제거
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
      for (const key of Object.keys(event.extra)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          delete event.extra[key];
        }
      }
    }

    return event;
  },

  // 추가 통합
  integrations: [
    // Prisma 쿼리 성능 트래킹 (필요시)
    // Sentry.prismaIntegration(),
  ],
});
