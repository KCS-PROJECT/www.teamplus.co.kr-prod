import {
  normalizeTeamRegionLabel,
  parseTeamRegionLabel,
} from "./team-region-label.util";

describe("parseTeamRegionLabel", () => {
  it("시/도 + 시군구 표준 라벨을 파싱한다", () => {
    expect(parseTeamRegionLabel("서울 강남구")).toEqual({
      city: "서울",
      district: "강남구",
    });
    expect(parseTeamRegionLabel("경기 수원시")).toEqual({
      city: "경기",
      district: "수원시",
    });
    expect(parseTeamRegionLabel("세종 세종시")).toEqual({
      city: "세종",
      district: "세종시",
    });
  });

  it("시/도 단독 라벨을 파싱한다 (district null)", () => {
    expect(parseTeamRegionLabel("서울")).toEqual({
      city: "서울",
      district: null,
    });
  });

  it("앞뒤·내부 다중 공백을 흡수한다", () => {
    expect(parseTeamRegionLabel("  서울   강남구  ")).toEqual({
      city: "서울",
      district: "강남구",
    });
  });

  it("시/도 간 중복 시군구명은 소속 시/도 안에서만 인정한다", () => {
    // "중구" 는 서울·인천·부산 등에 모두 존재 — city 스코프 내 검증
    expect(parseTeamRegionLabel("서울 중구")).toEqual({
      city: "서울",
      district: "중구",
    });
  });

  it("조합 불일치는 거부한다 (부산에 강남구 없음)", () => {
    expect(parseTeamRegionLabel("부산 강남구")).toBeNull();
  });

  it("비표준 시/도 표기를 거부한다 (축약형만 인정)", () => {
    expect(parseTeamRegionLabel("서울시 강남구")).toBeNull();
    expect(parseTeamRegionLabel("서울특별시 강남구")).toBeNull();
  });

  it("시군구 단독·자유 텍스트를 거부한다", () => {
    expect(parseTeamRegionLabel("강남구")).toBeNull();
    expect(parseTeamRegionLabel("강남")).toBeNull();
  });

  it("3토큰 이상을 거부한다 (시군구는 전부 단일 토큰)", () => {
    expect(parseTeamRegionLabel("서울 강남구 역삼동")).toBeNull();
  });

  it("null/빈 값은 null 을 반환한다", () => {
    expect(parseTeamRegionLabel(null)).toBeNull();
    expect(parseTeamRegionLabel(undefined)).toBeNull();
    expect(parseTeamRegionLabel("")).toBeNull();
  });
});

describe("normalizeTeamRegionLabel", () => {
  it("undefined 는 미변경(undefined) 그대로 통과한다", () => {
    expect(normalizeTeamRegionLabel(undefined)).toBeUndefined();
  });

  it("빈 문자열/공백은 해제(null)로 정규화한다", () => {
    expect(normalizeTeamRegionLabel("")).toBeNull();
    expect(normalizeTeamRegionLabel("   ")).toBeNull();
  });

  it("표준 라벨은 canonical 형태로 재조립해 반환한다", () => {
    expect(normalizeTeamRegionLabel("서울 강남구")).toBe("서울 강남구");
    expect(normalizeTeamRegionLabel("  서울   강남구 ")).toBe("서울 강남구");
    expect(normalizeTeamRegionLabel("서울")).toBe("서울");
  });

  it("비표준 라벨은 trim 원문 그대로 수용한다 (직접 입력 허용 — 1안)", () => {
    expect(normalizeTeamRegionLabel("강남")).toBe("강남");
    expect(normalizeTeamRegionLabel("서울시 강남구")).toBe("서울시 강남구");
    expect(normalizeTeamRegionLabel("부산 강남구")).toBe("부산 강남구");
    expect(normalizeTeamRegionLabel(" 인천 선학 국제빙상경기장 ")).toBe(
      "인천 선학 국제빙상경기장",
    );
  });
});
