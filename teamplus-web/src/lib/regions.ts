/**
 * 시/도 지역 목록 — 전국 탐색 필터의 단일 SoT.
 *
 * [2026-08-04] 기존에는 `(public)/academies/page.tsx` 안에 REGIONS 배열이 인라인으로
 *   있었다. 수업 탐색(`/classes-explore`)이 같은 목록을 쓰게 되면서 공용 상수로 추출했다.
 *
 * ⚠️ 백엔드 `src/common/constants/regions.constant.ts` 의 VENUE_CITIES 와
 *   값·순서를 일치시킬 것 — 값이 어긋나면 필터가 400 으로 거부된다.
 *   저장 형태는 `Venue.city` 축약형("서울", "경기", ...)이다.
 *
 * 참고: 세종은 현재 Venue 시드에 없어 결과가 0건일 수 있으나, 링크장이 등록되면
 *   자동으로 채워지므로 칩은 노출한다.
 */
/**
 * CLASS_REGION_DISABLED — 수업 지역 입력 미사용(기능은 존치, 폼 노출·필수 검증만 차단).
 *
 * [2026-08-27] 사용자 결정. 필수의 원 근거였던 "전국 노출 시 타지역 오등록 방지"는
 *   공개범위 중단(2026-08-12)으로 사라졌고, 목록 지역 표시도 제거(2026-08-19)돼
 *   소비처가 수업 상세 1곳만 남았다. 운영 실측상 직접 입력 9건 중 3건이 장소와 모순이라
 *   강제 입력이 오히려 오정보를 만들고 있었다.
 *
 * 이 플래그를 true 로 되돌리면 등록·수정 폼(동일 컴포넌트)의 입력과 필수 검증이 함께 부활한다.
 *   절차·복원 시 판단할 것: claudedocs/class-visibility-disable-2026-08-12.md §3-B · §5
 *
 * 참조: ClassForm.tsx SECTION 3.5 · useClassForm.ts validateForm
 */
export const SHOW_CLASS_REGION_SECTION: boolean = false;

export const REGIONS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '대전',
  '광주',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;

export type Region = (typeof REGIONS)[number];

/**
 * 시/도 → 시군구 — 수업 등록 시 감독/코치가 고르는 두 번째 단계.
 *
 * [2026-08-04] 지역 축이 시/도뿐이라 목록에 "서울"까지만 보였다. 서울 수업을 부산 학부모가
 *   등록하는 사고를 막으려면 실제 이동 범위인 시군구까지 노출해야 한다는 사용자 지시로 신설.
 *
 * ⚠️ 백엔드 `src/common/constants/regions.constant.ts` 의 `CITY_DISTRICTS` 와
 *   값이 어긋나면 저장이 400 으로 거부된다. 수정 시 양쪽을 함께 바꿀 것.
 *
 * 일반구(수원시 장안구 등)는 두지 않는다 — 장소 식별에는 "수원시" 로 충분하고
 * 단계를 늘리면 입력 이탈만 커진다.
 */
export const CITY_DISTRICTS: Record<Region, readonly string[]> = {
  서울: [
    '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구',
    '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구',
    '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구',
    '서초구', '강남구', '송파구', '강동구',
  ],
  경기: [
    '수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시',
    '동두천시', '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시',
    '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시', '이천시',
    '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시',
    '연천군', '가평군', '양평군',
  ],
  인천: [
    '중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구',
    '서구', '강화군', '옹진군',
  ],
  부산: [
    '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구',
    '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구',
    '기장군',
  ],
  대구: [
    '중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군',
    '군위군',
  ],
  대전: ['동구', '중구', '서구', '유성구', '대덕구'],
  광주: ['동구', '서구', '남구', '북구', '광산구'],
  울산: ['중구', '남구', '동구', '북구', '울주군'],
  // 세종은 하위 시군구가 없는 단층제 — 비우면 폼이 막히므로 자기 자신을 넣는다.
  세종: ['세종시'],
  강원: [
    '춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시',
    '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군',
    '양구군', '인제군', '고성군', '양양군',
  ],
  충북: [
    '청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군',
    '진천군', '괴산군', '음성군', '단양군',
  ],
  충남: [
    '천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시',
    '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군',
    '태안군',
  ],
  전북: [
    '전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군',
    '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군',
  ],
  전남: [
    '목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군',
    '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군',
    '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군',
    '신안군',
  ],
  경북: [
    '포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시',
    '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군',
    '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군',
    '울릉군',
  ],
  경남: [
    '창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시',
    '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군',
    '산청군', '함양군', '거창군', '합천군',
  ],
  제주: ['제주시', '서귀포시'],
};

/** 시/도 값이 SoT 목록에 있는지 — API 응답 복원 시 방어용. */
export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
}

/** 해당 시/도의 시군구 목록. 미지정·비정상 값이면 빈 배열. */
export function districtsOf(city: string | null | undefined): readonly string[] {
  return isRegion(city) ? CITY_DISTRICTS[city] : [];
}

/**
 * 표시용 지역 라벨 — "서울 강남구" / "서울" / null.
 * 백엔드가 `regionLabel` 을 함께 내려주지만, 응답이 city/district 만 있는 경로
 * (구 캐시·부분 응답)를 위해 프론트에도 같은 포맷 함수를 둔다.
 */
export function formatRegionLabel(
  city?: string | null,
  district?: string | null,
): string | null {
  if (!city) return null;
  return district ? `${city} ${district}` : city;
}

/**
 * 지역 라벨 역파싱 — "시/도" 또는 "시/도 시군구" 표준 라벨만 인정.
 *
 * teams.location 은 컬럼 분리 없이 formatRegionLabel 형태의 표준 라벨을 저장한다
 * (백엔드 team-region-label.util.ts 와 동일 계약). 시/도·시군구가 전부 공백 없는
 * 단일 토큰이라 공백 분리만으로 무손실 복원이 보장된다.
 * 자유 텍스트 등 비표준 값은 null — 폼에서 미선택 + 재선택 안내로 처리한다.
 */
export function parseRegionLabel(
  label?: string | null,
): { city: Region; district: string | null } | null {
  if (!label) return null;
  const tokens = label.trim().split(/\s+/);
  if (tokens.length === 0 || tokens.length > 2) return null;

  const [city, district] = tokens;
  if (!isRegion(city)) return null;
  if (district === undefined) return { city, district: null };
  if (!CITY_DISTRICTS[city].includes(district)) return null;
  return { city, district };
}

/** 수업 요일 — 백엔드 `ClassDaySchedule.dayOfWeek` 한글 SoT 와 동일. */
export const DAYS_OF_WEEK = ['월', '화', '수', '목', '금', '토', '일'] as const;

export type DayOfWeekKo = (typeof DAYS_OF_WEEK)[number];

/** 시간대 필터 구간 — 백엔드 CLASS_TIME_SLOTS 와 1:1. */
export const TIME_SLOTS = ['morning', 'afternoon', 'evening'] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];
