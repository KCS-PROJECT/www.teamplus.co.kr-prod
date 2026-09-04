/**
 * 탐색 카드 매퍼 — 장소 2필드 모델 {venue(FK) | venueText} 회귀 가드.
 *
 * 우선순위: 수업 링크장(FK) → 수업 텍스트 장소(venueId 없이 venueText) → 팀 홈링크장.
 * 텍스트 장소는 그 자체가 장소 전체라 홈링크장 이름과 결합하지 않는다(교차 조합 금지).
 * 지역 라벨의 시/도 폴백은 링크장(수업 → 홈) 도시를 유지한다.
 */
import { ClassesExploreService } from "./classes-explore.service";

type Card = {
  venue: { id: string; name: string } | null;
  venueText: string | null;
  regionLabel: string | null;
};

function makeService() {
  return new ClassesExploreService({} as never) as unknown as {
    toCard: (row: Record<string, unknown>) => Card;
  };
}

const HOME = {
  id: "home-1",
  name: "팀 홈링크장",
  city: "인천",
  address: "인천 연수구",
};

function row(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "c1",
    className: "수업",
    description: null,
    category: null,
    trainingType: "regular",
    visibility: "PUBLIC",
    capacity: 0,
    ageMin: null,
    ageMax: null,
    targetBirthYears: [],
    levelRequired: null,
    instructorName: "코치",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    regionCity: null,
    regionDistrict: null,
    team: { id: "t1", name: "팀", logoUrl: null, homeVenue: HOME },
    academy: null,
    venue: null,
    venueText: null,
    dayScheduleEntries: [],
    products: [],
    _count: { registrations: 0 },
    ...over,
  };
}

describe("ClassesExploreService.toCard — venueText", () => {
  it("수업 링크장(FK) + 세부 → venue 는 링크장, venueText 는 세부", () => {
    const card = makeService().toCard(
      row({
        venue: {
          id: "v1",
          name: "선학빙상장",
          city: "인천",
          address: "인천 연수구",
        },
        venueText: "1층 A실",
      }),
    );
    expect(card.venue?.id).toBe("v1");
    expect(card.venueText).toBe("1층 A실");
    expect(card.regionLabel).toBe("인천");
  });

  it("텍스트 장소만 있으면 홈링크장으로 폴백하지 않는다(venue null + venueText). 지역 라벨은 홈링크장 도시 유지", () => {
    const card = makeService().toCard(row({ venueText: "임시 야외 링크" }));
    expect(card.venue).toBeNull();
    expect(card.venueText).toBe("임시 야외 링크");
    expect(card.regionLabel).toBe("인천");
  });

  it("장소가 전혀 없으면 기존대로 홈링크장 폴백, venueText null", () => {
    const card = makeService().toCard(row({}));
    expect(card.venue?.id).toBe("home-1");
    expect(card.venueText).toBeNull();
  });
});
