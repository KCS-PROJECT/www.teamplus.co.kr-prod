import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export const ACCOUNT_LIST_STATUSES = [
  "NONE",
  "SUBMITTED",
  "REGISTERED",
  "FAILED",
] as const;
export type AccountListStatus = (typeof ACCOUNT_LIST_STATUSES)[number];

/** 운영자 — 팀별 정산 계좌 목록. NONE = 계좌 미입력 팀. */
export class QuerySettlementAccountsDto {
  @ApiPropertyOptional({ enum: ACCOUNT_LIST_STATUSES })
  @IsOptional()
  @IsIn(ACCOUNT_LIST_STATUSES, {
    message: "상태는 NONE, SUBMITTED, REGISTERED, FAILED 중 하나여야 합니다.",
  })
  status?: AccountListStatus;

  @ApiPropertyOptional({ description: "팀명·팀코드 검색" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined,
  )
  @IsString()
  @MaxLength(50)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
