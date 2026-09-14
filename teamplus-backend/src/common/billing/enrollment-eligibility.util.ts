import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * [Phase 3] 그 달 수강 자격 판정 — 단일 SoT.
 * 설계: claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §1·§4-2.
 *
 * 자격 = billingMonth == 기준월 AND
 *   ( (billingTiming=PREPAID  AND status=paid)
 *  OR (billingTiming=POSTPAID AND status IN (approved, paid)) )
 *
 * 상품 join·날짜 폴백 없음 — billingTiming·billingMonth 는 신청 생성 시 확정된
 * 스냅샷(`enrollment-billing.util.ts` resolveEnrollmentBilling)이라 그대로 읽는다.
 *
 * ⚠️ `billingMonth` NULL 은 **비자격**이다(매치 안 됨). 중복 차단
 * (`paid-enrollment-guard.util.ts` hasActivePaidEnrollment)의 NULL 폴백과 방향이
 * 반대인데 의도적이다 — 중복 차단은 "결정 불능 행을 지나쳐 중복 결제가 통과하면
 * 안 된다"는 보수적 차단이고, 여기는 "결정 불능 행이 명단·출석에 새어 들어가면
 * 안 된다"는 보수적 배제다. 같은 백필 전 NULL 행이라도 질문이 반대라 기본값도 반대다.
 */
export interface EligibilityRow {
  status: string;
  billingTiming: string | null;
  billingMonth: Date | null;
}

export function isEligibleForMonth(row: EligibilityRow, month: Date): boolean {
  if (row.billingMonth == null) return false;
  if (row.billingMonth.getTime() !== month.getTime()) return false;
  if (row.billingTiming === "PREPAID") return row.status === "paid";
  if (row.billingTiming === "POSTPAID") {
    return row.status === "approved" || row.status === "paid";
  }
  return false;
}

/** 단일 기준월 자격 where — `enrollment.findMany/findFirst`에 그대로 합성. */
export function eligibleEnrollmentWhere(month: Date): Prisma.EnrollmentWhereInput {
  return {
    billingMonth: month,
    OR: [
      { billingTiming: "PREPAID", status: "paid" },
      { billingTiming: "POSTPAID", status: { in: ["approved", "paid"] } },
    ],
  };
}

/** 여러 후보월 중 하나라도 자격이면 매치(현재 달 ∪ 다음 달 등 판매 창 복수월 조회용). */
export function eligibleEnrollmentWhereAnyOf(
  months: Date[],
): Prisma.EnrollmentWhereInput {
  if (months.length === 0) {
    // 빈 후보 — 항상 불일치. billingMonth: { in: [] } 은 Prisma 에서 빈 결과를 내지만
    // 의도를 명시적으로 남긴다.
    return { id: "__no_match__" };
  }
  return {
    billingMonth: { in: months },
    OR: [
      { billingTiming: "PREPAID", status: "paid" },
      { billingTiming: "POSTPAID", status: { in: ["approved", "paid"] } },
    ],
  };
}

export async function hasEligibleEnrollment(
  db: Db,
  childId: string,
  classId: string,
  month: Date,
): Promise<boolean> {
  const row = await db.enrollment.findFirst({
    where: { childId, classId, ...eligibleEnrollmentWhere(month) },
    select: { id: true },
  });
  return row != null;
}

export async function eligibleChildIdsForMonth(
  db: Db,
  classId: string,
  month: Date,
): Promise<Set<string>> {
  const rows = await db.enrollment.findMany({
    where: { classId, ...eligibleEnrollmentWhere(month) },
    select: { childId: true },
  });
  return new Set(rows.map((r) => r.childId));
}

/** 여러 수업의 자격자 집합을 배치 1쿼리로 — 명단·정원 집계의 N+1 방지. */
export async function eligibleChildIdsForClasses(
  db: Db,
  classIds: string[],
  month: Date,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  for (const id of classIds) map.set(id, new Set());
  if (classIds.length === 0) return map;

  const rows = await db.enrollment.findMany({
    where: { classId: { in: classIds }, ...eligibleEnrollmentWhere(month) },
    select: { classId: true, childId: true },
  });
  for (const row of rows) {
    map.get(row.classId)?.add(row.childId);
  }
  return map;
}
