/**
 * Next.js Instrumentation
 *
 * Next.js 14+ instrumentation hook을 사용하여
 * 서버 시작 시 Sentry + 통합 로깅 시스템을 초기화합니다.
 *
 * v18 (2026-05-22): 통합 로깅 명시 초기화 추가.
 *   기존엔 /api/log 첫 요청 때 lazy init 되었으나, 서버 부팅 즉시 카테고리 셸을
 *   보장하기 위해 register() 에서 initServerLogger() 를 호출하고 system.log 에
 *   boot 로그 1줄을 기록한다. teamplus-home/instrumentation.ts 와 동일 패턴.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // v18 통합 로깅 초기화 — Node 런타임에서만 (fs 사용)
    try {
      const mod = await import('./src/lib/server-log/server-logger');
      mod.initServerLogger();
      mod.serverLogger.system('info', '[boot] teamplus-web server started', {
        project: 'web',
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV ?? 'development',
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      // 부팅 실패해도 앱 자체는 동작해야 함 — stdout 으로 폴백
      // eslint-disable-next-line no-console
      console.error('[instrumentation] server-logger init failed:', err);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Sentry error handler for React Server Components
 *
 * Next.js 15+ nested React Server Component 에러를 캡처합니다.
 */
export const onRequestError = Sentry.captureRequestError;
