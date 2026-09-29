/**
 * PaymentReceiptService — Phase B 이관 완료 (2026-04-30)
 *
 * 담당:
 *   getReceipt           — 영수증 조회
 *   createReceipt        — 영수증 생성 (멱등)
 *
 * 정산 승인/지급 워크플로우(getSettlementList/approveSettlement/completeSettlement/
 * rejectSettlement)는 `/api/v1/settlements`(settlements 모듈)로 통합되며 폐기됨(2026-09).
 *
 * 의존성: Prisma 만 (외부 게이트웨이 불필요)
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { deriveSource, PaymentSourceType } from "../payment-source.util";

/**
 * 부가세 면세 대상 결제 출처 — `PAYMENT_TAX_EXEMPT_SOURCES` 환경변수(콤마 구분).
 *
 * 값: `CLASS` | `TOURNAMENT` | `ALL`. 미설정 시 전건 과세(현행 동작 유지).
 * 체육 교육용역은 사업자 업종 등록에 따라 면세일 수 있어(부가가치세법 §26①6)
 * 코드에 과세를 못 박지 않고 운영 설정으로 분리한다. 상품 단위로 구분해야 하면
 * `ClassProduct.taxExempt` 컬럼 도입이 필요하다(스키마 변경 필요 — 미구현).
 */
function taxExemptSources(): Set<string> {
  return new Set(
    (process.env.PAYMENT_TAX_EXEMPT_SOURCES ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * 영수증 과세 구분 + 부가세 산정.
 *
 * 면세 거래에는 역산(amount/11)을 적용하지 않는다 — 면세 매출에 부가세를 표기하면
 * 소비자에게 거짓 세액을 고지하는 것이 되고 매입세액 공제 오인을 유발한다.
 */
export function resolveReceiptTax(
  sourceType: PaymentSourceType | null,
  amount: number,
  exempt: Set<string> = taxExemptSources(),
): { taxable: boolean; taxAmount: number } {
  const isExempt =
    exempt.has("ALL") || (sourceType != null && exempt.has(sourceType));
  return {
    taxable: !isExempt,
    // 공급대가(부가세 포함가) 역산 — 과세 거래에만 적용.
    taxAmount: isExempt ? 0 : Math.round(amount / 11),
  };
}

@Injectable()
export class PaymentReceiptService {
  private readonly logger = new Logger(PaymentReceiptService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== 영수증 관리 ====================

  /**
   * 영수증 조회 (paymentId 기준)
   *
   * 영수증 레코드가 없고 결제가 완료 상태면 멱등 생성(lazy-create)하여 과거 결제건도 복구한다.
   * 반환 형태는 프론트 Receipt 계약( { receipt: {...} } )에 맞춰 매핑 — verifyPayment 와 동일 컨벤션.
   *
   * 소유자 검증(IDOR 방지): 본인 결제만 조회 가능하며, 관리자급(ADMIN/DIRECTOR/COACH/
   * ACADEMY_DIRECTOR)은 관리 목적으로 타인 결제 영수증 조회를 허용한다.
   */
  async getReceipt(
    paymentId: string,
    requesterId: string,
    requesterType: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        amount: true,
        paymentStatus: true,
        paymentMethod: true,
        completedAt: true,
        createdAt: true,
        receipt: { select: { id: true, taxable: true, taxAmount: true } },
        product: { select: { productName: true, billingTiming: true } },
        credits: { select: { totalSessions: true } },
        enrollments: {
          select: {
            class: { select: { className: true } },
            // User 모델은 firstName/lastName 분리 구조 — 표시명은 lastName+firstName 조합
            child: { select: { firstName: true, lastName: true } },
          },
          take: 1,
        },
        // 출처 라벨링 파생용 관계 — N+1 방지 take:1 select
        tournamentRegistrations: {
          select: {
            tournament: { select: { billingMode: true, name: true } },
          },
          take: 1,
        },
        monthlyBillingLines: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 정보를 찾을 수 없습니다.");
    }

    // 소유자 검증 — 본인 결제 또는 관리자급만 허용.
    const MANAGER_TYPES = ["ADMIN", "DIRECTOR", "COACH", "ACADEMY_DIRECTOR"];
    if (
      payment.userId !== requesterId &&
      !MANAGER_TYPES.includes(requesterType)
    ) {
      throw new ForbiddenException("해당 결제 정보에 접근할 권한이 없습니다.");
    }

    // 영수증 레코드가 없으면 완료 결제에 한해 멱등 생성 (과거 결제건 복구).
    let taxInfo: { taxable: boolean; taxAmount: number } | null =
      payment.receipt
        ? {
            taxable: payment.receipt.taxable,
            taxAmount: payment.receipt.taxAmount,
          }
        : null;
    if (!payment.receipt && payment.paymentStatus === "completed") {
      const created = await this.createReceipt(paymentId);
      taxInfo = { taxable: created.taxable, taxAmount: created.taxAmount };
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

    // enrollment 가 없는 경우(매치 결제 등) graceful 처리
    const enrollment = payment.enrollments?.[0];
    const childFullName = enrollment?.child
      ? `${enrollment.child.lastName}${enrollment.child.firstName}`
      : undefined;

    const tournament = payment.tournamentRegistrations?.[0]?.tournament;
    const src = deriveSource({
      productBillingTiming: payment.product?.billingTiming,
      hasMonthlyBillingLine: (payment.monthlyBillingLines?.length ?? 0) > 0,
      tournamentBillingMode: tournament?.billingMode ?? null,
    });
    // 대회 결제는 상품 연결이 없어 상품명이 비어 있다 — 배지(대회)와 어긋나지 않게 대회명으로 채운다.
    //   빈 문자열 상품명도 폴백 대상이다(?? 는 ""를 통과시켜 영수증 상품명이 공란이 된다).
    const productName =
      payment.product?.productName?.trim() ||
      (tournament ? `${tournament.name} 참가비` : "수업 결제");

    return {
      receipt: {
        // 다운로드/조회 엔드포인트가 Payment.id 로 조회하므로 receipt.id 는 항상 결제 ID.
        id: payment.id,
        orderNumber: payment.orderNumber,
        status: payment.paymentStatus,
        storeName: "TEAMPLUS",
        paymentDate: formatDate(payment.completedAt ?? payment.createdAt),
        paymentMethod: payment.paymentMethod ?? "card",
        productName,
        totalAmount: Number(payment.amount),
        creditsIssued,
        // enrollment 있을 때만 수업명·자녀명 반환 (없으면 undefined → 프론트 조건부 렌더)
        className: enrollment?.class?.className ?? undefined,
        childName: childFullName,
        // 파생 append (Dual Emit) — 무관계 결제는 null
        sourceType: src.sourceType,
        billingTiming: src.billingTiming,
        // 과세 구분 — 면세 거래는 taxable=false·taxAmount=0. 화면은 이 값으로 부가세
        //   표기 여부를 결정해야 한다(면세 매출에 부가세를 찍으면 거짓 세액 고지).
        taxable: taxInfo?.taxable ?? null,
        taxAmount: taxInfo?.taxAmount ?? null,
      },
    };
  }

  /**
   * 영수증 생성 (멱등: 이미 존재하면 기존 반환)
   * receiptNumber = YYYYMMDD-NNNNN 형식
   *
   * receiptUrl(토스 호스팅 영수증 URL)이 주어지면 함께 저장한다.
   * 이미 영수증이 있고 URL 만 비어있는 경우엔 URL 만 보충 업데이트한다.
   */
  async createReceipt(paymentId: string, receiptUrl?: string | null) {
    // 결제 존재 및 상태 확인
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        paymentStatus: true,
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            issuedAt: true,
            taxable: true,
            taxAmount: true,
            receiptUrl: true,
          },
        },
        // 과세/면세 판정용 출처 신호 — getReceipt 와 동일한 파생 규칙(N+1 방지 take:1).
        product: { select: { billingTiming: true } },
        tournamentRegistrations: {
          select: { tournament: { select: { billingMode: true } } },
          take: 1,
        },
        monthlyBillingLines: { select: { id: true }, take: 1 },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }

    if (payment.paymentStatus !== "completed") {
      throw new BadRequestException(
        "완료된 결제에 대해서만 영수증을 발급할 수 있습니다.",
      );
    }

    // 멱등성: 이미 영수증이 있으면 기존 반환.
    //   단, 영수증 URL 이 비어있고 새 URL 이 주어지면 URL 만 보충 업데이트.
    if (payment.receipt) {
      if (receiptUrl && !payment.receipt.receiptUrl) {
        return this.prisma.paymentReceipt.update({
          where: { paymentId },
          data: { receiptUrl },
          select: {
            id: true,
            paymentId: true,
            receiptNumber: true,
            issuedAt: true,
            taxable: true,
            taxAmount: true,
            receiptUrl: true,
            createdAt: true,
          },
        });
      }
      return payment.receipt;
    }

    // receiptNumber 생성: YYYYMMDD-NNNNN
    const now = new Date();
    const dateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");

    // 오늘 발행된 영수증 수 조회 (시퀀스 번호 산출)
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayCount = await this.prisma.paymentReceipt.count({
      where: {
        issuedAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    const receiptNumber = `${dateStr}-${String(todayCount + 1).padStart(5, "0")}`;

    // 과세 구분 + 부가세 — 면세 거래에는 역산을 적용하지 않는다(거짓 세액 고지 방지).
    const src = deriveSource({
      productBillingTiming: payment.product?.billingTiming,
      hasMonthlyBillingLine: (payment.monthlyBillingLines?.length ?? 0) > 0,
      tournamentBillingMode:
        payment.tournamentRegistrations?.[0]?.tournament?.billingMode ?? null,
    });
    const { taxable, taxAmount } = resolveReceiptTax(
      src.sourceType,
      Number(payment.amount),
    );

    const receipt = await this.prisma.paymentReceipt.create({
      data: {
        paymentId,
        receiptNumber,
        taxable,
        taxAmount,
        receiptUrl: receiptUrl ?? null,
      },
      select: {
        id: true,
        paymentId: true,
        receiptNumber: true,
        issuedAt: true,
        taxable: true,
        taxAmount: true,
        receiptUrl: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `영수증 생성 완료: paymentId=${paymentId}, receiptNumber=${receiptNumber}`,
    );

    return receipt;
  }
}
