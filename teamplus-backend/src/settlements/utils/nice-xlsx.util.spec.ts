import * as XLSX from "xlsx";
import { buildNiceXlsx, digitsOnly, truncateUtf8Bytes } from "./nice-xlsx.util";

describe("nice-xlsx.util", () => {
  it("Sheet1 에 제목 줄과 데이터를 쓰고, 문자열은 글자 셀·숫자는 숫자 셀로 남긴다", () => {
    const buffer = buildNiceXlsx(
      ["서브ID", "지급일", "지급액"],
      [["0012345678901234567", 20261006, 1849430]],
    );

    const book = XLSX.read(buffer, { type: "buffer", bookFiles: true });
    expect(book.SheetNames).toEqual(["Sheet1"]);
    const sheet = book.Sheets.Sheet1;
    expect(sheet.A1.v).toBe("서브ID");
    // 앞자리 0 과 16자리 이상이 그대로 남아야 한다.
    expect(sheet.A2).toMatchObject({ t: "s", v: "0012345678901234567" });
    expect(sheet.B2).toMatchObject({ t: "n", v: 20261006 });
    expect(sheet.C2).toMatchObject({ t: "n", v: 1849430 });

    // 원본 XML 에서도 글자 셀은 공유 문자열(t="s")이어야 한다 — 나이스 샘플과 같은 저장 형태.
    const files = (
      book as unknown as { files: Record<string, { content: Uint8Array }> }
    ).files;
    const xml = Buffer.from(files["xl/worksheets/sheet1.xml"].content).toString(
      "utf8",
    );
    expect(xml).toMatch(/<c r="A2" t="s">/);
    expect(xml).not.toMatch(/t="str"/);
  });

  it("UTF-8 바이트 기준으로 글자 중간을 끊지 않고 자른다", () => {
    expect(truncateUtf8Bytes("가".repeat(20), 40)).toBe("가".repeat(13));
    expect(truncateUtf8Bytes("abc", 40)).toBe("abc");
  });

  it("숫자만 남긴다", () => {
    expect(digitsOnly("123-45-67890")).toBe("1234567890");
  });
});
