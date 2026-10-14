import { nowKstParts } from "@/common/utils/kst-date.util";

/** 나이스 지급 요청 마감 — 지급일 당일 오전 10:30(KST). nice-pay-date.util 과 같은 값. */
const CUTOFF_MINUTES = 10 * 60 + 30;
const MAX_DAYS_AHEAD = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, "0");

const toDateOnly = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** 그 달의 N일 — N 이 그 달 길이보다 크면 말일. UTC 자정 규약. */
function dayInMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/**
 * 앱 설정 "매월 N일"로 가장 가까운 지급 가능일을 고른다(KST 달력일, `YYYY-MM-DD`).
 *   - 이번 달 N일이 아직 요청 가능하면(오늘 이후, 오늘이면 10:30 전) 이번 달, 아니면 다음 달 N일
 *   - 주말이면 다음 평일. 그래서 오늘부터 31일을 넘기면 대신 앞 평일로 당긴다(나이스 요청 상한)
 *   - 공휴일은 판정하지 않는다 — 나이스가 1001 로 거절하면 운영자가 바꾼다
 */
export function computeDefaultPayDate(
  dayOfMonth: number,
  now: ReturnType<typeof nowKstParts> = nowKstParts(),
): string {
  const day = Math.min(31, Math.max(1, Math.trunc(dayOfMonth)));
  const year = Number(now.year);
  const monthIndex = Number(now.month) - 1;
  const today = new Date(Date.UTC(year, monthIndex, Number(now.day)));
  const beforeCutoff =
    Number(now.hour) * 60 + Number(now.minute) < CUTOFF_MINUTES;

  let candidate = dayInMonth(year, monthIndex, day);
  const isToday = candidate.getTime() === today.getTime();
  if (candidate.getTime() < today.getTime() || (isToday && !beforeCutoff)) {
    candidate = dayInMonth(year, monthIndex + 1, day);
  }

  const limit = today.getTime() + MAX_DAYS_AHEAD * DAY_MS;
  if (isWeekend(candidate)) {
    const forward = new Date(candidate);
    while (isWeekend(forward)) forward.setUTCDate(forward.getUTCDate() + 1);
    if (forward.getTime() <= limit) {
      candidate = forward;
    } else {
      const backward = new Date(candidate);
      while (isWeekend(backward))
        backward.setUTCDate(backward.getUTCDate() - 1);
      candidate = backward;
    }
  }
  return toDateOnly(candidate);
}
