import { BadRequestException } from "@nestjs/common";

/**
 * Settlement.status 값 SoT. DB 컬럼은 Prisma String(마이그레이션 없이 값 확장 가능)이라
 * 여기 정의가 유효 상태의 유일한 출처다 — QuerySettlementDto 필터도 이 값에서 파생한다.
 */
export const SETTLEMENT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  PROCESSING: "processing",
  PAID: "paid",
  FAILED: "failed",
  REJECTED: "rejected",
} as const;

export type SettlementStatus =
  (typeof SETTLEMENT_STATUS)[keyof typeof SETTLEMENT_STATUS];

export const SETTLEMENT_STATUS_VALUES = Object.values(
  SETTLEMENT_STATUS,
) as SettlementStatus[];

/**
 * 상태 전이표.
 *  - pending → approved(승인) | rejected(반려)
 *  - approved → paid(지급, Phase 1 직접 전이) | processing(후속 단계 예약 — Phase 1 서비스는 호출 안 함)
 *  - processing → paid | failed / failed → processing (후속 단계 예약)
 *  - paid 종결 상태
 *  - rejected → pending 은 **마감 생성기 전용** 전이다(SettlementCloseService 가 재마감 시
 *    재계산 대상으로 되돌릴 때만 사용) — approve/reject/payout 등 일반 API 는 이 전이를
 *    호출하지 않는다(반려 후 재승인 요청은 재마감을 거쳐야 함).
 */
const TRANSITIONS: Record<SettlementStatus, readonly SettlementStatus[]> = {
  [SETTLEMENT_STATUS.PENDING]: [
    SETTLEMENT_STATUS.APPROVED,
    SETTLEMENT_STATUS.REJECTED,
  ],
  [SETTLEMENT_STATUS.APPROVED]: [
    SETTLEMENT_STATUS.PAID,
    SETTLEMENT_STATUS.PROCESSING,
  ],
  [SETTLEMENT_STATUS.PROCESSING]: [
    SETTLEMENT_STATUS.PAID,
    SETTLEMENT_STATUS.FAILED,
  ],
  [SETTLEMENT_STATUS.FAILED]: [SETTLEMENT_STATUS.PROCESSING],
  [SETTLEMENT_STATUS.PAID]: [],
  [SETTLEMENT_STATUS.REJECTED]: [SETTLEMENT_STATUS.PENDING],
};

/** 액션 라벨(에러 메시지 표시용) — 목표 상태 기준. */
const ACTION_LABELS: Partial<Record<SettlementStatus, string>> = {
  [SETTLEMENT_STATUS.APPROVED]: "승인",
  [SETTLEMENT_STATUS.REJECTED]: "반려",
  [SETTLEMENT_STATUS.PAID]: "지급",
  [SETTLEMENT_STATUS.PROCESSING]: "후속 처리 전환",
  [SETTLEMENT_STATUS.FAILED]: "실패 처리",
};

export function canTransition(from: string, to: SettlementStatus): boolean {
  const allowed = TRANSITIONS[from as SettlementStatus];
  return Boolean(allowed?.includes(to));
}

/** 위반 시 400 — 메시지는 목표 상태(to)의 동작 라벨을 사용한다. */
export function assertTransition(from: string, to: SettlementStatus): void {
  if (canTransition(from, to)) return;
  const label = ACTION_LABELS[to] ?? to;
  throw new BadRequestException(
    `현재 상태(${from})에서는 ${label}할 수 없습니다.`,
  );
}
