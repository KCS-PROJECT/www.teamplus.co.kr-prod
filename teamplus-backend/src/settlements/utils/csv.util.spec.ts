import { toCsvBuffer } from "./csv.util";

const parse = (buf: Buffer) =>
  buf.toString("utf-8").replace(/^﻿/, "").split("\n");

describe("toCsvBuffer", () => {
  it("BOM 을 앞에 붙인다", () => {
    const buf = toCsvBuffer(["a"], [["1"]]);
    expect(buf.toString("utf-8").startsWith("﻿")).toBe(true);
  });

  it("수식으로 시작하는 문자열 셀은 작은따옴표로 무해화한다", () => {
    const [, row] = parse(
      toCsvBuffer(["a", "b", "c", "d"], [["=SUM(A1)", "+1abc", "-x", "@cmd"]]),
    );
    expect(row).toBe("'=SUM(A1),'+1abc,'-x,'@cmd");
  });

  it("순수 정수(음수 금액 포함)는 숫자로 남긴다", () => {
    const [, row] = parse(
      toCsvBuffer(["a", "b", "c"], [["-5000", "0", "970000"]]),
    );
    expect(row).toBe("-5000,0,970000");
  });

  it("쉼표·따옴표가 있는 셀은 따옴표로 감싸고 내부 따옴표를 이중화한다", () => {
    const [, row] = parse(toCsvBuffer(["a"], [['팀,"A"']]));
    expect(row).toBe('"팀,""A"""');
  });
});
