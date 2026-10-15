import { needsAttention } from "./payout-request-view.util";

describe("payout-request-view.util needsAttention", () => {
  const TODAY = new Date("2026-10-15T00:00:00.000Z");
  const base = {
    status: "REQUESTED",
    settlementDate: TODAY,
    needsReview: false,
  };

  it("진행 중이고 확인 필요가 켜졌으면 주의", () => {
    expect(needsAttention({ ...base, needsReview: true }, TODAY)).toBe(true);
  });

  it("진행 중인데 지급일이 지났으면 주의", () => {
    expect(
      needsAttention(
        { ...base, settlementDate: new Date("2026-10-14T00:00:00.000Z") },
        TODAY,
      ),
    ).toBe(true);
  });

  it("지급일 당일에 아직 끝나지 않은 것은 확인 횟수와 무관하게 주의가 아니다 — 결과 배치가 하루 여러 번 돈다", () => {
    expect(needsAttention(base, TODAY)).toBe(false);
  });

  it("끝난 요청은 주의가 아니다", () => {
    expect(
      needsAttention({ ...base, status: "FAILED", needsReview: true }, TODAY),
    ).toBe(false);
  });
});
