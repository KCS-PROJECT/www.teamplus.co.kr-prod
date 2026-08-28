/**
 * PaymentRefundService — Phase B 이관 완료 (2026-04-30)
 *
 * 담당:
 *   cancelPayment   — KG 취소 호출 + $transaction: 크레딧 복원 + 환불 기록
 *   requestRefund   — cancelPayment 위임 (레거시 호환)
 *   getRefundLogs   — 환불 감사 이력 조회
 *
 * 의존성: Prisma · KgInicisGateway
 *
 * 순환 참조 규칙: Refund 는 다른 결제 도메인 서비스를 의존하지 않음.
 * (보상 트랜잭션이 필요해질 경우만 Webhook 단방향 의존 허용)
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { instantToKstDateOnly } from "@/common/utils/kst-date.util";
import {
  countPresentAttendanceSincePayment,
  hasElapsedScheduleSincePayment,
} from "@/common/utils/enrollment-usage.util";
import { KgInicisGateway, KgCancelAmbiguousError } from "../kg-inicis.gateway";
import {
  TossPaymentsGateway,
  TossCancelAmbiguousError,
} from "../toss-payments.gateway";
import {
  NicePaymentsGateway,
  NiceCancelAmbiguousError,
} from "../nice-payments.gateway";
import { ENROLLMENT_STATUS } from "@/common/enrollment/enrollment-status.constants";

/**
 * 잔여 회차 비례 환불 산정 결과 (설계 SoT: claudedocs/refund-policy-design-2026-07-09.md §3-1).
 *   환불액 = 결제액 − (개시 판정과 동일 기준의 present 출석 회수 × 회당 단가)
 */
export interface RefundQuote {
  paymentId: string;
  /** 결제 총액 */
  paidAmount: number;
  /** 기환불 누계(RefundLog 합산) — 중복 환불 방지용 */
  alreadyRefunded: number;
  /** 결제일 이후 present 출석 회수(사용분) */
  attendedCount: number;
  /** 회당 단가(원) */
  unitFee: number;
  /** 사용분 공제액 = attendedCount × unitFee */
  deductedAmount: number;
  /** 실제 환불 가능액 = max(0, 결제액 − 공제액 − 기환불액) */
  refundableAmount: number;
  /** 이용 개시 여부(출석 ≥ 1) */
  started: boolean;
  /** 산식 스냅샷 — RefundLog.refundReason·응답에 병기 */
  calculationNote: string;
}

/**
 * 환불/취소 요청자 컨텍스트.
 * - id/userType: HTTP 요청 사용자 (소유권 검증용)
 * - trusted: 상위 계층에서 이미 권한을 검증한 내부/시스템 호출(예: 픽업매치 호스트의
 *   매치 취소 → 참가자 일괄 환불)에서만 true. 외부에서 절대 주입 금지.
 */
export interface RefundRequester {
  id?: string;
  userType?: string;
  trusted?: boolean;
}

/**
 * 환불 실행 감사/승인제 연동 컨텍스트 (환불 승인제 — Phase 1).
 * - refundRequestId: 승인 실행 시 동일 트랜잭션에서 RefundRequest→executed 전이.
 * - actorId: 환불 실행 주체(승인 감독·ADMIN·trusted 시스템) — RefundLog.actorId 감사 기록.
 * - expectedVersion: RefundRequest fencing — 실행 확정 tx 에서 version 일치 요구(선점 잃으면 rollback).
 * - idempotencyKey: PG 멱등 키(토스 Idempotency-Key 헤더) — 재처리 시 이중 취소 방지.
 * - resumeProcessing: Payment 가 이미 `refund_processing`(이전 실행자 크래시) 인 상태에서 재개.
 *     초기 결제 단위 CAS(completed→refund_processing)를 건너뛰고 PG 멱등 재호출 후 tx.
 */
export interface RefundExecutionContext {
  refundRequestId?: string;
  actorId?: string;
  expectedVersion?: number;
  idempotencyKey?: string;
  resumeProcessing?: boolean;
  /**
   * 크레딧 처리 정책.
   *  - 'restore'(기본): 개시 전 취소 — 차감분을 되돌린다.
   *  - 'forfeit': 이용 개시 후 중도해지 — 잔여분을 금액으로 환급했으므로 회차는 소멸.
   *    복원하면 환급 + 회차 존치의 이중 혜택이 된다.
   */
  creditPolicy?: "restore" | "forfeit";
}

/**
 * 환불 실행 단계 식별 에러 — PG 성공 이후 DB 실패를 구분해 재처리를 안전하게 만든다.
 *
 * - stage='PG': PG 환불 응답 자체가 실패(무이체). 재처리 시 PG 재호출 안전.
 * - stage='DB_AFTER_PG': PG 환불은 성공했으나 이후 DB 트랜잭션이 실패(원장 미반영).
 *   재처리 시 **PG 재호출 금지** — DB 보상만 재적용해야 한다(pgRefundSucceededAt 보유).
 *
 * BadRequestException 을 확장해 기존 직접 호출부(ADMIN 취소·픽업 일괄)는 그대로 400 을
 * 응답받고, 승인제 실행 경로만 instanceof 로 stage 를 읽어 상태 전이한다.
 */
export class RefundExecutionError extends BadRequestException {
  readonly stage: "PG" | "DB_AFTER_PG";
  readonly code: string;
  readonly pgRefundSucceededAt: Date | null;

  constructor(
    stage: "PG" | "DB_AFTER_PG",
    code: string,
    message: string,
    pgRefundSucceededAt: Date | null = null,
  ) {
    super(message);
    this.stage = stage;
    this.code = code;
    this.pgRefundSucceededAt = pgRefundSucceededAt;
  }
}

/**
 * 결제 PG 판별 — 토스 / KG이니시스.
 *  실측 토스 paymentKey 예: `tnabl20260513231110JKCD9` (24자) — 단순히 't' + 영숫자 패턴.
 *  KG이니시스 TID 는 `StdpayCAR_INI...` / `StgpayKAR_INI...` 같이 'Std/Stg' prefix.
 *
 *  판별 우선순위:
 *   1) paymentMethod === 'toss'  → 신규 confirmTossPayment 가 명시적으로 'toss' 저장 (2026-05-14~)
 *   2) tid 가 KG TID 형태('Stdpay'/'Stgpay'/'Stxpay' 시작) → KG (false 반환)
 *   3) tid 가 't' 로 시작하고 영숫자만 + 길이 12~40 → 토스
 *   4) 기타 → KG (보수적 fallback)
 */
/**
 * 나이스 결제 판별 — 승인 시 applyApprovedPayment 가 paymentMethod/pgProvider 를 'nice' 로
 *  기록하므로 둘 중 하나만 맞아도 나이스로 본다(과거 행 대비 pgProvider 도 함께 확인).
 *  토스처럼 tid 패턴 추론에 기대지 않는다 — 나이스 tid 는 상점별 접두가 달라 패턴이 불안정하다.
 */
function isNicePayment(payment: {
  paymentMethod?: string | null;
  pgProvider?: string | null;
}): boolean {
  return (
    (payment.paymentMethod || "").toLowerCase() === "nice" ||
    (payment.pgProvider || "").toLowerCase() === "nice"
  );
}

function isTossPayment(payment: {
  paymentMethod?: string | null;
  tid?: string | null;
}): boolean {
  const m = (payment.paymentMethod || "").toLowerCase();
  if (m === "toss") return true;
  const tid = payment.tid || "";
  if (/^St[a-z]pay/i.test(tid)) return false; // KG 명시 패턴 우선 차단
  return /^t[A-Za-z0-9]{11,39}$/.test(tid);
}

@Injectable()
export class PaymentRefundService {
  private readonly logger = new Logger(PaymentRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kgInicisGateway: KgInicisGateway,
    private readonly tossPaymentsGateway: TossPaymentsGateway,
    private readonly nicePaymentsGateway: NicePaymentsGateway,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 환불 단일 진입점
    // 감독 승인 부분환불(refundByManager)의 소속 스코프 검증에만 쓰는 부수 의존.
    //   @Global 모듈이라 런타임에는 항상 주입되며, 미주입 시 관리자 외 요청은 fail-closed.
    @Optional()
    private readonly resourceAccess?: ResourceAccessService,
  ) {}

  /**
   * [환불 정책 1단계] 이용 개시 검증 — 개시된 결제는 셀프 취소 거절.
   *
   * 판정(둘 중 하나면 개시): 이 결제에 연결된 수강(Enrollment)별로,
   *   ① 결제일(KST 달력일) 이후 일정에 present 출석 ≥ 1, 또는
   *   ② 결제일 이후 취소되지 않은 일정이 이미 경과(어제 이전).
   * ②는 출석 입력이 일정보다 늦게 생기는 지연 창(코치 미입력·결석)에서 전액 셀프
   *   취소가 통과되는 구멍을 막는다. 결제일 이전 일정·출석(과거 재수강분)은 제외.
   * 수강 결제가 아닌 경우(쇼핑몰·대회·픽업매치 등 Enrollment 미연결)는 대상 아님.
   * 개시 후 환불은 환불 요청(승인제)·감독 부분환불 경로에서 처리한다.
   */
  private async assertEnrollmentNotUsed(paymentId: string, paidAt: Date) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { paymentId },
      select: { childId: true, classId: true },
    });
    if (enrollments.length === 0) return;

    // 결제 시점의 KST 달력일(UTC 자정) — scheduledDate(@db.Date) 비교 하한.
    const paidDayUtc = instantToKstDateOnly(paidAt);

    for (const e of enrollments) {
      const usedCount = await countPresentAttendanceSincePayment(
        this.prisma,
        e,
        paidDayUtc,
      );
      if (usedCount > 0) {
        throw new ForbiddenException(
          `이미 ${usedCount}회 출석한 수업의 결제는 앱에서 직접 취소할 수 없습니다. 환불은 감독에게 문의해주세요.`,
        );
      }
      if (await hasElapsedScheduleSincePayment(this.prisma, e, paidDayUtc)) {
        throw new ForbiddenException(
          "이미 수업이 진행된 결제는 앱에서 직접 취소할 수 없습니다. 결제 내역에서 환불 요청을 이용해주세요.",
        );
      }
    }
  }

  /**
   * [환불 정책 2단계] 잔여 회차 비례 환불 산정 (서버 단독 계산 — 클라이언트 값 신뢰 금지).
   *
   * 환불액 = 결제액 − (결제일 이후 present 출석 회수 × 회당 단가) − 기환불 누계.
   * 회당 단가는 ① 해당 수업의 PER_SESSION 상품가, ② 결제액 ÷ 패키지 총 회차 순으로 정한다.
   * 반올림은 공제액을 내림 처리해 소비자에게 불리하지 않게 한다(단가 폴백의 소수점 절사).
   * 단가를 산정할 수 없으면 공제 0 — 사업자 자료 미비를 소비자에게 전가하지 않는다.
   */
  async computeRefundQuote(paymentId: string): Promise<RefundQuote> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        completedAt: true,
        createdAt: true,
        product: {
          select: { classId: true, sessionsPerMonth: true },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }

    const paidAmount = Number(payment.amount);
    const paidDayUtc = instantToKstDateOnly(
      payment.completedAt ?? payment.createdAt,
    );

    const enrollments = await this.prisma.enrollment.findMany({
      where: { paymentId },
      select: { childId: true, classId: true },
    });
    let attendedCount = 0;
    for (const e of enrollments) {
      attendedCount += await countPresentAttendanceSincePayment(
        this.prisma,
        e,
        paidDayUtc,
      );
    }

    const refundedSum = await this.prisma.refundLog.aggregate({
      where: { paymentId },
      _sum: { refundAmount: true },
    });
    const alreadyRefunded = refundedSum._sum.refundAmount ?? 0;

    const unitFee = await this.resolveUnitFee(
      payment.product?.classId ?? enrollments[0]?.classId ?? null,
      payment.product?.sessionsPerMonth ?? 0,
      paidAmount,
    );
    const deductedAmount = Math.min(paidAmount, attendedCount * unitFee);
    const refundableAmount = Math.max(
      0,
      paidAmount - deductedAmount - alreadyRefunded,
    );

    return {
      paymentId,
      paidAmount,
      alreadyRefunded,
      attendedCount,
      unitFee,
      deductedAmount,
      refundableAmount,
      started: attendedCount > 0,
      calculationNote:
        `결제액 ${paidAmount}원 − 이용분 ${attendedCount}회 × ${unitFee}원(${deductedAmount}원)` +
        (alreadyRefunded > 0 ? ` − 기환불 ${alreadyRefunded}원` : "") +
        ` = ${refundableAmount}원`,
    };
  }

  /** 회당 단가 — PER_SESSION 상품가 우선, 없으면 결제액 ÷ 패키지 총 회차(내림). */
  private async resolveUnitFee(
    classId: string | null,
    sessionsPerPackage: number,
    paidAmount: number,
  ): Promise<number> {
    if (classId) {
      // 선불 수업에도 "1회 수업료"가 비판매(isActive:false) 참고용으로 보존된다.
      const perSession = await this.prisma.classProduct.findFirst({
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
   * [환불 정책 2단계] 감독/원장 승인 부분환불 — 이용 개시 후 잔여분 비례 환급.
   *
   * `POST /payments/:paymentId/cancel` 은 본인 결제(또는 ADMIN)만 대상이라 감독은
   * 소속 학생의 결제를 취소할 수 없다. 이 경로는 소속 스코프를 단언한 뒤
   * trusted 로 실행 엔진(cancelPayment)을 재사용한다.
   *
   * 금액은 서버 산정(computeRefundQuote)이 상한이며, 미지정 시 산정액 전액을 환불한다.
   */
  async refundByManager(
    paymentId: string,
    dto: {
      refundReason: string;
      refundAmount?: number;
      refundBankCode?: string;
      refundAccount?: string;
      refundAccountHolder?: string;
    },
    user: JwtUserPayload,
  ) {
    await this.assertManagerRefundScopeFor(paymentId, user);

    const quote = await this.computeRefundQuote(paymentId);
    const amount = dto.refundAmount ?? quote.refundableAmount;

    if (amount <= 0) {
      throw new BadRequestException(
        `환불 가능 잔액이 없습니다. (${quote.calculationNote})`,
      );
    }
    if (amount > quote.refundableAmount) {
      throw new BadRequestException(
        `환불액이 산정액을 초과할 수 없습니다. (${quote.calculationNote})`,
      );
    }

    const result = await this.cancelPayment(
      paymentId,
      `${dto.refundReason} [${quote.calculationNote}]`,
      amount,
      dto.refundBankCode,
      dto.refundAccount,
      dto.refundAccountHolder,
      { id: user.id, userType: user.userType, trusted: true },
      {
        actorId: user.id,
        // 개시 후 환불은 수강 종료 — 잔여 회차를 되돌리면 환급과 이중 혜택이 된다.
        creditPolicy: quote.started ? "forfeit" : "restore",
      },
    );

    return { ...result, quote };
  }

  /**
   * 감독 환불 소속 스코프 단언 — 결제가 속한 수업/대회/픽업매치의 관리자만 실행 가능.
   * 도메인이 판별되지 않는 결제(쇼핑 등)는 ADMIN 전용(fail-closed).
   */
  async assertManagerRefundScopeFor(
    paymentId: string,
    user: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(user.userType)) return;
    if (!this.resourceAccess) {
      throw new ForbiddenException("해당 결제를 환불할 권한이 없습니다.");
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { paymentId },
      select: { classId: true },
    });
    if (enrollment) {
      await this.resourceAccess.assertManageableClass(enrollment.classId, user);
      return;
    }

    const line = await this.prisma.monthlyPostpaidBillingLine.findFirst({
      where: { paymentId },
      select: { billing: { select: { classId: true } } },
    });
    if (line) {
      await this.resourceAccess.assertManageableClass(
        line.billing.classId,
        user,
      );
      return;
    }

    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { paymentId },
      select: { tournamentId: true },
    });
    if (reg) {
      await this.resourceAccess.assertManageableTournament(
        reg.tournamentId,
        user,
      );
      return;
    }

    // 픽업매치는 주최자(PickupMatch.managerId)가 관리 주체 — 팀/아카데미 스코프가 없다.
    const applicant = await this.prisma.pickupMatchApplicant.findFirst({
      where: { paymentId },
      select: { match: { select: { managerId: true } } },
    });
    if (applicant) {
      if (applicant.match.managerId === user.id) return;
      throw new ForbiddenException("해당 매치의 주최자만 환불할 수 있습니다.");
    }

    throw new ForbiddenException("해당 결제를 환불할 권한이 없습니다.");
  }

  /**
   * [Critical 1] 직접(admin/trusted) 환불 — Payment claim + 활성요청 정합화 + DIRECT 원장 생성을
   *   단일 tx-A 로 원자 처리. idempotencyKey 는 create 전에 생성해 원장과 함께 저장(사후 update 없음).
   *   어느 단계든 실패 → 전체 rollback(Payment completed 유지·고아 원장 없음). PG 는 tx-A 커밋 후 호출.
   */
  private async claimAndCreateDirectLedger(
    paymentId: string,
    paymentUserId: string,
    amount: number,
    reason: string,
    actorId?: string,
  ): Promise<RefundExecutionContext> {
    // 스코프 판별은 read-only 스냅샷(정합성 무관) — tx 밖에서 조회해 tx 를 짧게 유지.
    const scope = await this.detectDirectScope(paymentId);
    // 원장 id 를 create 전에 생성(idempotencyKey='rr:'+id 를 create data 에 포함 — 사후 update 제거).
    //   built-in randomUUID 사용(외부 의존 회피). id 는 String PK 라 형식 무관하게 유효.
    const ledgerId = `dr_${randomUUID()}`;
    const idempotencyKey = `rr:${ledgerId}`;

    const created = await this.prisma.$transaction(async (tx) => {
      // ① Payment claim CAS — count!==1 이면 선점 실패 → 전체 rollback.
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, paymentStatus: "completed" },
        data: { paymentStatus: "refund_processing" },
      });
      if (claim.count !== 1) {
        throw new RefundExecutionError(
          "PG",
          "PAYMENT_NOT_AVAILABLE",
          "이미 환불 처리 중이거나 완료된 결제입니다.",
        );
      }
      // ② 기존 활성 요청(pending·execution_failed·executing) → canceled 정합화(Major 2).
      const reconciled = await tx.refundRequest.updateMany({
        where: {
          paymentId,
          status: { in: ["pending", "execution_failed", "executing"] },
        },
        data: {
          status: "canceled",
          decidedBy: actorId ?? null,
          decidedAt: new Date(),
          decisionReason: "관리자 직접 환불로 종결",
          version: { increment: 1 },
        },
      });
      // ③ DIRECT/판별 원장 생성(id·idempotencyKey 포함) — executing.
      const rr = await tx.refundRequest.create({
        data: {
          id: ledgerId,
          paymentId,
          requesterId: actorId ?? paymentUserId,
          childId: scope.childId,
          // [Critical] 직접 실행 원장 origin 은 도메인 판별과 무관하게 'DIRECT' 고정(불변).
          //   판별된 도메인 정보는 스냅샷 필드(classId/tournamentId/teamId/academyId)에만 저장(감사·표시용).
          //   admin-only 정책(list 미노출·detail/reprocess ADMIN 전용)을 sourceType 으로 강제한다.
          sourceType: "DIRECT",
          classId: scope.classId,
          tournamentId: scope.tournamentId,
          teamId: scope.teamId,
          academyId: scope.academyId,
          status: "executing",
          requestReason: reason,
          requestedAmount: amount,
          idempotencyKey,
          decidedBy: actorId ?? null,
          decidedAt: new Date(),
          executionStartedAt: new Date(),
          // [Major 1] 최초 PG 시도 시각 — tx-A 내 원자 기록(직접 원장은 즉시 PG 시도 대상).
          pgFirstAttemptedAt: new Date(),
        },
        select: { id: true, version: true },
      });
      return {
        id: rr.id,
        version: rr.version,
        reconciledCount: reconciled.count,
      };
    });

    if (created.reconciledCount > 0) {
      this.logger.log(
        `직접 환불 — 활성 요청 ${created.reconciledCount}건 canceled 정합화: paymentId=${paymentId}`,
      );
    }
    return {
      refundRequestId: created.id,
      actorId,
      expectedVersion: created.version,
      idempotencyKey,
    };
  }

  /** 직접 환불 원장의 sourceType/스코프 판별(3종 → 실패 시 DIRECT). refund-request 와 독립. */
  private async detectDirectScope(paymentId: string): Promise<{
    sourceType: string;
    classId: string | null;
    tournamentId: string | null;
    teamId: string | null;
    academyId: string | null;
    childId: string | null;
  }> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { paymentId },
      select: { classId: true, childId: true },
    });
    if (enrollment) {
      const cls = await this.prisma.class.findUnique({
        where: { id: enrollment.classId },
        select: { teamId: true, academyId: true },
      });
      return {
        sourceType: "CLASS_PREPAID",
        classId: enrollment.classId,
        tournamentId: null,
        teamId: cls?.teamId ?? null,
        academyId: cls?.academyId ?? null,
        childId: enrollment.childId,
      };
    }
    const line = await this.prisma.monthlyPostpaidBillingLine.findFirst({
      where: { paymentId },
      select: { userId: true, billing: { select: { classId: true } } },
    });
    if (line) {
      const cls = await this.prisma.class.findUnique({
        where: { id: line.billing.classId },
        select: { teamId: true, academyId: true },
      });
      return {
        sourceType: "CLASS_POSTPAID",
        classId: line.billing.classId,
        tournamentId: null,
        teamId: cls?.teamId ?? null,
        academyId: cls?.academyId ?? null,
        childId: line.userId,
      };
    }
    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { paymentId },
      select: { tournamentId: true, childId: true },
    });
    if (reg) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: reg.tournamentId },
        select: { teamId: true },
      });
      return {
        sourceType: "TOURNAMENT",
        classId: null,
        tournamentId: reg.tournamentId,
        teamId: tournament?.teamId ?? null,
        academyId: null,
        childId: reg.childId,
      };
    }
    return {
      sourceType: "DIRECT",
      classId: null,
      tournamentId: null,
      teamId: null,
      academyId: null,
      childId: null,
    };
  }

  /** 시스템 원장 execution_failed 전이 (executing + version fencing). 직접 환불 실패 증거 영속. */
  private async markLedgerFailed(
    requestId: string,
    expectedVersion: number | undefined,
    err: RefundExecutionError,
  ): Promise<void> {
    const where: { id: string; status: string; version?: number } = {
      id: requestId,
      status: "executing",
    };
    if (expectedVersion !== undefined) where.version = expectedVersion;
    const upd = await this.prisma.refundRequest.updateMany({
      where,
      data: {
        status: "execution_failed",
        failureStage: err.stage,
        failureCode: err.code,
        failureReason: err.message,
        pgRefundSucceededAt: err.pgRefundSucceededAt,
        version: { increment: 1 },
      },
    });
    if (upd.count !== 1) {
      // [Major 2] 실패 증거 기록 실패 = 복구 증거 유실 — 경보(수동 확인 필요).
      this.logger.error(
        `[RECOVERY_NEEDED] 직접 환불 실패 증거 기록 실패 — requestId=${requestId}, stage=${err.stage}, code=${err.code}(증거 유실 감지).`,
      );
    }
  }

  /**
   * 결제 취소 (KG이니시스 취소 API 호출)
   *
   * 전액 또는 부분 취소를 처리합니다.
   * **트랜잭션 경계 보존 필수**: 환불 기록 + 결제 상태 변경 + 크레딧 복원은 단일 `$transaction`.
   */
  async cancelPayment(
    paymentId: string,
    cancelReason: string,
    cancelAmount?: number,
    refundBankCode?: string,
    refundAccount?: string,
    refundAccountHolder?: string,
    requester?: RefundRequester,
    refundContext?: RefundExecutionContext,
  ) {
    this.logger.log(
      `결제 취소 요청: paymentId=${paymentId}, 사유=${cancelReason}`,
    );

    // 결제 기록 조회
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }

    /** 소비자 본인의 셀프 취소(청약철회) — 관리자·trusted 내부 호출과 가드/금액 규칙이 다르다. */
    const isSelfService =
      !requester?.trusted && !isAdminRole(requester?.userType);

    // [2026-06-10 SECURITY] 소유권 검증 — 본인 결제만 취소/환불 가능.
    //   기존: 요청자 컨텍스트 없이 paymentId만으로 취소 → 임의 결제 환불·가상계좌 환불금 탈취 가능.
    //   예외: ADMIN/SYSTEM/OPER(isAdminRole) 또는 상위에서 권한 검증된 trusted 내부 호출.
    if (isSelfService) {
      if (!requester?.id || payment.userId !== requester.id) {
        this.logger.warn(
          `[SECURITY] 권한 없는 결제 취소 시도 차단: paymentId=${paymentId}, requesterId=${requester?.id ?? "none"}, ownerId=${payment.userId}`,
        );
        throw new ForbiddenException(
          "해당 결제를 취소/환불할 권한이 없습니다.",
        );
      }
    }

    // [환불 승인제 — 결제 단위 선점] 완료 상태 검증은 아래 Payment CAS(completed→refund_processing)로
    //   통합한다. resumeProcessing(이전 실행자 크래시로 이미 refund_processing) 재개는 CAS 스킵.
    if (
      !refundContext?.resumeProcessing &&
      payment.paymentStatus !== "completed"
    ) {
      // 조기 명확화(직접 호출부 UX) — CAS 로도 걸리지만 mock/enrollment 검증 전 빠른 400.
      throw new RefundExecutionError(
        "PG",
        "PAYMENT_NOT_AVAILABLE",
        "이미 환불 처리 중이거나 완료된 결제입니다.",
      );
    }

    // [환불 정책 1단계] 이용 개시(출석) 후 셀프 취소 차단.
    //   이 결제에 연결된 수강의 자녀가 결제일 이후 일정에 present 출석이 1회라도
    //   있으면 본인(학부모) 셀프 결제취소를 거절한다 — 환불은 감독/관리자 경로로만.
    //   ADMIN/SYSTEM/OPER·trusted 내부 호출은 통과 (관리자 환불·시스템 보상 경로).
    if (isSelfService) {
      await this.assertEnrollmentNotUsed(
        paymentId,
        payment.completedAt ?? payment.createdAt,
      );
    }

    if (!payment.tid) {
      throw new BadRequestException("결제 거래번호(TID)가 없습니다.");
    }

    // 취소 금액 설정 (기본값: 전액).
    //   셀프 취소는 이용 개시 전만 도달하므로 항상 전액 — 소비자가 임의 부분금액을
    //   지정해 스스로 손해 보는 요청을 만들 수 없게 한다(부분환불은 감독 승인 경로).
    const finalCancelAmount = isSelfService
      ? Number(payment.amount)
      : cancelAmount || Number(payment.amount);

    if (finalCancelAmount > Number(payment.amount)) {
      throw new BadRequestException(
        "취소 금액이 결제 금액을 초과할 수 없습니다.",
      );
    }

    // ── [A/Critical 1] 결제 단위 실행 선점 (단일 초크포인트) ──
    //   completed → refund_processing 로 원자적 전이한 실행자만 PG 를 호출한다.
    //   승인 E4 · admin cancel · trusted 픽업 · reprocess 전체재실행이 모두 이 경로를 지나므로
    //   동시 두 실행 중 정확히 1건만 PG 취소를 호출한다(이중 PG 취소 차단).
    let ctx: RefundExecutionContext | undefined = refundContext;
    let systemLedgerId: string | null = null;
    if (refundContext?.resumeProcessing) {
      // 재개(이미 refund_processing) — 선점 스킵, 멱등 PG 재호출.
    } else if (refundContext?.refundRequestId) {
      // 승인 경로 — 원장은 이미 존재. Payment claim CAS + 최초 PG 시도 시각(pgFirstAttemptedAt)
      //   set-if-null 을 **단일 $transaction** 으로 원자 기록한다([Major 1]). 최초시각 기록이 실패하면
      //   claim 도 함께 rollback → Payment completed 유지(중간 상태·raw 예외 잔존 금지).
      //   executionStartedAt 은 CAS 마다 갱신되어 "최초 PG 시도" 증거가 아니므로 별도 컬럼 사용.
      const rrId = refundContext.refundRequestId;
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.payment.updateMany({
          where: { id: paymentId, paymentStatus: "completed" },
          data: { paymentStatus: "refund_processing" },
        });
        if (claim.count === 0) {
          throw new RefundExecutionError(
            "PG",
            "PAYMENT_NOT_AVAILABLE",
            "이미 환불 처리 중이거나 완료된 결제입니다.",
          );
        }
        await tx.refundRequest.updateMany({
          where: { id: rrId, pgFirstAttemptedAt: null },
          data: { pgFirstAttemptedAt: new Date() },
        });
      });
    } else {
      // [Critical 1] 직접(admin/trusted) 환불 — claim + 활성요청 정합화 + DIRECT 원장 생성(+최초시각)을
      //   단일 tx-A 로 원자 처리(중간 실패 시 전체 rollback → Payment completed 유지). PG 는 tx-A 커밋 후.
      ctx = await this.claimAndCreateDirectLedger(
        paymentId,
        payment.userId,
        finalCancelAmount,
        cancelReason,
        refundContext?.actorId,
      );
      systemLedgerId = ctx.refundRequestId ?? null;
    }

    // PG 취소 성공 시점 스냅샷 — DB 트랜잭션 실패 시 DB_AFTER_PG(PG 재호출 금지) 구분용.
    let pgRefundSucceededAt: Date;
    try {
      // PG 분기: mock(DEV) / 토스 / KG이니시스
      if ((payment.paymentMethod || "").toLowerCase() === "mock") {
        // [DEV] mock 결제는 실제 PG 승인이 없으므로 PG 호출을 건너뛰고 DB 트랜잭션만 진행.
        this.logger.log(
          `mock 결제 취소 — PG 호출 생략: paymentId=${paymentId}`,
        );
      } else if (isNicePayment(payment)) {
        // [나이스] 토스와 두 가지가 결정적으로 다르다.
        //  1) 멱등 키가 없다 → 같은 키 재호출로 원 결과를 되받는 안전망이 없으므로,
        //     stale 재개(resumeProcessing)는 KG 와 동일하게 자동 재호출을 금지하고 격리한다.
        //  2) 부분취소는 **중복 orderId 로 재호출 불가**다 → 전액취소는 원 주문번호를 쓰되,
        //     부분취소는 환불요청 ID 로 매 호출 고유한 orderId 를 만들어 보낸다.
        if (refundContext?.resumeProcessing) {
          throw new RefundExecutionError(
            "PG",
            "NICE_UNCONFIRMED",
            "PG 결과 미확정 — 수동 확인이 필요합니다.",
          );
        }
        const isFullCancel = finalCancelAmount === Number(payment.amount);
        const cancelOrderId =
          isFullCancel || !ctx?.refundRequestId
            ? payment.orderNumber
            : `${payment.orderNumber}-R${ctx.refundRequestId}`;
        let niceRes: Awaited<ReturnType<NicePaymentsGateway["cancel"]>>;
        try {
          niceRes = await this.nicePaymentsGateway.cancel({
            tid: payment.tid,
            orderId: cancelOrderId,
            reason: cancelReason,
            cancelAmt: isFullCancel ? undefined : finalCancelAmount,
          });
        } catch (niceErr) {
          // transport 모호(취소 처리 여부 불명) → 격리(Payment 복원 금지).
          //   확정 실패(정상 수신 거절)는 아래 PG_CANCEL_ERROR 정규화 + 복원 경로로 전파.
          if (niceErr instanceof NiceCancelAmbiguousError) {
            throw new RefundExecutionError(
              "PG",
              "NICE_UNCONFIRMED",
              niceErr.message,
            );
          }
          throw niceErr;
        }
        const niceOk = ["cancelled", "partialCancelled"].includes(
          niceRes.status || "",
        );
        if (!niceOk) {
          this.logger.error(
            `나이스 결제 취소 응답 비정상: paymentId=${paymentId}, status=${niceRes.status}`,
          );
          throw new RefundExecutionError(
            "PG",
            "NICE_CANCEL_FAILED",
            "나이스 결제 취소에 실패했습니다.",
          );
        }
        this.logger.log(
          `나이스 결제 취소 성공: paymentId=${paymentId}, tid=${payment.tid.slice(0, 12)}***, cancelledTid=${niceRes.cancelledTid ?? "none"}`,
        );
      } else if (isTossPayment(payment)) {
        // 토스는 paymentKey(=Payment.tid) 와 reason 만 필요. cancelAmount 미지정 시 전액 취소.
        //   idempotencyKey 전달 → 재처리(resumeProcessing) 시 이중 취소 없이 원 결과 반환.
        // [멱등 payload 결정성] 같은 멱등키에는 항상 같은 body(reason·amount)가 가야 토스가 동일
        //   요청으로 보장한다(다르면 422). 승인 최초/재처리/resume 이 서로 다른 reason(memo 등)/amount 를
        //   만들지 않도록, 멱등키가 있으면 body 를 원장(requestedAmount) 기준 결정적 함수로 통일한다.
        //   (사람이 읽는 cancelReason 은 RefundLog/원장에만 기록 — PG body 와 분리.)
        let tossCancelReason = cancelReason;
        let tossCancelAmount: number | undefined =
          finalCancelAmount === Number(payment.amount)
            ? undefined
            : finalCancelAmount;
        if (ctx?.idempotencyKey && ctx?.refundRequestId) {
          const ledger = await this.prisma.refundRequest.findUnique({
            where: { id: ctx.refundRequestId },
            select: { requestedAmount: true, pgFirstAttemptedAt: true },
          });
          // [Critical 1 — 단일 안전 관문] resume(=결과 미확정 재개)에서는 토스 멱등 유효기간(14일)
          //   안 + 최초시각 존재일 때만 같은 키 재호출을 허용한다. 만료/미기록이면 PG 호출 0회로
          //   차단하고 TOSS_UNCONFIRMED 로 격리 → reconcile 로 전환. reprocess 진입부 가드를 우회한
          //   crash-resume(failureCode=null stale executing)도 이 관문에서 최종 방어된다.
          if (refundContext?.resumeProcessing) {
            const firstAt = ledger?.pgFirstAttemptedAt?.getTime();
            const TOSS_IDEMPOTENCY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
            const withinWindow =
              firstAt !== undefined &&
              Date.now() - firstAt <= TOSS_IDEMPOTENCY_WINDOW_MS;
            if (!withinWindow) {
              throw new RefundExecutionError(
                "PG",
                "TOSS_UNCONFIRMED",
                "토스 멱등 보장 기간 만료/미기록 — PG 재호출 없이 격리(reconcile 필요).",
              );
            }
          }
          const canonicalAmount = ledger?.requestedAmount ?? finalCancelAmount;
          tossCancelReason = `환불 처리 (${ctx.idempotencyKey})`;
          tossCancelAmount =
            canonicalAmount === Number(payment.amount)
              ? undefined
              : canonicalAmount;
        }
        let tossRes: Awaited<ReturnType<TossPaymentsGateway["cancel"]>>;
        try {
          tossRes = await this.tossPaymentsGateway.cancel({
            paymentKey: payment.tid,
            cancelReason: tossCancelReason,
            cancelAmount: tossCancelAmount,
            idempotencyKey: ctx?.idempotencyKey,
          });
        } catch (tossErr) {
          // [Critical] transport 모호·409 처리중·422 본문충돌 → 격리(Payment 복원 금지).
          //   TRANSPORT/PROCESSING → TOSS_UNCONFIRMED(같은 키 재시도 대상)
          //   CONFLICT(422) → TOSS_IDEMPOTENCY_CONFLICT(불변조건 위반 — 운영 확인/reconcile 대상)
          //   완결 실패(정상 수신 4xx 거절)는 BadRequestException 전파 → 아래 PG_CANCEL_ERROR 정규화 + 복원.
          if (tossErr instanceof TossCancelAmbiguousError) {
            throw new RefundExecutionError(
              "PG",
              tossErr.kind === "CONFLICT"
                ? "TOSS_IDEMPOTENCY_CONFLICT"
                : "TOSS_UNCONFIRMED",
              tossErr.message,
            );
          }
          throw tossErr;
        }
        const okStatus = ["CANCELED", "PARTIAL_CANCELED"].includes(
          (tossRes as { status?: string }).status || "",
        );
        if (!okStatus) {
          this.logger.error(
            `토스 결제 취소 응답 비정상: paymentId=${paymentId}, status=${(tossRes as { status?: string }).status}`,
          );
          throw new RefundExecutionError(
            "PG",
            "TOSS_CANCEL_FAILED",
            "토스 결제 취소에 실패했습니다.",
          );
        }
        this.logger.log(
          `토스 결제 취소 성공: paymentId=${paymentId}, paymentKey=${payment.tid.slice(0, 12)}***`,
        );
      } else {
        // [Major 1] KG 는 멱등 키·확정 조회 계약이 없어 stale 재개(resumeProcessing) 자동 재호출 금지.
        //   결과 미확정 상태로 격리(KG_UNCONFIRMED) — 운영 수동 확인 대상.
        if (refundContext?.resumeProcessing) {
          throw new RefundExecutionError(
            "PG",
            "KG_UNCONFIRMED",
            "PG 결과 미확정 — 수동 확인이 필요합니다.",
          );
        }
        let cancelResult: Awaited<ReturnType<KgInicisGateway["cancelPayment"]>>;
        try {
          cancelResult = await this.kgInicisGateway.cancelPayment({
            tid: payment.tid,
            cancelAmount: finalCancelAmount,
            cancelReason,
            totalAmount: Number(payment.amount),
            refundBankCode,
            refundAccount,
            refundAccountHolder,
          });
        } catch (kgErr) {
          // [Critical 2] transport 모호성(취소 처리 여부 불명) → KG_UNCONFIRMED 격리(Payment 복원 금지).
          if (kgErr instanceof KgCancelAmbiguousError) {
            throw new RefundExecutionError(
              "PG",
              "KG_UNCONFIRMED",
              kgErr.message,
            );
          }
          throw kgErr;
        }
        if (!cancelResult.success) {
          // 정상 수신된 명확한 거절 — completed 복원 대상(재환불 가능).
          this.logger.error(
            `결제 취소 실패: paymentId=${paymentId}, message=${cancelResult.message}`,
          );
          throw new RefundExecutionError(
            "PG",
            "KG_CANCEL_FAILED",
            cancelResult.message || "결제 취소에 실패했습니다.",
          );
        }
        this.logger.log(
          `KG이니시스 취소 성공: paymentId=${paymentId}, tid=${payment.tid}`,
        );
      }
      pgRefundSucceededAt = new Date();
    } catch (pgErr) {
      // PG 실패(stage PG) — 선점 과도 상태를 completed 로 복원(무이체 보장, 재환불 가능).
      //   복원 금지 예외: DB_AFTER_PG(이체 완료) · KG_UNCONFIRMED(취소 여부 불명 — 격리, 재호출 금지).
      // [상태매트릭스 감사] 게이트웨이가 던진 비-RefundExecutionError(토스 timeout/네트워크 오류,
      //   KG InternalServerError 등)도 PG 단계 실패로 정규화한다. 정규화하지 않으면 승인/직접 원장이
      //   'executing' 에 고아로 남아(실패 증거 없음·active index 점유) 재처리 불가 상태가 된다.
      //   이미 분류된 RefundExecutionError(DB_AFTER_PG·KG_UNCONFIRMED 등)는 원본 그대로 유지.
      const refundErr =
        pgErr instanceof RefundExecutionError
          ? pgErr
          : new RefundExecutionError(
              "PG",
              "PG_CANCEL_ERROR",
              pgErr instanceof Error ? pgErr.message : String(pgErr),
            );
      const isDbAfterPg = refundErr.stage === "DB_AFTER_PG";
      // PG 결과 불확실/불변조건 위반(공급자 무관) → Payment 복원 금지·격리.
      //   원장·idempotencyKey 를 보존해 해소(토스=같은 키 reprocess / KG·토스만료·CONFLICT=reconcile)로 이어간다.
      const isUnconfirmed =
        refundErr.code === "KG_UNCONFIRMED" ||
        refundErr.code === "TOSS_UNCONFIRMED" ||
        refundErr.code === "TOSS_IDEMPOTENCY_CONFLICT";
      if (!refundContext?.resumeProcessing && !isDbAfterPg && !isUnconfirmed) {
        const restore = await this.prisma.payment.updateMany({
          where: { id: paymentId, paymentStatus: "refund_processing" },
          data: { paymentStatus: "completed" },
        });
        if (restore.count !== 1) {
          // [Major 4] 복원 실패 = 금전 정합성 위험 — 경보 로그(수동 복구 필요).
          this.logger.error(
            `[RECOVERY_NEEDED] 결제 선점 복원 실패 — paymentId=${paymentId} 가 refund_processing 상태가 아님(수동 확인 필요).`,
          );
        }
      }
      // 직접 시스템 원장은 외부 caller 가 없으므로 여기서 execution_failed 전이(증거 영속).
      //   정규화된 refundErr 로 비-RefundExecutionError PG 실패도 원장에 증거를 남긴다.
      if (systemLedgerId) {
        await this.markLedgerFailed(
          systemLedgerId,
          ctx?.expectedVersion,
          refundErr,
        );
      }
      throw refundErr;
    }

    // 환불 기록 + 크레딧 복원 + 결제 상태 + 도메인 동기화 (원자적 트랜잭션)
    let result: { paymentStatus: string; refundLogId: string };
    try {
      result = await this.executeRefundTransaction(
        payment,
        finalCancelAmount,
        cancelReason,
        ctx,
      );
    } catch (txError) {
      // PG 는 성공했으나 DB 원장 반영 실패 — 재처리 시 PG 재호출 없이 DB 보상만.
      this.logger.error(
        `[DB_AFTER_PG] PG 취소 성공 후 DB 트랜잭션 실패: paymentId=${paymentId}, error=${
          txError instanceof Error ? txError.message : String(txError)
        }`,
      );
      const dbAfterPgErr = new RefundExecutionError(
        "DB_AFTER_PG",
        "DB_TX_FAILED",
        txError instanceof Error
          ? txError.message
          : "환불 원장 반영에 실패했습니다.",
        pgRefundSucceededAt,
      );
      // 직접 시스템 원장은 증거(failureStage/pgRefundSucceededAt)를 여기서 영속 → reprocess DB-only 복구.
      if (systemLedgerId) {
        await this.markLedgerFailed(
          systemLedgerId,
          ctx?.expectedVersion,
          dbAfterPgErr,
        );
      }
      throw dbAfterPgErr;
    }

    this.logger.log(
      `결제 취소 완료: paymentId=${paymentId}, status=${result.paymentStatus}`,
    );

    return {
      id: result.refundLogId,
      paymentId,
      refundAmount: finalCancelAmount,
      refundReason: cancelReason,
      paymentStatus: result.paymentStatus,
      processedAt: new Date(),
    };
  }

  /**
   * 환불 원장 반영 트랜잭션 (PG 취소 성공 이후 · DB 전용).
   *
   * RefundLog(actorId) + Payment→refunded + 크레딧 복원 + Enrollment/ClassRegistration +
   * 후불 BillingLine(refunded/partially_refunded, pending 롤백 금지) +
   * TournamentRegistration(REFUNDED+cancelledAt) + (refundRequestId 있으면 RefundRequest→executed)
   * 를 **단일 $transaction** 으로 커밋한다.
   *
   * 멱등: RefundRequest→executed 는 `status:'executing'` 가드 updateMany 라 재실행 안전.
   */
  private async executeRefundTransaction(
    payment: { id: string; amount: number },
    finalCancelAmount: number,
    cancelReason: string,
    refundContext?: RefundExecutionContext,
  ): Promise<{ paymentStatus: string; refundLogId: string }> {
    const paymentId = payment.id;
    const isFullRefund = finalCancelAmount === Number(payment.amount);
    const refundRatio = isFullRefund
      ? 1
      : finalCancelAmount / Number(payment.amount);

    return this.prisma.$transaction(async (tx) => {
      // 1. 환불 기록 생성 (actorId 감사 — 승인 감독/ADMIN/trusted 시스템)
      const refundLog = await tx.refundLog.create({
        data: {
          paymentId,
          refundAmount: finalCancelAmount,
          refundReason: cancelReason,
          actorId: refundContext?.actorId ?? null,
        },
      });

      // 2. 결제 상태 업데이트 — [A] 선점 CAS: refund_processing 를 점유한 실행자만 확정.
      //    count!==1 이면 다른 실행자가 이미 확정했거나 선점을 잃은 것 → 전체 rollback.
      const newStatus = isFullRefund ? "refunded" : "partially_refunded";
      const paymentUpd = await tx.payment.updateMany({
        where: { id: paymentId, paymentStatus: "refund_processing" },
        data: { paymentStatus: newStatus },
      });
      if (paymentUpd.count !== 1) {
        throw new Error(
          `PAYMENT_CAS_CONFLICT: paymentId=${paymentId} 가 refund_processing 상태가 아님(선점 상실).`,
        );
      }

      // 3. 크레딧 처리 (해당 결제로 발급된 크레딧이 있으면)
      const relatedCredits = await tx.memberCredit.findMany({
        where: { paymentId },
        select: { id: true, totalSessions: true },
      });

      const forfeit = refundContext?.creditPolicy === "forfeit";
      for (const credit of relatedCredits) {
        if (forfeit) {
          // 이용 개시 후 중도해지 — 잔여분은 금액으로 환급했으므로 회차 소멸.
          await this.creditDomain.forfeitRemaining(tx, {
            memberCreditId: credit.id,
            reason: `중도해지 환불 — 잔여 회차 회수 (${cancelReason})`,
            actorUserId: refundContext?.actorId,
          });
          continue;
        }
        // PR-B (v0.5): CreditDomainService.refundSessions 위임 (전액/부분 환불 통합)
        const restoredSessions = isFullRefund
          ? credit.totalSessions
          : Math.floor(credit.totalSessions * refundRatio);
        if (restoredSessions <= 0) continue;

        await this.creditDomain.refundSessions(tx, {
          memberCreditId: credit.id,
          sessionsToRestore: restoredSessions,
          isFullRefund,
          reason: isFullRefund
            ? `결제 취소 환불 — ${cancelReason}`
            : `부분 환불 (${Math.round(refundRatio * 100)}%) — ${cancelReason}`,
        });
      }
      if (relatedCredits.length > 0) {
        this.logger.log(
          `수업권 ${forfeit ? "회수" : "복원"}: paymentId=${paymentId}, 대상 수업권 ${relatedCredits.length}건`,
        );
      }

      // 4. Enrollment / ClassRegistration 동기화 — 전액 환불 또는 중도해지(회차 회수) 시
      //    수강이 종료되므로 캘린더·활성 수강생에서 제외한다.
      if (isFullRefund || forfeit) {
        const enrollments = await tx.enrollment.findMany({
          where: { paymentId },
          select: { id: true, classId: true, childId: true },
        });
        for (const e of enrollments) {
          await tx.enrollment.update({
            where: { id: e.id },
            data: { status: ENROLLMENT_STATUS.REFUNDED },
          });
          await tx.classRegistration.updateMany({
            where: { classId: e.classId, userId: e.childId, status: "active" },
            data: { status: "inactive" },
          });
        }
      }

      // 5. 후불 BillingLine 동기화 — pending 롤백 금지, refunded/partially_refunded 로만 전이.
      await tx.monthlyPostpaidBillingLine.updateMany({
        where: { paymentId },
        data: { paymentStatus: newStatus },
      });

      // 6. 대회 참가 등록 동기화 — 전액 환불 시 REFUNDED + cancelledAt.
      if (isFullRefund) {
        await tx.tournamentRegistration.updateMany({
          where: { paymentId },
          data: { paymentStatus: "REFUNDED", cancelledAt: new Date() },
        });

        // 픽업매치 신청 동기화 — 학부모 셀프 취소·감독 환불처럼 호출부가 직접
        //   applicant 를 갱신하지 않는 경로에서 결제만 refunded 로 남는 것을 막는다.
        //   (매치 일괄 취소 경로는 자체 갱신 후 진입하므로 멱등 재기록.)
        await tx.pickupMatchApplicant.updateMany({
          where: { paymentId },
          data: {
            paymentStatus: "refunded",
            refundedAt: new Date(),
            refundAmount: finalCancelAmount,
          },
        });
      }

      // 7. 승인제 연동 — RefundRequest→executed (동일 트랜잭션, executing + version fencing).
      //    [C-1/Major1] count!==1(선점 상실·상태 변화)이면 전체 rollback — 선점 잃은 실행자는
      //    원장/결제/크레딧 확정 불가.
      if (refundContext?.refundRequestId) {
        const fenceWhere: {
          id: string;
          status: string;
          version?: number;
        } = {
          id: refundContext.refundRequestId,
          status: "executing",
        };
        if (refundContext.expectedVersion !== undefined) {
          fenceWhere.version = refundContext.expectedVersion;
        }
        const rrUpd = await tx.refundRequest.updateMany({
          where: fenceWhere,
          data: {
            status: "executed",
            executedAt: new Date(),
            approvedAmount: finalCancelAmount,
          },
        });
        if (rrUpd.count !== 1) {
          throw new Error(
            `REFUND_REQUEST_FENCE_LOST: requestId=${refundContext.refundRequestId} 선점 상실 — 전체 rollback.`,
          );
        }
      }
      // 직접(admin/trusted) 환불의 활성 요청 정합화는 PG 호출 전 createDirectRefundLedger 에서
      //   수행하며, 이 트랜잭션은 항상 refundRequestId(승인 or 시스템 원장)를 통해 fence 된다.

      return { paymentStatus: newStatus, refundLogId: refundLog.id };
    });
  }

  /**
   * [환불 승인제 재처리 — DB_AFTER_PG 전용] PG 재호출 없이 DB 보상만 재적용한다.
   *
   * PG 환불은 이미 성공했으나 이후 DB 트랜잭션이 실패(원장 미반영)한 건의 재처리 경로.
   * cancelPayment 의 PG 분기를 건너뛰고 executeRefundTransaction 만 재실행한다.
   * 이미 refunded 로 반영된 결제는 멱등 처리(원장 이중 기록 방지).
   */
  async applyRefundDbOnly(
    paymentId: string,
    cancelReason: string,
    finalCancelAmount: number,
    refundContext?: RefundExecutionContext,
  ): Promise<{ paymentStatus: string; alreadyApplied: boolean }> {
    // [Major 3] 자기 증거·금액·fence 결과를 메서드 내부에서 강제(호출자 조건 의존 금지).
    if (!refundContext?.refundRequestId) {
      throw new BadRequestException(
        "DB 보상 재처리에는 대상 환불 요청이 필요합니다.",
      );
    }
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundContext.refundRequestId },
      select: {
        paymentId: true,
        status: true,
        failureStage: true,
        pgRefundSucceededAt: true,
        requestedAmount: true,
      },
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }
    // ① 자기 요청·PG 성공 증거 직접 검증.
    if (rr.paymentId !== paymentId) {
      throw new BadRequestException("결제-요청 대응이 일치하지 않습니다.");
    }
    if (rr.failureStage !== "DB_AFTER_PG" || !rr.pgRefundSucceededAt) {
      throw new BadRequestException(
        "PG 성공 증거(DB_AFTER_PG)가 없는 요청은 DB 보상 재처리할 수 없습니다.",
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, amount: true, paymentStatus: true },
    });
    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }
    // ② 금액 대조(요청 스냅샷 vs 인자, 결제금액 초과 금지).
    if (
      finalCancelAmount !== rr.requestedAmount ||
      finalCancelAmount > Number(payment.amount)
    ) {
      throw new BadRequestException(
        "재처리 금액이 요청/결제와 일치하지 않습니다.",
      );
    }

    const fenceWhere: { id: string; status: string; version?: number } = {
      id: refundContext.refundRequestId,
      status: "executing",
    };
    if (refundContext.expectedVersion !== undefined) {
      fenceWhere.version = refundContext.expectedVersion;
    }

    // 이미 원장 반영 완료 — 자기 요청 executed 전이(count=1) 확인 후에만 alreadyApplied.
    if (
      payment.paymentStatus === "refunded" ||
      payment.paymentStatus === "partially_refunded"
    ) {
      const upd = await this.prisma.refundRequest.updateMany({
        where: fenceWhere,
        data: {
          status: "executed",
          executedAt: new Date(),
          approvedAmount: finalCancelAmount,
        },
      });
      // ③④ fence 실패(count!==1) → 성공/알림 금지, 실패로 반환(선점 상실).
      if (upd.count !== 1) {
        throw new RefundExecutionError(
          "DB_AFTER_PG",
          "FENCE_LOST",
          "재처리 선점을 잃었습니다(다른 실행자 확정).",
          rr.pgRefundSucceededAt,
        );
      }
      this.logger.log(
        `[DB_AFTER_PG 재처리] 이미 환불 반영됨 — executed 멱등 확정: paymentId=${paymentId}`,
      );
      return { paymentStatus: payment.paymentStatus, alreadyApplied: true };
    }

    // refund_processing(자기 PG 성공·DB 미반영) → executeRefundTransaction 이 Payment CAS
    //   (refund_processing→refunded) + RefundRequest fence 로 확정. completed 면 CAS count 0 rollback.
    const result = await this.executeRefundTransaction(
      { id: payment.id, amount: payment.amount },
      finalCancelAmount,
      cancelReason,
      refundContext,
    );
    return { paymentStatus: result.paymentStatus, alreadyApplied: false };
  }

  /**
   * 환불 요청 (레거시 메서드 - cancelPayment 사용 권장)
   */
  async requestRefund(
    paymentId: string,
    refundReason: string,
    refundAmount?: number,
    requester?: RefundRequester,
    refundContext?: RefundExecutionContext,
  ) {
    return this.cancelPayment(
      paymentId,
      refundReason,
      refundAmount,
      undefined,
      undefined,
      undefined,
      requester,
      refundContext,
    );
  }

  /**
   * 환불 이력 조회
   */
  async getRefundLogs(paymentId: string, requester?: RefundRequester) {
    // [2026-06-10 SECURITY] 소유권 검증 — 본인 결제의 환불 이력만 조회 가능.
    if (!requester?.trusted && !isAdminRole(requester?.userType)) {
      const owner = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { userId: true },
      });
      if (!owner) {
        throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
      }
      if (!requester?.id || owner.userId !== requester.id) {
        throw new ForbiddenException(
          "해당 결제의 환불 이력을 조회할 권한이 없습니다.",
        );
      }
    }

    const refundLogs = await this.prisma.refundLog.findMany({
      where: { paymentId },
      orderBy: { processedAt: "desc" },
    });

    if (refundLogs.length === 0) {
      throw new NotFoundException("환불 기록이 없습니다.");
    }

    return refundLogs.map((log) => ({
      id: log.id,
      paymentId: log.paymentId,
      refundAmount: log.refundAmount,
      refundReason: log.refundReason,
      processedAt: log.processedAt,
    }));
  }
}
