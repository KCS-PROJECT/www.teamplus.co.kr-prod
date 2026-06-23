import { IsNotEmpty, IsString, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RejectSettlementDto {
  @ApiProperty({
    example: "정산 금액 불일치로 거절합니다.",
    description: "정산 거절 사유",
    minLength: 2,
    maxLength: 500,
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString({ message: "거절 사유는 문자열이어야 합니다." })
  @MinLength(2, { message: "거절 사유는 2자 이상 입력해주세요." })
  @MaxLength(500, { message: "거절 사유는 500자 이내로 입력해주세요." })
  reason!: string;
}
