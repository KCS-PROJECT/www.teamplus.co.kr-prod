import { Prisma, PrismaClient } from "@prisma/client";
import { isEligibleForMonth } from "./enrollment-eligibility.util";
import { utcMonthStart } from "@/common/utils/class-lifecycle.util";
import { kstTodayUtcMidnight, addUtcMonths } from "@/common/utils/kst-date.util";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * 명단 유지 판정 — 취소·환불로 등록 하나가 끝날 때, 같은 자녀의 다른 등록 때문에
 * 수강 명단(ClassRegistration)을 살려둬야 하는지.
 *
 * 명단은 (수업, 자녀)당 1행이라 등록 하나가 끝났다는 이유로 해지하면 같은 자녀의 다른
 * 유효 등록까지 함께 끊긴다(만료 자녀의 갱신 신청을 취소하면 현 수강이 사라진다).
 * 반대로 존재만으로 유지하면, paid 가 환불 전까지 남는 영구 이력이라 지난 달 결제 때문에
 * 이번 달 결제를 환불한 뒤에도 명단이 살아남는다. 그래서 등록 유형별로 판정한다:
 *
 *   · 후불(POSTPAID)·결정 불능(billingTiming NULL) : approved | paid 면 장부 유지(월 무관).
 *     자격 판정(isEligibleForMonth)은 후불도 귀속월이 맞아야 하므로 여기와 기준이 다르다.
 *   · 스팟(spot)          : paid 면 유효 — 일정 1회·상품 1개라 월 귀속 개념이 없다.
 *   · 월 정기 선불(그 외) : 이번 달 또는 다음 달(§4-6 판매 창) 자격이면 유효.
 *
 * [Phase 3] 이전엔 `salesOpenMonth − 1개월` 근사로 "아직 만료 전"을 추정했으나, 자격이
 * 신청 파생(billingMonth·billingTiming)으로 통일되면서 근사가 필요 없어졌다 — 그 신청
 * 자체가 이번 달·다음 달에 자격이 있는지를 `isEligibleForMonth`로 바로 판정한다.
 * `enrollments.billing_timing`을 그대로 읽는다(product join 재파생 없음) — 결정 불능
 * (NULL) 행은 후불과 동일하게 보수적으로 유지한다(§ 원 주석 — 명단을 함부로 끊지 않음).
 *
 * 사용처: 수강신청 취소(enrollments.service)·환불 실행(payment-refund.service)의 명단 해지 직전.
 */
export async function hasOtherValidEnrollment(
  db: Db,
  input: {
    classId: string;
    childId: string;
    /**
     * 이번에 취소·환불되는 등록 — 판정에서 제외한다. 비어 있으면 제외 없이 모든 등록을
     * 후보로 본다(그 자체가 "지금 끝나는 등록이 없다"는 뜻이라 명단은 유지 쪽으로 기운다).
     */
    excludeEnrollmentIds: string[];
  },
  /** 기준 시각 — 기본 실제 오늘(KST). 다른 순수 함수(computeSalesWindow 등)와 동일하게
   *  테스트에서 결정론적으로 고정할 수 있도록 옵션으로 둔다. */
  today: Date = kstTodayUtcMidnight(),
): Promise<boolean> {
  const cls = await db.class.findUnique({
    where: { id: input.classId },
    select: { trainingType: true },
  });
  if (!cls) return false;

  const rows = await db.enrollment.findMany({
    where: {
      classId: input.classId,
      childId: input.childId,
      ...(input.excludeEnrollmentIds.length > 0
        ? { id: { notIn: input.excludeEnrollmentIds } }
        : {}),
      status: { in: ["paid", "approved"] },
    },
    select: {
      id: true,
      status: true,
      billingMonth: true,
      billingTiming: true,
    },
  });
  if (rows.length === 0) return false;

  const todayMonth = utcMonthStart(today);
  const nextMonth = addUtcMonths(todayMonth, 1);

  for (const row of rows) {
    // 후불·결정 불능(NULL)은 활성 상태면 장부를 유지한다. **자격 판정과 다르다** —
    //   isEligibleForMonth 는 후불도 귀속월이 정확히 맞아야 자격을 주므로, 지난 달
    //   후불 신청자는 자격이 없지만 여기서는 장부가 남는다. 질문이 다르기 때문이다.
    //   여기는 "ClassRegistration 을 비활성으로 내려도 되는가"이고, 명단·출석 표시는
    //   자격에서 파생하므로 장부가 남아도 지난 달 사람이 이번 달 명단에 보이지는 않는다.
    //   판매 시작(openClassSales)이 결정 불능 행을 해제 후보에서 건너뛰는 것과 방향이
    //   같다 — 확신이 없으면 장부를 지우지 않는 쪽이 보수적이다.
    if (row.billingTiming !== "PREPAID") return true;
    // 스팟은 일정 1회·비발급 상품 1개라 월 귀속으로 만료를 따지지 않는다.
    if (cls.trainingType === "spot") {
      if (row.status === "paid") return true;
      continue;
    }
    const asEligibilityRow = {
      status: row.status,
      billingTiming: "PREPAID" as const,
      billingMonth: row.billingMonth,
    };
    if (isEligibleForMonth(asEligibilityRow, todayMonth)) return true;
    if (isEligibleForMonth(asEligibilityRow, nextMonth)) return true;
  }
  return false;
}
