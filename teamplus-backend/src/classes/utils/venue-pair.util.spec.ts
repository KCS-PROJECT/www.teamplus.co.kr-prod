import { normalizeVenuePair } from "./venue-pair.util";

describe("normalizeVenuePair — 수업 장소 2필드 모델 정규화 (설계 v5.2 §3.4-A)", () => {
  it("venueId 없이 venueText 만 있으면 자유 텍스트 장소 쌍 {null, text}", () => {
    expect(normalizeVenuePair(null, "인천 선학빙상장 1층 A실")).toEqual({
      venueId: null,
      venueText: "인천 선학빙상장 1층 A실",
    });
    expect(normalizeVenuePair("", "A")).toEqual({
      venueId: null,
      venueText: "A",
    });
    expect(normalizeVenuePair(undefined, "A")).toEqual({
      venueId: null,
      venueText: "A",
    });
  });

  it("venueId 있고 venueText 가 공백뿐이면 세부 없음 {id, null}", () => {
    expect(normalizeVenuePair("v1", "   ")).toEqual({
      venueId: "v1",
      venueText: null,
    });
    expect(normalizeVenuePair("v1", undefined)).toEqual({
      venueId: "v1",
      venueText: null,
    });
  });

  it("두 값 모두 trim 한다 — 세부 구역 앞뒤 공백 제거", () => {
    expect(normalizeVenuePair(" v1 ", " A실 ")).toEqual({
      venueId: "v1",
      venueText: "A실",
    });
  });

  it("둘 다 없으면 {null, null}", () => {
    expect(normalizeVenuePair(null, null)).toEqual({
      venueId: null,
      venueText: null,
    });
    expect(normalizeVenuePair("", "")).toEqual({
      venueId: null,
      venueText: null,
    });
  });

  it("두 필드는 독립 — venueId 가 없어도 venueText 를 버리지 않는다 (v4.2 불변식 폐기)", () => {
    const pair = normalizeVenuePair(null, "B실");
    expect(pair.venueText).toBe("B실");
  });
});
