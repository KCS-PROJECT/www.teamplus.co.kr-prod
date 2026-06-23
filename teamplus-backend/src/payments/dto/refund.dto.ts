import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RefundDto {
  @ApiProperty({
    example: "고객 요청",
    description: "환불 사유",
  })
  @IsNotEmpty({ message: "환불 사유는 필수입니다." })
  @IsString({ message: "환불 사유는 문자열이어야 합니다." })
  refundReason!: string;

  @ApiPropertyOptional({
    example: 240000,
    description: "환불 금액 (원) - 미입력시 전액 환불",
  })
  @IsOptional()
  @IsNumber({}, { message: "환불 금액은 숫자여야 합니다." })
  @Min(0, { message: "환불 금액은 0원 이상이어야 합니다." })
  refundAmount?: number;
}
