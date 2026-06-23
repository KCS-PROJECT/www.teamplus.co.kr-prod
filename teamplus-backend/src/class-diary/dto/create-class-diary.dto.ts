import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsDateString,
  Min,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateClassDiaryDto {
  @ApiProperty({ description: "수업 ID" })
  @IsString()
  classId!: string;

  @ApiProperty({ description: "클럽 ID" })
  @IsString()
  teamId!: string;

  @ApiProperty({ description: "수업 일자 (ISO 8601)" })
  @IsDateString()
  sessionDate!: string;

  @ApiPropertyOptional({ description: "주요 훈련 내용" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mainFocus?: string;

  @ApiPropertyOptional({ description: "훈련 상세 설명" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  drillDesc?: string;

  @ApiPropertyOptional({
    description: "강도 (low|medium|high)",
    default: "medium",
  })
  @IsOptional()
  @IsIn(["low", "medium", "high"])
  intensityLevel?: string;

  @ApiProperty({ description: "출석 인원", minimum: 0 })
  @IsInt()
  @Min(0)
  presentCount!: number;

  @ApiProperty({ description: "결석 인원", minimum: 0 })
  @IsInt()
  @Min(0)
  absentCount!: number;

  @ApiProperty({ description: "전체 인원", minimum: 0 })
  @IsInt()
  @Min(0)
  totalCount!: number;

  @ApiPropertyOptional({ description: "코치 종합 의견" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coachNotes?: string;
}
