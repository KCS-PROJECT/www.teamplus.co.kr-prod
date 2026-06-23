/**
 * Offline Queue
 *
 * navigator.onLine === false 인 상태에서 발생한 mutation(POST/PUT/PATCH/DELETE)
 * 요청을 IndexedDB 에 적재했다가, `online` 이벤트 발생 시 순서대로 flush 한다.
 *
 * 사용 흐름:
 *  1. `api-client.ts` 의 axios error handler 가 네트워크 오류 + offline 감지 시
 *     `offlineQueue.enqueue(config)` 호출.
 *  2. 브라우저가 다시 online 되면 worker 가 자동으로 flush — 적재된 순서대로
 *     `axios.request(config)` 재호출. 성공/실패는 무시 (best-effort).
 *  3. 사용자가 별도 UI(토스트/배너) 로 큐 상태를 인지할 수 있도록 subscribe 제공.
 *
 * 제약:
 *  - 결제·인증 같은 시간 민감 요청은 enqueue 하지 말 것 (host 가 결정).
 *  - X-Idempotency-Key 헤더를 함께 저장하므로 backend 멱등성 안전.
 *  - SSR/server 환경에서는 noop.
 *
 * Storage: IndexedDB (DB: teamplus-offline, store: queue) — localStorage 보다 큰 용량.
 */

import type { AxiosRequestConfig } from "axios";
import { devLog, devWarn, devError } from "@/lib/logger";

const DB_NAME = "teamplus-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

interface QueuedRequest {
  id?: number;
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  enqueuedAt: number;
}

type Listener = (size: number) => void;

class OfflineQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private listeners = new Set<Listener>();
  private flushing = false;

  /** SSR 환경에서는 모든 메서드가 noop. */
  private get isBrowser(): boolean {
    return typeof window !== "undefined" && typeof indexedDB !== "undefined";
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.isBrowser) {
      return Promise.reject(new Error("IndexedDB unavailable"));
    }
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async enqueue(config: AxiosRequestConfig): Promise<void> {
    if (!this.isBrowser) return;
    if (!config.method || !config.url) return;
    const method = config.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;

    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add({
        method,
        url: config.url,
        data: config.data,
        headers: (config.headers ?? {}) as Record<string, string>,
        params: config.params,
        enqueuedAt: Date.now(),
      } as QueuedRequest);
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      devLog(`[OfflineQueue] enqueued ${method} ${config.url}`);
      this.notifyListeners();
    } catch (e) {
      devError(`[OfflineQueue] enqueue failed: ${e}`);
    }
  }

  async size(): Promise<number> {
    if (!this.isBrowser) return 0;
    try {
      const db = await this.openDb();
      return await new Promise<number>((res, rej) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).count();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    } catch {
      return 0;
    }
  }

  /**
   * 큐 비우기 — online 이벤트 또는 수동 호출.
   * axios 인스턴스를 외부에서 주입받아 사용 (순환 의존 회피).
   */
  async flush(
    sender: (req: AxiosRequestConfig) => Promise<unknown>,
  ): Promise<void> {
    if (!this.isBrowser) return;
    if (this.flushing) return;
    this.flushing = true;
    try {
      const db = await this.openDb();
      const items: QueuedRequest[] = await new Promise((res, rej) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => res(req.result as QueuedRequest[]);
        req.onerror = () => rej(req.error);
      });
      // enqueuedAt 오름차순 정렬 — autoIncrement key 가 이미 보장하지만 안전 가드.
      items.sort((a, b) => a.enqueuedAt - b.enqueuedAt);

      for (const item of items) {
        try {
          await sender({
            method: item.method,
            url: item.url,
            data: item.data,
            headers: item.headers,
            params: item.params,
          });
          // 성공 시 큐에서 제거
          await this.deleteById(item.id!);
        } catch (e) {
          devWarn(
            `[OfflineQueue] flush retry skipped — ${item.method} ${item.url}: ${e}`,
          );
          // 단일 실패 시 다음 시도까지 큐에 유지. 다음 online 이벤트 또는 재시도에서 처리.
          break;
        }
      }
      this.notifyListeners();
    } catch (e) {
      devError(`[OfflineQueue] flush failed: ${e}`);
    } finally {
      this.flushing = false;
    }
  }

  private async deleteById(id: number): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.size().then((s) => listener(s));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    void this.size().then((s) => {
      for (const listener of this.listeners) {
        try {
          listener(s);
        } catch {
          /* listener 오류 무시 */
        }
      }
    });
  }

  /**
   * online 이벤트 자동 구독 — 앱 부팅 시 1회 호출 권장.
   * @param sender 큐에서 꺼낸 요청을 실제 전송할 함수 (e.g. apiClient.request)
   */
  attachOnlineHandler(
    sender: (req: AxiosRequestConfig) => Promise<unknown>,
  ): () => void {
    if (!this.isBrowser) return () => {};
    const handler = () => {
      void this.flush(sender);
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }
}

export const offlineQueue = new OfflineQueue();
