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
import { SettlementEntryType, SettlementSourceType } from "@prisma/client";

const ENTRY_TYPES = Object.values(SettlementEntryType);
const SOURCE_TYPES = Object.values(SettlementSourceType);

const trimOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/**
 * 정산 명세(건별) 조회·CSV 공용 쿼리. CSV 는 page/pageSize 를 무시하고 같은 필터로 전체를 내린다.
 */
export class QuerySettlementDetailsDto {
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

  @ApiPropertyOptional({ description: "구분 필터", enum: ENTRY_TYPES })
  @IsOptional()
  @IsIn(ENTRY_TYPES, { message: "구분은 PAYMENT 또는 REFUND 여야 합니다." })
  entryType?: SettlementEntryType;

  @ApiPropertyOptional({
    description: "검색어 — 상품명·주문번호 부분 일치(대소문자 무시)",
  })
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: "출처 필터 — 요약 행 드릴다운",
    enum: SOURCE_TYPES,
  })
  @IsOptional()
  @IsIn(SOURCE_TYPES, {
    message: "출처는 CLASS, TOURNAMENT, OTHER 중 하나여야 합니다.",
  })
  sourceType?: SettlementSourceType;

  @ApiPropertyOptional({
    description:
      "출처 ID — CLASS/TOURNAMENT 드릴다운 시 sourceType 과 함께 전달",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceId?: string;

  @ApiPropertyOptional({
    description:
      "상품명 정확 일치 — 출처가 OTHER 인 요약 행 드릴다운용(검색어 q 와 구분)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;
}
