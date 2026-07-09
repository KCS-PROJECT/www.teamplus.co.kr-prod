import { kstTodayUtcMidnight } from "./kst-date.util";

/**
 * [Lifecycle v4.1] 수업 수명주기 상태 파생 — 단일 SoT.
 * 설계: claudedocs/class-softdelete-lifecycle-design.md §7.2(유형 축)·§8.5(흐름)·§9.3(판매 승인).
 *
 * 상태는 DB 에 저장하지 않고 조회 시 파생한다 (입력: endedAt·salesOpenMonth 저장값 + 일정).
 *  - ON_SALE          : 판매 중 — 잔여 일정의 가장 이른 달 == 판매 승인 월(salesOpenMonth)
 *  - PENDING_SCHEDULE : 일정 등록 대기 — 판매·선수 등록 차단 대상 (§9.4)
 *  - ENDED            : 종료 — 명시 종료(endedAt) 또는 spot 자동 종료(파생)
 */
export type ClassLifecycleState = "ON_SALE" | "PENDING_SCHEDULE" | "ENDED";

export type PendingReason =
  /** 잔여 일정 자체가 없음 → CTA "일정 등록부터" */
  | "NO_SCHEDULE"
  /** 잔여 일정은 있으나 그 달이 아직 판매 승인되지 않음 → CTA "확인 후 판매 시작" */
  | "UNAPPROVED_MONTH";

export interface ClassLifecycleInput {
  endedAt: Date | null;
  /** 판매 승인 월 (@db.Date — 그 달 1일 UTC 자정) */
  salesOpenMonth: Date | null;
  /** regular | spot | lesson (classes 도메인) — spot 만 자동 종료 (§7.2) */
  trainingType?: string | null;
  /** 비취소 일정 전체 (정렬 무관 — 내부에서 판단) */
  schedules: Array<{ scheduledDate: Date }>;
}

export interface ClassLifecycleResult {
  state: ClassLifecycleState;
  pendingReason: PendingReason | null;
  /** 잔여 일정의 가장 이른 달 (그 달 1일 UTC 자정) — 판매 승인 사이클의 "다음 승인 대상 달" */
  earliestRemainingMonth: Date | null;
}

/** @db.Date(UTC 자정 = KST 달력일) Date → 그 달 1일 UTC 자정.
 *  수업 생성 시 첫 일정 달 자동 승인(salesOpenMonth 기록 — §9.3)에도 재사용. */
export function utcMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** 두 @db.Date 값의 "달" 일치 비교 (연·월 UTC 필드). */
function isSameUtcMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

export function deriveClassLifecycle(
  input: ClassLifecycleInput,
): ClassLifecycleResult {
  const today = kstTodayUtcMidnight();
  const remaining = input.schedules.filter((s) => s.scheduledDate >= today);
  const earliest =
    remaining.length > 0
      ? utcMonthStart(
          remaining.reduce((min, s) =>
            s.scheduledDate < min.scheduledDate ? s : min,
          ).scheduledDate,
        )
      : null;

  // 1) 명시 종료 최우선 — 재개([종료 취소])는 endedAt=null 롤백으로 이 분기를 벗어난다.
  if (input.endedAt) {
    return { state: "ENDED", pendingReason: null, earliestRemainingMonth: earliest };
  }

  // 2) spot(1회용): 마지막 일정 경과 = 수명 종료 (파생 자동 종료 — §7.2).
  //    일정이 아직 없으면 등록 대기, 잔여가 있으면 판매 승인 사이클 없이 판매 중 취급.
  if (input.trainingType === "spot") {
    if (remaining.length > 0) {
      return { state: "ON_SALE", pendingReason: null, earliestRemainingMonth: earliest };
    }
    return input.schedules.length > 0
      ? { state: "ENDED", pendingReason: null, earliestRemainingMonth: null }
      : {
          state: "PENDING_SCHEDULE",
          pendingReason: "NO_SCHEDULE",
          earliestRemainingMonth: null,
        };
  }

  // 3) regular/lesson — 판매 승인 사이클 (§9.3).
  if (!earliest) {
    return {
      state: "PENDING_SCHEDULE",
      pendingReason: "NO_SCHEDULE",
      earliestRemainingMonth: null,
    };
  }
  // 승인월 == 가장 이른 잔여 달일 때만 판매. NULL·상이(과거 달 일정 추가 포함)는
  // 전부 대기 — 가격 미확정 상태에서 자동 판매되지 않는 fail-safe (§9.1).
  if (input.salesOpenMonth && isSameUtcMonth(earliest, input.salesOpenMonth)) {
    return { state: "ON_SALE", pendingReason: null, earliestRemainingMonth: earliest };
  }
  return {
    state: "PENDING_SCHEDULE",
    pendingReason: "UNAPPROVED_MONTH",
    earliestRemainingMonth: earliest,
  };
}
