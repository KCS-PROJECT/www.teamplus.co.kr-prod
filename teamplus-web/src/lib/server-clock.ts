/**
 * server-clock.ts — ms 정밀 서버 시각 offset (X-Server-Time 헤더 기반)
 *
 * 모든 API 응답에 실려오는 `X-Server-Time`(ISO8601) 헤더로 서버-클라이언트 시각 차이를
 * 메모리에 캐시한다. 출석 윈도우(시작 −60min ~ 종료)처럼 분 단위 판정이 필요한 곳이
 * 기기 시계 대신 서버 보정 시각을 쓰도록 `getServerNowMs()` 를 제공한다.
 *
 * 설계:
 *  - 의존성 0 (api-client·services 를 import 하지 않아 순환 import 없음).
 *  - api-client 응답 인터셉터가 recordServerTime() 으로 매 응답마다 갱신 (네트워크 추가 0회).
 *  - 헤더를 한 번도 못 받은 환경(예: 일부 WebView 경로)은 offset 0 → 클라이언트 시각 폴백.
 *    이 경우에도 백엔드 validateTimeWindow 가 서버 시각으로 최종 차단하므로 부정 출석은 불가.
 */

let serverClockOffsetMs = 0;
let hasServerClock = false;

/** X-Server-Time(ISO8601)으로 서버-클라이언트 시각 차이를 기록. */
export function recordServerTime(iso: string | null | undefined): void {
  if (!iso) return;
  const serverMs = Date.parse(iso);
  if (Number.isNaN(serverMs)) return;
  serverClockOffsetMs = serverMs - Date.now();
  hasServerClock = true;
}

/** 서버 보정 현재 시각(ms). 헤더 미수신 환경은 클라이언트 Date.now() 폴백. */
export function getServerNowMs(): number {
  return Date.now() + (hasServerClock ? serverClockOffsetMs : 0);
}

/** 서버 시각 동기화 여부 — 디버깅/테스트용. */
export function hasServerClockSync(): boolean {
  return hasServerClock;
}
