import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * 기존 paid Enrollment 가 "현재 수강 중"인지 — 재결제(갱신) 허용 판정.
 *
 * paid 는 환불 전까지 영구히 남는 결제 이력이라, 존재만으로 중복 차단하면
 * 만료(배치 해제·크레딧 소진) 자녀의 재결제(갱신)가 영영 막힌다. 차단은
 * "지금도 수강 중"일 때만 하고, 판정 기준은 표시 SoT(hasValidPass —
 * enrollments.service getMyEnrollments)와 동일하게 유지한다:
 *   · 비발급 상품(sessionsPerMonth=0): ClassRegistration active 여부
 *   · 발급형(>0)·상품 미연결: 유효 크레딧(미만료·잔여>0) 보유 여부
 *
 * 사용처: 수강신청 생성(enrollments.service)·결제 생성(payment-create.service)의
 *   중복 검사. pending/pending_approval/approved 차단은 각 호출부가 기존대로 수행.
 */
export async function hasActivePaidEnrollment(
  db: Db,
  childId: string,
  classId: string,
): Promise<boolean> {
  const paidRows = await db.enrollment.findMany({
    where: { childId, classId, status: "paid" },
    select: { product: { select: { sessionsPerMonth: true } } },
  });
  if (paidRows.length === 0) return false;

  // 표시 판정과 동일한 상품 축 해석 — product 미연결은 발급형(크레딧 판정)으로 폴백.
  const hasNonIssuing = paidRows.some((e) => e.product?.sessionsPerMonth === 0);
  const hasIssuing = paidRows.some((e) => e.product?.sessionsPerMonth !== 0);

  if (hasNonIssuing) {
    const registration = await db.classRegistration.findUnique({
      where: { classId_userId: { classId, userId: childId } },
      select: { status: true },
    });
    if (registration?.status === "active") return true;
  }

  if (hasIssuing) {
    const credits = await db.memberCredit.findMany({
      where: { userId: childId, classId, expiresAt: { gte: new Date() } },
      select: { totalSessions: true, usedSessions: true },
    });
    if (credits.some((c) => c.usedSessions < c.totalSessions)) return true;
  }

  return false;
}
