import {
  ACTIVE_PAYOUT_REQUEST_STATUSES,
  PAYOUT_REQUEST_STATUS,
  classifyNiceStatusNm,
  isActivePayoutRequestStatus,
} from "./payout-request-status.constant";

describe("payout-request-status.constant", () => {
  it("진행 중 상태는 REQUESTING·REQUESTED·UNCONFIRMED 셋뿐이다(DB 부분 유니크 인덱스 조건과 동일)", () => {
    expect([...ACTIVE_PAYOUT_REQUEST_STATUSES].sort()).toEqual(
      ["REQUESTED", "REQUESTING", "UNCONFIRMED"].sort(),
    );
    for (const status of Object.values(PAYOUT_REQUEST_STATUS)) {
      expect(isActivePayoutRequestStatus(status)).toBe(
        ACTIVE_PAYOUT_REQUEST_STATUSES.includes(status),
      );
    }
  });

  it("나이스 상태 원문을 분류한다(공백 무시)", () => {
    expect(classifyNiceStatusNm("성공")).toBe("SUCCEEDED");
    expect(classifyNiceStatusNm(" 실패 ")).toBe("FAILED");
    expect(classifyNiceStatusNm("삭제")).toBe("CANCELLED");
    expect(classifyNiceStatusNm("요청")).toBe("PENDING");
    expect(classifyNiceStatusNm("재요청 진행중")).toBe("PENDING");
    expect(classifyNiceStatusNm("확인중")).toBe("UNKNOWN");
  });
});
