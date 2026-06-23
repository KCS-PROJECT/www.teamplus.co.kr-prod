import { Injectable, BadRequestException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "@/prisma/prisma.service";

export const FeeType = {
  MONTHLY_FIXED: "MONTHLY_FIXED",
  PER_SESSION: "PER_SESSION",
  PER_GAME: "PER_GAME",
} as const;
export type FeeType = (typeof FeeType)[keyof typeof FeeType];

export const BillingTiming = {
  PREPAID: "PREPAID",
  POSTPAID: "POSTPAID",
} as const;
export type BillingTiming = (typeof BillingTiming)[keyof typeof BillingTiming];

export interface FeeCalculationResult {
  feeType: FeeType;
  billingTiming: BillingTiming;
  baseAmount: Decimal;
  description: string;
}

@Injectable()
export class PaymentCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 정기 패키지 정밀 계산: sessionsPerWeek × feePerSession × (durationDays / 7)
   * 예) 주1회 × 70,000원 × 4주(durationDays=28) = 280,000원
   *
   * durationDays 누락 시 28일(=4주) 폴백 — 기존 monthlyPrice 시드 데이터(durationDays=30) 호환.
   */
  calculateMonthlyFee(product: {
    sessionsPerWeek: number | null;
    feePerSession: Decimal | null;
    durationDays?: number | null;
  }): Decimal {
    if (!product.sessionsPerWeek || !product.feePerSession) {
      throw new BadRequestException(
        "정기 패키지 계산에는 sessionsPerWeek와 feePerSession이 필요합니다.",
      );
    }
    const weeks = product.durationDays
      ? Math.max(1, Math.round(product.durationDays / 7))
      : 4;
    return new Decimal(product.sessionsPerWeek)
      .times(product.feePerSession)
      .times(weeks);
  }

  /**
   * 횟수제 계산: attendanceCount × feePerSession
   */
  calculatePerSessionFee(
    product: { feePerSession: Decimal | null },
    attendanceCount: number,
  ): Decimal {
    if (!product.feePerSession) {
      throw new BadRequestException(
        "횟수제 계산에는 feePerSession이 필요합니다.",
      );
    }
    if (attendanceCount < 0) {
      throw new BadRequestException("출석 횟수는 0 이상이어야 합니다.");
    }
    return new Decimal(attendanceCount).times(product.feePerSession);
  }

  /**
   * 경기당 계산: gamesCount × feePerGame
   */
  calculatePerGameFee(feePerGame: Decimal, gamesCount: number): Decimal {
    if (gamesCount < 0) {
      throw new BadRequestException("경기 수는 0 이상이어야 합니다.");
    }
    return new Decimal(gamesCount).times(feePerGame);
  }

  /**
   * 상품의 feeType에 따라 결제 금액 계산 (선결제용)
   */
  calculatePrepaidFee(product: {
    feeType: string;
    price: number;
    sessionsPerWeek: number | null;
    feePerSession: Decimal | null;
    durationDays?: number | null;
  }): FeeCalculationResult {
    const billingTiming = BillingTiming.PREPAID;

    switch (product.feeType as FeeType) {
      case FeeType.MONTHLY_FIXED: {
        // 세부 단가(sessionsPerWeek × feePerSession × weeks)가 저장된 경우 정밀 계산 모드,
        // 아니면 product.price 플랫 금액 사용. weeks = durationDays/7 동적 계산 (4주 하드코딩 제거).
        const hasBreakdown = !!(
          product.sessionsPerWeek && product.feePerSession
        );
        const amount = hasBreakdown
          ? this.calculateMonthlyFee(product)
          : new Decimal(product.price);
        const weeks = product.durationDays
          ? Math.max(1, Math.round(product.durationDays / 7))
          : 4;
        const description = hasBreakdown
          ? `${weeks}주 정기권 (주 ${product.sessionsPerWeek}회 × ${product.feePerSession}원)`
          : `${weeks}주 정기권 (${product.price.toLocaleString()}원)`;
        return {
          feeType: FeeType.MONTHLY_FIXED,
          billingTiming,
          baseAmount: amount,
          description,
        };
      }
      case FeeType.PER_SESSION: {
        // 선결제 횟수제: 기본 price 사용 또는 sessionsPerMonth 기준 계산
        const amount = new Decimal(product.price);
        return {
          feeType: FeeType.PER_SESSION,
          billingTiming,
          baseAmount: amount,
          description: `횟수제 선결제 (${product.price.toLocaleString()}원)`,
        };
      }
      case FeeType.PER_GAME: {
        const amount = new Decimal(product.price);
        return {
          feeType: FeeType.PER_GAME,
          billingTiming,
          baseAmount: amount,
          description: `경기당 선결제 (${product.price.toLocaleString()}원)`,
        };
      }
      default:
        throw new BadRequestException(
          `지원하지 않는 결제 방식입니다: ${product.feeType}`,
        );
    }
  }

  /**
   * 일할 계산: startDate 부터 monthEnd 까지 예정 ClassSchedule 회차 카운트 × feePerSession
   *
   * 당월 6일 이후 신규 가입 시 남은 수업 일정 기준 일할 요금을 산출합니다.
   * 취소(isCancelled=true) 일정은 제외합니다.
   *
   * @param product ClassProduct (classId, feePerSession, sessionsPerWeek 포함)
   * @param startDate 가입 시작 날짜 (당일 포함)
   * @param monthEnd 당월 말일 (23:59:59)
   * @returns sessions 남은 예정 회차 수, amount 일할 금액
   */
  async calculateProrated(
    product: {
      classId: string;
      feePerSession: Decimal | null;
    },
    startDate: Date,
    monthEnd: Date,
  ): Promise<{ sessions: number; amount: Decimal }> {
    if (!product.feePerSession) {
      return { sessions: 0, amount: new Decimal(0) };
    }

    // startDate ~ monthEnd 사이 취소되지 않은 수업 일정 카운트
    const sessions = await this.prisma.classSchedule.count({
      where: {
        classId: product.classId,
        scheduledDate: {
          gte: startDate,
          lte: monthEnd,
        },
        isCancelled: false,
      },
    });

    const amount = new Decimal(sessions).times(product.feePerSession);

    return { sessions, amount };
  }

  /**
   * 후결제 금액 계산: 해당 월 실제 출석 횟수 조회 → 횟수 × 단가
   */
  async calculatePostpaidFee(
    classId: string,
    userId: string,
    month: Date,
  ): Promise<{ attendanceCount: number; amount: Decimal }> {
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    // userId로 ClubMember.id 조회 (ClassAttendance.memberId는 ClubMember.id)
    const clubMember = await this.prisma.teamMember.findFirst({
      where: { userId, approvalStatus: "approved" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const memberId = clubMember?.id ?? userId;

    // 해당 월 출석 집계 (present 상태만)
    const attendances = await this.prisma.classAttendance.count({
      where: {
        memberId,
        attendanceStatus: "present",
        schedule: {
          classId,
          scheduledDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },
    });

    // 수업 상품에서 feePerSession 조회
    const product = await this.prisma.classProduct.findFirst({
      where: { classId, billingTiming: BillingTiming.POSTPAID },
      select: { feePerSession: true, feeType: true },
    });

    if (!product?.feePerSession) {
      return { attendanceCount: attendances, amount: new Decimal(0) };
    }

    const amount = this.calculatePerSessionFee(
      { feePerSession: product.feePerSession },
      attendances,
    );

    return { attendanceCount: attendances, amount };
  }
}
