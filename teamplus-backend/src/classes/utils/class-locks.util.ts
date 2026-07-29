/**
 * 수업 단위 advisory lock 헬퍼 — 단일 SoT.
 *
 * 두 lock 의 역할 (설계 §4-0):
 *   - sales lock (`class-sales:{classId}`):
 *       [판매 시작](openSales) ↔ MONTHLY_FIXED 수정·생성·삭제 경계 직렬화.
 *       수정 가드가 읽은 salesOpenMonth 와 커밋 시점 값이 달라지는 레이스 차단.
 *   - postpaid lock (`class-postpaid:{classId}`):
 *       후불 단가 수정 ↔ present 출석 기록 ↔ 정산 확정 직렬화 (무소급 보장).
 *
 * 사용 계약:
 *   - pg_advisory_xact_lock 은 트랜잭션 종료 시 자동 해제 — 반드시 $transaction
 *     안에서, 다른 조회·쓰기보다 먼저(tx 선두) 호출한다.
 *   - 두 lock 이 모두 필요한 트랜잭션(BOTH 수업의 bulk/reconcile)은 개별 획득 금지 —
 *     acquireClassSalesAndPostpaidLocks 로만 획득한다 (sales → postpaid 고정 순서,
 *     역순 획득 조합의 deadlock 방지).
 *   - postpaid lock 은 billingMode POSTPAID/BOTH 수업만 대상 —
 *     shouldUsePostpaidLock 로 판정해 PREPAID 수업(다수) 출석 경로 영향 0 유지.
 */

import { Prisma } from "@prisma/client";

const SALES_LOCK_PREFIX = "class-sales:";
const POSTPAID_LOCK_PREFIX = "class-postpaid:";
const SEAT_LOCK_PREFIX = "class-seats:";

type LockableTx = Pick<Prisma.TransactionClient, "$queryRaw">;

async function acquireAdvisoryLock(tx: LockableTx, key: string): Promise<void> {
  // pg_advisory_xact_lock 은 void 반환 — Prisma 는 void 컬럼을 역직렬화하지 못해
  //   P2010(Failed to deserialize column of type 'void')로 죽는다. ::text 캐스팅 필수.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}

/** 판매 시작 ↔ 상품 변경 직렬화 lock. tx 선두에서 호출. */
export async function acquireClassSalesLock(
  tx: LockableTx,
  classId: string,
): Promise<void> {
  await acquireAdvisoryLock(tx, `${SALES_LOCK_PREFIX}${classId}`);
}

/**
 * 좌석(정원) 선점 직렬화 lock — 결제 승인(캡처) 직전 "active 카운트 + 선점"을 원자화.
 *  마지막 1자리 동시 confirm 이 둘 다 통과하는 race 차단. tx 선두에서 호출.
 *  ⚠️ 단독 사용 전용 — sales/postpaid lock 과 같은 트랜잭션에서 조합 획득 금지
 *  (조합이 필요해지면 고정 순서 규약을 먼저 정의할 것).
 */
export async function acquireClassSeatLock(
  tx: LockableTx,
  classId: string,
): Promise<void> {
  await acquireAdvisoryLock(tx, `${SEAT_LOCK_PREFIX}${classId}`);
}

/** 후불 단가 ↔ 출석 ↔ 정산 직렬화 lock. tx 선두에서 호출. */
export async function acquireClassPostpaidLock(
  tx: LockableTx,
  classId: string,
): Promise<void> {
  await acquireAdvisoryLock(tx, `${POSTPAID_LOCK_PREFIX}${classId}`);
}

/**
 * 두 lock 동시 획득 — sales → postpaid 고정 순서 강제.
 * 양쪽이 필요한 트랜잭션은 반드시 이 함수만 사용한다.
 */
export async function acquireClassSalesAndPostpaidLocks(
  tx: LockableTx,
  classId: string,
): Promise<void> {
  await acquireClassSalesLock(tx, classId);
  await acquireClassPostpaidLock(tx, classId);
}

/** postpaid lock 대상 수업 판정 — PREPAID 수업은 lock 없이 기존 동작 유지. */
export function shouldUsePostpaidLock(
  billingMode: string | null | undefined,
): boolean {
  return billingMode === "POSTPAID" || billingMode === "BOTH";
}

type LockableTxWithClass = LockableTx & {
  class: {
    findUnique(args: {
      where: { id: string };
      select: { billingMode: boolean };
    }): Promise<{ billingMode: string | null } | null>;
  };
};

/**
 * present 출석 writer 전용 — tx 안에서 billingMode 를 판정해 후불 대상 수업만
 * postpaid lock 을 획득한다. writer 가 개별적으로 billingMode 를 조회·판단하지
 * 않도록 판정을 내장 (설계 §4-0 B). billingMode 는 수정 불가 정책이라 판정 조회가
 * lock 앞이어도 안전. tx 선두(다른 쓰기 전)에서 호출한다.
 */
export async function acquireClassPostpaidLockIfNeeded(
  tx: LockableTxWithClass,
  classId: string,
): Promise<void> {
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: { billingMode: true },
  });
  if (shouldUsePostpaidLock(cls?.billingMode)) {
    await acquireClassPostpaidLock(tx, classId);
  }
}
