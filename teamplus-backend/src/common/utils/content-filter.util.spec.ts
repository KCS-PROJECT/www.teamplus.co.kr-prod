import { filterProfanity, maskProfanity } from "./content-filter.util";

describe("filterProfanity", () => {
  it("정상 문장은 그대로 통과", () => {
    const result = filterProfanity("오늘 훈련 잘 마쳤습니다. 감사합니다!");
    expect(result.hasProfanity).toBe(false);
    expect(result.filtered).toBe("오늘 훈련 잘 마쳤습니다. 감사합니다!");
  });

  it("직접 매칭 비속어를 ● 로 치환", () => {
    const result = filterProfanity("씨발 뭐야");
    expect(result.hasProfanity).toBe(true);
    expect(result.filtered).toBe("●● 뭐야");
  });

  // 과거 회귀: 정규화 매칭 시 hasProfanity 플래그만 세우고 치환하지 않아 무방비였다.
  it.each([
    ["시 발 뭐야", "●●● 뭐야"],
    ["시.발 뭐야", "●●● 뭐야"],
    ["시*발 뭐야", "●●● 뭐야"],
    ["병 신 같은", "●●● 같은"],
  ])("공백·특수문자 삽입 우회도 치환한다: %s", (input, expected) => {
    const result = filterProfanity(input);
    expect(result.hasProfanity).toBe(true);
    expect(result.filtered).toBe(expected);
  });

  it("자모 분리 대표형도 탐지", () => {
    expect(filterProfanity("ㅅㅣㅂㅏㄹ").hasProfanity).toBe(true);
  });

  it("영문 비속어는 대소문자 무관", () => {
    const result = filterProfanity("FUCK this");
    expect(result.hasProfanity).toBe(true);
    expect(result.filtered).toBe("●●●● this");
  });

  // 오탐 방지: 단독 '새끼'는 정상 문맥(강아지 새끼)이 흔해 사전에서 제외했다.
  it("일반 문맥의 '새끼'는 마스킹하지 않는다", () => {
    const result = filterProfanity("우리 강아지가 새끼를 낳았어요");
    expect(result.hasProfanity).toBe(false);
  });

  it("욕설 결합형 '개새끼'는 마스킹한다", () => {
    expect(filterProfanity("개새끼야").hasProfanity).toBe(true);
  });

  it("문장부호(쉼표)는 정규화 제거 대상이 아니다 — 정상 문장 오탐 방지", () => {
    const result = filterProfanity("김코치 씨, 발표 잘하셨어요");
    expect(result.hasProfanity).toBe(false);
  });

  it("빈 값은 그대로 반환", () => {
    expect(filterProfanity("")).toEqual({ filtered: "", hasProfanity: false });
  });

  it("원문 길이를 보존한다", () => {
    const input = "이 시 발 사람";
    expect(filterProfanity(input).filtered).toHaveLength(input.length);
  });
});

describe("maskProfanity", () => {
  it("마스킹된 문자열만 반환", () => {
    expect(maskProfanity("씨발")).toBe("●●");
  });

  it("null/undefined 는 null 로 통과 (optional 필드용)", () => {
    expect(maskProfanity(null)).toBeNull();
    expect(maskProfanity(undefined)).toBeNull();
  });
});
