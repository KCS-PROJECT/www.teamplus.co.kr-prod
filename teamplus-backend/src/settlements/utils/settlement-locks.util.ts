/**
 * 정산 마감 advisory lock 헬퍼 — 팀 단위 직렬화.
 *
 * 같은 팀의 월 마감 재실행(재마감)·승인·지급이 동시에 끼어드는 경쟁을 막는다.
 * pg_advisory_xact_lock 은 트랜잭션 종료 시 자동 해제 — 반드시 $transaction 안에서,
 * 다른 조회·쓰기보다 먼저(tx 선두) 호출한다 (class-locks.util.ts 와 동일 패턴).
 */

import { Prisma } from "@prisma/client";

const SETTLEMENT_CLOSE_LOCK_PREFIX = "settlement-close:";

type LockableTx = Pick<Prisma.TransactionClient, "$queryRaw">;

async function acquireAdvisoryLock(tx: LockableTx, key: string): Promise<void> {
  // pg_advisory_xact_lock 은 void 반환 — Prisma 가 역직렬화 못 하므로 ::text 캐스팅 필수.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}

/** 팀 단위 정산 마감 lock. tx 선두에서 호출. */
export async function acquireSettlementCloseLock(
  tx: LockableTx,
  teamId: string,
): Promise<void> {
  await acquireAdvisoryLock(tx, `${SETTLEMENT_CLOSE_LOCK_PREFIX}${teamId}`);
}
