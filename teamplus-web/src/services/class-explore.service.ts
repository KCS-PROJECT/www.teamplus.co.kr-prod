import { api } from '@/services/api-client';
import type { ClassVisibility } from '@/lib/class-visibility';
import type { DayOfWeekKo, Region, TimeSlot } from '@/lib/regions';

/**
 * 전국 수업 탐색 서비스 — `GET /api/v1/classes/explore`.
 *
 * [2026-08-04] 팀에 가입하지 않은 학부모도 수업을 발견할 수 있게 하는 경로.
 *   백엔드가 `@Public` 이라 비로그인 호출이 가능하며, 노출 범위는 서버가 강제한다
 *   (비로그인=전체공개만 / 로그인=학부모공개까지 / 소속 팀이 있으면 그 팀 수업 추가).
 *
 * ⚠️ 이 경로는 `PUBLIC_API_PATTERNS`(api-lifecycle.ts)에 등록돼 있어야 한다.
 *   누락 시 토큰 없는 요청이 클라이언트 전처리 가드에서 401 로 차단된다.
 *
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
 */

export interface ExploreClassOwner {
  type: 'team' | 'academy';
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface ExploreClassVenue {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
}

export interface ExploreClassDaySchedule {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface ExploreClassPrice {
  min: number;
  feeType: string;
  billingTiming: string;
}

export interface ExploreClassItem {
  id: string;
  className: string;
  description: string | null;
  category: string | null;
  trainingType: string | null;
  visibility: ClassVisibility;
  owner: ExploreClassOwner | null;
  venue: ExploreClassVenue | null;
  /** [venueText] 대표 장소 텍스트 — venue 있으면 세부 구역, 없으면 장소 전체(마스터 미등록). */
  venueText?: string | null;
  /** [2026-08-04] 수업 지역 — 감독이 등록 시 고른 시/도·시군구. */
  regionCity: string | null;
  regionDistrict: string | null;
  /** "서울 강남구" 조합 문자열. 지역 미입력 수업은 장소 시/도 폴백(시군구 없음) 또는 null. */
  regionLabel: string | null;
  daySchedules: ExploreClassDaySchedule[];
  price: ExploreClassPrice | null;
  capacity: number;
  enrolledCount: number;
  /** null = 정원 무제한(capacity 0). 숫자면 남은 자리. */
  remainingSeats: number | null;
  targetBirthYears: number[];
  ageMin: number | null;
  ageMax: number | null;
  levelRequired: string | null;
  coachName: string | null;
  createdAt: string;
}

export interface ExploreClassesResponse {
  items: ExploreClassItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExploreClassesParams {
  q?: string;
  city?: Region;
  /** 시군구 — city 와 함께 지정할 때만 적용. 지역 미입력 수업은 결과에서 빠진다. */
  district?: string;
  category?: 'KIDS' | 'JUNIOR' | 'ADULT';
  trainingType?: 'regular' | 'lesson' | 'spot';
  /** 다중 선택 — 쉼표로 직렬화해 전송한다(백엔드가 배열/쉼표 양쪽 수용). */
  dayOfWeek?: DayOfWeekKo[];
  timeSlot?: TimeSlot;
  birthYear?: number;
  priceMax?: number;
  sort?: 'recent' | 'capacity';
  page?: number;
  limit?: number;
}

const EMPTY: ExploreClassesResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

export async function fetchExploreClasses(
  params: ExploreClassesParams,
): Promise<ExploreClassesResponse> {
  // 빈 값은 아예 보내지 않는다 — 백엔드 @IsIn 검증이 빈 문자열을 400 으로 거부한다.
  const query: Record<string, string> = {};
  if (params.q?.trim()) query.q = params.q.trim();
  if (params.city) query.city = params.city;
  // 시군구는 시/도 없이 보내면 백엔드가 무시하므로 조합일 때만 전송한다.
  if (params.city && params.district) query.district = params.district;
  if (params.category) query.category = params.category;
  if (params.trainingType) query.trainingType = params.trainingType;
  if (params.dayOfWeek?.length) query.dayOfWeek = params.dayOfWeek.join(',');
  if (params.timeSlot) query.timeSlot = params.timeSlot;
  if (params.birthYear) query.birthYear = String(params.birthYear);
  if (params.priceMax !== undefined && params.priceMax > 0) {
    query.priceMax = String(params.priceMax);
  }
  if (params.sort) query.sort = params.sort;
  if (params.page) query.page = String(params.page);
  if (params.limit) query.limit = String(params.limit);

  const res = await api.get<ExploreClassesResponse>('/classes/explore', {
    params: query,
  });

  return res.success && res.data ? res.data : EMPTY;
}
