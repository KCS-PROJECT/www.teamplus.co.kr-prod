"use client";

/**
 * refresh-bus — 도메인 단위 캐시 무효화 신호 버스
 *
 * TanStack Query 가 제거된 이후 (CLAUDE.md v2.4, 2026-04-21) 모든 데이터 페칭은
 * `useState + useCallback + useEffect` 커스텀 훅 패턴으로 통일됨. mutation 후
 * 다른 페이지의 listing 을 즉시 갱신할 통합 채널이 필요해 도입.
 *
 * ─── 사용 패턴 ──────────────────────────────────────
 * 1) Mutation 성공 직후 — 도메인 키 기반으로 신호 발화.
 *    ```
 *    import { emitRefresh } from '@/lib/refresh-bus';
 *    await api.post('/admin/coaches', payload);
 *    emitRefresh('coaches');              // 코치 listing
 *    emitRefresh(['coaches', teamId]);    // teamId scoping
 *    replace('/director-coaches');
 *    ```
 *
 * 2) Listing 페이지 — 마운트 시 자동 fetch 외에 신호 수신 시 재 fetch.
 *    ```
 *    import { useRefreshSubscription } from '@/lib/refresh-bus';
 *    useRefreshSubscription('coaches', loadCoaches);
 *    ```
 *
 * ─── 설계 ──────────────────────────────────────────
 *  · key 매칭: `'coaches'` 와 `['coaches', '<teamId>']` 가 부분 일치로 매치.
 *      구독자 키가 더 짧으면 (`'coaches'`) 그 prefix 로 발화한 모든 이벤트 수신.
 *      구독자 키가 더 길면 (`['coaches', 'T1']`) 정확히 동일하거나 더 길거나 같은 prefix 발화만 수신.
 *  · 이벤트는 즉시 발화 — micro-task 큐로 이연 (renderer 와 race 방지)
 *  · cross-tab 동기화: 동일 origin 의 BroadcastChannel('teamplus-refresh') 로 fan-out
 *      → 같은 사용자가 PC + 모바일 양쪽 열어두면 양쪽 모두 갱신.
 *  · WebSocket / Socket.io 이벤트 → 별도 어댑터에서 `emitRefresh` 호출 (단방향).
 */

type RefreshKey = string | readonly [string, ...string[]];

type Listener = (key: ReadonlyArray<string>) => void;

const listeners = new Set<{ key: ReadonlyArray<string>; cb: Listener }>();

let broadcastChannel: BroadcastChannel | null = null;
let initialized = false;

function ensureBroadcastChannel(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (typeof BroadcastChannel === "function") {
    try {
      broadcastChannel = new BroadcastChannel("teamplus-refresh");
      broadcastChannel.onmessage = (ev) => {
        const key = ev?.data?.key;
        if (Array.isArray(key)) {
          fanOut(key, /* skipBroadcast */ true);
        }
      };
    } catch {
      broadcastChannel = null;
    }
  }
}

function toKeyArray(key: RefreshKey): string[] {
  return typeof key === "string" ? [key] : [...key];
}

function isPrefixMatch(
  subscriberKey: ReadonlyArray<string>,
  emittedKey: ReadonlyArray<string>,
): boolean {
  if (subscriberKey.length === 0) return true; // 와일드카드
  if (emittedKey.length < subscriberKey.length) return false;
  for (let i = 0; i < subscriberKey.length; i += 1) {
    if (subscriberKey[i] !== emittedKey[i]) return false;
  }
  return true;
}

function fanOut(key: ReadonlyArray<string>, skipBroadcast = false): void {
  // micro-task 로 이연 — emit 호출자 동기 흐름 분리
  queueMicrotask(() => {
    listeners.forEach(({ key: subKey, cb }) => {
      if (isPrefixMatch(subKey, key)) {
        try {
          cb(key);
        } catch {
          /* swallow — 개별 구독자 오류가 다른 구독자 차단 금지 */
        }
      }
    });
    if (!skipBroadcast && broadcastChannel) {
      try {
        broadcastChannel.postMessage({ key: [...key] });
      } catch {
        /* swallow */
      }
    }
  });
}

/**
 * mutation 성공 후 호출. 동일 도메인을 구독 중인 listing 컴포넌트가 즉시 재 fetch.
 *
 * @example
 *   emitRefresh('coaches');
 *   emitRefresh(['coaches', teamId]);
 *   emitRefresh(['notices', teamId]);
 *   emitRefresh(['tournaments']);
 */
export function emitRefresh(key: RefreshKey): void {
  ensureBroadcastChannel();
  fanOut(toKeyArray(key));
}

/**
 * 구독자 등록. listing 컴포넌트가 mount 시 호출하여 mutation 신호 수신.
 *
 * 반환값은 unsubscribe 함수. useEffect 의 cleanup 에서 호출.
 */
export function subscribeRefresh(
  key: RefreshKey,
  callback: Listener,
): () => void {
  ensureBroadcastChannel();
  const entry = { key: toKeyArray(key), cb: callback };
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}

import { useEffect, useRef } from "react";

/**
 * React hook 변형. listing 페이지에서 mount/unmount 라이프사이클로 자동 구독.
 *
 * @example
 *   useRefreshSubscription('coaches', loadCoaches);
 *   useRefreshSubscription(['notices', teamId], loadNotices);
 */
export function useRefreshSubscription(
  key: RefreshKey,
  callback: () => void,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  // key 직렬화 — array 매번 새 참조라도 동일 내용이면 재구독 방지
  const serialized = typeof key === "string" ? key : key.join("/");
  useEffect(() => {
    const k =
      typeof key === "string" ? key : ([...key] as [string, ...string[]]);
    return subscribeRefresh(k, () => cbRef.current?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}

/**
 * 도메인 키 표준 — 매직 스트링 방지용 SoT. 신규 도메인 추가 시 여기 등록.
 *
 * 사용 예: `emitRefresh(REFRESH_KEYS.COACHES)`, `useRefreshSubscription(REFRESH_KEYS.NOTICES)`
 */
export const REFRESH_KEYS = {
  COACHES: "coaches",
  NOTICES: "notices",
  TOURNAMENTS: "tournaments",
  CLASSES: "classes",
  ATTENDANCE: "attendance",
  ROSTER: "roster",
  CREDITS: "credits",
  PAYMENTS: "payments",
  SETTLEMENTS: "settlements",
  CALENDAR: "calendar",
  // [추가 2026-05-15 V04] 팀 정보 변경 — team/[id]/edit 저장 후 emitRefresh(REFRESH_KEYS.TEAM)
  //   또는 emitRefresh(['team', teamId]) 로 scope 지정.
  TEAM: "team",
  // [추가 W2.D 2026-05-18] 매치 등록/수정/삭제 — matches/create 성공 시 emitRefresh
  //   → matches/list 페이지가 자동 재 fetch (#7 이슈: 등록 후 list 미반영 해결).
  MATCHES: "matches",
  // [추가 2026-05-23 Phase C] 자녀 정보 변경 — children/[childId]/edit 의 사진 업로드 등
  //   즉시 PATCH 후 발행 → /children 리스트, parent dashboard 캐러셀 자동 재fetch.
  CHILDREN: "children",
  // [추가 2026-05-23 Phase C] 수상 정보 변경 — awards/[id]/edit 의 사진 업로드 등
  //   즉시 PATCH 후 발행 → awards 리스트 자동 재fetch.
  AWARDS: "awards",
} as const;
