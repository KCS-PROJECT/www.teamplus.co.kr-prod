import * as crypto from "crypto";
import { buildPayoutEncKey, buildPayoutTrDtm } from "./nice-payout-crypto.util";

describe("nice-payout-crypto.util", () => {
  it("encKey = hex(sha256(sid + mid + trDtm + merchantKey))", () => {
    const expected = crypto
      .createHash("sha256")
      .update("0101001nictest00m20190619163525dummy-key", "utf8")
      .digest("hex");
    expect(
      buildPayoutEncKey("0101001", "nictest00m", "20190619163525", "dummy-key"),
    ).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it("trDtm 은 KST 벽시계 — UTC 15:00 은 다음날 00시", () => {
    expect(buildPayoutTrDtm(new Date(Date.UTC(2026, 8, 30, 15, 0, 5)))).toBe(
      "20261001000005",
    );
  });

  it("trDtm 월말·연말 경계", () => {
    expect(buildPayoutTrDtm(new Date(Date.UTC(2026, 11, 31, 16, 7, 9)))).toBe(
      "20270101010709",
    );
    expect(buildPayoutTrDtm(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe(
      "20260102120405",
    );
  });
});
