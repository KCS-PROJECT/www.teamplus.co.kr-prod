import { composeKstInstant } from "./kst-date.util";

/**
 * 수업 일정 시각 해석 — "입력 그대로의 값" 단일 SoT.
 *
 * TEAMPLUS 시간 저장 정책:
 *  - `ClassSchedule.startTime/endTime` (text "HH:mm"): 입력 그대로 저장 — 타임존 변환 없음. (SoT)
 *  - `ClassDaySchedule.startTime/endTime` (text "HH:mm"): 요일별 기본 일정 — 회차 시각 부재 시 폴백.
 *  - `Class.startTime/endTime` (대표값): 표시·해석 소스로 사용 금지 — 요일별 상이 왜곡 +
 *    등록시각(new Date) 폴백 데이터 오염. (구 resolveScheduleTime/EndTime 은 이 이유로 삭제됨)
 *
 * 우선순위: ClassSchedule.startTime(text) > ClassDaySchedule[요일](text) > null
 */

// ─── 요일 기본 일정(ClassDaySchedule) 기반 해석 — 대표값(Class.startTime) 미사용 ───
//
// 대표값은 "가장 이른 요일 시각 하나"라 요일별 시간이 다른 수업에서 왜곡되고,
// new Date() 폴백 데이터가 섞여 신뢰할 수 없다. 회차 시각이 없으면 그 회차
// 날짜의 요일에 해당하는 ClassDaySchedule 시각으로 해석하는 것이 항상 정확하다.

/** ClassDaySchedule 최소 계약 — dayOfWeek "월"~"일" · "HH:mm" 텍스트. */
export interface DayScheduleTemplate {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

const KO_DAY_BY_UTC_DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 회차 날짜(@db.Date, UTC 자정 = KST 달력일)의 요일에 해당하는 템플릿 행 반환.
 * getUTCDay 사용 — 서버 TZ 무관하게 KST 달력 요일과 일치한다.
 */
export function dayTemplateForDate(
  scheduledDate: Date,
  templates?: DayScheduleTemplate[] | null,
): DayScheduleTemplate | null {
  if (!templates || templates.length === 0) return null;
  const kr = KO_DAY_BY_UTC_DOW[scheduledDate.getUTCDay()];
  return templates.find((t) => t.dayOfWeek === kr) ?? null;
}

/**
 * 시작 시각 해석 v2 — 회차 시각(text) > 그 요일의 기본 일정 시각 > null.
 * null 이면 호출부가 시간 표기를 생략한다 (대표값 폴백 없음).
 */
export function resolveScheduleTimeByTemplate(
  scheduleStartTime: string | null | undefined,
  scheduledDate: Date,
  templates?: DayScheduleTemplate[] | null,
): string | null {
  if (scheduleStartTime) return scheduleStartTime;
  return dayTemplateForDate(scheduledDate, templates)?.startTime ?? null;
}

/** 종료 시각 해석 v2 — `resolveScheduleTimeByTemplate` 의 endTime 버전. */
export function resolveScheduleEndTimeByTemplate(
  scheduleEndTime: string | null | undefined,
  scheduledDate: Date,
  templates?: DayScheduleTemplate[] | null,
): string | null {
  if (scheduleEndTime) return scheduleEndTime;
  return dayTemplateForDate(scheduledDate, templates)?.endTime ?? null;
}

/**
 * 출석 시간 윈도우 SoT — 백엔드 검증과 프론트 노출(`teamplus-web/src/lib/attendance-window.ts`)이
 * 동일 규칙을 공유한다. 윈도우: 시작 − 60min ~ 종료시각(endTime). endTime 이 없거나
 * 유효하지 않으면(자정 넘김·"00:00" placeholder 등) 시작 + 120min 으로 폴백한다.
 */
export const ATTENDANCE_WINDOW_BEFORE_MIN = 60;
export const ATTENDANCE_WINDOW_FALLBACK_AFTER_MIN = 120;

export type AttendanceWindowState = "before" | "open" | "closed";

export interface AttendanceWindow {
  state: AttendanceWindowState;
  openAtMs: number;
  closeAtMs: number;
  startMs: number;
}

/**
 * "HH:mm" 을 scheduledDate(@db.Date, UTC 자정) 의 KST 달력일과 합성한 epoch(ms). 형식 불량이면 null.
 * `composeKstInstant` 로 `+09:00` 벽시계 합성 — 로컬 생성자(서버 TZ 의존) 대신 TZ 무관.
 */
function composeScheduleTime(
  base: Date,
  hhmm: string | null | undefined,
): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return composeKstInstant(base, hhmm).getTime();
}

/**
 * 출석 윈도우 상태와 경계 시각을 계산한다.
 *
 * @param scheduledDate 일정 날짜 (ClassSchedule.scheduledDate)
 * @param startTime "HH:mm" 시작 시각 (A 표준 일정). 없으면 scheduledDate 자체를 시작으로 사용.
 * @param endTime "HH:mm" 종료 시각. 없거나 시작보다 빠르면(≤start) 시작+120min 폴백.
 * @param nowMs 기준 현재 시각 (백엔드: 서버 Date.now(), 프론트: 서버보정 시각)
 */
export function computeAttendanceWindow(
  scheduledDate: Date,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  nowMs: number,
): AttendanceWindow {
  const startComposed = composeScheduleTime(scheduledDate, startTime);
  // startTime 부재 시 scheduledDate(UTC 자정=KST 09:00) 자체를 쓰면 09h 시프트 →
  // KST 자정으로 고정(프론트 attendance-window.ts fallback 정책과 동일 SoT).
  const startMs = startComposed ?? composeKstInstant(scheduledDate, "00:00").getTime();

  const endComposed = composeScheduleTime(scheduledDate, endTime);
  const closeAtMs =
    endComposed !== null && endComposed > startMs
      ? endComposed
      : startMs + ATTENDANCE_WINDOW_FALLBACK_AFTER_MIN * 60_000;

  const openAtMs = startMs - ATTENDANCE_WINDOW_BEFORE_MIN * 60_000;

  let state: AttendanceWindowState = "open";
  if (nowMs < openAtMs) state = "before";
  else if (nowMs > closeAtMs) state = "closed";

  return { state, openAtMs, closeAtMs, startMs };
}
