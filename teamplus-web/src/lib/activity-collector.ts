/**
 * Activity Collector (Client-side) — teamplus-web (v8.6, 2026-05-20)
 *
 * 클라이언트 활동 이벤트(PAGE_VIEW · CLICK · API_CALL · ERROR)를 메모리 큐에 모은 뒤
 * 5초 주기 OR 25개 도달 시 batch로 POST /api/log 전송.
 * beforeunload 시 navigator.sendBeacon으로 잔여 이벤트 flush (데이터 손실 0).
 */

export interface ActivityEvent {
  ts: string;
  category?: "access" | "activity" | "auth" | "system" | "error";
  level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  action?:
    | "PAGE_VIEW"
    | "CLICK"
    | "API_CALL"
    | "API_ERROR"
    | "ERROR"
    | "LOGIN"
    | "LOGOUT";
  message?: string;
  url?: string;
  resource?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

// [2026-05-21] trailingSlash 설정상 /api/log → 308 → /api/log/ 왕복 → 처음부터 슬래시 포함.
const ENDPOINT = "/api/log/";
const MAX_QUEUE = 50;
const FLUSH_SIZE = 25;
const FLUSH_INTERVAL_MS = 5_000;

class ActivityCollector {
  private queue: ActivityEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private sessionId: string | null = null;

  /** 세션 ID 자동 생성 (sessionStorage에 1회 저장) */
  private getSessionId(): string {
    if (typeof window === "undefined") return "ssr";
    if (this.sessionId) return this.sessionId;

    try {
      const KEY = "teamplus_log_session_id";
      let id = sessionStorage.getItem(KEY);
      if (!id) {
        id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(KEY, id);
      }
      this.sessionId = id;
      return id;
    } catch {
      return `s-${Date.now()}`;
    }
  }

  /** 이벤트 수집 — 자동 메타 보강 (ts·sessionId·url) */
  collect(event: ActivityEvent): void {
    if (typeof window === "undefined") return;

    const enriched: ActivityEvent = {
      ...event,
      ts: event.ts ?? new Date().toISOString(),
      sessionId: event.sessionId ?? this.getSessionId(),
      url: event.url ?? window.location.pathname + window.location.search,
    };

    // 큐 오버플로 방지 — 가장 오래된 것 제거
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();
    }
    this.queue.push(enriched);

    if (this.queue.length >= FLUSH_SIZE) {
      void this.flush();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  /** Flush — POST 전송. 실패 시 큐 유지 (다음 주기에 재시도) */
  async flush(): Promise<void> {
    if (typeof window === "undefined" || this.flushing) return;
    if (this.queue.length === 0) {
      this.cancelTimer();
      return;
    }

    this.flushing = true;
    this.cancelTimer();

    const batch = this.queue.splice(0, FLUSH_SIZE);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
        // credentials는 같은 origin이므로 기본
        keepalive: true, // 페이지 unload 시에도 전송 시도
      });
      if (!res.ok) {
        // 4xx/5xx — 큐에 다시 넣고 다음 주기 재시도 (큐 오버플로 시 drop)
        this.requeue(batch);
      }
    } catch {
      // 네트워크 실패 — 큐에 다시 넣음
      this.requeue(batch);
    } finally {
      this.flushing = false;
      // 큐에 남은 이벤트가 있으면 타이머 재설정
      if (this.queue.length > 0 && this.timer === null) {
        this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
      }
    }
  }

  /** Beacon flush — 페이지 unload 시 호출 (실패해도 무방) */
  flushBeacon(): void {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    try {
      const blob = new Blob([JSON.stringify({ events: batch })], {
        type: "application/json",
      });
      navigator.sendBeacon?.(ENDPOINT, blob);
    } catch {
      /* swallow */
    }
  }

  private requeue(batch: ActivityEvent[]): void {
    // 큐 앞쪽에 다시 삽입 (FIFO 유지)
    this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const activityCollector = new ActivityCollector();

/** 편의 함수 — 페이지 진입 추적 */
export function trackPageView(extra?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  activityCollector.collect({
    ts: new Date().toISOString(),
    category: "activity",
    action: "PAGE_VIEW",
    url: window.location.pathname + window.location.search,
    message: `PAGE_VIEW ${window.location.pathname}`,
    meta: extra,
  });
}

/** 편의 함수 — 클릭 추적 (data-track-id 사용 권장) */
export function trackClick(
  trackId: string,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  activityCollector.collect({
    ts: new Date().toISOString(),
    category: "activity",
    action: "CLICK",
    resource: trackId,
    message: `CLICK ${trackId}`,
    meta: extra,
  });
}

/** 편의 함수 — API 호출 추적 (api-lifecycle에서 자동 호출) */
export function trackApiCall(
  method: string,
  url: string,
  status: number,
  durationMs: number,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  activityCollector.collect({
    ts: new Date().toISOString(),
    category: status >= 400 ? "error" : "access",
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    action: status >= 400 ? "API_ERROR" : "API_CALL",
    resource: url,
    message: `${method} ${url} ${status} ${durationMs}ms`,
    status,
    durationMs,
    meta: { method, ...extra },
  });
}

/** 편의 함수 — 클라이언트 에러 추적 */
export function trackClientError(error: Error, extra?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  activityCollector.collect({
    ts: new Date().toISOString(),
    category: "error",
    level: "error",
    action: "ERROR",
    message: error.message,
    error: { name: error.name, message: error.message, stack: error.stack },
    meta: extra,
  });
}
