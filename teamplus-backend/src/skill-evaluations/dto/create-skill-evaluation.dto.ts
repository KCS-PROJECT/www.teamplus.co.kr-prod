import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  IsIn,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

const DIMENSION_NAMES = [
  "스케이팅",
  "퍽핸들링",
  "패싱",
  "슛팅",
  "게임운영",
] as const;

export class SkillDimensionDto {
  @ApiProperty({
    description: "평가 항목명",
    enum: DIMENSION_NAMES,
  })
  @IsString()
  @IsIn(DIMENSION_NAMES)
  dimensionName!: string;

  @ApiProperty({ description: "점수 (1-100)", minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  score!: number;

  @ApiPropertyOptional({ description: "항목별 코멘트" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class CreateSkillEvaluationDto {
  @ApiProperty({ description: "클럽 멤버 ID" })
  @IsString()
  memberId!: string;

  @ApiProperty({ description: "평가 날짜 (ISO 8601)" })
  @IsString()
  evaluationDate!: string;

  @ApiProperty({ description: "종합 점수 (1-100)", minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  overallScore!: number;

  @ApiPropertyOptional({ description: "코치 종합 코멘트" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coachComment?: string;

  @ApiPropertyOptional({ description: "개선 필요 영역" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  improvementAreas?: string;

  @ApiPropertyOptional({ description: "수업 ID (선택)" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: "항목별 평가 목록 (최대 5개)" })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDimensionDto)
  dimensions?: SkillDimensionDto[];
}
