import { Prisma } from "@prisma/client";
import { REFUND_REQUEST_ACTIVE_STATUSES } from "../refund-requests/refund-request.constants";

/**
 * 결제 승인 후처리의 등록 전이 — 결제 확인(토스·나이스 confirm)·mock 이 같은 규칙을 쓴다.
 *
 * 정책: 결제 기록은 항상 보존(호출 측이 이미 completed 로 확정)하되, 등록은 결제를 기다리던
 *   상태(수업 pending·approved / 대회 PENDING)일 때만 완료로 바꾼다. 그 사이 취소·만료됐거나
 *   후불 재활용으로 연결이 끊긴 등록은 되살리지 않는다. 전이된 등록이 하나도 없는 수업·대회
 *   결제는 "고아 결제"로 기록해 환불 요청을 자동 생성한다(승인제 환불 흐름으로 처리).
 */
export const PAYMENT_APPLICABLE_ENROLLMENT_STATUSES = ["pending", "approved"];

/** 대회 참가 등록에서 결제 완료를 기다리는 상태 — 취소(CANCELLED)는 되살리지 않는다. */
export const PAYMENT_APPLICABLE_TOURNAMENT_STATUSES = ["PENDING"];

export const ORPHAN_PAYMENT_REFUND_REASON =
  "결제 완료 전에 취소·만료된 수강신청입니다. 결제 금액 환불을 위해 자동 접수되었습니다.";

type Tx = Prisma.TransactionClient;

export type TransitionedEnrollment = {
  id: string;
  classId: string;
  childId: string;
};

export type PaymentEnrollmentTransitionResult = {
  /** paid 로 전이되고 명단이 활성화된 등록 */
  transitioned: TransitionedEnrollment[];
  /** 결제에 연결돼 있었지만 전이 조건에 맞지 않아 그대로 둔 등록(취소·만료 등) */
  stale: (TransitionedEnrollment & { status: string })[];
};

export type TransitionedTournamentRegistration = {
  id: string;
  tournamentId: string;
  childId: string | null;
};

export type PaymentTournamentTransitionResult = {
  /** PAID 로 전이된 참가 등록 */
  transitioned: TransitionedTournamentRegistration[];
  /** 결제에 연결돼 있었지만 전이 조건에 맞지 않아 그대로 둔 등록(취소 등) */
  stale: (TransitionedTournamentRegistration & { paymentStatus: string })[];
};

export async function applyPaymentToEnrollments(
  tx: Tx,
  paymentId: string,
  paidAt: Date,
): Promise<PaymentEnrollmentTransitionResult> {
  const linked = await tx.enrollment.findMany({
    where: { paymentId },
    select: { id: true, classId: true, childId: true, status: true },
  });
  const transitioned: TransitionedEnrollment[] = [];
  const stale: PaymentEnrollmentTransitionResult["stale"] = [];
  for (const e of linked) {
    const moved = await tx.enrollment.updateMany({
      where: {
        id: e.id,
        status: { in: PAYMENT_APPLICABLE_ENROLLMENT_STATUSES },
      },
      data: { status: "paid", paidAt },
    });
    if (moved.count !== 1) {
      // 전이 대상이 아닌 등록(취소·만료)은 그대로 두고 명단도 건드리지 않는다.
      //   좌석 선점이 잠금 안에서 등록 상태를 재확인한 뒤에만 명단을 올리므로 여기서
      //   되돌릴 잔여 좌석이 없고, 등록과 무관하게 배치된 좌석(감독 명단 관리·나이 범위
      //   자동 배치)을 결제 후처리가 해지하면 안 된다.
      stale.push(e);
      continue;
    }
    await tx.classRegistration.upsert({
      where: { classId_userId: { classId: e.classId, userId: e.childId } },
      update: { status: "active" },
      create: { classId: e.classId, userId: e.childId, status: "active" },
    });
    transitioned.push({ id: e.id, classId: e.classId, childId: e.childId });
  }
  return { transitioned, stale };
}

/**
 * 대회 참가 등록 전이 — 결제를 기다리던(PENDING) 등록만 PAID 로.
 *  취소(CANCELLED)된 등록은 되살리지 않는다. 수업 등록과 같은 규칙이며, 전이가 하나도
 *  없으면 호출부가 고아 결제로 처리해 환불 요청을 접수한다.
 */
export async function applyPaymentToTournamentRegistrations(
  tx: Tx,
  paymentId: string,
): Promise<PaymentTournamentTransitionResult> {
  const linked = await tx.tournamentRegistration.findMany({
    where: { paymentId },
    select: {
      id: true,
      tournamentId: true,
      childId: true,
      paymentStatus: true,
    },
  });
  const transitioned: TransitionedTournamentRegistration[] = [];
  const stale: PaymentTournamentTransitionResult["stale"] = [];
  for (const r of linked) {
    const moved = await tx.tournamentRegistration.updateMany({
      where: {
        id: r.id,
        paymentStatus: { in: PAYMENT_APPLICABLE_TOURNAMENT_STATUSES },
      },
      data: { paymentStatus: "PAID" },
    });
    if (moved.count !== 1) {
      stale.push(r);
      continue;
    }
    transitioned.push({
      id: r.id,
      tournamentId: r.tournamentId,
      childId: r.childId,
    });
  }
  return { transitioned, stale };
}

/**
 * 고아 결제 판정 — 돈은 나갔는데 연결된 등록이 하나도 완료로 전이되지 않은 결제.
 *
 * 대상: 선불 수업 상품 결제, 대회 참가 결제(수업 상품이 없어 관계로만 식별).
 * 제외: 후불 정산 결제(등록이 아니라 청구 라인에 연결), 상품·대회 어느 쪽에도
 *       연결되지 않은 결제(쇼핑 등 — 판단 근거가 없어 자동 접수하지 않는다).
 */
export function isOrphanPayment(input: {
  product:
    | { classId: string | null; billingTiming: string | null }
    | null
    | undefined;
  enrollments: PaymentEnrollmentTransitionResult;
  tournaments: PaymentTournamentTransitionResult;
  linkedBillingLines: number;
}): boolean {
  const { product, enrollments, tournaments, linkedBillingLines } = input;
  if (linkedBillingLines > 0) return false;
  if (enrollments.transitioned.length > 0) return false;
  if (tournaments.transitioned.length > 0) return false;
  const isPrepaidClassPayment =
    Boolean(product?.classId) && product?.billingTiming !== "POSTPAID";
  const isTournamentPayment =
    tournaments.stale.length > 0 || tournaments.transitioned.length > 0;
  return isPrepaidClassPayment || isTournamentPayment;
}

/**
 * 고아 결제로 자동 접수된 환불 요청인지 — 판단자료(사용현황) 계산이 "연결 등록 0건"을
 * fail-closed 로 막지 않도록 예외 처리할 대상을 식별한다. 사유 문장은 접수 시점에 이
 * 모듈이 단독으로 쓰는 상수라 요청 본문의 유일한 표식이다(별도 컬럼 없음).
 */
export function isOrphanAutoRefundRequest(rr: {
  requestReason?: string | null;
}): boolean {
  return rr.requestReason === ORPHAN_PAYMENT_REFUND_REASON;
}

/**
 * 고아 결제의 환불 요청 자동 접수 — 결제당 활성 요청 1건 제약이 있으므로 먼저 조회해 이미
 * 있으면 null 을 돌려준다(tx 안에서 unique 위반을 내면 트랜잭션이 abort 되므로 catch 로 대체 불가).
 *
 * 스코프 스냅샷(sourceType·classId·tournamentId·teamId·academyId)은 목록 필터·승인 재검증·
 * 알림 라우팅의 SoT라 학부모 직접 요청(refund-request.service resolveDomainScope)과 같은 형태로 남긴다.
 */
export async function recordOrphanPaymentRefundRequest(
  tx: Tx,
  input: {
    paymentId: string;
    payerUserId: string;
    amount: number;
    classId: string | null;
    tournamentId: string | null;
    childId: string | null;
  },
): Promise<string | null> {
  const existing = await tx.refundRequest.findFirst({
    where: {
      paymentId: input.paymentId,
      status: { in: REFUND_REQUEST_ACTIVE_STATUSES },
    },
    select: { id: true },
  });
  if (existing) return null;

  const scope = input.classId
    ? await resolveClassScope(tx, input.classId)
    : input.tournamentId
      ? await resolveTournamentScope(tx, input.tournamentId)
      : null;
  if (!scope) return null;

  const created = await tx.refundRequest.create({
    data: {
      paymentId: input.paymentId,
      requesterId: input.payerUserId,
      childId: input.childId,
      sourceType: scope.sourceType,
      classId: scope.classId,
      tournamentId: scope.tournamentId,
      teamId: scope.teamId,
      academyId: scope.academyId,
      status: "pending",
      requestReason: ORPHAN_PAYMENT_REFUND_REASON,
      requestedAmount: input.amount,
    },
    select: { id: true },
  });
  return created.id;
}

type OrphanScope = {
  sourceType: string;
  classId: string | null;
  tournamentId: string | null;
  teamId: string | null;
  academyId: string | null;
};

async function resolveClassScope(
  tx: Tx,
  classId: string,
): Promise<OrphanScope | null> {
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: { teamId: true, academyId: true },
  });
  return {
    sourceType: "CLASS_PREPAID",
    classId,
    tournamentId: null,
    teamId: cls?.teamId ?? null,
    academyId: cls?.academyId ?? null,
  };
}

async function resolveTournamentScope(
  tx: Tx,
  tournamentId: string,
): Promise<OrphanScope | null> {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: { teamId: true },
  });
  return {
    sourceType: "TOURNAMENT",
    classId: null,
    tournamentId,
    teamId: tournament?.teamId ?? null,
    academyId: null,
  };
}
