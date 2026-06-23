/**
 * =============================================================================
 * TEAMPLUS - 전국 아이스하키 유소년 팀 마스터 데이터 시드
 * =============================================================================
 *
 * 기준 문서:
 *   - 2026 유청소년 클럽리그(i-League) 초등부(U9/U12) 디비전 편성(최종)
 *   - 대한아이스하키협회(KIHA) 2026.03.12 공식 발표
 *   - 2026 스포츠클럽 디비전리그 U12 경기표
 *
 * 실행 방법:
 *   npx tsx prisma/seed-teams.ts
 *
 * 특징:
 *   - 멱등성(Idempotent): 중복 실행 시 기존 데이터 유지 (upsert 패턴)
 *   - 시스템 사용자 자동 생성: 팀 클럽의 coachId로 사용
 *   - 빙상장(Venue) → 클럽(Club) → 팀(Team) → 리그(League) → 디비전(Division) → 편성(TeamDivision) 순서
 *   - 총 98개 팀 (U9: 32, U12: 45, 지역: 18, 펀하키: 3), 26개 빙상장, 3개 리그, 13개 디비전
 */

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// =============================================================================
// 1. 빙상장(Venue) 마스터 데이터
// =============================================================================

interface VenueData {
  key: string;
  name: string;
  address: string;
  city: string;
  rinkSize?: string;
}

const VENUES: VenueData[] = [
  {
    key: "mokdong",
    name: "목동아이스링크",
    address: "서울 양천구 목동서로 159-1",
    city: "서울",
    rinkSize: "International",
  },
  {
    key: "taereung",
    name: "태릉국제빙상장",
    address: "서울 노원구 화랑로 727",
    city: "서울",
    rinkSize: "International",
  },
  {
    key: "jamsil",
    name: "잠실실내빙상장",
    address: "서울 송파구 올림픽로 25",
    city: "서울",
    rinkSize: "International",
  },
  {
    key: "incheon",
    name: "인천선학빙상장",
    address: "인천 미추홀구 매소홀로488번길 6-8",
    city: "인천",
    rinkSize: "International",
  },
  {
    key: "anyang",
    name: "안양빙상장",
    address: "경기 안양시 동안구 비산로 200",
    city: "경기",
    rinkSize: "International",
  },
  {
    key: "tancheon",
    name: "성남탄천빙상장",
    address: "경기 성남시 분당구 탄천로 215",
    city: "경기",
    rinkSize: "International",
  },
  {
    key: "suwon",
    name: "수원실내빙상장",
    address: "경기 수원시 장안구 경수대로 893",
    city: "경기",
    rinkSize: "International",
  },
  {
    key: "goyang",
    name: "고양어울림빙상장",
    address: "경기 고양시 일산서구 대화로 260",
    city: "경기",
    rinkSize: "International",
  },
  {
    key: "uijeongbu",
    name: "의정부빙상장",
    address: "경기 의정부시 체육로 137",
    city: "경기",
    rinkSize: "International",
  },
  {
    key: "bundang",
    name: "분당아이스아레나",
    address: "경기 성남시 분당구 불정로 90",
    city: "경기",
    rinkSize: "International",
  },
  {
    key: "gangneung",
    name: "강릉아이스아레나",
    address: "강원 강릉시 종합운동장길 32",
    city: "강원",
    rinkSize: "International",
  },
  {
    key: "chuncheon",
    name: "춘천의암빙상장",
    address: "강원 춘천시 스포츠타운길 80",
    city: "강원",
    rinkSize: "International",
  },
  {
    key: "daejeon",
    name: "대전아이스링크",
    address: "대전 유성구 월드컵대로 32",
    city: "대전",
    rinkSize: "International",
  },
  {
    key: "jeju",
    name: "제주빙상장",
    address: "제주 제주시 서해안로 536",
    city: "제주",
    rinkSize: "International",
  },
  {
    key: "blackice",
    name: "블랙아이스A",
    address: "경기 성남시 분당구",
    city: "경기",
  },
  {
    key: "korea_univ",
    name: "고려대체육관빙상장",
    address: "서울 성북구 안암로 145",
    city: "서울",
    rinkSize: "International",
  },
  {
    key: "pohang",
    name: "포항빙상장",
    address: "경북 포항시 남구 효자동길 8",
    city: "경상",
  },
  {
    key: "daegu",
    name: "대구빙상장",
    address: "대구 수성구 알파시티1로 100",
    city: "경상",
  },
  {
    key: "ulsan",
    name: "울산빙상장",
    address: "울산 남구 문수로 44",
    city: "경상",
  },
  {
    key: "busan",
    name: "부산아이스링크",
    address: "부산 연제구 월드컵대로 344",
    city: "경상",
  },
  {
    key: "gwangju",
    name: "광주빙상장",
    address: "광주 서구 풍암동 금화로 278",
    city: "전라",
  },
  {
    key: "jeonju",
    name: "전주빙상장",
    address: "전북 전주시 덕진구 기린대로 668",
    city: "전라",
  },
  {
    key: "changwon",
    name: "창원빙상장",
    address: "경남 창원시 의창구 원이대로 450",
    city: "경상",
  },
  {
    key: "gimhae",
    name: "김해빙상장",
    address: "경남 김해시 가야로 225",
    city: "경상",
  },
  {
    key: "total_perf",
    name: "토탈퍼포먼스아이스링크",
    address: "서울 성동구 왕십리로 115",
    city: "서울",
    rinkSize: "International",
  },
  {
    key: "sejong",
    name: "세종빙상장",
    address: "세종 세종시 보듬로 94",
    city: "충청",
  },
];

// =============================================================================
// 2. 팀 마스터 데이터 (KIHA 공식 편성 기준)
// =============================================================================

interface TeamData {
  /** 고유 코드 (clubCode로 사용) */
  code: string;
  /** 한글 팀명 */
  name: string;
  /** 영문 팀명 */
  nameEn: string;
  /** 약칭 (3-4글자) */
  shortName: string;
  /** 지역 */
  region: string;
  /** 연령대 */
  ageGroup: "U9" | "U12";
  /** 홈 빙상장 키 (VENUES의 key) */
  venueKey: string;
  /** 연락처 */
  phone: string;
  /** i-League 디비전 번호 (1~6) */
  divisionNum: number;
  /** 지역권 (중부권/남부권, 스포츠클럽 디비전리그 전용) - null이면 i-League */
  regionalDiv?: string;
}

// ---------------------------------------------------------------------------
// U9 팀 (32팀) - 2026 i-League
// ---------------------------------------------------------------------------
const U9_TEAMS: TeamData[] = [
  // DIV 1 (7팀 - 최상위)
  {
    code: "U9-ZBT",
    name: "제니스블리즈TOP",
    nameEn: "Zenith Blitz TOP",
    shortName: "ZBT",
    region: "서울",
    ageGroup: "U9",
    venueKey: "mokdong",
    phone: "010-1001-0001",
    divisionNum: 1,
  },
  {
    code: "U9-RDR",
    name: "루비덕스라이징",
    nameEn: "Ruby Ducks Rising",
    shortName: "RDR",
    region: "인천",
    ageGroup: "U9",
    venueKey: "incheon",
    phone: "010-1001-0002",
    divisionNum: 1,
  },
  {
    code: "U9-HLM",
    name: "HL목동",
    nameEn: "HL Mokdong",
    shortName: "HLM",
    region: "서울",
    ageGroup: "U9",
    venueKey: "mokdong",
    phone: "010-1001-0003",
    divisionNum: 1,
  },
  {
    code: "U9-GRB",
    name: "고양레빗츠",
    nameEn: "Goyang Rabbits",
    shortName: "GRB",
    region: "경기",
    ageGroup: "U9",
    venueKey: "goyang",
    phone: "010-1001-0004",
    divisionNum: 1,
  },
  {
    code: "U9-THD",
    name: "센더스",
    nameEn: "Thunders",
    shortName: "THD",
    region: "서울",
    ageGroup: "U9",
    venueKey: "jamsil",
    phone: "010-1001-0005",
    divisionNum: 1,
  },
  {
    code: "U9-HNT",
    name: "호네츠아이스하키클럽",
    nameEn: "Hornets Ice Hockey Club",
    shortName: "HNT",
    region: "경기",
    ageGroup: "U9",
    venueKey: "bundang",
    phone: "010-1001-0006",
    divisionNum: 1,
  },
  {
    code: "U9-CWL",
    name: "컬러웨일즈",
    nameEn: "Color Whales",
    shortName: "CWL",
    region: "제주",
    ageGroup: "U9",
    venueKey: "jeju",
    phone: "010-1001-0007",
    divisionNum: 1,
  },

  // DIV 2 (6팀)
  {
    code: "U9-RDK",
    name: "루비덕스",
    nameEn: "Ruby Ducks",
    shortName: "RDK",
    region: "인천",
    ageGroup: "U9",
    venueKey: "incheon",
    phone: "010-9306-7802",
    divisionNum: 2,
  },
  {
    code: "U9-ZBS",
    name: "제니스블리즈SILVER",
    nameEn: "Zenith Blitz Silver",
    shortName: "ZBS",
    region: "서울",
    ageGroup: "U9",
    venueKey: "mokdong",
    phone: "010-1002-0002",
    divisionNum: 2,
  },
  {
    code: "U9-THB",
    name: "센더스블랙",
    nameEn: "Thunders Black",
    shortName: "THB",
    region: "서울",
    ageGroup: "U9",
    venueKey: "jamsil",
    phone: "010-1002-0003",
    divisionNum: 2,
  },
  {
    code: "U9-UJA",
    name: "의정부에론스",
    nameEn: "Uijeongbu Aeros",
    shortName: "UJA",
    region: "경기",
    ageGroup: "U9",
    venueKey: "uijeongbu",
    phone: "010-1002-0004",
    divisionNum: 2,
  },
  {
    code: "U9-WPK",
    name: "올프팩",
    nameEn: "Wolf Pack",
    shortName: "WPK",
    region: "서울",
    ageGroup: "U9",
    venueKey: "taereung",
    phone: "010-1002-0005",
    divisionNum: 2,
  },
  {
    code: "U9-WVN",
    name: "와이번즈",
    nameEn: "Wyverns",
    shortName: "WVN",
    region: "경기",
    ageGroup: "U9",
    venueKey: "suwon",
    phone: "010-1002-0006",
    divisionNum: 2,
  },

  // DIV 3 (7팀)
  {
    code: "U9-ZBB",
    name: "제니스블리즈BRONZE",
    nameEn: "Zenith Blitz Bronze",
    shortName: "ZBB",
    region: "서울",
    ageGroup: "U9",
    venueKey: "mokdong",
    phone: "010-1003-0001",
    divisionNum: 3,
  },
  {
    code: "U9-MRN",
    name: "미린스",
    nameEn: "Mirins",
    shortName: "MRN",
    region: "강원",
    ageGroup: "U9",
    venueKey: "chuncheon",
    phone: "010-1003-0002",
    divisionNum: 3,
  },
  {
    code: "U9-DGC",
    name: "드래건스클럽",
    nameEn: "Dragons Club",
    shortName: "DGC",
    region: "경기",
    ageGroup: "U9",
    venueKey: "anyang",
    phone: "010-1003-0003",
    divisionNum: 3,
  },
  {
    code: "U9-KUT",
    name: "KUTIGERS",
    nameEn: "KU Tigers",
    shortName: "KUT",
    region: "서울",
    ageGroup: "U9",
    venueKey: "korea_univ",
    phone: "010-1003-0004",
    divisionNum: 3,
  },
  {
    code: "U9-TSC",
    name: "타식크루",
    nameEn: "Tasik Crew",
    shortName: "TSC",
    region: "경기",
    ageGroup: "U9",
    venueKey: "bundang",
    phone: "010-1003-0005",
    divisionNum: 3,
  },
  {
    code: "U9-OWL",
    name: "올브즈",
    nameEn: "Owls",
    shortName: "OWL",
    region: "서울",
    ageGroup: "U9",
    venueKey: "taereung",
    phone: "010-1003-0006",
    divisionNum: 3,
  },
  {
    code: "U9-ANR",
    name: "안암레빗츠",
    nameEn: "Anam Rabbits",
    shortName: "ANR",
    region: "서울",
    ageGroup: "U9",
    venueKey: "korea_univ",
    phone: "010-1003-0007",
    divisionNum: 3,
  },

  // DIV 4 (8팀)
  {
    code: "U9-LHA",
    name: "리틀HL안양",
    nameEn: "Little HL Anyang",
    shortName: "LHA",
    region: "경기",
    ageGroup: "U9",
    venueKey: "anyang",
    phone: "010-1004-0001",
    divisionNum: 4,
  },
  {
    code: "U9-ZWV",
    name: "제니스와이번즈",
    nameEn: "Zenith Wyverns",
    shortName: "ZWV",
    region: "경기",
    ageGroup: "U9",
    venueKey: "suwon",
    phone: "010-1004-0002",
    divisionNum: 4,
  },
  {
    code: "U9-SLE",
    name: "수원리틀이글스",
    nameEn: "Suwon Little Eagles",
    shortName: "SLE",
    region: "경기",
    ageGroup: "U9",
    venueKey: "suwon",
    phone: "010-1004-0003",
    divisionNum: 4,
  },
  {
    code: "U9-HMC",
    name: "하키머신아이스하키클럽",
    nameEn: "Hockey Machine IHC",
    shortName: "HMC",
    region: "경기",
    ageGroup: "U9",
    venueKey: "goyang",
    phone: "010-1004-0004",
    divisionNum: 4,
  },
  {
    code: "U9-ZPX",
    name: "제니스피닉스",
    nameEn: "Zenith Phoenix",
    shortName: "ZPX",
    region: "서울",
    ageGroup: "U9",
    venueKey: "mokdong",
    phone: "010-1004-0005",
    divisionNum: 4,
  },
  {
    code: "U9-SBB",
    name: "성남블루베이스",
    nameEn: "Seongnam Blue Base",
    shortName: "SBB",
    region: "경기",
    ageGroup: "U9",
    venueKey: "tancheon",
    phone: "010-1004-0006",
    divisionNum: 4,
  },
  {
    code: "U9-ZEG",
    name: "제니스이글스",
    nameEn: "Zenith Eagles",
    shortName: "ZEG",
    region: "서울",
    ageGroup: "U9",
    venueKey: "mokdong",
    phone: "010-1004-0007",
    divisionNum: 4,
  },
  {
    code: "U9-GST",
    name: "고양스타즈",
    nameEn: "Goyang Stars",
    shortName: "GST",
    region: "경기",
    ageGroup: "U9",
    venueKey: "goyang",
    phone: "010-1004-0008",
    divisionNum: 4,
  },

  // DIV 5 (4팀)
  {
    code: "U9-MGA",
    name: "메가아이스하키클럽",
    nameEn: "Mega Ice Hockey Club",
    shortName: "MGA",
    region: "경기",
    ageGroup: "U9",
    venueKey: "bundang",
    phone: "010-1005-0001",
    divisionNum: 5,
  },
  {
    code: "U9-SBS",
    name: "성남블루세이버즈",
    nameEn: "Seongnam Blue Sabers",
    shortName: "SBS",
    region: "경기",
    ageGroup: "U9",
    venueKey: "tancheon",
    phone: "010-1005-0002",
    divisionNum: 5,
  },
  {
    code: "U9-GUJ",
    name: "광은우디레주니어",
    nameEn: "Gwangeun Udire Jr.",
    shortName: "GUJ",
    region: "서울",
    ageGroup: "U9",
    venueKey: "taereung",
    phone: "010-1005-0003",
    divisionNum: 5,
  },
  {
    code: "U9-TRS",
    name: "트레저스",
    nameEn: "Treasures",
    shortName: "TRS",
    region: "경기",
    ageGroup: "U9",
    venueKey: "bundang",
    phone: "010-1005-0004",
    divisionNum: 5,
  },
];

// ---------------------------------------------------------------------------
// U12 팀 (45팀) - 2026 i-League
// ---------------------------------------------------------------------------
const U12_TEAMS: TeamData[] = [
  // DIV 1 (8팀 - 최상위)
  {
    code: "U12-ZIC",
    name: "제니스아이스",
    nameEn: "Zenith Ice",
    shortName: "ZIC",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2001-0001",
    divisionNum: 1,
  },
  {
    code: "U12-CWL",
    name: "컬러웨일즈",
    nameEn: "Color Whales",
    shortName: "CW2",
    region: "제주",
    ageGroup: "U12",
    venueKey: "jeju",
    phone: "010-2001-0002",
    divisionNum: 1,
  },
  {
    code: "U12-SWE",
    name: "수원이글스",
    nameEn: "Suwon Eagles",
    shortName: "SWE",
    region: "경기",
    ageGroup: "U12",
    venueKey: "suwon",
    phone: "010-2001-0003",
    divisionNum: 1,
  },
  {
    code: "U12-ZFR",
    name: "제니스포레",
    nameEn: "Zenith Fore",
    shortName: "ZFR",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2001-0004",
    divisionNum: 1,
  },
  {
    code: "U12-RBT",
    name: "래빗츠",
    nameEn: "Rabbits",
    shortName: "RBT",
    region: "경기",
    ageGroup: "U12",
    venueKey: "goyang",
    phone: "010-2001-0005",
    divisionNum: 1,
  },
  {
    code: "U12-RDW",
    name: "루비덕스와일드",
    nameEn: "Ruby Ducks Wild",
    shortName: "RDW",
    region: "인천",
    ageGroup: "U12",
    venueKey: "incheon",
    phone: "010-2001-0006",
    divisionNum: 1,
  },
  {
    code: "U12-THD",
    name: "센더스",
    nameEn: "Thunders U12",
    shortName: "TD2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "jamsil",
    phone: "010-2001-0007",
    divisionNum: 1,
  },
  {
    code: "U12-ARI",
    name: "안암레빗츠아이스하키클럽",
    nameEn: "Anam Rabbits IHC",
    shortName: "ARI",
    region: "서울",
    ageGroup: "U12",
    venueKey: "korea_univ",
    phone: "010-2001-0008",
    divisionNum: 1,
  },

  // DIV 2 (7팀)
  {
    code: "U12-KUU",
    name: "케이유유나이티드",
    nameEn: "KU United",
    shortName: "KUU",
    region: "서울",
    ageGroup: "U12",
    venueKey: "korea_univ",
    phone: "010-2002-0001",
    divisionNum: 2,
  },
  {
    code: "U12-HLM",
    name: "HL목동",
    nameEn: "HL Mokdong U12",
    shortName: "HM2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2002-0002",
    divisionNum: 2,
  },
  {
    code: "U12-GRB",
    name: "고양래빗츠",
    nameEn: "Goyang Rabbits U12",
    shortName: "GR2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "goyang",
    phone: "010-2002-0003",
    divisionNum: 2,
  },
  {
    code: "U12-ZFL",
    name: "제니스플레임즈",
    nameEn: "Zenith Flames",
    shortName: "ZFL",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2002-0004",
    divisionNum: 2,
  },
  {
    code: "U12-IKZ",
    name: "아이키스제니스",
    nameEn: "IKIS Zenith",
    shortName: "IKZ",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2002-0005",
    divisionNum: 2,
  },
  {
    code: "U12-RDB",
    name: "루비덕스블레이즈",
    nameEn: "Ruby Ducks Blaze",
    shortName: "RDB",
    region: "인천",
    ageGroup: "U12",
    venueKey: "incheon",
    phone: "010-2002-0006",
    divisionNum: 2,
  },
  {
    code: "U12-HNT",
    name: "호네츠아이스하키클럽",
    nameEn: "Hornets Ice Hockey U12",
    shortName: "HN2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "bundang",
    phone: "010-2002-0007",
    divisionNum: 2,
  },

  // DIV 3 (7팀)
  {
    code: "U12-GEH",
    name: "고양이글스하키클럽",
    nameEn: "Goyang Eagles HC",
    shortName: "GEH",
    region: "경기",
    ageGroup: "U12",
    venueKey: "goyang",
    phone: "010-2003-0001",
    divisionNum: 3,
  },
  {
    code: "U12-MGA",
    name: "메가아이스하키클럽",
    nameEn: "Mega Ice Hockey U12",
    shortName: "MG2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "bundang",
    phone: "010-2003-0002",
    divisionNum: 3,
  },
  {
    code: "U12-RDK",
    name: "루비덕스",
    nameEn: "Ruby Ducks U12",
    shortName: "RD2",
    region: "인천",
    ageGroup: "U12",
    venueKey: "incheon",
    phone: "010-2003-0003",
    divisionNum: 3,
  },
  {
    code: "U12-TRX",
    name: "티렉스",
    nameEn: "T-Rex",
    shortName: "TRX",
    region: "경기",
    ageGroup: "U12",
    venueKey: "tancheon",
    phone: "010-2003-0004",
    divisionNum: 3,
  },
  {
    code: "U12-KU6",
    name: "케이유유나이티드16",
    nameEn: "KU United 16",
    shortName: "KU6",
    region: "서울",
    ageGroup: "U12",
    venueKey: "korea_univ",
    phone: "010-2003-0005",
    divisionNum: 3,
  },
  {
    code: "U12-ZPX",
    name: "제니스피닉스",
    nameEn: "Zenith Phoenix U12",
    shortName: "ZP2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2003-0006",
    divisionNum: 3,
  },
  {
    code: "U12-THB",
    name: "센더스블랙",
    nameEn: "Thunders Black U12",
    shortName: "TB2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "jamsil",
    phone: "010-2003-0007",
    divisionNum: 3,
  },

  // DIV 4 (8팀)
  {
    code: "U12-GST",
    name: "고양스타즈",
    nameEn: "Goyang Stars U12",
    shortName: "GS2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "goyang",
    phone: "010-2004-0001",
    divisionNum: 4,
  },
  {
    code: "U12-OWL",
    name: "올브즈",
    nameEn: "Owls U12",
    shortName: "OW2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "taereung",
    phone: "010-2004-0002",
    divisionNum: 4,
  },
  {
    code: "U12-BST",
    name: "비스트",
    nameEn: "Beast",
    shortName: "BST",
    region: "경기",
    ageGroup: "U12",
    venueKey: "bundang",
    phone: "010-2004-0003",
    divisionNum: 4,
  },
  {
    code: "U12-UJA",
    name: "의정부에론스",
    nameEn: "Uijeongbu Aeros U12",
    shortName: "UA2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "uijeongbu",
    phone: "010-2004-0004",
    divisionNum: 4,
  },
  {
    code: "U12-HMC",
    name: "하키머신아이스하키클럽",
    nameEn: "Hockey Machine U12",
    shortName: "HM3",
    region: "경기",
    ageGroup: "U12",
    venueKey: "goyang",
    phone: "010-2004-0005",
    divisionNum: 4,
  },
  {
    code: "U12-ITP",
    name: "아이스탑",
    nameEn: "Ice Top",
    shortName: "ITP",
    region: "경기",
    ageGroup: "U12",
    venueKey: "tancheon",
    phone: "010-2004-0006",
    divisionNum: 4,
  },
  {
    code: "U12-WVN",
    name: "와이번즈",
    nameEn: "Wyverns U12",
    shortName: "WV2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "suwon",
    phone: "010-2004-0007",
    divisionNum: 4,
  },
  {
    code: "U12-ZBL",
    name: "제니스블러즈",
    nameEn: "Zenith Blues",
    shortName: "ZBL",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2004-0008",
    divisionNum: 4,
  },

  // DIV 5 (12팀)
  {
    code: "U12-WPK",
    name: "올프팩",
    nameEn: "Wolf Pack U12",
    shortName: "WP2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "taereung",
    phone: "010-2005-0001",
    divisionNum: 5,
  },
  {
    code: "U12-DGC",
    name: "드래건스클럽",
    nameEn: "Dragons Club U12",
    shortName: "DG2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "anyang",
    phone: "010-2005-0002",
    divisionNum: 5,
  },
  {
    code: "U12-TRS",
    name: "트레저스",
    nameEn: "Treasures U12",
    shortName: "TR2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "bundang",
    phone: "010-2005-0003",
    divisionNum: 5,
  },
  {
    code: "U12-BLS",
    name: "블루세이버즈",
    nameEn: "Blue Sabers",
    shortName: "BLS",
    region: "경기",
    ageGroup: "U12",
    venueKey: "tancheon",
    phone: "010-2005-0004",
    divisionNum: 5,
  },
  {
    code: "U12-LHA",
    name: "리틀HL안양",
    nameEn: "Little HL Anyang U12",
    shortName: "LH2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "anyang",
    phone: "010-2005-0005",
    divisionNum: 5,
  },
  {
    code: "U12-SBB",
    name: "성남블루베이스",
    nameEn: "Seongnam Blue Base U12",
    shortName: "SB2",
    region: "경기",
    ageGroup: "U12",
    venueKey: "tancheon",
    phone: "010-2005-0006",
    divisionNum: 5,
  },
  {
    code: "U12-TSJ",
    name: "타식주니어",
    nameEn: "Tasik Junior",
    shortName: "TSJ",
    region: "경기",
    ageGroup: "U12",
    venueKey: "bundang",
    phone: "010-2005-0007",
    divisionNum: 5,
  },
  {
    code: "U12-AGF",
    name: "안양GA포스",
    nameEn: "Anyang GA Force",
    shortName: "AGF",
    region: "경기",
    ageGroup: "U12",
    venueKey: "anyang",
    phone: "010-2005-0008",
    divisionNum: 5,
  },
  {
    code: "U12-KUT",
    name: "KUTIGERS",
    nameEn: "KU Tigers U12",
    shortName: "KT2",
    region: "서울",
    ageGroup: "U12",
    venueKey: "korea_univ",
    phone: "010-2005-0009",
    divisionNum: 5,
  },
  {
    code: "U12-MRN",
    name: "미린스",
    nameEn: "Mirins U12",
    shortName: "MR2",
    region: "강원",
    ageGroup: "U12",
    venueKey: "chuncheon",
    phone: "010-2005-0010",
    divisionNum: 5,
  },
  {
    code: "U12-SBE",
    name: "성남블루이글스",
    nameEn: "Seongnam Blue Eagles",
    shortName: "SBE",
    region: "경기",
    ageGroup: "U12",
    venueKey: "tancheon",
    phone: "010-2005-0011",
    divisionNum: 5,
  },
  {
    code: "U12-JTD",
    name: "제주센더스",
    nameEn: "Jeju Thunders",
    shortName: "JTD",
    region: "제주",
    ageGroup: "U12",
    venueKey: "jeju",
    phone: "010-2005-0012",
    divisionNum: 5,
  },

  // DIV 6 (3팀)
  {
    code: "U12-ZLB",
    name: "제니스로빗츠",
    nameEn: "Zenith Lobitz",
    shortName: "ZLB",
    region: "서울",
    ageGroup: "U12",
    venueKey: "mokdong",
    phone: "010-2006-0001",
    divisionNum: 6,
  },
  {
    code: "U12-TRD",
    name: "센더스레드",
    nameEn: "Thunders Red",
    shortName: "TRD",
    region: "서울",
    ageGroup: "U12",
    venueKey: "jamsil",
    phone: "010-2006-0002",
    divisionNum: 6,
  },
  {
    code: "U12-GUD",
    name: "광은UDIRE",
    nameEn: "Gwangeun UDIRE",
    shortName: "GUD",
    region: "서울",
    ageGroup: "U12",
    venueKey: "taereung",
    phone: "010-2006-0003",
    divisionNum: 6,
  },
];

// ---------------------------------------------------------------------------
// 스포츠클럽 디비전리그 추가 팀 (중부권/남부권)
// ---------------------------------------------------------------------------
const REGIONAL_TEAMS: TeamData[] = [
  // 중부권 (8팀)
  {
    code: "REG-GPC",
    name: "강릉파인클로버스",
    nameEn: "Gangneung Pine Clovers",
    shortName: "GPC",
    region: "강원",
    ageGroup: "U12",
    venueKey: "gangneung",
    phone: "010-3001-0001",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-IKS",
    name: "아이키스",
    nameEn: "IKIS",
    shortName: "IKS",
    region: "경기",
    ageGroup: "U12",
    venueKey: "bundang",
    phone: "010-3001-0002",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-SJT",
    name: "세종터틀스",
    nameEn: "Sejong Turtles",
    shortName: "SJT",
    region: "충청",
    ageGroup: "U12",
    venueKey: "sejong",
    phone: "010-3001-0003",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-PHA",
    name: "포항엔젤스",
    nameEn: "Pohang Angels",
    shortName: "PHA",
    region: "경상",
    ageGroup: "U12",
    venueKey: "pohang",
    phone: "010-3001-0004",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-CCT",
    name: "춘천타이거스",
    nameEn: "Chuncheon Tigers",
    shortName: "CCT",
    region: "강원",
    ageGroup: "U12",
    venueKey: "chuncheon",
    phone: "010-3001-0005",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-DIU",
    name: "대전아이스유니콘스",
    nameEn: "Daejeon Ice Unicorns",
    shortName: "DIU",
    region: "충청",
    ageGroup: "U12",
    venueKey: "daejeon",
    phone: "010-3001-0006",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-JCW",
    name: "제주컬러웨일즈",
    nameEn: "Jeju Color Whales",
    shortName: "JCW",
    region: "제주",
    ageGroup: "U12",
    venueKey: "jeju",
    phone: "010-3001-0007",
    divisionNum: 0,
    regionalDiv: "중부권",
  },
  {
    code: "REG-TTS",
    name: "터틀스s",
    nameEn: "Turtles S",
    shortName: "TTS",
    region: "충청",
    ageGroup: "U12",
    venueKey: "sejong",
    phone: "010-3001-0008",
    divisionNum: 0,
    regionalDiv: "중부권",
  },

  // 남부권 (10팀)
  {
    code: "REG-DSE",
    name: "대구스카이이글스",
    nameEn: "Daegu Sky Eagles",
    shortName: "DSE",
    region: "경상",
    ageGroup: "U12",
    venueKey: "daegu",
    phone: "010-3002-0001",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-DLH",
    name: "대구리틀HL클럽팀",
    nameEn: "Daegu Little HL Club",
    shortName: "DLH",
    region: "경상",
    ageGroup: "U12",
    venueKey: "daegu",
    phone: "010-3002-0002",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-BKN",
    name: "블랙나이즈",
    nameEn: "Black Knives",
    shortName: "BKN",
    region: "경상",
    ageGroup: "U12",
    venueKey: "busan",
    phone: "010-3002-0003",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-RDL",
    name: "레드라이언",
    nameEn: "Red Lion",
    shortName: "RDL",
    region: "경상",
    ageGroup: "U12",
    venueKey: "ulsan",
    phone: "010-3002-0004",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-ULD",
    name: "울산돌핀스",
    nameEn: "Ulsan Dolphins",
    shortName: "ULD",
    region: "경상",
    ageGroup: "U12",
    venueKey: "ulsan",
    phone: "010-3002-0005",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-HLG",
    name: "HL김해",
    nameEn: "HL Gimhae",
    shortName: "HLG",
    region: "경상",
    ageGroup: "U12",
    venueKey: "gimhae",
    phone: "010-3002-0006",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-CWD",
    name: "창원데블스",
    nameEn: "Changwon Devils",
    shortName: "CWD",
    region: "경상",
    ageGroup: "U12",
    venueKey: "changwon",
    phone: "010-3002-0007",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-JBS",
    name: "전북스포츠클럽",
    nameEn: "Jeonbuk Sports Club",
    shortName: "JBS",
    region: "전라",
    ageGroup: "U12",
    venueKey: "jeonju",
    phone: "010-3002-0008",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-GWB",
    name: "강원베어스",
    nameEn: "Gangwon Bears",
    shortName: "GWB",
    region: "강원",
    ageGroup: "U12",
    venueKey: "gangneung",
    phone: "010-3002-0009",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
  {
    code: "REG-GJI",
    name: "광주아이스",
    nameEn: "Gwangju Ice",
    shortName: "GJI",
    region: "전라",
    ageGroup: "U12",
    venueKey: "gwangju",
    phone: "010-3002-0010",
    divisionNum: 0,
    regionalDiv: "남부권",
  },
];

// ---------------------------------------------------------------------------
// 펀하키(Fun Hockey) 레슨 클럽 (3팀)
// ---------------------------------------------------------------------------
const FUN_HOCKEY_TEAMS: TeamData[] = [
  {
    code: "FUN-BLK",
    name: "펀블랙",
    nameEn: "Fun Black",
    shortName: "FBK",
    region: "경기",
    ageGroup: "U9",
    venueKey: "blackice",
    phone: "010-4001-0001",
    divisionNum: 0,
  },
  {
    code: "FUN-SLH",
    name: "펀실화",
    nameEn: "Fun Silhwa",
    shortName: "FSH",
    region: "경기",
    ageGroup: "U9",
    venueKey: "blackice",
    phone: "010-4001-0002",
    divisionNum: 0,
  },
  {
    code: "FUN-MRN",
    name: "펀모닝",
    nameEn: "Fun Morning",
    shortName: "FMN",
    region: "경기",
    ageGroup: "U9",
    venueKey: "korea_univ",
    phone: "010-4001-0003",
    divisionNum: 0,
  },
];

// 전체 팀 목록
const ALL_TEAMS: TeamData[] = [
  ...U9_TEAMS,
  ...U12_TEAMS,
  ...REGIONAL_TEAMS,
  ...FUN_HOCKEY_TEAMS,
];

// =============================================================================
// 3. 시드 실행 함수
// =============================================================================

async function seedTeams() {
  console.log("=".repeat(70));
  console.log("  TEAMPLUS - 전국 아이스하키 유소년 팀 마스터 데이터 시드");
  console.log("  기준: 2026 i-League 초등부(U9/U12) 디비전 편성(최종)");
  console.log("=".repeat(70));
  console.log("");

  // -------------------------------------------------------------------------
  // Step 1: 시스템 사용자 생성 (Club.coachId FK 충족용)
  // -------------------------------------------------------------------------
  console.log("[1/6] 시스템 사용자 생성...");

  const SYSTEM_EMAIL = "system-seed@teamplus.com";
  const SYSTEM_PHONE = "010-0000-9999";
  const passwordHash = await bcrypt.hash("SystemSeed2026!", 10);

  let systemUser = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
  });

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: SYSTEM_EMAIL,
        phone: SYSTEM_PHONE,
        username: "system-seed",
        passwordHash,
        userType: "ADMIN",
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    console.log("  + 시스템 사용자 생성 완료");
  } else {
    console.log("  = 시스템 사용자 이미 존재");
  }

  // -------------------------------------------------------------------------
  // Step 2: 빙상장(Venue) 생성
  // -------------------------------------------------------------------------
  console.log("\n[2/6] 빙상장(Venue) 생성...");

  const venueMap: Record<string, string> = {}; // key -> venue.id

  for (const venue of VENUES) {
    const existing = await prisma.venue.findFirst({
      where: { name: venue.name },
    });

    if (existing) {
      venueMap[venue.key] = existing.id;
      // 업데이트 불필요 시 skip
    } else {
      const created = await prisma.venue.create({
        data: {
          name: venue.name,
          address: venue.address,
          city: venue.city,
          rinkSize: venue.rinkSize || null,
          status: "active",
        },
      });
      venueMap[venue.key] = created.id;
      console.log(`  + ${venue.name}`);
    }
  }
  console.log(`  총 ${Object.keys(venueMap).length}개 빙상장 준비 완료`);

  // -------------------------------------------------------------------------
  // Step 3: 클럽(Club) + 팀(Team) 생성
  // -------------------------------------------------------------------------
  console.log("\n[3/6] 클럽(Club) + 팀(Team) 생성...");

  const teamMap: Record<string, string> = {}; // team.code -> team.id
  let createdClubs = 0;
  let createdTeams = 0;

  for (const team of ALL_TEAMS) {
    const clubCode = `SEED-${team.code}`;

    // Club upsert
    let club = await prisma.club.findUnique({
      where: { clubCode },
    });

    if (!club) {
      club = await prisma.club.create({
        data: {
          clubCode,
          clubName: team.name,
          coachId: systemUser.id,
          location: `${team.region} (${team.nameEn})`,
          phone: team.phone,
        },
      });
      createdClubs++;
    }

    // Team upsert (Club 내 같은 이름의 팀 검색)
    let teamRecord = await prisma.team.findFirst({
      where: {
        clubId: club.id,
        name: team.name,
        division: team.ageGroup,
      },
    });

    if (!teamRecord) {
      teamRecord = await prisma.team.create({
        data: {
          clubId: club.id,
          name: team.name,
          shortName: team.shortName,
          division: team.ageGroup,
          primaryColor: getTeamColor(team.code),
          isActive: true,
        },
      });
      createdTeams++;
    }

    teamMap[team.code] = teamRecord.id;

    // Venue 연결 (Club <-> Venue)
    if (venueMap[team.venueKey]) {
      const existingVenue = await prisma.venue.findFirst({
        where: {
          id: venueMap[team.venueKey],
          clubId: club.id,
        },
      });
      if (!existingVenue) {
        // Venue에 clubId 업데이트 (첫 번째 팀만)
        const venueRecord = await prisma.venue.findUnique({
          where: { id: venueMap[team.venueKey] },
        });
        if (venueRecord && !venueRecord.clubId) {
          await prisma.venue.update({
            where: { id: venueMap[team.venueKey] },
            data: { clubId: club.id },
          });
        }
      }
    }
  }

  console.log(`  + 신규 클럽 ${createdClubs}개 생성`);
  console.log(`  + 신규 팀 ${createdTeams}개 생성`);
  console.log(`  총 ${ALL_TEAMS.length}개 팀 준비 완료`);

  // -------------------------------------------------------------------------
  // Step 4: 리그(League) 생성
  // -------------------------------------------------------------------------
  console.log("\n[4/6] 리그(League) 생성...");

  // 2026 i-League U9
  let leagueU9 = await prisma.league.findFirst({
    where: { name: "2026 i-League U9", season: "2026" },
  });
  if (!leagueU9) {
    leagueU9 = await prisma.league.create({
      data: {
        name: "2026 i-League U9",
        season: "2026",
        year: 2026,
        description:
          "2026 유청소년 클럽리그(i-League) 초등부 U9 (2016~2017년생)",
        ageGroup: "U9",
        status: "active",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-11-30"),
      },
    });
    console.log("  + 2026 i-League U9 생성");
  } else {
    console.log("  = 2026 i-League U9 이미 존재");
  }

  // 2026 i-League U12
  let leagueU12 = await prisma.league.findFirst({
    where: { name: "2026 i-League U12", season: "2026" },
  });
  if (!leagueU12) {
    leagueU12 = await prisma.league.create({
      data: {
        name: "2026 i-League U12",
        season: "2026",
        year: 2026,
        description:
          "2026 유청소년 클럽리그(i-League) 초등부 U12 (2013~2015년생)",
        ageGroup: "U12",
        status: "active",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-11-30"),
      },
    });
    console.log("  + 2026 i-League U12 생성");
  } else {
    console.log("  = 2026 i-League U12 이미 존재");
  }

  // 2026 스포츠클럽 디비전리그
  let leagueRegional = await prisma.league.findFirst({
    where: { name: "2026 스포츠클럽 디비전리그 U12", season: "2026" },
  });
  if (!leagueRegional) {
    leagueRegional = await prisma.league.create({
      data: {
        name: "2026 스포츠클럽 디비전리그 U12",
        season: "2026",
        year: 2026,
        description: "2026 스포츠클럽 디비전리그 U12 (중부권/남부권)",
        ageGroup: "U12",
        status: "active",
        startDate: new Date("2026-04-26"),
        endDate: new Date("2026-11-30"),
      },
    });
    console.log("  + 2026 스포츠클럽 디비전리그 U12 생성");
  } else {
    console.log("  = 2026 스포츠클럽 디비전리그 U12 이미 존재");
  }

  // -------------------------------------------------------------------------
  // Step 5: 디비전(Division) 생성
  // -------------------------------------------------------------------------
  console.log("\n[5/6] 디비전(Division) 생성...");

  // U9 디비전 (DIV 1 ~ DIV 5)
  const u9Divisions: Record<number, string> = {};
  for (let div = 1; div <= 5; div++) {
    const divName = `DIV ${div}`;
    let division = await prisma.division.findFirst({
      where: { leagueId: leagueU9.id, name: divName },
    });
    if (!division) {
      division = await prisma.division.create({
        data: {
          leagueId: leagueU9.id,
          name: divName,
          level: div,
          description: `U9 ${divName} (${div === 1 ? "최상위" : `레벨 ${div}`})`,
          sortOrder: div,
        },
      });
      console.log(`  + U9 ${divName}`);
    }
    u9Divisions[div] = division.id;
  }

  // U12 디비전 (DIV 1 ~ DIV 6)
  const u12Divisions: Record<number, string> = {};
  for (let div = 1; div <= 6; div++) {
    const divName = `DIV ${div}`;
    let division = await prisma.division.findFirst({
      where: { leagueId: leagueU12.id, name: divName },
    });
    if (!division) {
      division = await prisma.division.create({
        data: {
          leagueId: leagueU12.id,
          name: divName,
          level: div,
          description: `U12 ${divName} (${div === 1 ? "최상위" : `레벨 ${div}`})`,
          sortOrder: div,
        },
      });
      console.log(`  + U12 ${divName}`);
    }
    u12Divisions[div] = division.id;
  }

  // 지역 디비전 (중부권, 남부권)
  const regionalDivisions: Record<string, string> = {};
  for (const regionName of ["중부권", "남부권"]) {
    let division = await prisma.division.findFirst({
      where: { leagueId: leagueRegional.id, name: regionName },
    });
    if (!division) {
      division = await prisma.division.create({
        data: {
          leagueId: leagueRegional.id,
          name: regionName,
          level: regionName === "중부권" ? 1 : 2,
          description: `스포츠클럽 디비전리그 ${regionName}`,
          sortOrder: regionName === "중부권" ? 1 : 2,
        },
      });
      console.log(`  + 디비전리그 ${regionName}`);
    }
    regionalDivisions[regionName] = division.id;
  }

  // -------------------------------------------------------------------------
  // Step 6: 팀-디비전 매핑 (TeamDivision)
  // -------------------------------------------------------------------------
  console.log("\n[6/6] 팀-디비전 편성(TeamDivision) 매핑...");

  let mappedCount = 0;

  // U9 팀 매핑
  for (const team of U9_TEAMS) {
    if (
      team.divisionNum > 0 &&
      teamMap[team.code] &&
      u9Divisions[team.divisionNum]
    ) {
      const existing = await prisma.teamDivision.findFirst({
        where: {
          teamId: teamMap[team.code],
          divisionId: u9Divisions[team.divisionNum],
          season: "2026",
        },
      });
      if (!existing) {
        await prisma.teamDivision.create({
          data: {
            teamId: teamMap[team.code],
            divisionId: u9Divisions[team.divisionNum],
            season: "2026",
            status: "active",
          },
        });
        mappedCount++;
      }
    }
  }

  // U12 팀 매핑
  for (const team of U12_TEAMS) {
    if (
      team.divisionNum > 0 &&
      teamMap[team.code] &&
      u12Divisions[team.divisionNum]
    ) {
      const existing = await prisma.teamDivision.findFirst({
        where: {
          teamId: teamMap[team.code],
          divisionId: u12Divisions[team.divisionNum],
          season: "2026",
        },
      });
      if (!existing) {
        await prisma.teamDivision.create({
          data: {
            teamId: teamMap[team.code],
            divisionId: u12Divisions[team.divisionNum],
            season: "2026",
            status: "active",
          },
        });
        mappedCount++;
      }
    }
  }

  // 지역 팀 매핑
  for (const team of REGIONAL_TEAMS) {
    if (
      team.regionalDiv &&
      teamMap[team.code] &&
      regionalDivisions[team.regionalDiv]
    ) {
      const existing = await prisma.teamDivision.findFirst({
        where: {
          teamId: teamMap[team.code],
          divisionId: regionalDivisions[team.regionalDiv],
          season: "2026",
        },
      });
      if (!existing) {
        await prisma.teamDivision.create({
          data: {
            teamId: teamMap[team.code],
            divisionId: regionalDivisions[team.regionalDiv],
            season: "2026",
            status: "active",
          },
        });
        mappedCount++;
      }
    }
  }

  console.log(`  + ${mappedCount}개 팀-디비전 편성 완료`);

  // -------------------------------------------------------------------------
  // 완료 요약
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  console.log("  시드 실행 완료!");
  console.log("=".repeat(70));
  console.log(`
  요약:
    빙상장(Venue)     : ${VENUES.length}개
    클럽(Club)        : ${ALL_TEAMS.length}개
    팀(Team)          : ${ALL_TEAMS.length}개
    리그(League)       : 3개 (i-League U9, i-League U12, 스포츠클럽 디비전리그)
    디비전(Division)   : 13개 (U9: 5개, U12: 6개, 지역: 2개)
    팀-디비전 편성     : ${U9_TEAMS.length + U12_TEAMS.length + REGIONAL_TEAMS.length}개 (U9: ${U9_TEAMS.length}, U12: ${U12_TEAMS.length}, 지역: ${REGIONAL_TEAMS.length})

  데이터 출처:
    - 2026 유청소년 클럽리그(i-League) 디비전 편성(최종)
    - 대한아이스하키협회 2026.03.12 공식 발표
    - 2026 스포츠클럽 디비전리그 U12 경기표

  확인 방법:
    GET /api/v1/leagues              -- 리그 목록
    GET /api/v1/leagues/:id          -- 디비전 포함
    GET /api/v1/divisions/:id        -- 팀 목록
  `);
}

// =============================================================================
// 유틸리티 함수
// =============================================================================

/**
 * 팀 코드 기반 대표 색상 반환
 * 실제 팀 색상이 확인되면 업데이트 예정
 */
function getTeamColor(code: string): string {
  const colorMap: Record<string, string> = {
    // 루비덕스 계열 - 마룬/버건디
    "U9-RDR": "#800020",
    "U9-RDK": "#800020",
    "U12-RDW": "#800020",
    "U12-RDB": "#800020",
    "U12-RDK": "#800020",

    // 제니스 계열 - 네이비
    "U9-ZBT": "#001F5B",
    "U9-ZBS": "#4A6FA5",
    "U9-ZBB": "#7B6D3E",
    "U9-ZWV": "#001F5B",
    "U9-ZPX": "#CC5500",
    "U9-ZEG": "#001F5B",
    "U12-ZIC": "#001F5B",
    "U12-ZFR": "#001F5B",
    "U12-ZFL": "#CC3300",
    "U12-ZPX": "#CC5500",
    "U12-ZBL": "#003399",
    "U12-ZLB": "#001F5B",
    "U12-IKZ": "#001F5B",

    // 센더스 계열 - 진한 파랑
    "U9-THD": "#0033CC",
    "U9-THB": "#1A1A1A",
    "U12-THD": "#0033CC",
    "U12-THB": "#1A1A1A",
    "U12-TRD": "#CC0000",

    // HL 계열 - 빨강
    "U9-HLM": "#CC0000",
    "U12-HLM": "#CC0000",
    "U9-LHA": "#CC0000",
    "U12-LHA": "#CC0000",
    "REG-HLG": "#CC0000",

    // 컬러웨일즈 - 보라
    "U9-CWL": "#6A0DAD",
    "U12-CWL": "#6A0DAD",
    "REG-JCW": "#6A0DAD",

    // 기본색
  };

  return colorMap[code] || "#2563EB"; // 기본값: 블루
}

// =============================================================================
// 실행
// =============================================================================

seedTeams()
  .then(() => {
    console.log("\n시드 스크립트 정상 종료.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n시드 스크립트 오류 발생:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
