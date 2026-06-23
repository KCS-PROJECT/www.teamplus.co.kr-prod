/**
 * 수업 일정 표시 시각 해석 — "입력 그대로의 값" 단일 SoT.
 *
 * TEAMPLUS 시간 저장 정책 (실측 2026-06-11):
 *  - `ClassSchedule.startTime/endTime` (text "HH:mm"): 입력 그대로 저장 — 타임존 변환 없음. (SoT)
 *  - `Class.startTime/endTime` (timestamp without time zone): 벽시계 시각을 KST 변환 없이
 *    naive 저장됨. Prisma 가 이 컬럼을 UTC 로 역직렬화하므로, 입력 시각과 일치시키려면
 *    반드시 getUTCHours/getUTCMinutes 로 추출해야 한다. (로컬 getHours 사용 시 +9 시프트)
 *
 * 우선순위: ClassSchedule.startTime(text) > Class.startTime(timestamp, UTC 추출) > null
 */
export function resolveScheduleTime(
  scheduleStartTime: string | null | undefined,
  classStartTime: Date | null | undefined,
): string | null {
  if (scheduleStartTime) return scheduleStartTime;
  if (classStartTime) {
    const h = String(classStartTime.getUTCHours()).padStart(2, "0");
    const m = String(classStartTime.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  return null;
}

/**
 * 종료 시각 해석 — `resolveScheduleTime` 의 endTime 버전.
 * 우선순위: ClassSchedule.endTime(text) > Class.endTime(timestamp, UTC 추출) > null
 */
export function resolveScheduleEndTime(
  scheduleEndTime: string | null | undefined,
  classEndTime: Date | null | undefined,
): string | null {
  if (scheduleEndTime) return scheduleEndTime;
  if (classEndTime) {
    const h = String(classEndTime.getUTCHours()).padStart(2, "0");
    const m = String(classEndTime.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  return null;
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

/** "HH:mm" 을 scheduledDate 의 로컬 날짜와 합성한 epoch(ms). 형식 불량이면 null. */
function composeLocalTime(
  base: Date,
  hhmm: string | null | undefined,
): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
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
  const startComposed = composeLocalTime(scheduledDate, startTime);
  const startMs = startComposed ?? scheduledDate.getTime();

  const endComposed = composeLocalTime(scheduledDate, endTime);
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
