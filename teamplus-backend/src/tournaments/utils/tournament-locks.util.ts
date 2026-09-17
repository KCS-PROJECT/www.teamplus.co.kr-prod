/**
 * 대회 후불 청구 advisory lock — `class-locks.util.ts` 패턴 SoT 준용.
 *
 * 대회 취소(applyTournamentCancellation) ↔ 결제요청 확정(confirmTournamentSettlement) ↔
 * 결제요청 취소(cancelTournamentSettlement) 세 경로가 같은 대회의 TournamentRegistration·
 * Payment 행을 동시에 갱신하지 못하도록 직렬화한다.
 *
 * pg_advisory_xact_lock 은 트랜잭션 종료 시 자동 해제 — 반드시 $transaction 안에서,
 * 다른 조회·쓰기보다 먼저(tx 선두) 호출한다.
 */

import { Prisma } from "@prisma/client";

const TOURNAMENT_BILLING_LOCK_PREFIX = "tournament-billing:";

type LockableTx = Pick<Prisma.TransactionClient, "$queryRaw">;

/** 대회 후불 청구 직렬화 lock. tx 선두에서 호출. */
export async function acquireTournamentBillingLock(
  tx: LockableTx,
  tournamentId: string,
): Promise<void> {
  const key = `${TOURNAMENT_BILLING_LOCK_PREFIX}${tournamentId}`;
  // pg_advisory_xact_lock 은 void 반환 — Prisma 는 void 컬럼을 역직렬화하지 못해
  //   P2010(Failed to deserialize column of type 'void')로 죽는다. ::text 캐스팅 필수.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}
