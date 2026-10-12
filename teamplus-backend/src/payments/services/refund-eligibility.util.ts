import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  dateOnlyToString,
  instantToKstDateOnly,
  kstTodayUtcMidnight,
} from "@/common/utils/kst-date.util";
import {
  countPresentAttendanceSincePayment,
  findFirstScheduleDaySincePayment,
} from "@/common/utils/enrollment-usage.util";
import {
  isTournamentUsageStarted,
  resolveTournamentUsageStart,
} from "@/common/utils/tournament-usage.util";
import type { PaymentScope, RefundSourceType } from "./payment-scope.util";

/**
 * 취소·환불 조건 판정 SoT — 훈련(선불 수강)과 대회가 같은 함수로 "이용 개시"와
 * "본인 취소 가능 / 환불 요청 가능 / 환불 가능액"을 판정한다.
 *
 * 개시 = 결제 후 첫 이용일 당일 0시(KST). 훈련은 귀속월·결제일 이후 첫 미취소 회차 날짜,
 * 대회는 시작일(미정이면 취소·연기 제외 첫 경기일). 개시 전엔 본인이 전액 취소,
 * 개시 후엔 환불 요청(승인제)만. 후불 청구 결제는 본인 취소 항상 불가.
 *
 * 공제(개시 후 환불액)는 훈련만 출석 회수 × 회당 단가. 대회 공제는 환불 규정 제4조에
 * 대회 이용분 정의가 게시된 뒤 추가한다(현재 공제 없음·전액 산정).
 *
 * 순수 함수 모듈 — DB 클라이언트를 인자로 받아 트랜잭션 안에서도 같은 판정을 쓴다.
 */

export const USAGE_STARTED = "USAGE_STARTED";
export const SELF_CANCEL_NOT_ALLOWED = "SELF_CANCEL_NOT_ALLOWED";

export const SELF_CANCEL_TOURNAMENT_MESSAGE =
  "대회 참가비는 대회 화면에서 참가 취소해주세요(대회 전날까지). 대회 당일 이후에는 결제 내역에서 환불 요청을 이용해주세요.";
export const SELF_CANCEL_NOT_ALLOWED_MESSAGE =
  "이 결제는 앱에서 직접 취소할 수 없습니다. 결제 내역에서 환불 요청을 이용해주세요.";
export const SELF_CANCEL_ATTENDED_MESSAGE = (usedCount: number) =>
  `이미 ${usedCount}회 출석한 수업의 결제는 앱에서 직접 취소할 수 없습니다. 환불은 감독에게 문의해주세요.`;
export const SELF_CANCEL_CLASS_STARTED_MESSAGE =
  "수업 시작일부터는 앱에서 직접 취소할 수 없습니다. 결제 내역에서 환불 요청을 이용해주세요.";
export const SELF_CANCEL_TOURNAMENT_STARTED_MESSAGE =
  "대회 당일부터는 참가를 취소할 수 없습니다.";

/** 법정 청약철회 기간(전자상거래법 §17①) — 결제일 기준 7일. 이 기간 내 + 미개시면 전액. */
export const LEGAL_WITHDRAWAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RefundReasonCode =
  /** 이용 개시 당일 0시(KST) 경과 */
  | "USAGE_STARTED"
  /** 후불 청구 결제(수업 월 청구·후불 대회 정산) — 본인 취소 불가 */
  | "POSTPAID_BILLING"
  /** 셀프 취소 API 는 선불 수강만 — 대회는 대회 화면, 픽업매치는 주최자 */
  | "DOMAIN_CANCEL_ONLY"
  /** 어느 도메인에도 연결되지 않은 결제(쇼핑 등 미지원) */
  | "SOURCE_NOT_SUPPORTED"
  | "PAYMENT_NOT_COMPLETED"
  /** 0원 결제 — 돌려줄 금액 없음 */
  | "FREE_PAYMENT"
  /** 공제·기환불로 잔액 0 */
  | "NO_REFUNDABLE_BALANCE";

export type UsageEnrollment = {
  childId: string;
  classId: string;
  /** 선불 월분 귀속월(`@db.Date`) — 다음 달분 선결제의 사용분 하한. 무월 레거시 null. */
  billingMonth: Date | null;
};

export type UsageStartDb = Parameters<typeof countPresentAttendanceSincePayment>[0] &
  Parameters<typeof findFirstScheduleDaySincePayment>[0] &
  Parameters<typeof resolveTournamentUsageStart>[0] & {
    enrollment: {
      findMany(args: {
        where: Prisma.EnrollmentWhereInput;
        select: { childId: true; classId: true; billingMonth: true };
      }): Promise<UsageEnrollment[]>;
    };
    tournament: {
      findUnique(args: {
        where: { id: string };
        select: { startDate: true; status: true };
      }): Promise<{ startDate: Date | null; status: string } | null>;
    };
  };

export interface UsageStart {
  /** 개시 여부 — 첫 이용일(UTC 자정) ≤ 오늘(KST) 또는 출석 ≥1 또는 대회 상태 개시. */
  started: boolean;
  /** 첫 이용일(UTC 자정값). null = 이용일 미정(일정 없음). */
  usageStartDayUtc: Date | null;
  /** 사용분 하한 이후 present 출석 회수(선불 수강만, 그 외 0). */
  attendedCount: number;
  /** 사용분 계산에 쓴 수강 연결(선불 수강만). */
  enrollments: UsageEnrollment[];
}

/**
 * 사용분 하한 — 결제일(KST 달력일)과 귀속월 1일 중 늦은 쪽.
 * 10/25 에 11월분을 선결제하면 10월 회차·출석은 이 결제의 사용분이 아니다.
 */
export function usageLowerBound(
  paidDayUtc: Date,
  billingMonth: Date | null,
): Date {
  return billingMonth && billingMonth.getTime() > paidDayUtc.getTime()
    ? billingMonth
    : paidDayUtc;
}

/**
 * 이용 개시 판정 — 셀프 취소 가드와 환불 가능액 산정이 공유한다.
 * 잠금(Payment CAS) 직후 트랜잭션 안에서 재호출해 판정~선점 사이의 창을 닫는 용도로도 쓰며,
 * 그래서 수강 연결·대회 시작일/상태를 스냅샷이 아니라 db 에서 다시 읽는다.
 */
export async function resolveUsageStart(
  db: UsageStartDb,
  input: { scope: PaymentScope; paidDayUtc: Date; todayUtc?: Date },
): Promise<UsageStart> {
  const todayUtc = input.todayUtc ?? kstTodayUtcMidnight();
  const { scope, paidDayUtc } = input;

  if (scope.sourceType === "CLASS_PREPAID") {
    const enrollments = await db.enrollment.findMany({
      where: { paymentId: scope.paymentId },
      select: { childId: true, classId: true, billingMonth: true },
    });
    let attendedCount = 0;
    let firstDay: Date | null = null;
    const seen = new Set<string>();
    for (const e of enrollments) {
      const since = usageLowerBound(paidDayUtc, e.billingMonth);
      attendedCount += await countPresentAttendanceSincePayment(db, e, since);
      const key = `${e.classId}:${since.getTime()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = await findFirstScheduleDaySincePayment(db, e, since);
      if (day && (firstDay === null || day.getTime() < firstDay.getTime())) {
        firstDay = day;
      }
    }
    const started =
      attendedCount > 0 ||
      (firstDay !== null && firstDay.getTime() <= todayUtc.getTime());
    return { started, usageStartDayUtc: firstDay, attendedCount, enrollments };
  }

  if (scope.sourceType === "TOURNAMENT" && scope.tournament) {
    // 시작일·상태는 스냅샷이 아니라 다시 읽는다 — 선점 직후 재판정이 그 사이의 변경을 잡도록.
    const fresh = await db.tournament.findUnique({
      where: { id: scope.tournament.id },
      select: { startDate: true, status: true },
    });
    const usage = await resolveTournamentUsageStart(db, {
      id: scope.tournament.id,
      startDate: fresh ? fresh.startDate : scope.tournament.startDate,
      status: fresh?.status ?? scope.tournament.status,
    });
    return {
      started: isTournamentUsageStarted(usage, todayUtc),
      usageStartDayUtc: usage.usageStartDayUtc,
      attendedCount: 0,
      enrollments: [],
    };
  }

  return {
    started: false,
    usageStartDayUtc: null,
    attendedCount: 0,
    enrollments: [],
  };
}

/**
 * 결제 종류만으로 정해지는 셀프 취소 거절 사유 — `null` 이면 종류 가드 통과(개시 판정 필요).
 * `domainVerified` 는 결제 종류 가드만 면제한다(대회 참가취소 경로).
 */
export function resolveSelfCancelKindReason(
  scope: PaymentScope,
  domainVerified = false,
): RefundReasonCode | null {
  if (domainVerified) return null;
  if (scope.sourceType === "CLASS_POSTPAID") return "POSTPAID_BILLING";
  if (scope.sourceType === "TOURNAMENT") {
    return scope.billingTiming === "POSTPAID"
      ? "POSTPAID_BILLING"
      : "DOMAIN_CANCEL_ONLY";
  }
  if (scope.sourceType === "PICKUP_MATCH") return "DOMAIN_CANCEL_ONLY";
  if (scope.sourceType === "UNKNOWN") return "SOURCE_NOT_SUPPORTED";
  return null;
}

/** 셀프 취소 가능 여부 — `null` 이면 가능. 결제 완료 상태는 호출부가 먼저 확인한다. */
export function resolveSelfCancelReason(
  scope: PaymentScope,
  usage: Pick<UsageStart, "started">,
  domainVerified = false,
): RefundReasonCode | null {
  const kind = resolveSelfCancelKindReason(scope, domainVerified);
  if (kind) return kind;
  if (usage.started) return "USAGE_STARTED";
  return null;
}

/** 종류 거절 403 — Phase 0 의 errorCode·메시지 그대로, `details.reasonCode` 는 additive. */
function throwKindRejected(scope: PaymentScope, reason: RefundReasonCode): never {
  throw new ForbiddenException({
    errorCode: SELF_CANCEL_NOT_ALLOWED,
    message:
      // 후불 정산 대회 결제는 참가취소와 무관한 청구 결제 — 일반(환불 요청) 안내.
      scope.sourceType === "TOURNAMENT" && reason !== "POSTPAID_BILLING"
        ? SELF_CANCEL_TOURNAMENT_MESSAGE
        : SELF_CANCEL_NOT_ALLOWED_MESSAGE,
    details: { sourceType: scope.sourceType, reasonCode: reason },
  });
}

/**
 * 결제 종류 가드 — 개시 판정(DB 조회) 전에 먼저 거는 값싼 가드. 거절이면 403.
 */
export function assertSelfCancelKindAllowed(
  scope: PaymentScope,
  domainVerified = false,
): void {
  const reason = resolveSelfCancelKindReason(scope, domainVerified);
  if (reason) throwKindRejected(scope, reason);
}

/**
 * 셀프 취소 가드(종류 + 개시) — 거절 사유를 403 으로 던진다. 개시 거절은 기존 출석 가드
 * 문구를 잇고 `errorCode: USAGE_STARTED` 와 `details`(개시일·이용 회수)를 더한다.
 */
export function assertSelfCancelAllowed(
  scope: PaymentScope,
  usage: UsageStart,
  domainVerified = false,
): void {
  const reason = resolveSelfCancelReason(scope, usage, domainVerified);
  if (reason === null) return;
  if (reason !== "USAGE_STARTED") throwKindRejected(scope, reason);

  const message =
    scope.sourceType === "TOURNAMENT"
      ? SELF_CANCEL_TOURNAMENT_STARTED_MESSAGE
      : usage.attendedCount > 0
        ? SELF_CANCEL_ATTENDED_MESSAGE(usage.attendedCount)
        : SELF_CANCEL_CLASS_STARTED_MESSAGE;
  throw new ForbiddenException({
    errorCode: USAGE_STARTED,
    message,
    details: {
      sourceType: scope.sourceType,
      reasonCode: reason,
      usageStartDate: usage.usageStartDayUtc
        ? dateOnlyToString(usage.usageStartDayUtc)
        : null,
      usedUnits: usage.attendedCount,
    },
  });
}

export interface RefundEligibility {
  paymentId: string;
  sourceType: RefundSourceType;
  paidAt: Date;
  /** 첫 이용일 "YYYY-MM-DD"(KST 달력일). null = 미정. 시각 해석은 표시 화면 책임. */
  usageStartDate: string | null;
  started: boolean;
  /** 본인 전액 취소 가능(셀프 취소 API 기준 — 선불 수강·미개시). */
  selfCancelable: boolean;
  selfCancelReason: RefundReasonCode | null;
  /** 환불 요청(승인제) 접수 가능. 접수 기간 상한(365일)은 환불 요청 서비스가 따로 본다. */
  refundRequestable: boolean;
  refundRequestReason: RefundReasonCode | null;
  /** 결제 후 7일 이내. */
  withinLegalWithdrawal: boolean;
  /** 7일 이내 + 미개시 — 요청 생성 시 전액 규칙. */
  fullRefundEligible: boolean;
  deduction: {
    basis: "ATTENDANCE" | "NONE";
    usedUnits: number;
    unitFee: number;
    deductedAmount: number;
  };
  paidAmount: number;
  /** 기환불 누계(RefundLog 합산) — 중복 환불 방지용 */
  alreadyRefunded: number;
  /** 실제 환불 가능액 = max(0, 결제액 − 공제액 − 기환불액) */
  refundableAmount: number;
  // ── 호환 키(기존 RefundQuote) — 웹 refund-preview 가 읽는다. Phase 2 에서 deduction.* 로 이전 후 제거.
  attendedCount: number;
  unitFee: number;
  deductedAmount: number;
  /** 산식 스냅샷 — RefundLog.refundReason·응답에 병기 */
  calculationNote: string;
}

export type RefundEligibilityDb = UsageStartDb & {
  refundLog: {
    aggregate(args: {
      where: Prisma.RefundLogWhereInput;
      _sum: { refundAmount: true };
    }): Promise<{ _sum: { refundAmount: number | null } }>;
  };
  classProduct: {
    findFirst(args: {
      where: Prisma.ClassProductWhereInput;
      orderBy: { createdAt: "desc" };
      select: { price: true };
    }): Promise<{ price: number } | null>;
  };
};

/** 회당 단가 — PER_SESSION 상품가 우선, 없으면 결제액 ÷ 패키지 총 회차(내림), 둘 다 없으면 0(공제 없음). */
export async function resolveUnitFee(
  db: Pick<RefundEligibilityDb, "classProduct">,
  classId: string | null,
  sessionsPerPackage: number,
  paidAmount: number,
): Promise<number> {
  if (classId) {
    // 선불 수업에도 "1회 수업료"가 비판매(isActive:false) 참고용으로 보존된다.
    const perSession = await db.classProduct.findFirst({
      where: { classId, feeType: "PER_SESSION" },
      orderBy: { createdAt: "desc" },
      select: { price: true },
    });
    if (perSession && perSession.price > 0) return perSession.price;
  }
  if (sessionsPerPackage > 0) {
    return Math.floor(paidAmount / sessionsPerPackage);
  }
  return 0;
}

/**
 * 취소·환불 조건 종합 판정 (서버 단독 계산 — 클라이언트 값 신뢰 금지).
 *
 * 환불액 = 결제액 − (사용분 하한 이후 present 출석 회수 × 회당 단가) − 기환불 누계.
 * 공제액은 내림 처리해 소비자에게 불리하지 않게 한다. 단가를 산정할 수 없으면 공제 0.
 */
export async function evaluateRefundEligibility(
  db: RefundEligibilityDb,
  input: {
    payment: {
      id: string;
      amount: number | { toString(): string };
      paymentStatus: string;
      completedAt: Date | null;
      createdAt: Date;
    };
    scope: PaymentScope;
    /** 결제에 연결된 상품(단가 폴백용). 미전달 시 PER_SESSION 상품가만 본다. */
    product?: { classId: string | null; sessionsPerMonth: number } | null;
    now?: Date;
  },
): Promise<RefundEligibility> {
  const { payment, scope } = input;
  const now = input.now ?? new Date();
  const paidAt = payment.completedAt ?? payment.createdAt;
  const paidDayUtc = instantToKstDateOnly(paidAt);
  const paidAmount = Number(payment.amount);

  const usage = await resolveUsageStart(db, {
    scope,
    paidDayUtc,
    todayUtc: instantToKstDateOnly(now),
  });

  const refundedSum = await db.refundLog.aggregate({
    where: { paymentId: payment.id },
    _sum: { refundAmount: true },
  });
  const alreadyRefunded = refundedSum._sum.refundAmount ?? 0;

  const basis: RefundEligibility["deduction"]["basis"] =
    scope.sourceType === "CLASS_PREPAID" ? "ATTENDANCE" : "NONE";
  const unitFee =
    basis === "ATTENDANCE"
      ? await resolveUnitFee(
          db,
          input.product?.classId ?? usage.enrollments[0]?.classId ?? null,
          input.product?.sessionsPerMonth ?? 0,
          paidAmount,
        )
      : 0;
  const usedUnits = basis === "ATTENDANCE" ? usage.attendedCount : 0;
  const deductedAmount = Math.min(paidAmount, usedUnits * unitFee);
  const refundableAmount = Math.max(
    0,
    paidAmount - deductedAmount - alreadyRefunded,
  );

  const completed = payment.paymentStatus === "completed";
  const withinLegalWithdrawal =
    now.getTime() - paidAt.getTime() <= LEGAL_WITHDRAWAL_DAYS * DAY_MS;

  const selfCancelReason: RefundReasonCode | null = !completed
    ? "PAYMENT_NOT_COMPLETED"
    : resolveSelfCancelReason(scope, usage);

  const refundRequestReason: RefundReasonCode | null = !completed
    ? "PAYMENT_NOT_COMPLETED"
    : paidAmount <= 0
      ? "FREE_PAYMENT"
      : scope.sourceType === "UNKNOWN"
        ? "SOURCE_NOT_SUPPORTED"
        : refundableAmount <= 0
          ? "NO_REFUNDABLE_BALANCE"
          : null;

  return {
    paymentId: payment.id,
    sourceType: scope.sourceType,
    paidAt,
    usageStartDate: usage.usageStartDayUtc
      ? dateOnlyToString(usage.usageStartDayUtc)
      : null,
    started: usage.started,
    selfCancelable: selfCancelReason === null,
    selfCancelReason,
    refundRequestable: refundRequestReason === null,
    refundRequestReason,
    withinLegalWithdrawal,
    fullRefundEligible: withinLegalWithdrawal && !usage.started,
    deduction: { basis, usedUnits, unitFee, deductedAmount },
    paidAmount,
    alreadyRefunded,
    refundableAmount,
    attendedCount: usedUnits,
    unitFee,
    deductedAmount,
    calculationNote:
      `결제액 ${paidAmount}원 − 이용분 ${usedUnits}회 × ${unitFee}원(${deductedAmount}원)` +
      (alreadyRefunded > 0 ? ` − 기환불 ${alreadyRefunded}원` : "") +
      ` = ${refundableAmount}원`,
  };
}
