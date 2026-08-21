import {
  isValidDistrict,
  isVenueCity,
} from "@/common/constants/regions.constant";

/**
 * 팀 지역 라벨 파싱 — "시/도" 또는 "시/도 시군구" 표준 라벨만 인정.
 *
 * teams.location 은 별도 컬럼 없이 지역 문자열을 저장하는 단일 SoT 다
 * (수업 classes.region_city/district 와 달리 팀은 지역 기반 인덱스 필터 요구가 없어
 *  컬럼 분리 없이 라벨 저장을 채택 — 2026-08-21 설계 확정).
 * 시/도 17개·시군구 250여 개가 전부 공백 없는 단일 토큰이라
 * 공백 분리만으로 무손실 역파싱이 보장된다.
 *
 * @returns 파싱 성공 시 { city, district } — district 는 시/도 단독 라벨이면 null.
 *          표준 라벨이 아니면 null (자유 텍스트 · "부산 강남구" 조합 불일치 포함).
 */
export function parseTeamRegionLabel(
  label: string | null | undefined,
): { city: string; district: string | null } | null {
  if (!label) return null;
  const tokens = label.trim().split(/\s+/);
  if (tokens.length === 0 || tokens.length > 2) return null;

  const [city, district] = tokens;
  if (!isVenueCity(city)) return null;
  if (district === undefined) return { city, district: null };
  if (!isValidDistrict(city, district)) return null;
  return { city, district };
}

/**
 * 팀 지역 입력 정규화 — create/update 공통.
 *
 * 반환 시맨틱은 updateTeam 의 3분기 규약과 동일:
 *   · undefined → 미변경 (필드 미전송)
 *   · null      → 해제 (빈 문자열 전송)
 *   · string    → 표준 라벨이면 파싱 토큰으로 재조립한 canonical 라벨
 *                 (내부 다중 공백 등 표기 흔들림을 저장 전에 흡수),
 *                 아니면 trim 한 원문 그대로 수용 — 자유 입력 허용 (2026-08-21 1안 결정).
 *
 * 하이브리드 입력 정책: 프론트 기본 UX 는 시/도·시군구 2단계 선택이지만
 * "직접 입력" 모드로 임의 문구("인천 선학 국제빙상경기장" 등)도 저장할 수 있다.
 * 따라서 이 게이트는 차단이 아니라 표준 라벨의 canonical 정규화만 책임진다.
 */
export function normalizeTeamRegionLabel(
  input: string | undefined,
): string | null | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parsed = parseTeamRegionLabel(trimmed);
  if (!parsed) return trimmed;
  return parsed.district ? `${parsed.city} ${parsed.district}` : parsed.city;
}
