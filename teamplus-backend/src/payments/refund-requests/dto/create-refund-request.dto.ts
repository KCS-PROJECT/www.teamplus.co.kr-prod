import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length } from "class-validator";

/**
 * 환불 요청 생성 Body (E1 · 학부모).
 * paymentId 소유권·결제 완료 여부·도메인 판별(fail-closed)은 서비스에서 검증한다.
 */
export class CreateRefundRequestDto {
  @ApiProperty({
    description: "환불을 요청할 결제 ID (본인 결제만 허용)",
    example: "clx1a2b3c4d5e6f7g8h9",
  })
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @ApiProperty({
    description: "환불 요청 사유",
    minLength: 1,
    maxLength: 500,
    example: "개인 사정으로 수강을 취소합니다.",
  })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
