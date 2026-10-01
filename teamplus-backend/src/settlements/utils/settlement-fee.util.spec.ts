import { calcFee } from "./settlement-fee.util";

describe("calcFee", () => {
  it.each([
    [10000, 0.011, 110],
    [10000, 0.03, 300],
    [3000, 0.03, 90],
    [10015, 0.033, 330],
    [200000, 0.011, 2200],
    [0, 0.011, 0],
    [10000, 0, 0],
  ])("%d원 × %d → %d원", (amount, rate, expected) => {
    expect(calcFee(amount, rate)).toBe(expected);
  });

  it("x.5 경계는 부동소수 오차 없이 올림한다", () => {
    // 11500 × 0.011 = 126.5 — 그대로 곱하면 126.49999… 가 되어 126 으로 떨어진다.
    expect(Math.round(11500 * 0.011)).toBe(126);
    expect(calcFee(11500, 0.011)).toBe(127);
    expect(calcFee(500, 0.033)).toBe(17);
  });

  it("건별 반올림이라 합산 반올림과 다를 수 있다", () => {
    const perItem = calcFee(10015, 0.033) * 3;
    expect(perItem).toBe(990);
    expect(calcFee(10015 * 3, 0.033)).toBe(991);
  });
});
