import { Prisma } from "@prisma/client";
import { eligibleEnrollmentWhereAnyOf } from "./enrollment-eligibility.util";
import { utcMonthStart } from "@/common/utils/class-lifecycle.util";
import { addUtcMonths } from "@/common/utils/kst-date.util";

/**
 * [Phase 3] 일정/캘린더 노출 자격 — 학부모 화면 공통 SoT.
 *
 * 일정에 노출할 수업 = 대상월(months) 중 하나에 그 자녀의 자격 있는 신청
 * (billingMonth·billingTiming 직접 판독, `enrollment-eligibility.util.ts`)이 있는 수업.
 *   · 코치 자동배치(Enrollment 없음) 제외
 *   · 선불 미결제(approved)·타월 신청 제외
 *
 * 클래스 단위 where 절이라 개별 일정 날짜는 못 본다 — 호출부가 조회 범위(scheduledDate
 * 필터)에 걸치는 달 전부를 `months` 로 넘겨야 한다(`monthsInRange` 참고). 좁게 주면
 * (예: 이번 달만) 다음 달 신청만 있는 학생의 일정이 통째로 빠지고, 넓게 주면(그 범위
 * 밖 달 포함) 무관한 수업이 후보에 낀다 — 실제 자격 여부는 개별 일정에서
 * `scheduleVisibleChildIds`/`isEligibleForMonth`가 마저 좁힌다.
 *
 * 사용처: parent-dashboard / calendar / calendar-dashboard 서비스의 `class` where 절.
 *   ⚠️ class.where 에 이미 `OR`(예: 소속 ownerFilters)가 있으면 본 필터의 OR 와 충돌하므로
 *      `AND: [{ OR: ownerFilters }, scheduleEligibleClassFilter(...)]` 로 감싸 합성한다.
 */
export function scheduleEligibleClassFilter(
  childUserIds: string[],
  months: Date[],
): Prisma.ClassWhereInput {
  return {
    enrollments: {
      some: {
        childId: { in: childUserIds },
        ...eligibleEnrollmentWhereAnyOf(months),
      },
    },
  };
}

/**
 * [start, end) 구간(임의 Date, 시각 무관)이 걸치는 달의 1일 UTC 자정 목록 —
 * `scheduleEligibleClassFilter`에 넘길 `months` 산출용. end 는 exclusive.
 */
export function monthsInRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const endMonth = utcMonthStart(new Date(end.getTime() - 1));
  let cursor = utcMonthStart(start);
  while (cursor.getTime() <= endMonth.getTime()) {
    months.push(cursor);
    cursor = addUtcMonths(cursor, 1);
  }
  return months;
}

/** 일정 자녀 매핑에서 "결제/수강 중"으로 간주할 enrollment 상태. */
export const SCHEDULE_VISIBLE_ENROLLMENT_STATUSES = [
  "paid",
  "approved",
] as const;

/**
 * [Phase 3] 일정 카드에 노출할 자녀 = ClassRegistration(active) ∩ 그 일정 달의 자격자.
 *   `enrolledChildIds` 는 호출부가 **그 일정의 scheduledDate 가 속한 달** 기준으로
 *   미리 걸러 넘겨야 한다(`eligibleChildIdsForMonth`/`isEligibleForMonth` 활용) —
 *   이 함수 자체는 이미 좁혀진 두 id 집합을 교집합할 뿐 월 판정을 하지 않는다.
 *   선불 미결제(active 등록 없음)·코치 자동배치(enrollment 없음)는 자연 제외된다.
 */
export function scheduleVisibleChildIds(
  registrationUserIds: string[],
  enrolledChildIds: Iterable<string>,
  childUserIds: string[],
): string[] {
  const enrolled = new Set(enrolledChildIds);
  const allowed = new Set(childUserIds);
  return Array.from(
    new Set(
      registrationUserIds.filter((id) => allowed.has(id) && enrolled.has(id)),
    ),
  );
}

/**
 * 후불(POSTPAID) 수업은 수업권 없이 출석 가능 → 항상 true. 선불은 유효 수업권 보유 시 true.
 *
 * BOTH 수업은 학생별로 선·후불이 갈리므로 `isStudentPostpaid`(그 학생이 선택한
 * 상품의 billingTiming=POSTPAID 여부)을 전달한다. true 면 크레딧 없이도 출석 가능.
 * 전용 PREPAID/POSTPAID 동작은 기본값(false)으로 불변.
 *
 * `classRequiresCredit`: 수업에 발급형 상품(ISSUING_PRODUCT_WHERE)이 있는지 —
 * false 면 크레딧 미사용 수업이라 무조건 출석 가능. 출석 API 의
 * shouldSkipCreditFlow(attendance.service)와 동일 파생을 전달해야 버튼과 API 가 일치한다.
 */
export function canCheckInForClass(
  billingMode: string | null | undefined,
  hasValidCredit: boolean,
  isStudentPostpaid = false,
  classRequiresCredit = true,
): boolean {
  return (
    !classRequiresCredit ||
    billingMode === "POSTPAID" ||
    isStudentPostpaid ||
    hasValidCredit
  );
}
