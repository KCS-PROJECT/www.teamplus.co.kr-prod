/**
 * Loading Data Tracker
 *
 * 페이지 전환 풀스크린 로더가 Next.js 라우트 commit 시점이 아니라
 * "전환 이후 시작된 화면 데이터 요청"이 모두 안정화된 뒤 닫히도록 돕는
 * 경량 전역 트래커입니다.
 *
 * - React 의존성 없음: api-client 와 LoadingContext 양쪽에서 import 가능
 * - 요청 시작/종료만 추적: 실제 응답 데이터에는 접근하지 않음
 * - 배경성 요청은 제외: 알림 배지/전역 팝업 같은 화면 본문과 무관한 요청이
 *   로더를 오래 붙잡지 않도록 함
 */

export interface LoadingDataRequest {
  id: string;
  method: string;
  url: string;
  startedAt: number;
}

export interface LoadingDataSnapshot {
  pendingCount: number;
  pending: LoadingDataRequest[];
}

type Listener = (snapshot: LoadingDataSnapshot) => void;

const pendingRequests = new Map<string, LoadingDataRequest>();
const listeners = new Set<Listener>();

function now(): number {
  return Date.now();
}

function normaliseUrl(url: string): string {
  if (!url) return "";

  try {
    // 절대 URL이면 pathname+search만 사용
    const parsed = new URL(url, "http://teamplus.local");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function isBackgroundRequest(method: string, url: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedUrl = normaliseUrl(url);

  // 화면 본문 데이터와 무관한 전역 배경 요청.
  // 이 요청들이 느려도 페이지 전환 로더를 붙잡지 않아야 한다.
  if (/\/notifications\/stats\/unread(?:[/?#]|$)/.test(normalizedUrl)) {
    return true;
  }
  if (
    normalizedMethod === "GET" &&
    /\/app\/banners(?:[/?#]|$)/.test(normalizedUrl)
  ) {
    return true;
  }

  return false;
}

function createSnapshot(): LoadingDataSnapshot {
  const pending = Array.from(pendingRequests.values());
  return {
    pendingCount: pending.length,
    pending,
  };
}

function notify(): void {
  const snapshot = createSnapshot();
  listeners.forEach((listener) => {
    listener(snapshot);
  });
}

export function beginLoadingDataRequest(input: {
  id?: string;
  method?: string;
  url?: string;
}): () => void {
  const method = input.method ?? "GET";
  const url = input.url ?? "";

  if (isBackgroundRequest(method, url)) {
    return () => {};
  }

  const id =
    input.id ??
    `${method}:${url}:${now()}:${Math.random().toString(36).slice(2)}`;
  const request: LoadingDataRequest = {
    id,
    method: method.toUpperCase(),
    url: normaliseUrl(url),
    startedAt: now(),
  };

  pendingRequests.set(id, request);
  notify();

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    if (pendingRequests.delete(id)) {
      notify();
    }
  };
}

export function subscribeLoadingDataRequests(listener: Listener): () => void {
  listeners.add(listener);
  listener(createSnapshot());

  return () => {
    listeners.delete(listener);
  };
}

export function getPendingLoadingDataRequestCount(options?: {
  since?: number;
}): number {
  const since = options?.since ?? 0;
  let count = 0;

  pendingRequests.forEach((request) => {
    if (request.startedAt >= since) {
      count += 1;
    }
  });

  return count;
}
