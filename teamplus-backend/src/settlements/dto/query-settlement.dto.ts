import {
  IsOptional,
  IsDateString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

/** 정산 상태 값 */
export enum SettlementStatusEnum {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * 정산 목록 조회 쿼리 DTO
 */
export class QuerySettlementDto {
  @ApiPropertyOptional({
    description: "조회 시작일 (ISO 8601)",
    example: "2026-01-01",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "조회 종료일 (ISO 8601)",
    example: "2026-12-31",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: "정산 상태 필터",
    enum: SettlementStatusEnum,
  })
  @IsOptional()
  @IsEnum(SettlementStatusEnum, {
    message:
      "유효한 정산 상태를 입력해주세요. (pending|processing|completed|failed)",
  })
  status?: SettlementStatusEnum;

  @ApiPropertyOptional({ description: "페이지 번호 (1부터)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "페이지 크기", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
