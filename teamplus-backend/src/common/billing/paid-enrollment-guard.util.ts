import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * 기존 paid Enrollment 가 "현재 수강 중"인지 — 재결제(갱신) 허용 판정.
 *
 * paid 는 환불 전까지 영구히 남는 결제 이력이라, 존재만으로 중복 차단하면
 * 만료(배치 해제·크레딧 소진) 자녀의 재결제(갱신)가 영영 막힌다. 차단은
 * "지금도 수강 중"일 때만 하고, 판정 기준은 표시 SoT(hasValidPass —
 * enrollments.service getMyEnrollments)·출석 API 게이트와 동일한 단일 공식:
 *
 *   수강 중 = ClassRegistration active AND (발급형 상품이면 유효 크레딧 보유)
 *
 * 비발급 상품(sessionsPerMonth=0)은 크레딧 미발급이 정상이라 크레딧 항을
 * 평가하지 않는다(등록만). 등록이 어느 상태로든 해제되면 상품 유형과 무관하게
 * 수강 중이 아니다 — 어느 한 축 단독 판정은 소진 재구매(등록 유지·크레딧 소진)
 * 또는 해제 복귀(등록 해제·크레딧 잔여) 중 한쪽을 막다른 상태로 만든다.
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

  const registration = await db.classRegistration.findUnique({
    where: { classId_userId: { classId, userId: childId } },
    select: { status: true },
  });
  if (registration?.status !== "active") return false;

  // 비발급 paid 가 하나라도 있으면 등록 active 만으로 수강 중.
  //   product 미연결 행은 발급형(크레딧 판정)으로 폴백 — 표시 판정과 동일 해석.
  const hasNonIssuing = paidRows.some((e) => e.product?.sessionsPerMonth === 0);
  if (hasNonIssuing) return true;

  const credits = await db.memberCredit.findMany({
    where: { userId: childId, classId, expiresAt: { gte: new Date() } },
    select: { totalSessions: true, usedSessions: true },
  });
  return credits.some((c) => c.usedSessions < c.totalSessions);
}
