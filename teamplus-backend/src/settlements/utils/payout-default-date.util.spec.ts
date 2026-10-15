import { computeDefaultPayDate } from "./payout-default-date.util";

/** KST 벽시계 성분 — 2026-10-13 은 화요일. */
const at = (
  year: string,
  month: string,
  day: string,
  hour = "09",
  minute = "00",
) => ({ year, month, day, hour, minute });

describe("computeDefaultPayDate", () => {
  it("이번 달 N일이 아직 안 지났으면 이번 달 N일", () => {
    expect(computeDefaultPayDate(15, at("2026", "10", "13"))).toBe(
      "2026-10-15",
    );
  });

  it("오늘이 N일이면 10:30 전에는 오늘, 이후에는 다음 달", () => {
    expect(computeDefaultPayDate(13, at("2026", "10", "13", "10", "29"))).toBe(
      "2026-10-13",
    );
    expect(computeDefaultPayDate(13, at("2026", "10", "13", "10", "30"))).toBe(
      "2026-11-13",
    );
  });

  it("이번 달 N일이 지났으면 다음 달 N일", () => {
    expect(computeDefaultPayDate(5, at("2026", "10", "13"))).toBe("2026-11-05");
  });

  it("주말이면 다음 평일로 미룬다 (2026-11-15 일요일 → 11-16 월요일)", () => {
    expect(computeDefaultPayDate(15, at("2026", "11", "02"))).toBe(
      "2026-11-16",
    );
  });

  it("29~31일은 짧은 달에서 말일이 된다", () => {
    // 2027-02 은 28일까지. 2027-02-28 은 일요일 → 3월 1일 월요일.
    expect(computeDefaultPayDate(31, at("2027", "02", "03"))).toBe(
      "2027-03-01",
    );
    // 2026-11 은 30일까지, 11-30 은 월요일.
    expect(computeDefaultPayDate(31, at("2026", "11", "03"))).toBe(
      "2026-11-30",
    );
  });

  it("주말을 미루면 오늘부터 31일을 넘기는 경우 앞 평일로 당긴다", () => {
    // 2026-07-31(금) 10:30 이후 → 8-31(월)이라 31일 안. 다른 예: 2027-01-31(일) 11시 → 2-28(일) → 미루면 3-1 = 29일. 상한 안.
    // 상한을 넘기는 예: 2026-10-01(목) 11시, N=1 → 2026-11-01(일) → 미루면 11-02 = 32일 → 당겨서 10-30(금).
    expect(computeDefaultPayDate(1, at("2026", "10", "01", "11", "00"))).toBe(
      "2026-10-30",
    );
  });

  it("범위 밖 N 은 1~31 로 자른다", () => {
    expect(computeDefaultPayDate(0, at("2026", "10", "13"))).toBe("2026-11-02");
    // 31 → 10-31(토) → 다음 평일 11-02(월), 오늘부터 20일이라 상한 안.
    expect(computeDefaultPayDate(99, at("2026", "10", "13"))).toBe(
      "2026-11-02",
    );
  });
});
