import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApproveSettlementDto {
  @ApiPropertyOptional({
    description: "승인 메모 (선택)",
    example: "정산 내역 검토 완료",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * 정산 반려 DTO — 반려 시 사유 필수
 */
export class RejectSettlementDto {
  @ApiProperty({
    description: "반려 사유 (reject 시 필수)",
    example: "금액 불일치로 재검토 필요",
    maxLength: 500,
  })
  @IsString({ message: "반려 사유는 문자열이어야 합니다." })
  @MaxLength(500, { message: "반려 사유는 500자 이내로 입력해주세요." })
  @IsNotEmpty({ message: "반려 사유를 입력해주세요." })
  reason!: string;
}
