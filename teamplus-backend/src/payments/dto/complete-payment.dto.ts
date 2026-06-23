import { IsNotEmpty, IsString, IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CompletePaymentDto {
  @ApiProperty({
    example: "ORD-1234567890-abcdefgh",
    description: "주문 번호",
  })
  @IsNotEmpty({ message: "주문 번호는 필수입니다." })
  @IsString({ message: "주문 번호는 문자열이어야 합니다." })
  orderNumber!: string;

  @ApiProperty({
    example: "INI-12345678",
    description: "KG이니시스 거래 ID",
  })
  @IsNotEmpty({ message: "거래 ID는 필수입니다." })
  @IsString({ message: "거래 ID는 문자열이어야 합니다." })
  tid!: string;

  @ApiProperty({
    example: "completed",
    description: "결제 상태 (completed|failed)",
    enum: ["completed", "failed"],
  })
  @IsNotEmpty({ message: "결제 상태는 필수입니다." })
  @IsString({ message: "결제 상태는 문자열이어야 합니다." })
  @IsIn(["completed", "failed"], {
    message: "결제 상태는 completed 또는 failed여야 합니다.",
  })
  paymentStatus!: string;
}
