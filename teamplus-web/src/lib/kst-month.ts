/**
 * KST(Asia/Seoul) 기준 월 유틸 — 정산 API 계약이 KST 월 경계를 기준으로 하므로,
 * 디바이스 로컬 타임존이 아닌 KST 로 현재월을 산출한다.
 *
 * 타 타임존 감독이 KST 월 경계(예: UTC 자정 이전이지만 KST 로는 다음 달)에서
 * 잘못된 월을 열거나 `nextMonthDisabled` 판정이 어긋나는 문제를 방지한다.
 */

/**
 * 주어진 시각(기본 현재)을 KST 기준 'YYYY-MM' 으로 반환.
 *
 * `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` 는
 * 'YYYY-MM-DD' 형태를 반환하므로 앞 7자리(연-월)를 취한다.
 */
export function kstYearMonth(date: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  // 'YYYY-MM-DD' → 'YYYY-MM'
  return ymd.slice(0, 7);
}
