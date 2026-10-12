import { Prisma } from "@prisma/client";

/**
 * 결제 종류 분류기 — 환불 엔진(셀프 취소 가드·직접 환불 원장 스냅샷)과 환불 요청 생성이
 * 같은 판별을 쓴다. 결제 행에는 종류 컬럼이 없어 연결 테이블로 역추적한다:
 *   수강(Enrollment) → 선불 수강 / 월 청구 라인 → 후불 수강 / 대회 등록 → 대회 /
 *   픽업매치 신청 → 픽업매치 / 어디에도 없음 → UNKNOWN(쇼핑 등 미지원).
 *
 * 순수 함수 모듈 — PrismaService / Prisma.TransactionClient 모두 대입 가능.
 */

export type RefundSourceType =
  | "CLASS_PREPAID"
  | "CLASS_POSTPAID"
  | "TOURNAMENT"
  | "PICKUP_MATCH"
  | "UNKNOWN";

export interface PaymentScope {
  paymentId: string;
  sourceType: RefundSourceType;
  /** 선후불 — 대회는 Tournament.billingMode, 후불 수강은 POSTPAID. 판별 불가 null. */
  billingTiming: "PREPAID" | "POSTPAID" | null;
  classId: string | null;
  tournamentId: string | null;
  teamId: string | null;
  academyId: string | null;
  childId: string | null;
  /** 대회 개시 판정 입력 — TOURNAMENT 에서만 채운다. */
  tournament: { id: string; startDate: Date | null; status: string } | null;
}

export type PaymentScopeDb = Pick<
  Prisma.TransactionClient,
  | "enrollment"
  | "monthlyPostpaidBillingLine"
  | "tournamentRegistration"
  | "tournament"
  | "class"
  | "pickupMatchApplicant"
>;

export async function resolvePaymentScope(
  db: PaymentScopeDb,
  paymentId: string,
): Promise<PaymentScope> {
  const EMPTY: Omit<PaymentScope, "sourceType" | "billingTiming"> = {
    paymentId,
    classId: null,
    tournamentId: null,
    teamId: null,
    academyId: null,
    childId: null,
    tournament: null,
  };

  const enrollment = await db.enrollment.findFirst({
    where: { paymentId },
    select: { classId: true, childId: true },
  });
  if (enrollment) {
    const cls = await db.class.findUnique({
      where: { id: enrollment.classId },
      select: { teamId: true, academyId: true },
    });
    return {
      ...EMPTY,
      sourceType: "CLASS_PREPAID",
      billingTiming: "PREPAID",
      classId: enrollment.classId,
      teamId: cls?.teamId ?? null,
      academyId: cls?.academyId ?? null,
      childId: enrollment.childId,
    };
  }

  const line = await db.monthlyPostpaidBillingLine.findFirst({
    where: { paymentId },
    select: { userId: true, billing: { select: { classId: true } } },
  });
  if (line) {
    const cls = await db.class.findUnique({
      where: { id: line.billing.classId },
      select: { teamId: true, academyId: true },
    });
    return {
      ...EMPTY,
      sourceType: "CLASS_POSTPAID",
      billingTiming: "POSTPAID",
      classId: line.billing.classId,
      teamId: cls?.teamId ?? null,
      academyId: cls?.academyId ?? null,
      childId: line.userId,
    };
  }

  const reg = await db.tournamentRegistration.findFirst({
    where: { paymentId },
    select: { tournamentId: true, childId: true },
  });
  if (reg) {
    const tournament = await db.tournament.findUnique({
      where: { id: reg.tournamentId },
      select: { teamId: true, startDate: true, status: true, billingMode: true },
    });
    return {
      ...EMPTY,
      sourceType: "TOURNAMENT",
      billingTiming: tournament?.billingMode === "POSTPAID" ? "POSTPAID" : "PREPAID",
      tournamentId: reg.tournamentId,
      teamId: tournament?.teamId ?? null,
      childId: reg.childId,
      tournament: {
        id: reg.tournamentId,
        startDate: tournament?.startDate ?? null,
        status: tournament?.status ?? "scheduled",
      },
    };
  }

  // 픽업매치 참가비 — 관리 주체가 팀/아카데미가 아니라 주최자(PickupMatch.managerId)라
  //   스코프 스냅샷 컬럼이 없다. 승인 권한·알림 라우팅은 결제 → 신청 → 매치로 역참조한다.
  const applicant = await db.pickupMatchApplicant.findFirst({
    where: { paymentId },
    select: { id: true },
  });
  if (applicant) {
    return { ...EMPTY, sourceType: "PICKUP_MATCH", billingTiming: null };
  }

  return { ...EMPTY, sourceType: "UNKNOWN", billingTiming: null };
}
