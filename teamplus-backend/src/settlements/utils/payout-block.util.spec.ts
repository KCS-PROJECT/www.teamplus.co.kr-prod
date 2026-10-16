import {
  classifyPayoutBlock,
  type PayoutBlockInput,
} from "./payout-block.util";

describe("classifyPayoutBlock", () => {
  const base: PayoutBlockInput = {
    status: "approved",
    netAmount: 100000,
    reviewReopened: false,
    reviewOpen: false,
    account: {
      status: "REGISTERED",
      subMallId: "SUB-1",
      registrationInProgress: false,
    },
  };

  it("지급 대기·지급 실패이고 계좌가 등록 완료면 서브ID 와 함께 통과한다", () => {
    expect(classifyPayoutBlock(base)).toEqual({
      reason: null,
      subMallId: "SUB-1",
    });
    expect(classifyPayoutBlock({ ...base, status: "failed" })).toEqual({
      reason: null,
      subMallId: "SUB-1",
    });
  });

  it("다른 상태는 상태 사유 — 지급 처리 중은 진행 중으로 나눈다", () => {
    expect(classifyPayoutBlock({ ...base, status: "processing" }).reason).toBe(
      "PAYOUT_IN_PROGRESS",
    );
    expect(classifyPayoutBlock({ ...base, status: "paid" }).reason).toBe(
      "NOT_PAYABLE_STATUS",
    );
  });

  it("확인 필요는 금액·계좌보다 먼저 — 실패 건 나이스 재진행은 따로 알린다", () => {
    expect(
      classifyPayoutBlock({
        ...base,
        reviewReopened: true,
        reviewOpen: true,
        account: null,
      }).reason,
    ).toBe("PAYOUT_REVIEW_REOPENED");
    expect(
      classifyPayoutBlock({ ...base, reviewOpen: true, netAmount: 0 }).reason,
    ).toBe("PAYOUT_REVIEW_OPEN");
  });

  it("0원 이하는 계좌보다 먼저", () => {
    expect(
      classifyPayoutBlock({ ...base, netAmount: 0, account: null }).reason,
    ).toBe("NET_NOT_POSITIVE");
  });

  it.each([
    ["계좌 없음", null, "ACCOUNT_NONE"],
    [
      "등록 처리 중",
      { status: "SUBMITTED", subMallId: null, registrationInProgress: true },
      "IN_PROGRESS",
    ],
    [
      "나이스 등록 전",
      { status: "SUBMITTED", subMallId: null, registrationInProgress: false },
      "NOT_REGISTERED",
    ],
    [
      "계좌 변경 뒤 재등록 전",
      {
        status: "SUBMITTED",
        subMallId: "SUB-1",
        registrationInProgress: false,
      },
      "ACCOUNT_CHANGED",
    ],
    [
      "등록 완료인데 서브ID 없음",
      { status: "REGISTERED", subMallId: null, registrationInProgress: false },
      "SUB_ID_MISSING",
    ],
  ] as const)("%s 이면 계좌 사유", (_label, account, reason) => {
    expect(classifyPayoutBlock({ ...base, account }).reason).toBe(reason);
  });
});
