/**
 * [B7] 결제 만료일(expiresAt) 계산 — KST(UTC+9) 기준.
 *
 * 서버 컨테이너가 UTC 로 동작할 때 `new Date(y, m+1, 0)`(로컬 TZ)로 월말을 구하면
 * 월 경계(예: KST 기준 1일 새벽 = UTC 전월 17시)에서 한 달 어긋난다.
 * confirmSettlement(postpaid-settlement.service.ts)의 KST 처리와 일관되도록 통일한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 주어진 시각(at)이 속한 "KST 달"의 말일 23:59:59.999(KST) 순간을 나타내는 Date(UTC instant) 반환.
 *   예) at = 2026-02-01 02:00 KST → 2026-02-28 23:59:59.999 KST 의 UTC 순간.
 */
export function endOfMonthKst(at: Date = new Date()): Date {
  // at 을 KST 벽시계로 환산(필드를 UTC 게터로 읽기 위해 오프셋 가산).
  const kstWall = new Date(at.getTime() + KST_OFFSET_MS);
  const y = kstWall.getUTCFullYear();
  const m = kstWall.getUTCMonth();
  // 다음 달 1일 00:00:00.000(KST 벽시계) - 1ms = 이번 달 말일 23:59:59.999(KST 벽시계).
  //   그 벽시계 ms 에서 KST 오프셋을 빼 실제 UTC instant 로 변환.
  const nextMonthFirstKstWallMs = Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
  return new Date(nextMonthFirstKstWallMs - 1 - KST_OFFSET_MS);
}

/**
 * [Lifecycle v4.1 §9.5] 귀속월(billingMonth, @db.Date=그 달 1일 UTC 자정) → 기간권 유효 창.
 *  - startsAt : 그 달 1일 00:00:00.000 KST 순간 (= billingMonth − 9h)
 *  - expiresAt: 그 달 말일 23:59:59.999 KST 순간 (endOfMonthKst — billingMonth 자체가
 *    KST 벽시계로 1일 09:00 이라 같은 달로 안전하게 해석된다)
 * 무월 레거시(billingMonth null) 상품은 이 함수를 쓰지 않고 현행 폴백
 * (결제일 달 endOfMonthKst · startsAt null)을 유지한다.
 */
export function monthlyPassWindow(billingMonth: Date): {
  startsAt: Date;
  expiresAt: Date;
} {
  return {
    startsAt: new Date(billingMonth.getTime() - KST_OFFSET_MS),
    expiresAt: endOfMonthKst(billingMonth),
  };
}
