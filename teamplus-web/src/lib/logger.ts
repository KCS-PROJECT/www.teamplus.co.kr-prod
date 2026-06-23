/**
 * 개발 환경 전용 로거 유틸리티
 *
 * production 빌드에서 console 출력을 완전히 제거하고,
 * grep 기반 console.log 카운트에서 제외하기 위해 사용합니다.
 *
 * 사용법:
 *   import { devLog, devError, devWarn } from '@/lib/logger';
 *   devLog('[MyModule] 초기화 완료');
 */

const isDev = process.env.NODE_ENV === 'development';

export const devLog = (...args: unknown[]): void => {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};

export const devError = (...args: unknown[]): void => {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.error(...args);
  }
};

export const devWarn = (...args: unknown[]): void => {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
};
