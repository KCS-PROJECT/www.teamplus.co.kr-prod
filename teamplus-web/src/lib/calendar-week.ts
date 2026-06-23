/**
 * 주 시작 요일 SoT — 일요일 시작.
 * 월~일 시작으로 바꾸려면 이 파일의 헬퍼만 수정한다.
 */

/** 그리드 헤더 7칸 표시용 라벨 (일~토 순) */
export const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** JS getDay()(일=0…토=6) → 일요일 시작 열 인덱스(일=0…토=6) */
export const toWeekColumn = (jsDay: number): number => jsDay;

/** Date → 일요일 시작 열 인덱스 */
export const weekColumnOf = (d: Date): number => toWeekColumn(d.getDay());

/** 해당 월 1일이 들어갈 열(=그리드가 이전 달로 당겨야 할 칸 수). month 는 0-base. */
export const monthGridStartOffset = (year: number, month0: number): number =>
  weekColumnOf(new Date(year, month0, 1));

/** "이번주(일요일 시작)" 의 일요일 00:00 Date 반환 — 원본 불변 */
export const getWeekStart = (base: Date): Date => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - toWeekColumn(d.getDay()));
  return d;
};

/** 헤더 '열 인덱스' 기준 주말 판별 (일요일 시작 → 일=0, 토=6) */
export const colIsSaturday = (col: number): boolean => col === 6;
export const colIsSunday = (col: number): boolean => col === 0;
