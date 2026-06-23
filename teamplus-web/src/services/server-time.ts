/**
 * server-time.ts — 서버 시각 SoT 모듈
 *
 * 백엔드 `GET /api/v1/datetime` endpoint를 1회 호출해 서버-클라이언트 시각 차이(offset)
 * 를 메모리에 캐시한다. 이후 `getServerToday()` 호출은 캐시된 offset을 적용한 Date를
 * 반환하므로 네트워크 호출 없이 즉시 결과 제공.
 *
 * 사용 예:
 *   import { getServerToday } from '@/services/server-time';
 *   const today = await getServerToday();  // 서버 기준 오늘 날짜
 *
 * 정합성:
 *   - 같은 세션에서 모든 호출자가 동일한 offset 공유 (메모리 캐시)
 *   - 동시 호출 시 inflight Promise 합성으로 네트워크 호출 중복 방지
 *   - API 실패/파싱 실패 시 offset = 0 fallback → 클라이언트 `new Date()` 와 동일 동작
 *
 * 한계:
 *   - 백엔드 datetime endpoint가 날짜 단위(YYYYMMDD)만 보내므로 분/초 정밀도는 클라이언트 추정
 *   - 시간대(timezone) 보정 없음 — KST 단일 가정
 */

import { api } from '@/services/api-client';

interface DatetimeResponse {
  year?: string; // 'YYYY'
  month?: string; // 'YYYYMM'
  date?: string; // 'YYYYMMDD'
  dateTime?: string; // 'YYYYMMDDhhmm'
}

let cachedOffsetMs: number | null = null;
let inflight: Promise<number> | null = null;

/**
 * 서버 시각 − 클라이언트 시각 (ms) 캐시.
 * 세션 1회만 fetch. 동시 호출은 inflight Promise 공유.
 */
async function getServerOffsetMs(): Promise<number> {
  if (cachedOffsetMs !== null) return cachedOffsetMs;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const clientStart = Date.now();
      const res = await api.get<DatetimeResponse>('/datetime');
      const clientEnd = Date.now();

      if (!res.success || !res.data?.date) {
        cachedOffsetMs = 0;
        return 0;
      }

      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(res.data.date);
      if (!m) {
        cachedOffsetMs = 0;
        return 0;
      }

      // 서버는 날짜만 보내므로 자정 기준으로 offset 계산
      const serverDateMidnight = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
      );

      // 클라이언트의 RTT 중간 시점 자정 기준
      const clientMid = (clientStart + clientEnd) / 2;
      const clientMidDate = new Date(clientMid);
      const clientDateMidnight = new Date(
        clientMidDate.getFullYear(),
        clientMidDate.getMonth(),
        clientMidDate.getDate(),
      );

      cachedOffsetMs =
        serverDateMidnight.getTime() - clientDateMidnight.getTime();
      return cachedOffsetMs;
    } catch {
      cachedOffsetMs = 0;
      return 0;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * 서버 기준 "오늘" 날짜를 Date 객체로 반환.
 * 날짜(연/월/일) 단위는 서버 기준 정확, 시각(시/분/초)은 클라이언트 추정.
 *
 * 호출 시점에 캐시된 offset이 있으면 즉시 반환 (await로 마이크로태스크 1회만).
 * 캐시 없으면 fetch 후 반환 (네트워크 RTT).
 */
export async function getServerToday(): Promise<Date> {
  const offset = await getServerOffsetMs();
  return new Date(Date.now() + offset);
}

/**
 * 이미 캐시된 offset이 있으면 동기 호출로 즉시 Date 반환, 없으면 null.
 * UI 즉시 렌더 fallback 용도 (mount 직후 useState 초기값에 활용).
 */
export function getServerTodaySync(): Date | null {
  if (cachedOffsetMs === null) return null;
  return new Date(Date.now() + cachedOffsetMs);
}

/** 캐시 무효화 — 테스트/디버깅 또는 사용자 명시적 동기화 요청 시 */
export function resetServerTimeCache(): void {
  cachedOffsetMs = null;
  inflight = null;
}
