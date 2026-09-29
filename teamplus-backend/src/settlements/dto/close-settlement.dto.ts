import { IsString, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 월 마감 생성기 요청 DTO — POST /api/v1/settlements/close.
 */
export class CloseSettlementDto {
  @ApiProperty({
    description: "마감할 정산월 (YYYY-MM) — 종료된 과거월만 가능",
    example: "2026-08",
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "정산월은 YYYY-MM 형식이어야 합니다.",
  })
  month!: string;
}
