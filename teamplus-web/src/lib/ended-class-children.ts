/**
 * 종료된 훈련 상세(학부모) — "수강한 자녀" 요약 집계.
 *
 * 포함 기준: 이 수업의 수강 이력(paid·completed, 후불 approved) 이 있거나 출석(present)이
 * 1회 이상인 자녀. 취소·환불만 남은 자녀는 출석이 없으면 제외한다. 선불 approved 는
 * 학부모 승인 후 결제하지 않은 신청이라 수강 이력으로 보지 않는다.
 * 과거 후불 등록 중 expired 로 바뀐 건은 수강 이력으로 잡히지 않아 출석으로 보완한다.
 */

export interface EndedEnrollmentInput {
  childId: string;
  status: string;
  /** "YYYY-MM" — 없으면 월 행에 기여하지 않는다. */
  billingMonth?: string | null;
  isPostpaid: boolean;
}

export interface EndedAttendanceInput {
  /** @db.Date ISO 문자열 — 앞 7자리가 달력 월이다. */
  scheduledDate: string;
  attendanceStatus: string;
}

export interface EndedChildSummary {
  childId: string;
  name: string;
  hasPrepaid: boolean;
  hasPostpaid: boolean;
  /** 출석 조회가 실패한 자녀 — 횟수를 0으로 단정하지 않는다. */
  attendanceUnavailable: boolean;
  months: Array<{ yearMonth: string; presentCount: number }>;
}

const SETTLED_STATUSES = new Set(["paid", "completed"]);

function isHistoryRow(e: EndedEnrollmentInput): boolean {
  return SETTLED_STATUSES.has(e.status) || (e.status === "approved" && e.isPostpaid);
}

export function buildEndedChildrenSummary(
  children: Array<{ id: string; name: string }>,
  enrollments: EndedEnrollmentInput[],
  /** 자녀 id → 출석 목록. 값이 null 이면 조회 실패. */
  attendanceByChild: Map<string, EndedAttendanceInput[] | null>,
): EndedChildSummary[] {
  const result: EndedChildSummary[] = [];
  for (const child of children) {
    const history = enrollments.filter(
      (e) => e.childId === child.id && isHistoryRow(e),
    );
    const attendance = attendanceByChild.get(child.id);
    const presentByMonth = new Map<string, number>();
    for (const a of attendance ?? []) {
      if (a.attendanceStatus !== "present") continue;
      const ym = a.scheduledDate.slice(0, 7);
      presentByMonth.set(ym, (presentByMonth.get(ym) ?? 0) + 1);
    }
    if (history.length === 0 && presentByMonth.size === 0) continue;

    const monthKeys = new Set(presentByMonth.keys());
    for (const e of history) if (e.billingMonth) monthKeys.add(e.billingMonth);

    result.push({
      childId: child.id,
      name: child.name,
      hasPrepaid: history.some((e) => !e.isPostpaid),
      hasPostpaid: history.some((e) => e.isPostpaid),
      attendanceUnavailable: attendance === null,
      months: Array.from(monthKeys)
        .sort()
        .map((yearMonth) => ({
          yearMonth,
          presentCount: presentByMonth.get(yearMonth) ?? 0,
        })),
    });
  }
  return result;
}
