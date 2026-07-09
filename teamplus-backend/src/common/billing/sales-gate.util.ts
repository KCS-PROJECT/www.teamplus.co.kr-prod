import { BadRequestException } from "@nestjs/common";
import {
  deriveClassLifecycle,
  type ClassLifecycleResult,
} from "@/common/utils/class-lifecycle.util";

/**
 * [Lifecycle v4.1 §9.4] 판매 게이트 — 대기/종료 수업의 수강신청·결제 서버 차단.
 *
 * 프론트 숨김은 1차 방어일 뿐이며(직접 API 호출·화면 race 우회 가능),
 * 본 가드가 최종 집행 지점이다. 삽입 위치:
 *  - enrollments.createEnrollment (수강신청 생성)
 *  - payment-create.initiatePayment (결제 생성)
 * mockPay 는 기존 enrollment 대상이라 별도 삽입 불요 (신규 enrollment 가 차단되면 자연 커버).
 */

/** deriveClassLifecycle 입력을 만들 수 있는 최소 Prisma 클라이언트 표면. */
type PrismaLike = {
  class: {
    findUnique(args: {
      where: { id: string };
      select: {
        endedAt: true;
        salesOpenMonth: true;
        trainingType: true;
        schedules: {
          where: { isCancelled: false };
          select: { scheduledDate: true };
        };
      };
    }): Promise<{
      endedAt: Date | null;
      salesOpenMonth: Date | null;
      trainingType: string | null;
      schedules: Array<{ scheduledDate: Date }>;
    } | null>;
  };
};

export const SALES_GATE_MESSAGES = {
  PENDING:
    "지금은 수강 신청·결제가 가능한 기간이 아닙니다. 다음 일정 준비 중입니다.",
  ENDED: "종료된 수업입니다.",
} as const;

/**
 * 수업이 판매 중(ON_SALE)이 아니면 400 을 던진다. 판매 중이면 파생 결과를 반환
 * (호출부가 승인월 등 추가 검증에 재사용 가능).
 */
export async function assertClassOnSale(
  prisma: PrismaLike,
  classId: string,
): Promise<ClassLifecycleResult> {
  const klass = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      endedAt: true,
      salesOpenMonth: true,
      trainingType: true,
      schedules: {
        where: { isCancelled: false },
        select: { scheduledDate: true },
      },
    },
  });
  if (!klass) {
    throw new BadRequestException("수업 정보를 찾을 수 없습니다.");
  }
  const lifecycle = deriveClassLifecycle(klass);
  if (lifecycle.state === "ENDED") {
    throw new BadRequestException(SALES_GATE_MESSAGES.ENDED);
  }
  if (lifecycle.state === "PENDING_SCHEDULE") {
    throw new BadRequestException(SALES_GATE_MESSAGES.PENDING);
  }
  return lifecycle;
}

/**
 * [Lifecycle v4.1 §9.2] 판매 노출 필터 — 학부모행 응답의 상품 목록에서
 * "지난/미래 월분" 월별 패키지를 숨긴다.
 *  - billingMonth null(무월 레거시) → 노출 (점진 전환 폴백)
 *  - billingMonth == salesOpenMonth → 노출 (현재 판매 월분)
 *  - 그 외 → 제외
 * 감독 관리용 목록(GET /classes/:classId/products)에는 적용하지 않는다 — 이력 확인용 전체 유지.
 */
export function filterSellableProducts<
  T extends { billingMonth?: Date | null },
>(products: T[], salesOpenMonth: Date | null | undefined): T[] {
  return products.filter(
    (p) =>
      !p.billingMonth ||
      (salesOpenMonth != null &&
        p.billingMonth.getTime() === salesOpenMonth.getTime()),
  );
}
