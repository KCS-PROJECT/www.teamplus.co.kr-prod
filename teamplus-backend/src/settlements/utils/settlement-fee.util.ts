const RATE_SCALE = 1e4;

/**
 * 건별 수수료(원 단위 반올림). 요율을 0.01% 단위 정수로 바꿔 곱한다 —
 * `11500 × 0.011` 처럼 x.5 경계에서 부동소수 오차(126.4999…)로 반올림이 내려가지 않게 한다.
 */
export function calcFee(amount: number, rate: number): number {
  return Math.round((amount * Math.round(rate * RATE_SCALE)) / RATE_SCALE);
}
