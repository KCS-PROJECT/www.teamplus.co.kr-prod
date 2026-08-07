/**
 * KST(Asia/Seoul) 날짜·시각 공통 유틸 — 서버 프로세스 타임존과 무관하게 동작하는 것이 원칙.
 * 상세 설계: claudedocs/timezone-storage-redesign-2026-07-02.md §5 [기술 상세 T1]
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 현재 시각의 KST 벽시계 성분.
 * epoch에 +9h 후 반드시 getUTC* 로 읽는다 — 로컬 getter 로 읽으면
 * 서버 TZ가 KST일 때 +9가 이중 적용되어 15시 이후 날짜가 하루 앞선다.
 */
export function nowKstParts(): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
} {
  const k = new Date(Date.now() + KST_OFFSET_MS);
  return {
    year: String(k.getUTCFullYear()),
    month: String(k.getUTCMonth() + 1).padStart(2, "0"),
    day: String(k.getUTCDate()).padStart(2, "0"),
    hour: String(k.getUTCHours()).padStart(2, "0"),
    minute: String(k.getUTCMinutes()).padStart(2, "0"),
  };
}

/**
 * 날짜 문자열("YYYY-MM-DD")을 `@db.Date` write 용 UTC 자정 instant 로 변환.
 * `@db.Date` 컬럼은 UTC 자정 규약 — `+09:00` 로 파싱하면 전일 15:00Z 가 되어 date cast 시 전일로 오저장된다.
 */
export function dateOnlyToUtc(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

/**
 * `@db.Date` read: Prisma 가 UTC 자정 instant(`...T00:00:00.000Z`)로 반환하므로
 * UTC 날짜 성분이 곧 달력 날짜다 (±9h 보정 불필요 — 보정 시 이중 시프트).
 */
export function dateOnlyToString(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * `@db.Date` 날짜 + "HH:mm"(KST 벽시계)을 KST 시각 instant 로 합성.
 * date 성분은 UTC 로 추출(자정이라 KST 날짜와 동일)하고 시각에 `+09:00` 를 부여한다.
 */
export function composeKstInstant(dateOnly: Date, hhmm: string): Date {
  return new Date(`${dateOnly.toISOString().slice(0, 10)}T${hhmm}:00+09:00`);
}

/**
 * `@db.Date` 경계 필터용 UTC 자정 [gte, lt) — 하루치 범위.
 */
export function utcDayRange(d: string): { gte: Date; lt: Date } {
  const gte = dateOnlyToUtc(d);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/**
 * 오늘(KST 달력)의 UTC 자정 instant. `@db.Date` 경계 계산의 기준점 —
 * `addUtcDays`/`setUTCMonth` 로 일·월을 가감해 주/월/기간 경계를 파생한다.
 */
export function kstTodayUtcMidnight(): Date {
  const { year, month, day } = nowKstParts();
  return new Date(`${year}-${month}-${day}T00:00:00Z`);
}

/**
 * 임의 instant 를 그 instant 의 KST 달력일 UTC 자정 으로 변환.
 * instant(@db.Timestamptz)를 `@db.Date` 컬럼에 대입할 때 UTC 날짜부를 취하면
 * KST 심야(00~09시) 건이 전일로 기록되므로, KST 벽시계 날짜를 취해 UTC 자정으로 고정한다.
 * getTime/toISOString 만 사용 — 서버 TZ 무관.
 */
export function instantToKstDateOnly(at: Date): Date {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return new Date(`${k.toISOString().slice(0, 10)}T00:00:00Z`);
}

/**
 * UTC 자정 instant 를 N일 가감한 새 Date (순수 함수, UTC 기준 — DST/TZ 무관).
 * `@db.Date` 경계 파생 전용.
 */
export function addUtcDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * 임의 instant 가 속한 KST 달력일의 '그 날 끝' exclusive 상한 instant (다음날 KST 자정).
 * "N월 N일까지" 같은 날짜 단위 마감 판정에 사용 — `now < 반환값` 이면 아직 그 날 안.
 * KST 날짜 D 의 끝 = D+1 00:00 KST = D 15:00 UTC (KST=UTC+9).
 */
export function kstDayEndExclusive(at: Date): Date {
  const dayUtcMidnight = instantToKstDateOnly(at);
  return new Date(dayUtcMidnight.getTime() + 15 * 60 * 60 * 1000);
}

/*
 * [2026-08-07] 게시 기간(A군 `@db.Timestamptz`) 변환 helper 는 **백엔드에 두지 않는다.**
 *   규약(`CLAUDE_STANDARDS.md` ⏰): 절대 시점은 UTC 로 주고받고, KST 벽시계 ↔ 절대시각
 *   변환은 **입력 화면**이 담당한다(웹 `notices-create`, 어드민 `notices` 각각 구현).
 *   백엔드가 date-only 를 받아 변환하려던 시도는 어드민 점검 공지의 분 단위 입력을
 *   깨뜨려 철회했다. 이 파일은 `@db.Date`(B군) 전용 유틸만 유지한다.
 */
