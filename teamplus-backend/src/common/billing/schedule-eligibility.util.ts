import { Prisma } from "@prisma/client";

/**
 * [Phase B] 일정/캘린더 노출 자격 — 학부모 화면 공통 SoT.
 *
 * 일정에 노출할 수업 = 선불(prepaid) **paid 결제** OR 후불(POSTPAID) **approved 수강 중** 자녀가 있는 수업.
 *   · 코치 자동배치(Enrollment 없음) 제외
 *   · 선불 미결제(approved · POSTPAID 아님) 제외 (paid 도 아니고 후불도 아님)
 *
 * 사용처: parent-dashboard / calendar / calendar-dashboard 서비스의 `class` where 절.
 *   ⚠️ class.where 에 이미 `OR`(예: 소속 ownerFilters)가 있으면 본 필터의 OR 와 충돌하므로
 *      `AND: [{ OR: ownerFilters }, scheduleEligibleClassFilter(...)]` 로 감싸 합성한다.
 */
export function scheduleEligibleClassFilter(
  childUserIds: string[],
): Prisma.ClassWhereInput {
  return {
    OR: [
      {
        enrollments: {
          some: { childId: { in: childUserIds }, status: "paid" },
        },
      },
      {
        billingMode: "POSTPAID",
        enrollments: {
          some: { childId: { in: childUserIds }, status: "approved" },
        },
      },
      // BOTH 수업에서 후불 상품(billingTiming=POSTPAID)을 선택한 approved 자녀.
      //   선불 paid 는 위 1번 branch 가 이미 커버하므로 후불(approved)만 추가.
      {
        billingMode: "BOTH",
        enrollments: {
          some: {
            childId: { in: childUserIds },
            status: "approved",
            product: { billingTiming: "POSTPAID" },
          },
        },
      },
    ],
  };
}

/** 일정 자녀 매핑에서 "결제/수강 중"으로 간주할 enrollment 상태. */
export const SCHEDULE_VISIBLE_ENROLLMENT_STATUSES = [
  "paid",
  "approved",
] as const;

/**
 * 일정 카드에 노출할 자녀 = ClassRegistration(active) ∩ enrollment(paid|approved).
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
 */
export function canCheckInForClass(
  billingMode: string | null | undefined,
  hasValidCredit: boolean,
  isStudentPostpaid = false,
): boolean {
  return billingMode === "POSTPAID" || isStudentPostpaid || hasValidCredit;
}
