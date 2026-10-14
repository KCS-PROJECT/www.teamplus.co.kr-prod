import { Prisma, SettlementDetailStatus } from "@prisma/client";
import { kstTodayUtcMidnight } from "@/common/utils/kst-date.util";
import { SETTLEMENT_STATUS } from "../constants/settlement-status.constant";

/** 지급 완료 시 정산 행에 남기는 계좌 스냅샷 — 계좌번호는 암호문 그대로. */
export interface PaidAccountSnapshot {
  bankName: string;
  bankAccount: string;
  accountHolder: string;
}

/**
 * 정산을 지급 완료(paid)로 바꾸고 명세·거래 기록을 함께 남긴다 — 수동 지급과 나이스 지급 결과가 같은 기록을 갖도록
 * 한 곳에서 처리한다. 반드시 팀 advisory lock 을 잡은 트랜잭션 안에서, 상태 조건(expectedFrom)이 맞을 때만 바꾼다.
 * 바뀐 행이 없으면 false — 호출하는 쪽이 현재 상태를 읽어 안내한다.
 */
export async function markSettlementPaidInTx(
  tx: Prisma.TransactionClient,
  input: {
    settlementId: string;
    expectedFrom: readonly string[];
    extraWhere?: Prisma.SettlementWhereInput;
    account: PaidAccountSnapshot | null;
    description: string;
  },
): Promise<boolean> {
  const updated = await tx.settlement.updateMany({
    where: {
      id: input.settlementId,
      status: { in: [...input.expectedFrom] },
      ...(input.extraWhere ?? {}),
    },
    data: {
      status: SETTLEMENT_STATUS.PAID,
      completedAt: new Date(),
      ...(input.account
        ? {
            bankName: input.account.bankName,
            bankAccount: input.account.bankAccount,
            accountHolder: input.account.accountHolder,
          }
        : {}),
    },
  });
  if (updated.count === 0) return false;

  const settlement = await tx.settlement.findUniqueOrThrow({
    where: { id: input.settlementId },
    select: { netAmount: true },
  });
  await tx.settlementDetail.updateMany({
    where: { settlementId: input.settlementId },
    data: { status: SettlementDetailStatus.PAID },
  });
  await tx.settlementTransaction.create({
    data: {
      settlementId: input.settlementId,
      transactionType: "payout",
      amount: settlement.netAmount,
      description: input.description,
      // @db.Date — KST 달력일. completedAt(instant)의 UTC 날짜부를 쓰면 KST 심야(00~09시) 완료 건이 전일로 기록됨.
      transactionDate: kstTodayUtcMidnight(),
    },
  });
  return true;
}
