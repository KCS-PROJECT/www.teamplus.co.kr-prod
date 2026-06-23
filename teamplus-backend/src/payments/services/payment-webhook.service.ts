/**
 * PaymentWebhookService — Phase B 이관 완료 (2026-04-30)
 *
 * 담당:
 *   finalizePayment (구 _finalizePayment, public화) — $transaction: 크레딧 발급 + 등록 생성
 *   completePayment — Webhook 서명 검증 + 금액 검증 → finalizePayment 위임
 *
 * 호출 경로:
 *   completePayment      ← KG이니시스 Webhook (PaymentsController)
 *   finalizePayment      ← Create.mockCompletePayment (dev only)
 *                        ← completePayment (정식 경로)
 *
 * 순환 참조 방지: 이 서비스는 다른 결제 도메인 서비스에 의존하지 않음.
 * Refund/Create → Webhook 단방향만 허용.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { KgInicisGateway } from "../kg-inicis.gateway";

export interface FinalizePaymentParams {
  orderNumber: string;
  tid: string;
  amount: number;
  paymentStatus: "completed" | "failed";
}

export interface FinalizePaymentResult {
  id: string;
  orderNumber: string;
  amount: number | unknown;
  paymentStatus: string;
  tid: string | null;
  completedAt: Date | null;
  creditsIssued: number;
}

export interface WebhookPayload {
  orderNumber: string;
  tid: string;
  resultCode: string;
  amount: number;
  authCode?: string;
  signature?: string;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kgInicisGateway: KgInicisGateway,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): MemberCredit 발급 단일 진입점
  ) {}

  /**
   * 결제 상태 확정 + 부가 처리 (크레딧 발급 + Enrollment 결제 완료 + ClassRegistration 자동 생성)
   *
   * **트랜잭션 경계 보존 필수**: 단일 `$transaction` 내부에서 모든 부가 작업 원자 처리.
   * Split 절대 금지 (SPEC §3.3 / §4.1 참조).
   *
   * Public 화 사유: PaymentCreateService.mockCompletePayment 가 직접 호출.
   * 외부 노출(Controller 직접 호출) 금지 — 코드 리뷰로 통제.
   */
  async finalizePayment(
    params: FinalizePaymentParams,
  ): Promise<FinalizePaymentResult> {
    const { orderNumber, tid, paymentStatus } = params;

    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        amount: true,
        paymentStatus: true,
        productId: true,
        product: {
          select: {
            classId: true,
            durationDays: true,
            sessionsPerMonth: true,
            feePerSession: true,
            class: { select: { billingMode: true } },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }
    if (payment.paymentStatus !== "pending") {
      this.logger.warn(
        `이미 처리된 결제: orderNumber=${orderNumber}, status=${payment.paymentStatus}`,
      );
      throw new ConflictException("이미 처리된 결제입니다.");
    }

    const completedAt = paymentStatus === "completed" ? new Date() : null;

    const { updatedPayment, creditsIssued } = await this.prisma.$transaction(
      async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { orderNumber },
          data: {
            paymentStatus,
            tid: paymentStatus === "completed" ? tid : null,
            completedAt,
          },
          select: {
            id: true,
            orderNumber: true,
            userId: true,
            amount: true,
            paymentStatus: true,
            tid: true,
            completedAt: true,
          },
        });

        let creditsIssued = 0;

        // [Phase B-3] POSTPAID(모드 A) 수업은 선결제 크레딧 발급 없음 — 후불 정산으로 청구한다.
        const isPostpaidClass =
          payment.product?.class?.billingMode === "POSTPAID";

        if (
          paymentStatus === "completed" &&
          payment.product &&
          !isPostpaidClass
        ) {
          this.logger.log(`수업권 발급 시작: orderNumber=${orderNumber}`);

          // 2026-05-22 정책 — 수업권 사용 기간 = 본 패키지 기간(durationDays) + 미사용 회차 사용 30일.
          //   학생이 본 기간 안에 모든 회차를 소진하지 못한 경우 30일 동안 추가 사용 가능.
          //   (사용자 정책 결정 — "보너스"가 아닌 표준 정책으로 모든 신규 결제에 일관 적용)
          //   - 결제 가드는 본 기간(durationDays) 기준 유지 — extra 30일은 가드 미적용.
          const MEMBER_CREDIT_EXTRA_USABLE_DAYS = 30;
          const now = new Date();
          const durationDays = payment.product.durationDays ?? 28;
          const expiresAt = new Date(now);
          expiresAt.setDate(
            expiresAt.getDate() +
              durationDays +
              MEMBER_CREDIT_EXTRA_USABLE_DAYS,
          );
          expiresAt.setHours(23, 59, 59, 999);

          // 2026-04-27 (N-9): User × Class 단위로 수업권 발급. ClubMember 결합 제거.
          // 발급 대상자: 학부모 결제 → enrollment.childId. enrollment 없으면 결제자 본인.
          const enrollmentForCredit = await tx.enrollment.findFirst({
            where: { paymentId: updatedPayment.id },
            select: { childId: true },
          });
          const targetUserId =
            enrollmentForCredit?.childId ?? updatedPayment.userId;

          // 2026-05-19 (N주 패키지 정합): 항상 sessionsPerMonth 만큼 발급.
          // 일할 계산 분기 폐기 — 결제 시점부터 durationDays 동안 패키지 유효이므로
          // 모든 학부모가 항상 동일한 N회차 사용 가능 (학부모별 결제일 자유로움).
          const issuedSessions = payment.product.sessionsPerMonth;

          // PR-B (v0.5): CreditDomainService.issueFromPayment 위임
          await this.creditDomain.issueFromPayment(tx, {
            paymentId: updatedPayment.id,
            userId: targetUserId,
            classId: payment.product.classId,
            sessions: issuedSessions,
            expiresAt,
            sourceLabel: `결제 완료 - 수업권 발급 (주문번호: ${orderNumber})`,
          });

          creditsIssued = issuedSessions;
          this.logger.log(
            `수업권 발급 완료: targetUserId=${targetUserId}, classId=${payment.product.classId}, sessions=${creditsIssued}`,
          );
        }

        if (updatedPayment.paymentStatus === "completed") {
          try {
            const enrollment = await tx.enrollment.findFirst({
              where: {
                paymentId: updatedPayment.id,
                status: { in: ["pending", "approved"] },
              },
              select: {
                id: true,
                childId: true,
                classId: true,
                class: { select: { team: { select: { id: true } } } },
              },
            });

            if (enrollment) {
              await tx.enrollment.update({
                where: { id: enrollment.id },
                data: {
                  status: "paid",
                  paidAt: completedAt,
                },
              });
              this.logger.log(
                `Enrollment 결제 완료 처리: enrollmentId=${enrollment.id}`,
              );

              // ClassRegistration 자동 생성 (enrollments.service.ts:markAsPaid 로직 동일 적용)
              const teamId = enrollment.class?.team?.id;
              if (teamId) {
                let regTeamMember = await tx.teamMember.findFirst({
                  where: { userId: enrollment.childId, teamId },
                  select: { id: true },
                });

                if (!regTeamMember) {
                  const childUser = await tx.user.findUnique({
                    where: { id: enrollment.childId },
                    select: { firstName: true, lastName: true },
                  });
                  regTeamMember = await tx.teamMember.create({
                    data: {
                      userId: enrollment.childId,
                      teamId,
                      playerName: childUser
                        ? `${childUser.lastName}${childUser.firstName}`.trim()
                        : "미등록",
                      playerAge: 0,
                      approvalStatus: "approved",
                    },
                  });
                  this.logger.log(
                    `TeamMember 자동 생성: userId=${enrollment.childId}, teamId=${teamId}`,
                  );
                }

                // 2026-04-27 (N-9): ClassRegistration 은 User 기반으로 통일.
                const existingReg = await tx.classRegistration.findUnique({
                  where: {
                    classId_userId: {
                      classId: enrollment.classId,
                      userId: enrollment.childId,
                    },
                  },
                });
                if (!existingReg) {
                  await tx.classRegistration.create({
                    data: {
                      classId: enrollment.classId,
                      userId: enrollment.childId,
                      status: "active",
                    },
                  });
                  this.logger.log(
                    `ClassRegistration 생성: classId=${enrollment.classId}, userId=${enrollment.childId}`,
                  );
                }
              }
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `[WARNING] Enrollment/ClassRegistration 처리 실패 (트랜잭션 내부): ` +
                `orderNumber=${orderNumber}, error=${message}. ` +
                `결제/크레딧은 정상 처리됨, 수동 확인 필요.`,
            );
          }
        }

        return { updatedPayment, creditsIssued };
      },
    );

    return {
      id: updatedPayment.id,
      orderNumber: updatedPayment.orderNumber,
      amount: updatedPayment.amount,
      paymentStatus: updatedPayment.paymentStatus,
      tid: updatedPayment.tid,
      completedAt: updatedPayment.completedAt,
      creditsIssued,
    };
  }

  /**
   * 결제 완료 처리 (KG이니시스 웹훅 콜백)
   *
   * 웹훅을 통해 결제 결과를 수신하고 처리합니다.
   * - 서명 검증
   * - 중복 처리 방지
   * - 크레딧 자동 발급 (finalizePayment 위임)
   */
  async completePayment(
    webhookData: WebhookPayload,
  ): Promise<FinalizePaymentResult> {
    const { orderNumber, tid, resultCode, amount, signature } = webhookData;

    this.logger.log(
      `결제 완료 웹훅 수신: orderNumber=${orderNumber}, tid=${tid}, resultCode=${resultCode}`,
    );

    // 결제 기록 존재 확인 (서명 검증 전 amount 비교용)
    const existing = await this.prisma.payment.findUnique({
      where: { orderNumber },
      select: { amount: true, paymentStatus: true },
    });
    if (!existing) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }
    if (existing.paymentStatus !== "pending") {
      this.logger.warn(
        `이미 처리된 결제: orderNumber=${orderNumber}, status=${existing.paymentStatus}`,
      );
      throw new ConflictException("이미 처리된 결제입니다.");
    }

    // 웹훅 서명 검증 (보안 필수 - signature 없으면 무조건 거부)
    if (!signature) {
      this.logger.error(`웹훅 서명 누락: orderNumber=${orderNumber}`);
      throw new BadRequestException("웹훅 서명이 누락되었습니다.");
    }
    const isValidSignature = this.kgInicisGateway.verifyWebhookSignature(
      { orderNumber, tid, amount, resultCode },
      signature,
    );
    if (!isValidSignature) {
      this.logger.error(`웹훅 서명 검증 실패: orderNumber=${orderNumber}`);
      throw new BadRequestException("웹훅 서명이 유효하지 않습니다.");
    }

    // 금액 검증 (서버사이드 필수)
    if (!this.kgInicisGateway.verifyAmount(amount, Number(existing.amount))) {
      this.logger.error(
        `결제 금액 불일치: 요청=${amount}, DB=${existing.amount}, orderNumber=${orderNumber}`,
      );
      throw new BadRequestException("결제 금액이 일치하지 않습니다.");
    }

    // 결제 상태 결정 (0000: 성공)
    const paymentStatus: "completed" | "failed" =
      resultCode === "0000" ? "completed" : "failed";

    this.logger.log(
      `결제 상태 업데이트: orderNumber=${orderNumber}, status=${paymentStatus}`,
    );

    // 공통 헬퍼로 상태 전환 + 크레딧 발급 + Enrollment 처리
    return this.finalizePayment({
      orderNumber,
      tid,
      amount,
      paymentStatus,
    });
  }
}
