import {
  classifyPayoutCancelBlock,
  isPayoutRequestCancelable,
  needsAttention,
} from "./payout-request-view.util";

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

describe("payout-request-view.util isPayoutRequestCancelable", () => {
  const PAY_DATE = new Date("2026-10-15T00:00:00.000Z");
  const before = {
    year: "2026",
    month: "10",
    day: "15",
    hour: "10",
    minute: "29",
  };
  const after = { ...before, minute: "30" };
  const row = {
    status: "REQUESTED",
    niceSeq: "SEQ001",
    needsReview: false,
    settlementDate: PAY_DATE,
  };

  it("접수번호가 있는 접수 건은 지급일 10:30 전까지 취소할 수 있다", () => {
    expect(isPayoutRequestCancelable(row, before)).toBe(true);
    expect(isPayoutRequestCancelable(row, after)).toBe(false);
  });

  it("접수번호가 없거나, 응답 미확인이거나, 확인 필요면 취소할 수 없다", () => {
    expect(isPayoutRequestCancelable({ ...row, niceSeq: null }, before)).toBe(
      false,
    );
    expect(
      isPayoutRequestCancelable({ ...row, status: "UNCONFIRMED" }, before),
    ).toBe(false);
    expect(
      isPayoutRequestCancelable({ ...row, needsReview: true }, before),
    ).toBe(false);
  });

  it("막는 이유는 접수 아님 → 확인 필요 → 마감 순으로 하나만 돌려주고, 없으면 접수번호를 준다", () => {
    expect(classifyPayoutCancelBlock(row, before)).toEqual({
      reason: null,
      niceSeq: "SEQ001",
    });
    expect(
      classifyPayoutCancelBlock(
        { ...row, niceSeq: null, needsReview: true },
        before,
      ).reason,
    ).toBe("NO_REQUEST");
    expect(
      classifyPayoutCancelBlock({ ...row, needsReview: true }, after).reason,
    ).toBe("REVIEW_OPEN");
    expect(classifyPayoutCancelBlock(row, after).reason).toBe("CUTOFF_PASSED");
  });
});
