/**
 * Sentry Client Configuration (Next.js 15 Turbopack 호환)
 *
 * 브라우저에서 발생하는 JavaScript 에러·성능·세션 리플레이를 Sentry로 전송합니다.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 * @note Sentry 10.49.0 기준 — Turbopack 전환 시 `sentry.client.config.ts`가 무시되므로
 *        이 파일이 클라이언트 설정의 Source of Truth 입니다.
 */

import * as Sentry from '@sentry/nextjs';

const SENSITIVE_HEADER_KEYS = ['authorization', 'cookie', 'x-auth-token', 'set-cookie'];
const SENSITIVE_PARAM_KEYS = ['token', 'key', 'secret', 'auth', 'password'];
const SENSITIVE_EXTRA_KEYS = ['password', 'token', 'secret', 'key', 'auth', 'creditcard'];
const IGNORED_ERROR_MESSAGES = [
  'ResizeObserver loop',
  'ResizeObserver loop completed with undelivered notifications',
  'Network request failed',
  'Failed to fetch',
  'Load failed',
  'AbortError',
  'The user aborted a request',
];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,

  enabled: process.env.NODE_ENV === 'production',

  ignoreErrors: [...IGNORED_ERROR_MESSAGES, /^Script error\.?$/],

  beforeSend(event) {
    if (event.request?.cookies) {
      delete event.request.cookies;
    }

    if (event.request?.headers) {
      for (const header of SENSITIVE_HEADER_KEYS) {
        delete event.request.headers[header];
      }
    }

    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        for (const param of SENSITIVE_PARAM_KEYS) {
          if (url.searchParams.has(param)) {
            url.searchParams.set(param, '[FILTERED]');
          }
        }
        event.request.url = url.toString();
      } catch {
        // URL 파싱 실패 시 무시
      }
    }

    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (SENSITIVE_EXTRA_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
          delete event.extra[key];
        }
      }
    }

    const message = event.exception?.values?.[0]?.value;
    if (message && IGNORED_ERROR_MESSAGES.some((ignored) => message.includes(ignored))) {
      return null;
    }

    return event;
  },

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
    Sentry.browserTracingIntegration({
      enableInp: true,
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
