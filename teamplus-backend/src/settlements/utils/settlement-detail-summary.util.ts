import { SettlementEntryType, SettlementSourceType } from "@prisma/client";

export interface SettlementDetailSummaryInput {
  entryType: SettlementEntryType;
  sourceType: SettlementSourceType;
  sourceId: string | null;
  productName: string;
  paymentAmount: number;
  feeAmount: number;
  actualAmount: number;
}

export interface SettlementDetailSummaryGroup {
  sourceType: SettlementSourceType;
  sourceId: string | null;
  name: string;
  paymentCount: number;
  paymentAmount: number;
  refundCount: number;
  /** 환불 금액 합계(양수) — Settlement.refundAmount 규약과 같다. */
  refundAmount: number;
  /** 수수료 합계(환불 환급분 상계 후). */
  feeAmount: number;
  /** 실지급액 합계. */
  netAmount: number;
}

type SummaryTotals = Omit<
  SettlementDetailSummaryGroup,
  "sourceType" | "sourceId" | "name"
>;

/**
 * 명세 행을 출처(수업·대회)별로 묶는다. sourceId 가 없는 행(OTHER 등)은 같은 종류 안에서
 * 상품명으로 묶는다 — 건별 드릴다운 필터(buildDetailsWhere)와 같은 규칙이다.
 * rows 는 최신순이어야 한다 — 그룹 이름은 처음 만난(가장 최근) 행의 상품명이다.
 */
export function aggregateDetailsBySource(
  rows: readonly SettlementDetailSummaryInput[],
): {
  data: SettlementDetailSummaryGroup[];
  meta: { groupCount: number; totals: SummaryTotals };
} {
  const groups = new Map<string, SettlementDetailSummaryGroup>();
  const totals: SummaryTotals = {
    paymentCount: 0,
    paymentAmount: 0,
    refundCount: 0,
    refundAmount: 0,
    feeAmount: 0,
    netAmount: 0,
  };

  for (const row of rows) {
    const key = row.sourceId
      ? `${row.sourceType}:id:${row.sourceId}`
      : `${row.sourceType}:name:${row.productName}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        name: row.productName,
        paymentCount: 0,
        paymentAmount: 0,
        refundCount: 0,
        refundAmount: 0,
        feeAmount: 0,
        netAmount: 0,
      };
      groups.set(key, group);
    }

    for (const target of [group, totals]) {
      if (row.entryType === SettlementEntryType.REFUND) {
        target.refundCount++;
        target.refundAmount += -row.paymentAmount;
      } else {
        target.paymentCount++;
        target.paymentAmount += row.paymentAmount;
      }
      target.feeAmount += row.feeAmount;
      target.netAmount += row.actualAmount;
    }
  }

  const data = [...groups.values()].sort(
    (a, b) => b.netAmount - a.netAmount || a.name.localeCompare(b.name, "ko"),
  );

  return { data, meta: { groupCount: data.length, totals } };
}
