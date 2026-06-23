import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RejectBookingDto {
  @ApiProperty({
    example: "해당 시간대에 정기 훈련이 예정되어 있습니다.",
    description: "거절 사유",
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString({ message: "거절 사유는 문자열이어야 합니다." })
  reason!: string;
}
