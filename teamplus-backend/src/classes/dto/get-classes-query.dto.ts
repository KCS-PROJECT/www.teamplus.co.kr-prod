import { IsOptional, IsString, IsIn, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * classes 도메인의 수업 유형 (학부모용 결제 수업).
 * 정규/레슨 2카테고리.
 *   - regular: 팀 정기 수업 (teamId 기반, 월 정액 또는 후불)
 *   - lesson:  오픈클래스 레슨 (academyId 기반)
 * ※ training 도메인(REGULAR_TRAINING/GAME/FUN/CAMP/PICKUP)은 별도 SoT (training/dto/create-training.dto.ts).
 */
const TRAINING_TYPES = ["regular", "lesson"] as const;

// 상위 분류 (FE: src/lib/class-categories.ts SoT 와 정합).
// 'tournament' 는 별 도메인(Tournament) 이라 이 DTO 대상이 아님.
const CLASS_CATEGORIES = ["regular", "open"] as const;
export type ClassCategoryCode = (typeof CLASS_CATEGORIES)[number];

export class GetClassesQueryDto {
  @ApiPropertyOptional({
    description: "수업 유형 필터 (세부 형태)",
    enum: TRAINING_TYPES,
    example: "regular",
  })
  @IsOptional()
  @IsString()
  @IsIn(TRAINING_TYPES, { message: "유효한 수업 유형을 선택해주세요." })
  trainingType?: string;

  @ApiPropertyOptional({
    description:
      "상위 분류 필터 (regular: 클럽 정규 수업 · open: 아카데미 오픈클래스)",
    enum: CLASS_CATEGORIES,
    example: "regular",
  })
  @IsOptional()
  @IsString()
  @IsIn(CLASS_CATEGORIES, { message: "유효한 분류를 선택해주세요." })
  category?: ClassCategoryCode;

  @ApiPropertyOptional({
    description:
      "학부모 자녀 선택 스코프 — 지정 시 해당 자녀 소속 팀 수업만 (PARENT 전용)",
  })
  @IsOptional()
  @IsString()
  childId?: string;

  @ApiPropertyOptional({
    description: "자녀 나이 (이 나이의 자녀가 수업 가능한 수업 필터)",
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "나이는 정수여야 합니다." })
  @Min(0, { message: "나이는 0 이상이어야 합니다." })
  @Max(100, { message: "나이는 100 이하여야 합니다." })
  childAge?: number;

  @ApiPropertyOptional({
    description: "페이지 번호 (기본값: 1)",
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "페이지는 정수여야 합니다." })
  @Min(1, { message: "페이지는 1 이상이어야 합니다." })
  page?: number;

  @ApiPropertyOptional({
    description: "페이지당 항목 수 (기본값: 20, 최대: 50)",
    example: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit은 정수여야 합니다." })
  @Min(1, { message: "limit은 1 이상이어야 합니다." })
  @Max(50, { message: "limit은 50 이하여야 합니다." })
  limit?: number;
}
