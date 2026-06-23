import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PayoutSettlementDto {
  @ApiPropertyOptional({
    description: "지급 메모 (선택)",
    example: "2026-04 정기 지급 완료",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
