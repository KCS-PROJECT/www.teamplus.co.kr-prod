/**
 * Retry Utility
 * API 요청 재시도 로직 (Exponential Backoff)
 */

import { ApiErrorCode, createApiError } from '@/types';

/**
 * Retry 옵션
 */
export interface RetryOptions {
  /** 최대 재시도 횟수 (기본: 3) */
  maxRetries?: number;
  /** 기본 대기 시간 ms (기본: 1000) */
  baseDelayMs?: number;
  /** 최대 대기 시간 ms (기본: 10000) */
  maxDelayMs?: number;
  /** 재시도 가능한 HTTP 상태 코드 */
  retryableStatusCodes?: number[];
  /** Jitter 사용 여부 (기본: true) */
  useJitter?: boolean;
  /** 재시도 시 호출되는 콜백 */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
  /** AbortSignal (취소 지원) */
  signal?: AbortSignal;
}

/**
 * 기본 Retry 옵션
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'signal'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [500, 502, 503, 504],
  useJitter: true,
};

/**
 * 에러가 재시도 가능한지 확인
 */
function isRetryableError(error: unknown, retryableStatusCodes: number[]): boolean {
  // 네트워크 에러 (fetch 실패)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // AbortError는 재시도하지 않음
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }

  // HTTP 응답 에러
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // statusCode 확인
    if (typeof err.statusCode === 'number') {
      return retryableStatusCodes.includes(err.statusCode);
    }

    // code 확인 (ApiError 형식)
    if (err.code === ApiErrorCode.NETWORK_ERROR ||
        err.code === ApiErrorCode.TIMEOUT_ERROR) {
      return true;
    }
  }

  return false;
}

/**
 * Exponential Backoff 대기 시간 계산
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  useJitter: boolean
): number {
  // 2^attempt * baseDelay
  const exponentialDelay = Math.min(
    baseDelayMs * Math.pow(2, attempt),
    maxDelayMs
  );

  // Jitter 추가 (0~25% 랜덤)
  if (useJitter) {
    const jitter = Math.random() * 0.25 * exponentialDelay;
    return Math.floor(exponentialDelay + jitter);
  }

  return exponentialDelay;
}

/**
 * 지정된 시간만큼 대기 (취소 가능)
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

/**
 * 재시도 로직이 포함된 비동기 함수 실행
 *
 * @example
 * ```typescript
 * const data = await withRetry(
 *   () => api.get('/unstable-endpoint'),
 *   { maxRetries: 3, onRetry: (attempt, delay) => devLog(`Retry ${attempt} in ${delay}ms`) }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // 첫 시도가 아니면 대기
    if (attempt > 0) {
      const delayMs = calculateDelay(
        attempt - 1,
        config.baseDelayMs,
        config.maxDelayMs,
        config.useJitter
      );

      config.onRetry?.(attempt, delayMs, lastError);

      try {
        await delay(delayMs, options.signal);
      } catch (e) {
        // AbortError면 즉시 실패
        throw e;
      }
    }

    try {
      // 취소 확인
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      return await fn();
    } catch (error) {
      lastError = error;

      // AbortError는 즉시 실패
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      // 마지막 시도이거나 재시도 불가능한 에러면 throw
      if (attempt === config.maxRetries ||
          !isRetryableError(error, config.retryableStatusCodes)) {
        throw error;
      }
    }
  }

  // 모든 재시도 실패
  throw lastError ?? createApiError(ApiErrorCode.UNKNOWN_ERROR, '모든 재시도가 실패했습니다.');
}

/**
 * 재시도 가능한 fetch wrapper
 *
 * @example
 * ```typescript
 * const response = await retryableFetch('/api/data', {
 *   method: 'GET',
 *   retryOptions: { maxRetries: 3 }
 * });
 * ```
 */
export async function retryableFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { retryOptions?: RetryOptions }
): Promise<Response> {
  const { retryOptions, ...fetchInit } = init ?? {};

  return withRetry(
    async () => {
      const response = await fetch(input, fetchInit);

      // HTTP 에러도 throw하여 재시도 로직에서 처리하도록 함
      if (!response.ok && retryOptions?.retryableStatusCodes?.includes(response.status)) {
        const error = new Error(`HTTP ${response.status}`) as Error & { statusCode: number };
        error.statusCode = response.status;
        throw error;
      }

      return response;
    },
    { ...retryOptions, signal: fetchInit.signal ?? undefined }
  );
}

/**
 * 프리셋: 공격적인 재시도 (빠른 재시도, 더 많은 시도)
 */
export const aggressiveRetryOptions: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  useJitter: true,
};

/**
 * 프리셋: 개발 환경용 (100회 재시도, 빠른 간격)
 * - 개발 중 네트워크 불안정이나 서버 재시작 대응
 */
export const developmentRetryOptions: RetryOptions = {
  maxRetries: 100,
  baseDelayMs: 300,
  maxDelayMs: 3000,
  useJitter: true,
};

/**
 * 프리셋: 보수적인 재시도 (느린 재시도, 적은 시도)
 */
export const conservativeRetryOptions: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 2000,
  maxDelayMs: 15000,
  useJitter: true,
};

/**
 * 프리셋: 즉시 실패 (재시도 없음)
 */
export const noRetryOptions: RetryOptions = {
  maxRetries: 0,
};

export default withRetry;
