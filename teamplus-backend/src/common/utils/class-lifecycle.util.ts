import {
  kstTodayUtcMidnight,
  addUtcMonths,
  dateOnlyToYearMonth,
} from "./kst-date.util";

/**
 * [Lifecycle v4.1 §9.3 · §4-6] 수업 수명주기 상태 파생 — 단일 SoT.
 * 설계: claudedocs/class-softdelete-lifecycle-design.md §7.2(유형 축)·§8.5(흐름)·§9.3(판매 승인)
 *       claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §4-6(판매 창 2개월).
 *
 * 상태는 DB 에 저장하지 않고 조회 시 파생한다 (입력: endedAt·salesOpenMonth 저장값 + 일정).
 *  - ON_SALE          : 운영 중(판매 가능 상태) — salesOpenMonth(판매 창 상한) ≥ 오늘 달
 *  - PENDING_SCHEDULE : 일정 등록 대기 — 판매·선수 등록 차단 대상 (§9.4)
 *  - ENDED            : 종료 — 명시 종료(endedAt) 또는 spot 자동 종료(파생)
 *
 * ON_SALE 은 "수업이 살아 있고 무언가 팔고 있다"는 유효 상태일 뿐, "어느 달분이 팔리는가"는
 * computeSellableMonths 가 별도로 판정한다(§4-6) — 두 판정을 하나의 `==` 비교로 섞으면
 * 다음 달 판매를 미리 연 수업이 이번 달 내내 "판매 대기"로 보이는 결함이 생긴다.
 */
export type ClassLifecycleState = "ON_SALE" | "PENDING_SCHEDULE" | "ENDED";

export type PendingReason =
  /** 잔여 일정 자체가 없음 → CTA "일정 등록부터" */
  | "NO_SCHEDULE"
  /** 잔여 일정은 있으나 판매 창이 열리지 않음(승인 없음·과거 달) → CTA "확인 후 판매 시작" */
  | "UNAPPROVED_MONTH";

export interface ClassLifecycleInput {
  endedAt: Date | null;
  /** 판매 창 상한 — 판매 개시된 가장 늦은 달 (@db.Date — 그 달 1일 UTC 자정) */
  salesOpenMonth: Date | null;
  /** regular | spot | lesson (classes 도메인) — spot 만 자동 종료 (§7.2) */
  trainingType?: string | null;
  /** 비취소 일정 전체 (정렬 무관 — 내부에서 판단) */
  schedules: Array<{ scheduledDate: Date }>;
  /** 비취소 일정 존재 여부(과거 포함) — schedules 를 미래분만 조회한 호출부가
   *  spot 자동 종료 판정(과거 일정 유무)을 잃지 않도록 전달. 미전달 시 schedules 로 판단. */
  hadAnySchedule?: boolean;
}

export interface ClassLifecycleResult {
  state: ClassLifecycleState;
  pendingReason: PendingReason | null;
  /** 잔여 일정의 가장 이른 달 (그 달 1일 UTC 자정) — §2 운영월(진행 중인 달) 산출용.
   *  판매 창 판정에는 더 이상 쓰이지 않는다(§4-6). */
  earliestRemainingMonth: Date | null;
}

/** @db.Date(UTC 자정 = KST 달력일) Date → 그 달 1일 UTC 자정.
 *  수업 생성 시 첫 일정 달 자동 승인(salesOpenMonth 기록 — §9.3)에도 재사용. */
export function utcMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * 조회 select 리터럴({ endedAt, salesOpenMonth, trainingType, schedules, hadAnySchedule })이
 * 소비처(getClasses·getClass·getClubClasses·getClassProducts·openClassSales 등)마다 반복되던 것을
 * 한 곳으로 묶는다 — row 에 다른 필드가 더 있어도(billingMode·products 등) 구조적 타이핑으로 통과.
 */
export function toLifecycleInput(
  row: {
    endedAt: Date | null;
    salesOpenMonth: Date | null;
    trainingType?: string | null;
  },
  schedules: Array<{ scheduledDate: Date }>,
  hadAnySchedule?: boolean,
): ClassLifecycleInput {
  return {
    endedAt: row.endedAt,
    salesOpenMonth: row.salesOpenMonth,
    trainingType: row.trainingType,
    schedules,
    hadAnySchedule,
  };
}

export function deriveClassLifecycle(
  input: ClassLifecycleInput,
  today: Date = kstTodayUtcMidnight(),
): ClassLifecycleResult {
  const todayMonth = utcMonthStart(today);
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
    return (input.hadAnySchedule ?? input.schedules.length > 0)
      ? { state: "ENDED", pendingReason: null, earliestRemainingMonth: null }
      : {
          state: "PENDING_SCHEDULE",
          pendingReason: "NO_SCHEDULE",
          earliestRemainingMonth: null,
        };
  }

  // 3) regular/lesson — 유효 상태(운영 중 여부)는 판매 창 상한(salesOpenMonth)이
  //    오늘 달 이상인지로만 판정한다(§4-6). "어느 달분이 팔리는가"는 별개(computeSellableMonths).
  if (!earliest) {
    return {
      state: "PENDING_SCHEDULE",
      pendingReason: "NO_SCHEDULE",
      earliestRemainingMonth: null,
    };
  }
  if (input.salesOpenMonth && input.salesOpenMonth.getTime() >= todayMonth.getTime()) {
    return { state: "ON_SALE", pendingReason: null, earliestRemainingMonth: earliest };
  }
  return {
    state: "PENDING_SCHEDULE",
    pendingReason: "UNAPPROVED_MONTH",
    earliestRemainingMonth: earliest,
  };
}

export interface SalesWindow {
  lifecycle: ClassLifecycleResult;
  /** [§4-6] 판매 중인 달 — 학부모 노출 상품의 월 집합(오름차순). */
  sellableMonths: Date[];
  /** [§4-6] 다음 판매 개시 대상월 — [판매 시작] 버튼이 열 다음 달. */
  nextSalesMonth: Date | null;
  /** sellableMonths 의 "YYYY-MM" 표현 — 응답 직렬화용. */
  sellableMonthKeys: string[];
  /** nextSalesMonth 의 "YYYY-MM" 표현 — 응답 직렬화용. */
  nextSalesMonthKey: string | null;
}

/**
 * [§4-6] 판매 창 산출 — lifecycle·판매 중인 달·다음 판매 개시 대상월을 오늘/잔여 일정
 * 한 벌에서 함께 계산한다. 소비처가 deriveClassLifecycle + computeSellableMonths +
 * computeNextSalesMonth 를 각각 불러 같은 schedules 배열을 3번 순회하던 중복을 없앤다.
 *
 * 두 산출 모두 입력 계약이 같다 — "잔여(오늘 이후, 취소 아님) 일정의 달 집합"만 후보가
 * 된다(과거 일정이 섞여 있어도 여기서 걸러진다). 이번 달 회차가 전부 지났고 다음 달
 * 회차만 남았으면 이번 달은 후보에서 자동 제외된다.
 */
export function computeSalesWindow(
  input: ClassLifecycleInput,
  today: Date = kstTodayUtcMidnight(),
): SalesWindow {
  const lifecycle = deriveClassLifecycle(input, today);
  const todayMonth = utcMonthStart(today);

  const remainingMonthKeys = new Set<number>();
  for (const s of input.schedules) {
    if (s.scheduledDate < today) continue;
    remainingMonthKeys.add(utcMonthStart(s.scheduledDate).getTime());
  }
  const remainingMonths = [...remainingMonthKeys]
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  // 판매 중인 달 — 유효 상태가 ON_SALE 이 아니면 빈 배열. spot 은 salesOpenMonth 상한
  //   없이 잔여 일정 달 전부(판매 승인 사이클이 없는 1회용 수업이라 상한 개념 자체가 없음).
  let sellableMonths: Date[] = [];
  if (lifecycle.state === "ON_SALE") {
    if (input.trainingType === "spot") {
      sellableMonths = remainingMonths;
    } else {
      const upper = input.salesOpenMonth as Date; // ON_SALE(regular/lesson) 은 salesOpenMonth != null 보장
      sellableMonths = remainingMonths.filter(
        (m) =>
          m.getTime() >= todayMonth.getTime() && m.getTime() <= upper.getTime(),
      );
    }
  }

  // 다음 판매 개시 대상월 — 하한 max(오늘 달, salesOpenMonth+1개월), 상한 오늘 달+1개월.
  //   spot 은 판매 승인 사이클이 없어 항상 null. lifecycle 상태와 무관하게 판정한다
  //   (아직 PENDING_SCHEDULE 인 수업의 "다음 열 달" 후보로도 쓰인다 — openClassSales).
  let nextSalesMonth: Date | null = null;
  if (input.trainingType !== "spot") {
    const lowerFromSalesOpen = input.salesOpenMonth
      ? addUtcMonths(input.salesOpenMonth, 1)
      : todayMonth;
    const lower =
      lowerFromSalesOpen.getTime() > todayMonth.getTime()
        ? lowerFromSalesOpen
        : todayMonth;
    const upper = addUtcMonths(todayMonth, 1);
    for (const m of remainingMonths) {
      if (m.getTime() >= lower.getTime() && m.getTime() <= upper.getTime()) {
        nextSalesMonth = m;
        break;
      }
    }
  }

  return {
    lifecycle,
    sellableMonths,
    nextSalesMonth,
    sellableMonthKeys: sellableMonths.map(dateOnlyToYearMonth),
    nextSalesMonthKey: nextSalesMonth ? dateOnlyToYearMonth(nextSalesMonth) : null,
  };
}

/** @deprecated computeSalesWindow(input).sellableMonths 사용 — 단일 값만 필요한 소비처용 얇은 래퍼. */
export function computeSellableMonths(input: ClassLifecycleInput): Date[] {
  return computeSalesWindow(input).sellableMonths;
}

/** @deprecated computeSalesWindow(input).nextSalesMonth 사용 — 단일 값만 필요한 소비처용 얇은 래퍼. */
export function computeNextSalesMonth(input: ClassLifecycleInput): Date | null {
  return computeSalesWindow(input).nextSalesMonth;
}
