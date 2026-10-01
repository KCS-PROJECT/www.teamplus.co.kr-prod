import { BadRequestException } from "@nestjs/common";
import { assertNicePayDate } from "./nice-pay-date.util";

describe("assertNicePayDate", () => {
  /** KST 벽시계 시각으로 "지금"을 고정한다(2026-10-05 는 월요일). */
  const setKstNow = (iso: string) => {
    jest.spyOn(Date, "now").mockReturnValue(new Date(`${iso}+09:00`).getTime());
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const expectInvalid = (payDate: string) => {
    try {
      assertNicePayDate(payDate);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errorCode: "PAYOUT_DATE_INVALID",
      });
      return;
    }
    throw new Error(`${payDate} 가 통과했다`);
  };

  it("평일 미래 날짜는 나이스 양식(YYYYMMDD)으로 돌려준다", () => {
    setKstNow("2026-10-05T09:00:00");
    expect(assertNicePayDate("2026-10-06")).toBe("20261006");
  });

  it("오늘은 10:30 전까지만 된다", () => {
    setKstNow("2026-10-05T10:29:00");
    expect(assertNicePayDate("2026-10-05")).toBe("20261005");

    setKstNow("2026-10-05T10:30:00");
    expectInvalid("2026-10-05");
  });

  it("KST 자정 직후에도 KST 날짜로 오늘을 판단한다", () => {
    // UTC 로는 아직 10-04 이지만 KST 는 10-05 00:30 이다.
    setKstNow("2026-10-05T00:30:00");
    expect(assertNicePayDate("2026-10-05")).toBe("20261005");
    expectInvalid("2026-10-04");
  });

  it("지난 날·주말·없는 날짜·형식 오류·한 달 초과는 거절한다", () => {
    setKstNow("2026-10-05T09:00:00");
    expectInvalid("2026-10-02");
    expectInvalid("2026-10-10");
    expectInvalid("2026-10-11");
    expectInvalid("2026-02-30");
    expectInvalid("20261006");
    expectInvalid("2026-11-06");
    expect(assertNicePayDate("2026-11-05")).toBe("20261105");
  });
});
