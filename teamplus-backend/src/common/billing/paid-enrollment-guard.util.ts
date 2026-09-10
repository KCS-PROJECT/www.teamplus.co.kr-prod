import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * 같은 (자녀, 수업, 귀속월)에 유효 선불 결제가 이미 있는지 — 중복 결제 차단 판정
 * (설계: claudedocs/enrollment-monthly-eligibility-design-2026-09-09.md §1·§4-1).
 *
 * 자격은 §1 조건식대로 "그 달" 단위다 — 선불은 그 달 paid 존재가 곧 그 달 자격이므로
 * 등록(ClassRegistration) 상태·크레딧 잔여를 더 볼 필요가 없다. (자녀, 수업) 단위였던
 * 구 판정은 "8월 paid 가 있으면 9월도 영구 차단"이 되어 갱신(다음 달 재결제) 자체가
 * 막혔다 — 월을 인자로 받아 같은 달만 막고 다른 달은 통과시킨다.
 *
 * 사용처: 수강신청 생성(enrollments.service)·결제 생성(payment-create.service)의
 *   중복 검사. pending/pending_approval/approved 차단은 각 호출부가 기존대로
 *   (billingMonth 조건을 더해) 수행한다.
 *
 * billingTiming 필터를 두지 않는다 — 후불(POSTPAID) paid 도 같은 (자녀, 수업, 달) 재신청을
 * 막아야 하는 건 선불과 동일(§1 조건식)이고, timing 으로 좁히면 후불 중복이 새어나간다.
 * billingMonth 는 `OR: [{billingMonth}, {billingMonth: null}]`로 조회한다 — 백필 전
 * NULL 행은 어느 달 귀속인지 결정 불능이라, 정확한 매치만 보면 그 행을 지나쳐 중복
 * 결제가 통과한다. 결정 불능 행은 보수적으로 함께 차단한다.
 */
export async function hasActivePaidEnrollment(
  db: Db,
  childId: string,
  classId: string,
  billingMonth: Date,
): Promise<boolean> {
  const paid = await db.enrollment.findFirst({
    where: {
      childId,
      classId,
      status: "paid",
      OR: [{ billingMonth }, { billingMonth: null }],
    },
    select: { id: true },
  });
  return paid != null;
}
