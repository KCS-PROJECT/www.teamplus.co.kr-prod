import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CITY_DISTRICTS,
  isValidDistrict,
  isVenueCity,
} from "@/common/constants/regions.constant";

export const CLASS_REGION_MESSAGES = {
  DISTRICT_WITHOUT_CITY: "지역(시/도)을 먼저 선택해주세요.",
  DISTRICT_MISMATCH: "선택한 시/도에 속하지 않는 시군구입니다.",
} as const;

/**
 * 수업 지역 입력 검증 — 생성·수정 공통.
 *
 * [2026-08-04] 감독이 서울에서 하는 수업을 부산 학부모가 등록하는 사고를 막기 위해
 *   수업 자체에 지역을 저장하기로 했다(사용자 지시). DTO 의 `@IsIn` 은 값 자체만 보므로
 *   여기서 **조합**을 검증한다 — 시군구 이름은 시/도 간 중복이 많아
 *   ("중구"·"동구"·"고성군" 등) 평탄 목록 검증만으로는 "부산 강남구" 가 통과한다.
 *
 * 규칙:
 *   · 둘 다 미전달 → 통과(변경 없음 / 미입력 허용 — 기존 수업 BC)
 *   · 시군구만 전달 → 400 (어느 시/도인지 알 수 없음)
 *   · 시/도만 전달 → 통과 (시군구 미상 지역 허용. 목록에는 시/도만 표기)
 *   · 둘 다 전달 → 조합이 SoT 에 있어야 통과
 *
 * @param city     regionCity — DTO 통과값이므로 VENUE_CITIES 소속은 이미 보장되지만,
 *                 수정 경로에서 기존 DB 값과 섞이므로 여기서 다시 확인한다.
 * @param district regionDistrict
 */
export function assertClassRegion(
  city: string | null | undefined,
  district: string | null | undefined,
): void {
  if (!district) return;
  if (!city) {
    throw new BadRequestException(CLASS_REGION_MESSAGES.DISTRICT_WITHOUT_CITY);
  }
  if (!isValidDistrict(city, district)) {
    throw new BadRequestException(CLASS_REGION_MESSAGES.DISTRICT_MISMATCH);
  }
}

/**
 * 수정 경로의 지역 병합 — DTO 미전달 필드는 기존 값을 유지한다.
 *
 * 시/도만 바꾸면 기존 시군구가 새 시/도에 속하지 않게 되므로
 * (예: 서울 강남구 → regionCity 만 "부산" 으로 변경) **시군구를 함께 비운다.**
 * 잘못된 조합을 저장하느니 시/도만 남기는 편이 안전하다 — 목록 표기가 "부산" 으로만 좁혀질 뿐
 * 오정보를 노출하지 않는다.
 */
export function mergeClassRegion(
  current: { regionCity: string | null; regionDistrict: string | null },
  dto: { regionCity?: string; regionDistrict?: string },
): { regionCity: string | null; regionDistrict: string | null } {
  const nextCity = dto.regionCity ?? current.regionCity;
  const cityChanged =
    dto.regionCity !== undefined && dto.regionCity !== current.regionCity;

  let nextDistrict: string | null;
  if (dto.regionDistrict !== undefined) {
    nextDistrict = dto.regionDistrict;
  } else if (cityChanged) {
    nextDistrict = null; // 시/도가 바뀌었는데 시군구 미전달 → 조합 붕괴 방지
  } else {
    nextDistrict = current.regionDistrict;
  }

  assertClassRegion(nextCity, nextDistrict);
  return { regionCity: nextCity ?? null, regionDistrict: nextDistrict };
}

/**
 * 지역 필터 where 절 — 탐색(/classes/explore) 공용.
 *
 * `Class.regionCity` 가 SoT 지만, 이 컬럼은 2026-08-04 신설이라 **기존 수업은 전부 NULL** 이다.
 * 그래서 값이 없는 수업은 기존 축(수업 장소 → 팀 홈링크장)으로 폴백해 필터링한다.
 * 폴백이 없으면 마이그레이션 직후 지역 필터가 거의 모든 수업을 걸러내 목록이 비어 보인다.
 */
export function buildClassRegionWhere(
  city: string | undefined,
  district: string | undefined,
): Prisma.ClassWhereInput | null {
  if (!city) return null;

  const cityWhere: Prisma.ClassWhereInput = {
    OR: [
      { regionCity: city },
      // 신설 컬럼이 비어 있는 기존 수업 — 장소/홈링크장 기반 폴백 (2026-08-04 이전 데이터)
      { regionCity: null, venue: { city } },
      { regionCity: null, venueId: null, team: { homeVenue: { city } } },
    ],
  };

  // 시군구는 신설 컬럼에만 존재한다(Venue 에는 시군구 필드가 없다).
  // 따라서 시군구를 지정하면 폴백 대상(regionCity=null)은 자연히 제외된다 —
  // "구까지 고른 사용자에게 구 미상 수업을 섞어 보여주지 않는다" 는 의도된 동작.
  if (!district) return cityWhere;
  return { AND: [{ regionCity: city }, { regionDistrict: district }] };
}

/**
 * 표시용 지역 라벨 — "서울 강남구" / "서울" / null.
 * 응답에 문자열로 함께 실어 프론트 3곳(목록·탐색·상세)이 같은 포맷을 쓰게 한다.
 */
export function formatRegionLabel(
  city: string | null | undefined,
  district: string | null | undefined,
): string | null {
  if (!city) return null;
  return district ? `${city} ${district}` : city;
}

/** 시/도별 시군구 목록 — 폼 셀렉트 공급용(프론트 상수와 동기화 검증에도 사용). */
export const CLASS_REGION_DISTRICTS = CITY_DISTRICTS;
export { isVenueCity };
