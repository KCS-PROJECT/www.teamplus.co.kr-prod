import { maskFullName, maskPersonName } from "./mask-name.util";

describe("maskPersonName", () => {
  it.each([
    ["홍길동", "홍*동"],
    ["남궁민수", "남**수"],
    ["홍길", "홍*"],
    ["홍", "홍"],
  ])("%s → %s", (input, expected) => {
    expect(maskPersonName(input)).toBe(expected);
  });

  it("공백 포함 이름은 토큰별로 마스킹", () => {
    expect(maskPersonName("John Doe")).toBe("J**n D*e");
  });

  it("빈 값은 fallback", () => {
    expect(maskPersonName(null)).toBe("익명");
    expect(maskPersonName("   ")).toBe("익명");
    expect(maskPersonName("", "알 수 없음")).toBe("알 수 없음");
  });
});

describe("maskFullName", () => {
  it("성+이름을 조립 후 마스킹", () => {
    expect(maskFullName("홍", "길동")).toBe("홍*동");
  });

  it("양쪽 모두 비면 fallback", () => {
    expect(maskFullName(null, null, "알 수 없음")).toBe("알 수 없음");
  });
});
