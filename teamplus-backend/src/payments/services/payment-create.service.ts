/**
 * PaymentCreateService — Phase B 이관 완료 (2026-04-30)
 *
 * 담당:
 *   initiatePayment        — 결제 시작 (KG이니시스 페이지 URL 생성)
 *   mockCompletePayment    — DEV ONLY 결제 완료 mock (PaymentWebhookService.finalizePayment 위임)
 *   verifyPayment          — 결제 완료 페이지에서 호출하는 상태 확인
 *   getClassProduct        — 수업 상품 단건 조회 (결제 미리보기)
 *   calculateFee           — feeType별 결제 금액 계산
 *   checkPaymentIdempotency / setPaymentIdempotency — Redis 멱등성 키 (private)
 *
 * 의존성: Prisma · Redis · ConfigService · KgInicisGateway · PaymentCalculationService · PaymentWebhookService
 *
 * 순환 참조 규칙: Create → Webhook 단방향만 허용 (역방향 금지).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Decimal } from "@prisma/client/runtime/library";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { calculateKoreanAge } from "@/common/utils/age.util";
import { KgInicisGateway } from "../kg-inicis.gateway";
import {
  PaymentCalculationService,
  FeeType,
} from "../payment-calculation.service";
import { PaymentWebhookService } from "./payment-webhook.service";

export interface InitiatePaymentOptions {
  paymentMethod?: string;
  quota?: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  classId?: string;
  childId?: string;
}

import {
  assertPaymentAllowed,
  PACKAGE_PAYMENT_BLOCK_MESSAGES,
} from "@/classes/utils/package-guard.util";

@Injectable()
export class PaymentCreateService {
  private readonly logger = new Logger(PaymentCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly kgInicisGateway: KgInicisGateway,
    private readonly calculationService: PaymentCalculationService,
    // [수정 2026-05-13] mockCompletePayment 제거 — webhookService 미사용. underscore 로 lint 통과.
    private readonly _webhookService: PaymentWebhookService,
  ) {
    // hold reference (DI graph 유지)
    void this._webhookService;
  }

  /**
   * 결제 시작 (KG이니시스 결제 페이지로 리다이렉트)
   */
  async initiatePayment(
    userId: string,
    productId: string,
    amount: number,
    options?: InitiatePaymentOptions,
  ) {
    this.logger.log(
      `결제 시작: userId=${userId}, productId=${productId}, amount=${amount}`,
    );

    // 상품 확인 (필요 필드만 select)
    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        productName: true,
        feeType: true,
        price: true,
        sessionsPerWeek: true,
        feePerSession: true,
        durationDays: true,
        isActive: true,
        classId: true,
        class: {
          select: {
            id: true,
            endTime: true,
            billingMode: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }

    // [B6] BOTH(선택형) 수업의 enrollment 는 반드시 선택 상품(classProductId)을 가져야 한다.
    //   결제 경로는 항상 특정 상품(productId)로 진행되어 아래 enrollment 생성 시
    //   classProductId: productId 로 채워지므로 불변식이 보장된다 — 누락 시 명시 차단.
    if (product.class?.billingMode === "BOTH" && !productId) {
      throw new BadRequestException("선불/후불을 선택해주세요.");
    }

    // 패키지 가드 — isActive=false(수동 비활성)만 차단. 수업 종료일 기반 차단은 폐기.
    const blockReason = assertPaymentAllowed({
      feeType: product.feeType,
      durationDays: product.durationDays,
      isActive: product.isActive,
      class: product.class
        ? { endTime: product.class.endTime }
        : null,
    });
    if (blockReason) {
      this.logger.warn(
        `결제 가드 차단: reason=${blockReason}, productId=${productId}, classId=${product.class?.id ?? "(no-class)"}, feeType=${product.feeType}, durationDays=${product.durationDays}, classEnd=${product.class?.endTime?.toISOString() ?? "(null)"}`,
      );
      throw new BadRequestException(
        PACKAGE_PAYMENT_BLOCK_MESSAGES[blockReason],
      );
    }

    // feeType별 서버사이드 금액 계산 및 검증 (보안 필수)
    const feeResult = this.calculationService.calculatePrepaidFee({
      feeType: product.feeType,
      price: Number(product.price),
      sessionsPerWeek: product.sessionsPerWeek,
      feePerSession: product.feePerSession,
      durationDays: product.durationDays,
    });
    const expectedAmount = feeResult.baseAmount.toNumber();

    if (!this.kgInicisGateway.verifyAmount(amount, expectedAmount)) {
      this.logger.warn(
        `결제 금액 불일치: 요청=${amount}, 서버계산=${expectedAmount}, feeType=${product.feeType}`,
      );
      throw new BadRequestException(
        "결제 금액이 상품 가격과 일치하지 않습니다.",
      );
    }

    // 동일 사용자·동일 상품 연타 방어 (Redis SETNX 락).
    //  [수정 2026-05-13] 토스 위젯 흐름은 사용자가 위젯 진입 후 취소 가능 → 락 TTL 단축(5초).
    //   - 'toss' 외 (KG이니시스 등): 기존 60초 유지 (PG 리다이렉트 이후 즉시 재시도 차단).
    const userProductLockKey = `payment:lock:${userId}:${productId}`;
    const lockTtlSec = options?.paymentMethod === "toss" ? 5 : 60;
    const lockAcquired = await this.redisService.setIfNotExists(
      userProductLockKey,
      "1",
      lockTtlSec,
    );
    if (!lockAcquired) {
      this.logger.warn(
        `동일 상품 결제 락 충돌: userId=${userId}, productId=${productId} (ttl=${lockTtlSec}s)`,
      );
      throw new ConflictException(
        "동일 상품에 대한 결제가 이미 진행 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    // 수업 결제인 경우 학부모-자녀 관계 검증 + 나이 제한 + 기존 수강신청 중복 체크
    let existingEnrollment: {
      id: string;
      status: string;
      requestedBy: string;
      paymentId: string | null;
    } | null = null;
    if (options?.classId && options?.childId) {
      const parentChild = await this.prisma.parentChild.findUnique({
        where: {
          parentId_childId: { parentId: userId, childId: options.childId },
        },
        select: { parentId: true },
      });
      if (!parentChild) {
        await this.redisService.del(userProductLockKey);
        throw new ForbiddenException("자녀 정보를 찾을 수 없습니다.");
      }

      // 자녀 팀 가입 승인 검증 (FE 수업 상세 가드의 최종 방어선).
      //  - 정규 수업(Class.teamId 존재): 자녀가 해당 팀에 approved 멤버여야 결제 가능
      //  - 오픈클래스(academyId 만 존재): 별도 정책 — 본 가드 우회
      const classForTeam = await this.prisma.class.findUnique({
        where: { id: options.classId },
        select: { teamId: true },
      });
      if (classForTeam?.teamId) {
        const childMembership = await this.prisma.teamMember.findFirst({
          where: {
            userId: options.childId,
            teamId: classForTeam.teamId,
            approvalStatus: "approved",
          },
          select: { id: true },
        });
        if (!childMembership) {
          await this.redisService.del(userProductLockKey);
          throw new ForbiddenException(
            "등록된 자녀가 없어 결제할 수 없습니다.",
          );
        }
      }

      // 수업 나이 제한 검증 (parent_direct 경로 최종 방어선).
      const classForAge = await this.prisma.class.findUnique({
        where: { id: options.classId },
        select: { ageMin: true, ageMax: true, targetBirthYears: true },
      });

      const targetYears = classForAge?.targetBirthYears ?? [];
      const hasTargetYears = targetYears.length > 0;
      if (
        classForAge &&
        (hasTargetYears ||
          classForAge.ageMin != null ||
          classForAge.ageMax != null)
      ) {
        const childProfile = await this.prisma.childProfile.findUnique({
          where: { userId: options.childId },
          select: { birthDate: true },
        });

        if (!childProfile) {
          await this.redisService.del(userProductLockKey);
          throw new BadRequestException(
            "자녀 생년월일 정보가 없어 나이 제한을 확인할 수 없습니다.",
          );
        }

        if (hasTargetYears) {
          // 대상 출생연도 개별 목록(SoT) — 비연속 선택까지 정확히 매칭.
          const birthYear = new Date(childProfile.birthDate).getFullYear();
          if (!targetYears.includes(birthYear)) {
            await this.redisService.del(userProductLockKey);
            throw new BadRequestException(
              "이 수업은 대상 출생연도에 해당하는 자녀만 수강 가능합니다.",
            );
          }
        } else {
          // 하위호환 — targetBirthYears 미설정 수업은 기존 ageMin/ageMax(한국나이) 범위 검증.
          const childAge = calculateKoreanAge(new Date(childProfile.birthDate));

          if (classForAge.ageMin != null && childAge < classForAge.ageMin) {
            await this.redisService.del(userProductLockKey);
            throw new BadRequestException(
              `이 수업은 만 ${classForAge.ageMin}세 이상만 수강 가능합니다.`,
            );
          }

          if (classForAge.ageMax != null && childAge > classForAge.ageMax) {
            await this.redisService.del(userProductLockKey);
            throw new BadRequestException(
              `이 수업은 만 ${classForAge.ageMax}세까지만 수강 가능합니다.`,
            );
          }
        }
      }

      // 수업 정원 검증 (parent_direct 결제 플로우 최종 방어선)
      const classCapacity = await this.prisma.class.findUnique({
        where: { id: options.classId },
        select: { capacity: true },
      });
      if (classCapacity?.capacity && classCapacity.capacity > 0) {
        const activeCount = await this.prisma.classRegistration.count({
          where: { classId: options.classId, status: "active" },
        });
        if (activeCount >= classCapacity.capacity) {
          await this.redisService.del(userProductLockKey);
          throw new ConflictException(
            "수업 정원이 마감되었습니다. 대기 등록을 이용해주세요.",
          );
        }
      }

      existingEnrollment = await this.prisma.enrollment.findFirst({
        where: {
          childId: options.childId,
          classId: options.classId,
          status: {
            in: ["pending", "pending_approval", "approved", "paid"],
          },
        },
        select: { id: true, status: true, requestedBy: true, paymentId: true },
      });
      if (existingEnrollment) {
        const isMyPending =
          existingEnrollment.status === "pending" &&
          existingEnrollment.requestedBy === userId;
        if (!isMyPending) {
          await this.redisService.del(userProductLockKey);
          throw new ConflictException(
            "이미 신청 중이거나 수강 중인 수업입니다.",
          );
        }
        this.logger.log(
          `본인 pending Enrollment 재활용: enrollmentId=${existingEnrollment.id}`,
        );
      }
    }

    // 주문번호 생성
    const randomSuffix = uuidv4().replace(/-/g, "").substring(0, 12);
    const orderNumber = `ORD-${Date.now()}-${randomSuffix}`;

    // 중복 결제 요청 방지 (Redis idempotency check)
    const isDuplicate = await this.checkPaymentIdempotency(orderNumber);
    if (isDuplicate) {
      this.logger.warn(`중복 결제 요청: orderNumber=${orderNumber}`);
      throw new ConflictException("이미 처리 중인 결제 요청입니다.");
    }

    // Idempotency 키 설정 (24시간)
    await this.setPaymentIdempotency(orderNumber);

    // 사용자 정보 조회 (구매자 정보)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 결제 기록 생성 (pending 상태) + 수업 결제인 경우 Enrollment 연결
    const myPendingEnrollmentId =
      existingEnrollment?.status === "pending" &&
      existingEnrollment?.requestedBy === userId
        ? existingEnrollment.id
        : null;

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderNumber,
          userId,
          productId,
          amount,
          paymentStatus: "pending",
          paymentMethod: options?.paymentMethod || "card",
        },
      });

      if (options?.classId && options?.childId) {
        if (myPendingEnrollmentId) {
          const oldPaymentId = existingEnrollment?.paymentId;
          if (oldPaymentId && oldPaymentId !== created.id) {
            await tx.payment.update({
              where: { id: oldPaymentId },
              data: { paymentStatus: "cancelled" },
            });
            this.logger.log(
              `이전 고아 Payment cancelled 처리: paymentId=${oldPaymentId}`,
            );
          }
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 72);
          await tx.enrollment.update({
            where: { id: myPendingEnrollmentId },
            data: {
              paymentId: created.id,
              classProductId: productId,
              expiresAt,
            },
          });
          this.logger.log(
            `Enrollment 재활용: enrollmentId=${myPendingEnrollmentId}, 새 paymentId=${created.id}`,
          );
        } else {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 72);
          await tx.enrollment.create({
            data: {
              childId: options.childId,
              classId: options.classId,
              classProductId: productId,
              requestedBy: userId,
              requestType: "parent_direct",
              status: "pending",
              paymentId: created.id,
              expiresAt,
            },
          });
          this.logger.log(
            `Enrollment 생성: classId=${options.classId}, childId=${options.childId}, paymentId=${created.id}`,
          );
        }
      }

      return created;
    });

    this.logger.log(
      `결제 기록 생성: paymentId=${payment.id}, orderNumber=${orderNumber}`,
    );

    // [수정 2026-05-13] DEV mock 자동 완료 분기 제거 — 실제 결제(토스/KG이니시스) 흐름만 사용.
    //  paymentMethod='toss' 면 frontend 위젯이 결제 진행 후 /payments/toss/confirm 호출.
    //  paymentMethod=card 등 KG이니시스 분기는 paymentPageUrl 리다이렉트.
    if (options?.paymentMethod === "toss") {
      this.logger.log(
        `[TOSS] Payment 발급 — orderNumber=${orderNumber} (위젯이 결제 후 /toss/confirm 호출)`,
      );
      // [추가 2026-05-13] 토스 분기는 위젯이 결제 진행하므로 backend 락 즉시 해제 —
      //  사용자가 위젯에서 취소·실패 후 즉시 재시도 가능하게.
      await this.redisService.del(userProductLockKey);
      return {
        id: payment.id,
        orderNumber: payment.orderNumber,
        amount: payment.amount,
        paymentStatus: payment.paymentStatus,
        productId: payment.productId,
      };
    }

    // KG이니시스 결제 페이지 URL 생성
    const paymentPageUrl = await this.kgInicisGateway.createPaymentRequest({
      orderNumber,
      amount,
      productName: product.productName,
      buyerName: options?.buyerName || "고객",
      buyerEmail: options?.buyerEmail || user.email,
      buyerPhone: options?.buyerPhone || user.phone || undefined,
      paymentMethod: options?.paymentMethod,
      quota: options?.quota,
    });

    this.logger.log(`KG이니시스 결제 URL 생성 완료: ${orderNumber}`);

    return {
      id: payment.id,
      orderNumber: payment.orderNumber,
      amount: payment.amount,
      paymentStatus: payment.paymentStatus,
      productId: payment.productId,
      paymentPageUrl,
    };
  }

  /**
   * [제거 2026-05-13] mockCompletePayment — 사용자 요청에 따라 DEV mock 자동 완료 폐기.
   *  토스/KG이니시스 실 결제 흐름만 사용. Facade(PaymentsService) 도 미사용 deprecated.
   */

  /**
   * 결제 완료 확인 (결제 완료 페이지 /payment/complete 에서 호출)
   *
   * orderNumber로 Payment 조회 후 completed 상태인 경우 영수증·크레딧 정보 반환.
   * pending 상태면 아직 처리 중으로 판단(409) — 프론트에서 재시도 처리.
   * 본인 결제만 조회 가능 (IDOR 방지).
   */
  async verifyPayment(userId: string, orderNumber: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        amount: true,
        paymentStatus: true,
        paymentMethod: true,
        tid: true,
        completedAt: true,
        createdAt: true,
        productId: true,
        product: {
          select: {
            productName: true,
            sessionsPerMonth: true,
          },
        },
        credits: {
          select: {
            totalSessions: true,
          },
        },
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            issuedAt: true,
          },
        },
        // 수업명·수강생명 조회 (결제 1건 = enrollment 1건 가정, 다중은 본 범위 외)
        // N+1 방지: include 대신 select로 필요 필드만 조회
        enrollments: {
          select: {
            class: {
              select: { className: true },
            },
            // User 모델은 firstName/lastName 분리 구조 — 표시명은 lastName+firstName 조합
            child: {
              select: { firstName: true, lastName: true },
            },
          },
          take: 1,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }

    // 소유자 검증 (IDOR 방지)
    if (payment.userId !== userId) {
      throw new ForbiddenException("해당 결제 정보에 접근할 권한이 없습니다.");
    }

    if (payment.paymentStatus === "pending") {
      throw new ConflictException(
        "결제가 아직 처리 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    const creditsIssued = payment.credits.reduce(
      (sum, c) => sum + c.totalSessions,
      0,
    );

    const formatDate = (d: Date | null): string => {
      if (!d) return "";
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${yy}.${mm}.${dd} ${hh}:${mi}`;
    };

    // enrollment가 없는 경우(매치 결제 등) graceful 처리
    const enrollment = payment.enrollments?.[0];
    // User는 firstName/lastName 분리 구조 → 성+이름 조합 (예: "김민준")
    const childFullName = enrollment?.child
      ? `${enrollment.child.lastName}${enrollment.child.firstName}`
      : undefined;

    return {
      receipt: {
        id: payment.receipt?.id ?? payment.id,
        orderNumber: payment.orderNumber,
        status: payment.paymentStatus,
        storeName: "TEAMPLUS",
        paymentDate: formatDate(payment.completedAt ?? payment.createdAt),
        paymentMethod: payment.paymentMethod ?? "card",
        productName: payment.product?.productName ?? "수업 결제",
        totalAmount: Number(payment.amount),
        creditsIssued,
        // enrollment 있을 때만 수업명·자녀명 반환 (없으면 undefined → 프론트 조건부 렌더)
        className: enrollment?.class?.className ?? undefined,
        childName: childFullName,
      },
      creditsIssued,
      message:
        payment.paymentStatus === "completed"
          ? "결제가 완료되었습니다."
          : "결제가 실패했습니다.",
    };
  }

  /**
   * 수업 상품 단건 조회 (결제 미리보기용)
   */
  async getClassProduct(productId: string) {
    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        productName: true,
        price: true,
        feeType: true,
        billingTiming: true,
        sessionsPerWeek: true,
        feePerSession: true,
        sessionsPerMonth: true,
      },
    });

    if (!product) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }

    return product;
  }

  /**
   * feeType별 결제 금액 계산
   */
  async calculateFee(
    classId: string,
    feeType: string,
    attendanceCount?: number,
  ): Promise<{ amount: number; description: string }> {
    const product = await this.prisma.classProduct.findFirst({
      where: { classId, feeType, isActive: true },
      select: {
        price: true,
        feeType: true,
        billingTiming: true,
        sessionsPerWeek: true,
        feePerSession: true,
        durationDays: true,
        sessionsPerMonth: true,
      },
    });

    if (!product) {
      throw new NotFoundException(
        `해당 수업의 ${feeType} 유형 상품을 찾을 수 없습니다.`,
      );
    }

    switch (feeType as FeeType) {
      case FeeType.MONTHLY_FIXED: {
        const hasBreakdown = !!(
          product.sessionsPerWeek && product.feePerSession
        );
        const amount = hasBreakdown
          ? this.calculationService.calculateMonthlyFee(product)
          : new Decimal(Number(product.price));
        const weeks = product.durationDays
          ? Math.max(1, Math.round(product.durationDays / 7))
          : 4;
        const description = hasBreakdown
          ? `${weeks}주 정기권 (주 ${product.sessionsPerWeek}회 × ${product.feePerSession}원)`
          : `${weeks}주 정기권 · 총 ${product.sessionsPerMonth}회 (${Number(product.price).toLocaleString()}원)`;
        return {
          amount: amount.toNumber(),
          description,
        };
      }
      case FeeType.PER_SESSION: {
        if (
          product.billingTiming === "POSTPAID" &&
          attendanceCount !== undefined
        ) {
          const amount = this.calculationService.calculatePerSessionFee(
            { feePerSession: product.feePerSession },
            attendanceCount,
          );
          return {
            amount: amount.toNumber(),
            description: `횟수제 (${attendanceCount}회 × ${product.feePerSession}원)`,
          };
        }
        return {
          amount: Number(product.price),
          description: `횟수제 선결제 (${Number(product.price).toLocaleString()}원)`,
        };
      }
      case FeeType.PER_GAME: {
        return {
          amount: Number(product.price),
          description: `경기당 (${Number(product.price).toLocaleString()}원)`,
        };
      }
      default:
        throw new BadRequestException(
          `지원하지 않는 결제 방식입니다: ${feeType}`,
        );
    }
  }

  /**
   * Private: 결제 Idempotency 확인 (중복 방지)
   * Redis key: {payment-prefix}idempotency:{orderNumber}
   */
  private async checkPaymentIdempotency(orderNumber: string): Promise<boolean> {
    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.payment;
    const cacheKey = `${keyPrefix}idempotency:${orderNumber}`;

    return await this.redisService.exists(cacheKey);
  }

  /**
   * Private: 결제 Idempotency 키 설정 (24h TTL)
   */
  private async setPaymentIdempotency(orderNumber: string): Promise<void> {
    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.payment;
    const ttl = redisConfig.cacheTTL.paymentIdempotency;
    const cacheKey = `${keyPrefix}idempotency:${orderNumber}`;

    await this.redisService.set(cacheKey, "processing", ttl);
  }
}
