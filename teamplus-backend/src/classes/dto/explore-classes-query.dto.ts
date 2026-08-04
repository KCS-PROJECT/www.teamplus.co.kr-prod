import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  CLASSES_DOMAIN_TRAINING_TYPES,
  CLASS_CATEGORIES,
  CLASS_DAYS_OF_WEEK,
} from "@/common/constants/class-domain.constant";
import {
  ALL_DISTRICTS,
  VENUE_CITIES,
} from "@/common/constants/regions.constant";

const TIME_SLOTS = ["morning", "afternoon", "evening"] as const;
const SORT_OPTIONS = ["recent", "capacity"] as const;

/**
 * 전국 수업 탐색 쿼리 — `GET /api/v1/classes/explore`.
 *
 * 이 엔드포인트는 `@Public()` 이라 비로그인도 호출한다.
 *   · `page`/`limit` 은 문자열로 받아 서비스에서 `clampLimit`/`clampOffset` 으로 클램프한다
 *     (400 대신 조용히 자른다 — 공개 경로에서 상한을 초과했다는 사실 자체를 알릴 이유가 없다).
 *   · 노출 범위 자체는 클라이언트가 지정할 수 없다 — `visibility` 는 쿼리에 없고
 *     서비스가 뷰어 기준으로 강제한다(`buildClassVisibilityWhere`).
 *
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md §5-2
 */
export class ExploreClassesQueryDto {
  @ApiPropertyOptional({
    description: "검색어 — 수업명·설명·강사명·팀명 부분일치",
    example: "초급",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "지역(시/도) — 수업 장소 기준, 미지정 시 팀 홈링크장으로 폴백",
    enum: VENUE_CITIES,
    example: "서울",
  })
  @IsOptional()
  @IsIn(VENUE_CITIES)
  city?: string;

  @ApiPropertyOptional({
    description:
      "지역(시군구) — city 와 함께 지정할 때만 적용됩니다. 감독이 등록 시 선택한 수업 지역 기준이라 " +
      "지역 미입력 수업(2026-08-04 이전)은 결과에서 제외됩니다.",
    example: "강남구",
  })
  @IsOptional()
  // 기본 @IsIn 메시지는 시군구 250여 개를 전부 나열한다 → 짧게 대체.
  @IsIn(ALL_DISTRICTS, { message: "유효하지 않은 시군구입니다." })
  district?: string;

  @ApiPropertyOptional({
    description: "대상 구분",
    enum: CLASS_CATEGORIES,
  })
  @IsOptional()
  @IsIn(CLASS_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    description: "수업 유형 (학부모용 결제 수업만)",
    enum: CLASSES_DOMAIN_TRAINING_TYPES,
  })
  @IsOptional()
  @IsIn(CLASSES_DOMAIN_TRAINING_TYPES)
  trainingType?: string;

  @ApiPropertyOptional({
    description: "요일 — 쉼표 구분 다중 선택 (예: 월,수,금)",
    example: "월,수",
  })
  @IsOptional()
  // 쿼리스트링은 `?dayOfWeek=월,수` 와 `?dayOfWeek=월&dayOfWeek=수` 두 형태로 온다.
  // 어느 쪽이든 배열로 정규화한다.
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const raw = Array.isArray(value) ? value : String(value).split(",");
    return raw.map((v) => String(v).trim()).filter((v) => v.length > 0);
  })
  @IsArray()
  @IsIn(CLASS_DAYS_OF_WEEK, { each: true })
  dayOfWeek?: string[];

  @ApiPropertyOptional({
    description:
      "시간대 — morning(~12시) | afternoon(12~17시) | evening(17시~)",
    enum: TIME_SLOTS,
  })
  @IsOptional()
  @IsIn(TIME_SLOTS)
  timeSlot?: (typeof TIME_SLOTS)[number];

  @ApiPropertyOptional({
    description:
      "대상 출생연도 — 비로그인 또는 자녀 미선택 시 직접 지정. 로그인 학부모/학생은 자동 적용.",
    example: 2015,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  birthYear?: number;

  @ApiPropertyOptional({
    description: "가격 상한 (원) — 판매 중인 상품의 최저가 기준",
    example: 200000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional({
    description:
      "정렬 — recent(최신순·기본) | capacity(정원 많은 순). " +
      "가격순은 최저가가 관계 테이블에 있어 DB 정렬이 불가하므로 제공하지 않는다(priceMax 필터로 대체).",
    enum: SORT_OPTIONS,
    default: "recent",
  })
  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort?: (typeof SORT_OPTIONS)[number];

  @ApiPropertyOptional({ description: "페이지 (1부터)", example: 1 })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    description: "페이지 크기 (기본 20, 최대 50 — 초과 시 50으로 클램프)",
    example: 20,
  })
  @IsOptional()
  @IsString()
  limit?: string;
}
