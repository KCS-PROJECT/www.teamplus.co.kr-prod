import {
  classifyPayoutFileAccount,
  resolveNiceAction,
} from "./nice-account-state.util";

describe("nice-account-state.util", () => {
  it("서브몰 ID 가 없으면 상태와 무관하게 나이스 등록 대상이다", () => {
    for (const status of ["SUBMITTED", "FAILED", "REGISTERED"] as const) {
      expect(resolveNiceAction({ status, subMallId: null })).toBe("REGISTER");
    }
  });

  it("서브몰 ID 가 있으면 등록 완료일 때만 할 일이 없고, 아니면 나이스에서 수정한다", () => {
    expect(
      resolveNiceAction({ status: "REGISTERED", subMallId: "team-1" }),
    ).toBe("NONE");
    expect(
      resolveNiceAction({ status: "SUBMITTED", subMallId: "team-1" }),
    ).toBe("UPDATE");
    expect(resolveNiceAction({ status: "FAILED", subMallId: "team-1" })).toBe(
      "UPDATE",
    );
  });

  it("지급 엑셀에는 등록 완료이고 서브몰 ID 가 있는 계좌만 들어간다", () => {
    const account = (
      status: "SUBMITTED" | "FAILED" | "REGISTERED",
      subMallId: string | null,
      registrationInProgress = false,
    ) => ({ status, subMallId, registrationInProgress });
    const reasonOf = (input: ReturnType<typeof account> | null) =>
      classifyPayoutFileAccount(input).exclusion;

    expect(classifyPayoutFileAccount(account("REGISTERED", "team-1"))).toEqual({
      exclusion: null,
      subMallId: "team-1",
    });
    expect(reasonOf(null)).toBe("ACCOUNT_NONE");
    expect(reasonOf(account("SUBMITTED", "team-1"))).toBe("ACCOUNT_CHANGED");
    expect(reasonOf(account("FAILED", "team-1"))).toBe("ACCOUNT_CHANGED");
    expect(reasonOf(account("REGISTERED", null))).toBe("SUB_ID_MISSING");
    expect(reasonOf(account("SUBMITTED", null))).toBe("NOT_REGISTERED");
    expect(reasonOf(account("REGISTERED", "team-1", true))).toBe("IN_PROGRESS");
  });
});
