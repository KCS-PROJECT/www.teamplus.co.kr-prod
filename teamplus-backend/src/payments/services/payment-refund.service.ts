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
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { KgInicisGateway } from "../kg-inicis.gateway";
import { TossPaymentsGateway } from "../toss-payments.gateway";

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
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 환불 단일 진입점
  ) {}

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

    // [2026-06-10 SECURITY] 소유권 검증 — 본인 결제만 취소/환불 가능.
    //   기존: 요청자 컨텍스트 없이 paymentId만으로 취소 → 임의 결제 환불·가상계좌 환불금 탈취 가능.
    //   예외: ADMIN/SYSTEM/OPER(isAdminRole) 또는 상위에서 권한 검증된 trusted 내부 호출.
    if (!requester?.trusted && !isAdminRole(requester?.userType)) {
      if (!requester?.id || payment.userId !== requester.id) {
        this.logger.warn(
          `[SECURITY] 권한 없는 결제 취소 시도 차단: paymentId=${paymentId}, requesterId=${requester?.id ?? "none"}, ownerId=${payment.userId}`,
        );
        throw new ForbiddenException("해당 결제를 취소/환불할 권한이 없습니다.");
      }
    }

    if (payment.paymentStatus !== "completed") {
      throw new BadRequestException("완료된 결제만 취소할 수 있습니다.");
    }

    if (!payment.tid) {
      throw new BadRequestException("결제 거래번호(TID)가 없습니다.");
    }

    // 취소 금액 설정 (기본값: 전액)
    const finalCancelAmount = cancelAmount || Number(payment.amount);

    if (finalCancelAmount > Number(payment.amount)) {
      throw new BadRequestException(
        "취소 금액이 결제 금액을 초과할 수 없습니다.",
      );
    }

    // PG 분기: 토스 / KG이니시스
    if (isTossPayment(payment)) {
      // 토스는 paymentKey(=Payment.tid) 와 reason 만 필요. cancelAmount 미지정 시 전액 취소.
      const isFullCancel = finalCancelAmount === Number(payment.amount);
      const tossRes = await this.tossPaymentsGateway.cancel({
        paymentKey: payment.tid,
        cancelReason,
        cancelAmount: isFullCancel ? undefined : finalCancelAmount,
      });
      // 응답의 status 가 'CANCELED' (전액) 또는 'PARTIAL_CANCELED' (부분) 이어야 정상.
      const okStatus = ["CANCELED", "PARTIAL_CANCELED"].includes(
        (tossRes as { status?: string }).status || "",
      );
      if (!okStatus) {
        this.logger.error(
          `토스 결제 취소 응답 비정상: paymentId=${paymentId}, status=${(tossRes as { status?: string }).status}`,
        );
        throw new BadRequestException("토스 결제 취소에 실패했습니다.");
      }
      this.logger.log(
        `토스 결제 취소 성공: paymentId=${paymentId}, paymentKey=${payment.tid.slice(0, 12)}***`,
      );
    } else {
      const cancelResult = await this.kgInicisGateway.cancelPayment({
        tid: payment.tid,
        cancelAmount: finalCancelAmount,
        cancelReason,
        totalAmount: Number(payment.amount),
        refundBankCode,
        refundAccount,
        refundAccountHolder,
      });
      if (!cancelResult.success) {
        this.logger.error(
          `결제 취소 실패: paymentId=${paymentId}, message=${cancelResult.message}`,
        );
        throw new BadRequestException(
          cancelResult.message || "결제 취소에 실패했습니다.",
        );
      }
      this.logger.log(
        `KG이니시스 취소 성공: paymentId=${paymentId}, tid=${payment.tid}`,
      );
    }

    // 환불 기록 + 크레딧 복원 + 결제 상태 업데이트 (원자적 트랜잭션)
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 환불 기록 생성
      const refundLog = await tx.refundLog.create({
        data: {
          paymentId,
          refundAmount: finalCancelAmount,
          refundReason: cancelReason,
        },
      });

      // 2. 결제 상태 업데이트
      const newStatus =
        finalCancelAmount === Number(payment.amount)
          ? "refunded"
          : "partially_refunded";
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { paymentStatus: newStatus },
      });

      // 3. 크레딧 복원 (해당 결제로 발급된 크레딧이 있으면)
      // 부분 환불 시 환불 비율에 따라 크레딧 비례 복원
      const relatedCredits = await tx.memberCredit.findMany({
        where: { paymentId },
      });

      const isFullRefund = finalCancelAmount === Number(payment.amount);
      const refundRatio = isFullRefund
        ? 1
        : finalCancelAmount / Number(payment.amount);

      // PR-B (v0.5): CreditDomainService.refundSessions 위임 (전액/부분 환불 통합)
      for (const credit of relatedCredits) {
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
          `수업권 복원: paymentId=${paymentId}, 복원 수업권 ${relatedCredits.length}건`,
        );
      }

      // 4. Enrollment / ClassRegistration 동기화 — 전액 환불 시 캘린더에서 제외
      //    (Calendar 쿼리가 Enrollment.status='paid' 만 노출하므로 'refunded' 로 갱신).
      // P1-6 (v0.5): silent-fail `.catch(() => undefined)` 패턴 → `updateMany` 로 정합성 강화
      //              (레코드 없으면 count=0, 있으면 active → inactive 안전 전환)
      if (isFullRefund) {
        const enrollments = await tx.enrollment.findMany({
          where: { paymentId },
          select: { id: true, classId: true, childId: true },
        });
        for (const e of enrollments) {
          await tx.enrollment.update({
            where: { id: e.id },
            data: { status: "refunded" },
          });
          await tx.classRegistration.updateMany({
            where: {
              classId: e.classId,
              userId: e.childId,
              status: "active", // 이미 inactive 인 경우 skip
            },
            data: { status: "inactive" },
          });
        }
      }

      return { refundLog, updatedPayment };
    });

    this.logger.log(
      `결제 취소 완료: paymentId=${paymentId}, status=${result.updatedPayment.paymentStatus}`,
    );

    return {
      id: result.refundLog.id,
      paymentId: result.refundLog.paymentId,
      refundAmount: result.refundLog.refundAmount,
      refundReason: result.refundLog.refundReason,
      paymentStatus: result.updatedPayment.paymentStatus,
      processedAt: result.refundLog.processedAt,
    };
  }

  /**
   * 환불 요청 (레거시 메서드 - cancelPayment 사용 권장)
   */
  async requestRefund(
    paymentId: string,
    refundReason: string,
    refundAmount?: number,
    requester?: RefundRequester,
  ) {
    return this.cancelPayment(
      paymentId,
      refundReason,
      refundAmount,
      undefined,
      undefined,
      undefined,
      requester,
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
