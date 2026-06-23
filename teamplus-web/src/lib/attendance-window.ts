/**
 * 출석 시간 윈도우 (D-A · 2026-04-27 결정 · 종료=endTime 으로 확장)
 *
 * SoT: backend `@/common/utils/schedule-time.util` computeAttendanceWindow 와 동일 정책.
 * 윈도우: 수업 시작 시각 − 60min ~ 수업 종료시각(endTime).
 *   endTime 이 없거나 유효하지 않으면(자정 넘김·"00:00" placeholder 등) 시작 + 120min 폴백.
 *
 * 현재 시각은 기기 시계가 아니라 `@/lib/server-clock` 의 서버 보정 시각(getServerNowMs)을
 * 기본으로 사용한다. 헤더 미수신 환경은 클라이언트 시각으로 폴백하며, 이 경우에도 백엔드
 * validateTimeWindow 가 서버 시각으로 최종 차단하므로 부정 출석은 불가하다.
 *
 * 사용처:
 * - 학부모/학생 출석 버튼 노출 (ClassCalendarSection · SelectedDayClassList)
 * - 향후 출석 윈도우를 평가하는 모든 화면
 */

import { getServerNowMs } from './server-clock';

export const ATTENDANCE_WINDOW_BEFORE_MIN = 60;
export const ATTENDANCE_WINDOW_FALLBACK_AFTER_MIN = 120;
/** @deprecated endTime 종료 기준으로 전환됨. 폴백 상수는 FALLBACK_AFTER_MIN 사용. */
export const ATTENDANCE_WINDOW_AFTER_MIN = ATTENDANCE_WINDOW_FALLBACK_AFTER_MIN;

export type AttendanceWindowState = 'before' | 'open' | 'closed';

/** "HH:mm" 을 base 의 로컬 날짜와 합성한 epoch(ms). 형식 불량이면 null. */
function composeLocalTime(base: Date, hhmm?: string | null): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    h,
    m,
    0,
    0,
  ).getTime();
}

/**
 * 주어진 수업 시작/종료가 현재 출석 윈도우 안에 있는지 판정.
 *
 * `scheduledDate` 의미는 입력 경로에 따라 두 가지로 혼재한다:
 * - A 표준 (미니달력/dateSchedules): scheduledDate = 로컬 자정, 실제 시각은 `startTime`/`endTime` "HH:mm"
 * - B (단건/import): scheduledDate 에 실제 시각 포함, startTime/endTime null
 *
 * @param scheduledDateISO 수업 일정 ISO 문자열 (`ClassSchedule.scheduledDate`)
 * @param startTime "HH:mm" 시작 시각 (A 표준 일정), 없으면 scheduledDate 자체를 시작으로 사용
 * @param endTime "HH:mm" 종료 시각. 없거나 시작보다 빠르면(≤start) 시작+120min 폴백
 * @param nowMs 기준 현재 시각(ms). 미지정 시 서버 보정 시각(getServerNowMs)
 * @returns 'before' (시작 60분 전 도달 X) | 'open' (윈도우 안) | 'closed' (종료 경과)
 */
export function getAttendanceWindowState(
  scheduledDateISO: string,
  startTime?: string | null,
  endTime?: string | null,
  nowMs?: number,
): AttendanceWindowState {
  const now = nowMs ?? getServerNowMs();
  const base = new Date(scheduledDateISO);
  if (Number.isNaN(base.getTime())) return 'open';

  const startComposed = composeLocalTime(base, startTime);
  const start = startComposed ?? base.getTime();

  const endComposed = composeLocalTime(base, endTime);
  const upper =
    endComposed !== null && endComposed > start
      ? endComposed
      : start + ATTENDANCE_WINDOW_FALLBACK_AFTER_MIN * 60_000;

  const lower = start - ATTENDANCE_WINDOW_BEFORE_MIN * 60_000;
  if (now < lower) return 'before';
  if (now > upper) return 'closed';
  return 'open';
}
