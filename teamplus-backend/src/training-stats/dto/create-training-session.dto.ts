import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  IsNumber,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TrainingMetricDto {
  @ApiProperty({
    description: "지표 이름 (speed|accuracy|endurance|agility|strength)",
  })
  @IsString()
  @MaxLength(50)
  metricName!: string;

  @ApiProperty({ description: "측정값" })
  @IsNumber()
  metricValue!: number;

  @ApiPropertyOptional({ description: "단위 (km/h, %, reps 등)" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
}

export class CreateTrainingSessionDto {
  @ApiProperty({ description: "ClubMember ID" })
  @IsString()
  memberId!: string;

  @ApiProperty({ description: "클럽 ID" })
  @IsString()
  teamId!: string;

  @ApiPropertyOptional({ description: "연결된 수업 ID" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ description: "훈련 일자 (ISO 8601)" })
  @IsDateString()
  sessionDate!: string;

  @ApiProperty({ description: "훈련 시간 (분)", minimum: 1 })
  @IsInt()
  @Min(1)
  durationMin!: number;

  @ApiPropertyOptional({
    description: "강도 (low|medium|high)",
    default: "medium",
  })
  @IsOptional()
  @IsIn(["low", "medium", "high"])
  intensityLvl?: string;

  @ApiPropertyOptional({
    description: "집중 영역 (skating|shooting|passing|defense|fitness)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  focusArea?: string;

  @ApiPropertyOptional({ description: "메모" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: "훈련 지표 목록",
    type: [TrainingMetricDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingMetricDto)
  metrics?: TrainingMetricDto[];
}
