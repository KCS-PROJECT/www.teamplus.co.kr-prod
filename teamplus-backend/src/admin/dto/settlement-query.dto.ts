import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsDateString,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export enum SettlementStatusFilter {
  ALL = "all",
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export class AdminSettlementQueryDto {
  @ApiPropertyOptional({
    description: "클럽 ID로 필터링",
    example: "club-uuid",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description: "정산 상태 필터",
    enum: SettlementStatusFilter,
    default: SettlementStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(SettlementStatusFilter)
  status?: SettlementStatusFilter;

  @ApiPropertyOptional({
    description: "정산 월 (YYYY-MM 형식)",
    example: "2026-01",
  })
  @IsOptional()
  @IsString()
  settlementMonth?: string;

  @ApiPropertyOptional({
    description: "조회 시작일",
    example: "2026-01-01",
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: "조회 종료일",
    example: "2026-01-31",
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: "페이지 번호 (1부터 시작)",
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "페이지 크기",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
