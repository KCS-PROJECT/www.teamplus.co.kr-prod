import { Prisma, PrismaClient } from "@prisma/client";
import {
  dbDateToKstYearMonth,
  resolvePrepaidAttribution,
  resolveRowBillingTiming,
} from "@/payments/settlement/attribution.util";

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
 *   · 후불(POSTPAID)      : approved | paid 면 유효 — 월 만료가 없는 구독형.
 *   · 스팟(spot)          : paid 면 유효 — 일정 1회·상품 1개라 월 귀속 개념이 없다.
 *   · 월 정기 선불(그 외) : 결제 귀속월이 현재 판매월의 직전 달 이상일 때만 유효.
 *
 * 마지막 항의 기준은 판매 시작의 미갱신 배치 해제(classes.service openClassSales)와 같다.
 * 직전 판매월을 저장하지 않으므로 salesOpenMonth 의 한 달 전으로 근사하며,
 * salesOpenMonth 가 없으면(판매 시작 전) 월 조건을 적용하지 않는다.
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
): Promise<boolean> {
  const cls = await db.class.findUnique({
    where: { id: input.classId },
    select: { billingMode: true, trainingType: true, salesOpenMonth: true },
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
      paidAt: true,
      product: {
        select: {
          billingTiming: true,
          feeType: true,
          billingMonth: true,
          price: true,
        },
      },
      payment: {
        select: {
          amount: true,
          paymentStatus: true,
          completedAt: true,
          createdAt: true,
          refundLogs: { select: { refundAmount: true } },
        },
      },
    },
  });
  if (rows.length === 0) return false;

  const minYearMonth =
    cls.salesOpenMonth != null
      ? previousYearMonth(dbDateToKstYearMonth(cls.salesOpenMonth))
      : null;

  for (const row of rows) {
    const timing = resolveRowBillingTiming(
      cls.billingMode,
      row.product?.billingTiming,
    );
    // 후불은 월 만료가 없다 — 활성 상태면 그대로 유효. 결제방식을 판정할 수 없는
    //   행(UNASSIGNED)도 명단을 함부로 끊지 않도록 유효로 본다. 판매 시작 해제
    //   (openClassSales)는 UNASSIGNED 를 건너뛰어 방향이 반대인데, 그쪽은 "해제 대상 선정",
    //   여기는 "해지해도 되는가"라 보수적 기본값이 다르다. UNASSIGNED 는 상품 미연결
    //   BOTH 등록에서만 나오고 BOTH 수업은 전량 전환돼 현재 실사용 경로가 없다.
    if (timing !== "PREPAID") return true;
    // 스팟은 일정 1회·비발급 상품 1개라 월 귀속으로 만료를 따지지 않는다.
    if (cls.trainingType === "spot") {
      if (row.status === "paid") return true;
      continue;
    }
    const att = resolvePrepaidAttribution({
      billingTiming: "PREPAID",
      feeType: row.product?.feeType,
      billingMonth: row.product?.billingMonth,
      enrollmentStatus: row.status,
      enrollmentPaidAt: row.paidAt,
      productPrice: row.product?.price,
      payment: row.payment,
    });
    // 환불·취소된 결제는 PAID 로 판정되지 않아 자동 제외된다.
    if (att.billingStatus !== "PAID") continue;
    if (minYearMonth == null) return true;
    if (att.yearMonth != null && att.yearMonth >= minYearMonth) return true;
  }
  return false;
}

/** "YYYY-MM" 의 직전 달. */
function previousYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map((v) => Number(v));
  const prev =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return `${prev.year}-${String(prev.month).padStart(2, "0")}`;
}
